import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import { determineCurrentStage } from "@/lib/investor/approval-pipeline";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/fund/[id]/pending-actions
 *
 * Returns a summary of pending GP actions for a fund:
 * - Pending wire confirmations (transactions with status PENDING)
 * - Pending document reviews (LPDocuments with status UPLOADED_PENDING_REVIEW)
 * - New investors needing review (investors at APPLIED or UNDER_REVIEW stage)
 * - Docs approved awaiting wire (investors at DOCS_APPROVED stage)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: fundId } = await params;
    if (!fundId) {
      return NextResponse.json({ error: "Fund ID required" }, { status: 400 });
    }

    // Verify GP access to this fund
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        teams: {
          where: { role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" },
          select: { teamId: true },
        },
      },
    });

    if (!user || user.teams.length === 0) {
      return NextResponse.json({ error: "GP access required" }, { status: 403 });
    }

    const teamIds = user.teams.map((t) => t.teamId);

    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId: { in: teamIds } },
      select: { id: true, teamId: true },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    // Fetch all pending action counts in parallel
    const [pendingWires, pendingDocs, newInvestors, docsApprovedInvestors] =
      await Promise.all([
        // 1. Pending wire confirmations
        prisma.transaction.count({
          where: {
            fundId,
            status: { in: ["PENDING", "PROCESSING", "PROOF_UPLOADED"] },
          },
        }),

        // 2. Pending document reviews
        prisma.lPDocument.count({
          where: {
            fundId,
            status: "UPLOADED_PENDING_REVIEW",
            deletedAt: null,
          },
        }),

        // 3. New investors at APPLIED/UNDER_REVIEW (via fundData.approvalStage or inferred)
        prisma.investor.findMany({
          where: { fundId },
          select: {
            fundData: true,
            accreditationStatus: true,
            onboardingStep: true,
            onboardingCompletedAt: true,
          },
        }),

        // 4. Investments at DOCS_APPROVED (awaiting wire)
        prisma.investment.count({
          where: {
            fundId,
            status: "DOCS_APPROVED",
          },
        }),
      ]);

    // Count investors by stage using shared determineCurrentStage logic
    let needsReviewCount = 0;
    for (const inv of newInvestors) {
      const stage = determineCurrentStage(inv as Record<string, unknown>);
      if (stage === "APPLIED" || stage === "UNDER_REVIEW") {
        needsReviewCount++;
      }
    }

    return NextResponse.json({
      pendingWires,
      pendingDocs,
      needsReview: needsReviewCount,
      awaitingWire: docsApprovedInvestors,
      totalActions: pendingWires + pendingDocs + needsReviewCount + docsApprovedInvestors,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[PENDING_ACTIONS] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
