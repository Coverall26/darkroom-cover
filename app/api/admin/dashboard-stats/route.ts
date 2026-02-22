import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { determineCurrentStage } from "@/lib/investor/approval-pipeline";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dashboard-stats
 *
 * Returns cross-fund dashboard stats for the GP's team:
 * - Dataroom views count
 * - Emails captured (unique viewers)
 * - Total commitments (Investment where status >= COMMITTED)
 * - Total funded amount
 * - Fund-level raise progress
 * - Pending action counts (4 categories: wires, docs, investor review, awaiting wire)
 * - Investor pipeline stage counts
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAppRouter();
    if (auth instanceof NextResponse) return auth;

    // Get all admin teams for cross-fund stats
    const adminTeams = await prisma.userTeam.findMany({
      where: {
        userId: auth.userId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
      select: { teamId: true },
    });

    const teamIds = adminTeams.map((t: { teamId: string }) => t.teamId);

    // Pre-fetch fund IDs for queries that need them
    const funds = await prisma.fund.findMany({
      where: { teamId: { in: teamIds } },
      select: {
        id: true,
        name: true,
        targetRaise: true,
        currentRaise: true,
        status: true,
        _count: { select: { investors: true } },
      },
    });

    const fundIds = funds.map((f: { id: string }) => f.id);

    // Fetch all data in parallel
    const [
      viewers,
      investments,
      pendingWires,
      pendingDocs,
      dataroomViewCount,
      docsApprovedCount,
      allInvestors,
    ] = await Promise.all([
      // Unique dataroom viewers (emails captured)
      prisma.viewer.count({
        where: {
          dataroom: { teamId: { in: teamIds } },
        },
      }),

      // All investments across funds
      prisma.investment.findMany({
        where: {
          fund: { teamId: { in: teamIds } },
        },
        select: {
          commitmentAmount: true,
          fundedAmount: true,
          status: true,
        },
      }),

      // Pending wire confirmations (include PROOF_UPLOADED)
      prisma.transaction.count({
        where: {
          fundId: { in: fundIds },
          status: { in: ["PENDING", "PROCESSING", "PROOF_UPLOADED"] },
        },
      }),

      // Pending document reviews
      prisma.lPDocument.count({
        where: {
          fund: { teamId: { in: teamIds } },
          status: "UPLOADED_PENDING_REVIEW",
          deletedAt: null,
        },
      }),

      // Dataroom view count
      prisma.view.count({
        where: {
          dataroom: { teamId: { in: teamIds } },
        },
      }),

      // Investments awaiting wire (DOCS_APPROVED)
      prisma.investment.count({
        where: {
          fund: { teamId: { in: teamIds } },
          status: "DOCS_APPROVED",
        },
      }),

      // All investors across funds for pipeline stage counts
      prisma.investor.findMany({
        where: { fundId: { in: fundIds } },
        select: {
          fundData: true,
          accreditationStatus: true,
          onboardingStep: true,
          onboardingCompletedAt: true,
        },
      }),
    ]);

    // Calculate pipeline stage counts
    const pipeline: Record<string, number> = {
      APPLIED: 0,
      UNDER_REVIEW: 0,
      APPROVED: 0,
      REJECTED: 0,
      COMMITTED: 0,
      DOCS_APPROVED: 0,
      FUNDED: 0,
    };
    let needsReviewCount = 0;
    for (const inv of allInvestors) {
      const stage = determineCurrentStage(inv as Record<string, unknown>);
      pipeline[stage] = (pipeline[stage] || 0) + 1;
      if (stage === "APPLIED" || stage === "UNDER_REVIEW") {
        needsReviewCount++;
      }
    }

    // Calculate commitment and funded totals
    const committedStatuses = [
      "COMMITTED",
      "DOCS_APPROVED",
      "FUNDED",
      "COMPLETED",
    ];
    const commitmentCount = investments.filter(
      (i: { status: string }) => committedStatuses.includes(i.status),
    ).length;
    const totalCommitted = investments.reduce(
      (sum: number, i: { commitmentAmount: unknown }) => sum + (Number(i.commitmentAmount) || 0),
      0,
    );
    const totalFunded = investments.reduce(
      (sum: number, i: { fundedAmount: unknown }) => sum + (Number(i.fundedAmount) || 0),
      0,
    );

    // Build per-fund raise progress
    const fundProgress = funds.map((f: { id: string; name: string; targetRaise: unknown; currentRaise: unknown; status: string; _count: { investors: number } }) => {
      const target = Number(f.targetRaise) || 0;
      const current = Number(f.currentRaise) || 0;
      return {
        id: f.id,
        name: f.name,
        target,
        current,
        committed: 0,
        funded: 0,
        investorCount: f._count.investors,
        status: f.status,
      };
    });

    // Calculate total target across all funds
    const totalTarget = funds.reduce(
      (sum: number, f: { targetRaise: unknown }) => sum + (Number(f.targetRaise) || 0),
      0,
    );
    const totalCurrent = funds.reduce(
      (sum: number, f: { currentRaise: unknown }) => sum + (Number(f.currentRaise) || 0),
      0,
    );

    const totalInvestors = funds.reduce(
      (sum: number, f: { _count: { investors: number } }) => sum + f._count.investors,
      0,
    );

    return NextResponse.json({
      stats: {
        dataroomViews: dataroomViewCount,
        emailsCaptured: viewers,
        commitments: commitmentCount,
        totalCommitted,
        totalFunded,
      },
      raise: {
        totalTarget,
        totalCurrent,
        totalCommitted,
        totalFunded,
        funds: fundProgress,
      },
      pendingActions: {
        pendingWires,
        pendingDocs,
        needsReview: needsReviewCount,
        awaitingWire: docsApprovedCount,
        total: pendingWires + pendingDocs + needsReviewCount + docsApprovedCount,
      },
      pipeline,
      fundCount: funds.length,
      investorCount: totalInvestors,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[DASHBOARD_STATS] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
