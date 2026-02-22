import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import { determineCurrentStage } from "@/lib/investor/approval-pipeline";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/fund/[id]/pending-details
 *
 * Returns detailed pending action items for a fund (top N per category).
 * Used by the GP dashboard "Action Required" card for inline resolution.
 *
 * Query params:
 *   limit?: number (default 5, max 10) — items per category
 *
 * Returns:
 *   pendingWires: Array of pending wire transactions with investor info
 *   pendingDocs: Array of documents awaiting review
 *   needsReview: Array of investors needing review (APPLIED/UNDER_REVIEW)
 *   awaitingWire: Array of investments at DOCS_APPROVED stage
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

    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") || "5", 10) || 5),
      10,
    );

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

    // Fetch detailed pending items in parallel
    const [wireTransactions, pendingDocuments, investors, docsApprovedInvestments] =
      await Promise.all([
        // 1. Pending wire transactions with investor details
        prisma.transaction.findMany({
          where: {
            fundId,
            status: { in: ["PENDING", "PROCESSING", "PROOF_UPLOADED"] },
          },
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            description: true,
            metadata: true,
            investor: {
              select: {
                id: true,
                entityName: true,
                user: {
                  select: { name: true, email: true },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: limit,
        }),

        // 2. Pending document reviews
        prisma.lPDocument.findMany({
          where: {
            fundId,
            status: "UPLOADED_PENDING_REVIEW",
            deletedAt: null,
          },
          select: {
            id: true,
            title: true,
            documentType: true,
            createdAt: true,
            originalFilename: true,
            investor: {
              select: {
                id: true,
                entityName: true,
                user: {
                  select: { name: true, email: true },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: limit,
        }),

        // 3. Investors needing review (fetch all to determine stage, but limit output)
        prisma.investor.findMany({
          where: { fundId },
          select: {
            id: true,
            entityName: true,
            fundData: true,
            accreditationStatus: true,
            onboardingStep: true,
            onboardingCompletedAt: true,
            createdAt: true,
            user: {
              select: { name: true, email: true },
            },
          },
          orderBy: { createdAt: "asc" },
        }),

        // 4. Investments at DOCS_APPROVED (awaiting wire transfer)
        prisma.investment.findMany({
          where: {
            fundId,
            status: "DOCS_APPROVED",
          },
          select: {
            id: true,
            commitmentAmount: true,
            fundedAmount: true,
            status: true,
            createdAt: true,
            investor: {
              select: {
                id: true,
                entityName: true,
                user: {
                  select: { name: true, email: true },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: limit,
        }),
      ]);

    // Process investors to find APPLIED/UNDER_REVIEW
    const reviewNeeded: Array<{
      investorId: string;
      name: string;
      email: string;
      stage: string;
      createdAt: Date;
    }> = [];
    let totalNeedsReview = 0;

    for (const inv of investors) {
      const stage = determineCurrentStage(inv as Record<string, unknown>);
      if (stage === "APPLIED" || stage === "UNDER_REVIEW") {
        totalNeedsReview++;
        if (reviewNeeded.length < limit) {
          reviewNeeded.push({
            investorId: inv.id,
            name: inv.user?.name || inv.entityName || "Unknown",
            email: inv.user?.email || "",
            stage,
            createdAt: inv.createdAt,
          });
        }
      }
    }

    // Format wire transactions
    const pendingWires = wireTransactions.map((tx) => {
      const meta = (tx.metadata as Record<string, unknown>) || {};
      return {
        transactionId: tx.id,
        investorId: tx.investor?.id || null,
        name: tx.investor?.user?.name || tx.investor?.entityName || "Unknown",
        email: tx.investor?.user?.email || "",
        amount: Number(tx.amount),
        status: tx.status,
        createdAt: tx.createdAt,
        proofFileName: (meta.proofFileName as string) || null,
      };
    });

    // Format pending documents
    const pendingDocs = pendingDocuments.map((doc) => ({
      documentId: doc.id,
      investorId: doc.investor?.id || null,
      name: doc.investor?.user?.name || doc.investor?.entityName || "Unknown",
      email: doc.investor?.user?.email || "",
      title: doc.title,
      documentType: doc.documentType,
      originalFilename: doc.originalFilename,
      createdAt: doc.createdAt,
    }));

    // Format awaiting wire investments
    const awaitingWire = docsApprovedInvestments.map((inv) => ({
      investmentId: inv.id,
      investorId: inv.investor?.id || null,
      name: inv.investor?.user?.name || inv.investor?.entityName || "Unknown",
      email: inv.investor?.user?.email || "",
      commitmentAmount: Number(inv.commitmentAmount),
      fundedAmount: Number(inv.fundedAmount),
      createdAt: inv.createdAt,
    }));

    // Count totals (for the "and X more" display)
    const [totalWires, totalDocs, totalAwaitingWire] = await Promise.all([
      prisma.transaction.count({
        where: { fundId, status: { in: ["PENDING", "PROCESSING"] } },
      }),
      prisma.lPDocument.count({
        where: { fundId, status: "UPLOADED_PENDING_REVIEW", deletedAt: null },
      }),
      prisma.investment.count({
        where: { fundId, status: "DOCS_APPROVED" },
      }),
    ]);

    return NextResponse.json({
      pendingWires: {
        items: pendingWires,
        total: totalWires,
      },
      pendingDocs: {
        items: pendingDocs,
        total: totalDocs,
      },
      needsReview: {
        items: reviewNeeded,
        total: totalNeedsReview,
      },
      awaitingWire: {
        items: awaitingWire,
        total: totalAwaitingWire,
      },
      totalActions: totalWires + totalDocs + totalNeedsReview + totalAwaitingWire,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[PENDING_DETAILS] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
