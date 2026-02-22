import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { enforceRBACAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports/operational?fundId=xxx
 *
 * Returns GP operational metrics:
 * - Wire reconciliation (expected vs received, variance, overdue)
 * - Document completion (% complete by type, rejection rate)
 * - Investor conversion timing (avg days per stage)
 * - SLA tracking (overdue wires, overdue doc reviews)
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fundId = searchParams.get("fundId");
  if (!fundId) {
    return NextResponse.json(
      { error: "fundId is required" },
      { status: 400 },
    );
  }

  try {
    // Verify access
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: { id: true, name: true, targetRaise: true, teamId: true },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Fund not found" },
        { status: 404 },
      );
    }

    const rbacResult = await enforceRBACAppRouter({
      roles: ["OWNER", "ADMIN", "SUPER_ADMIN"],
      teamId: fund.teamId,
    });
    if (rbacResult instanceof NextResponse) return rbacResult;

    // Fetch all data in parallel
    const [transactions, lpDocuments, signatureDocuments, investors] =
      await Promise.all([
        // All transactions for this fund
        prisma.transaction.findMany({
          where: { fundId },
          select: {
            id: true,
            status: true,
            amount: true,
            expectedAmount: true,
            amountVariance: true,
            initiatedAt: true,
            completedAt: true,
            confirmedAt: true,
            fundsReceivedDate: true,
            createdAt: true,
          },
        }),

        // All LP documents for this fund
        prisma.lPDocument.findMany({
          where: { fundId, deletedAt: null },
          select: {
            id: true,
            documentType: true,
            status: true,
            createdAt: true,
            reviewedAt: true,
            uploadSource: true,
          },
        }),

        // Signature documents for this fund
        prisma.signatureDocument.findMany({
          where: { fundId },
          select: {
            id: true,
            status: true,
            documentType: true,
            sentAt: true,
            completedAt: true,
            requiredForOnboarding: true,
            recipients: {
              select: {
                id: true,
                status: true,
                signedAt: true,
              },
            },
          },
        }),

        // All investors for stage timing
        prisma.investor.findMany({
          where: { fundId },
          select: {
            id: true,
            fundData: true,
            createdAt: true,
            onboardingCompletedAt: true,
            ndaSigned: true,
            accreditationStatus: true,
            investments: {
              where: { fundId },
              select: {
                status: true,
                createdAt: true,
                updatedAt: true,
              },
              take: 1,
            },
          },
        }),
      ]);

    // === Wire Reconciliation ===
    const now = new Date();
    const WIRE_SLA_DAYS = 5;

    const completedWires = transactions.filter(
      (t) => t.status === "COMPLETED",
    );
    const pendingWires = transactions.filter((t) =>
      ["PENDING", "PROCESSING", "PROOF_UPLOADED"].includes(t.status),
    );

    const totalExpected = transactions.reduce(
      (sum, t) => sum + (Number(t.expectedAmount || t.amount) || 0),
      0,
    );
    const totalReceived = completedWires.reduce(
      (sum, t) => sum + (Number(t.amount) || 0),
      0,
    );
    const totalVariance = completedWires.reduce(
      (sum, t) => sum + (Number(t.amountVariance) || 0),
      0,
    );

    // Calculate average confirmation time (days)
    let totalConfirmDays = 0;
    let confirmCount = 0;
    for (const t of completedWires) {
      const start = t.initiatedAt || t.createdAt;
      const end = t.confirmedAt || t.completedAt;
      if (start && end) {
        const days =
          (new Date(end).getTime() - new Date(start).getTime()) /
          (1000 * 60 * 60 * 24);
        totalConfirmDays += days;
        confirmCount++;
      }
    }
    const avgConfirmDays =
      confirmCount > 0 ? totalConfirmDays / confirmCount : null;

    // Overdue wires (pending > SLA days)
    const overdueWires = pendingWires.filter((t) => {
      const created = t.initiatedAt || t.createdAt;
      const daysSince =
        (now.getTime() - new Date(created).getTime()) /
        (1000 * 60 * 60 * 24);
      return daysSince > WIRE_SLA_DAYS;
    });

    const wireReconciliation = {
      totalTransactions: transactions.length,
      completed: completedWires.length,
      pending: pendingWires.length,
      failed: transactions.filter((t) => t.status === "FAILED").length,
      totalExpected,
      totalReceived,
      totalVariance: Math.abs(totalVariance),
      variancePercent:
        totalExpected > 0
          ? (Math.abs(totalExpected - totalReceived) / totalExpected) * 100
          : 0,
      avgConfirmationDays:
        avgConfirmDays !== null
          ? Math.round(avgConfirmDays * 10) / 10
          : null,
      overdueCount: overdueWires.length,
      slaDays: WIRE_SLA_DAYS,
    };

    // === Document Completion Metrics ===
    const DOC_REVIEW_SLA_HOURS = 48;

    const docsByType: Record<
      string,
      {
        total: number;
        approved: number;
        rejected: number;
        pending: number;
        avgReviewHours: number;
        reviewCount: number;
      }
    > = {};

    for (const doc of lpDocuments) {
      const type = doc.documentType || "OTHER";
      if (!docsByType[type]) {
        docsByType[type] = {
          total: 0,
          approved: 0,
          rejected: 0,
          pending: 0,
          avgReviewHours: 0,
          reviewCount: 0,
        };
      }
      docsByType[type].total++;

      if (doc.status === "APPROVED") {
        docsByType[type].approved++;
      } else if (doc.status === "REJECTED") {
        docsByType[type].rejected++;
      } else if (doc.status === "UPLOADED_PENDING_REVIEW") {
        docsByType[type].pending++;
      }

      // Calculate review time
      if (doc.reviewedAt && doc.createdAt) {
        const hours =
          (new Date(doc.reviewedAt).getTime() -
            new Date(doc.createdAt).getTime()) /
          (1000 * 60 * 60);
        docsByType[type].avgReviewHours += hours;
        docsByType[type].reviewCount++;
      }
    }

    // Finalize averages
    const documentMetrics = Object.entries(docsByType).map(
      ([type, data]) => ({
        type,
        total: data.total,
        approved: data.approved,
        rejected: data.rejected,
        pending: data.pending,
        completionRate:
          data.total > 0
            ? Math.round((data.approved / data.total) * 100)
            : 0,
        rejectionRate:
          data.total > 0
            ? Math.round((data.rejected / data.total) * 100)
            : 0,
        avgReviewHours:
          data.reviewCount > 0
            ? Math.round(
                (data.avgReviewHours / data.reviewCount) * 10,
              ) / 10
            : null,
      }),
    );

    // Overdue doc reviews
    const pendingDocs = lpDocuments.filter(
      (d) => d.status === "UPLOADED_PENDING_REVIEW",
    );
    const overdueDocs = pendingDocs.filter((d) => {
      const hoursSince =
        (now.getTime() - new Date(d.createdAt).getTime()) /
        (1000 * 60 * 60);
      return hoursSince > DOC_REVIEW_SLA_HOURS;
    });

    // Signature document completion
    const requiredSigDocs = signatureDocuments.filter(
      (d) => d.requiredForOnboarding,
    );
    const completedSigDocs = requiredSigDocs.filter(
      (d) => d.status === "COMPLETED",
    );
    let totalSigningDays = 0;
    let signingCount = 0;
    for (const doc of completedSigDocs) {
      if (doc.sentAt && doc.completedAt) {
        const days =
          (new Date(doc.completedAt).getTime() -
            new Date(doc.sentAt).getTime()) /
          (1000 * 60 * 60 * 24);
        totalSigningDays += days;
        signingCount++;
      }
    }

    const signatureMetrics = {
      totalRequired: requiredSigDocs.length,
      completed: completedSigDocs.length,
      completionRate:
        requiredSigDocs.length > 0
          ? Math.round(
              (completedSigDocs.length / requiredSigDocs.length) * 100,
            )
          : 0,
      avgSigningDays:
        signingCount > 0
          ? Math.round((totalSigningDays / signingCount) * 10) / 10
          : null,
      totalRecipients: signatureDocuments.reduce(
        (sum, d) => sum + d.recipients.length,
        0,
      ),
      signedRecipients: signatureDocuments.reduce(
        (sum, d) =>
          sum +
          d.recipients.filter((r) => r.status === "SIGNED" || r.signedAt)
            .length,
        0,
      ),
    };

    // === Investor Conversion Timing ===
    const stageTiming: Record<
      string,
      { totalDays: number; count: number }
    > = {
      toOnboarding: { totalDays: 0, count: 0 },
      toNdaSigned: { totalDays: 0, count: 0 },
      toCommitted: { totalDays: 0, count: 0 },
      toFunded: { totalDays: 0, count: 0 },
    };

    for (const inv of investors) {
      const created = new Date(inv.createdAt);

      // To onboarding complete
      if (inv.onboardingCompletedAt) {
        const days =
          (new Date(inv.onboardingCompletedAt).getTime() -
            created.getTime()) /
          (1000 * 60 * 60 * 24);
        stageTiming.toOnboarding.totalDays += days;
        stageTiming.toOnboarding.count++;
      }

      // To committed (via investment record)
      const investment = inv.investments[0];
      if (
        investment &&
        ["COMMITTED", "DOCS_APPROVED", "FUNDED", "COMPLETED"].includes(
          investment.status,
        )
      ) {
        const days =
          (new Date(investment.createdAt).getTime() -
            created.getTime()) /
          (1000 * 60 * 60 * 24);
        stageTiming.toCommitted.totalDays += days;
        stageTiming.toCommitted.count++;
      }

      // To funded
      if (
        investment &&
        ["FUNDED", "COMPLETED"].includes(investment.status)
      ) {
        const days =
          (new Date(investment.updatedAt).getTime() -
            created.getTime()) /
          (1000 * 60 * 60 * 24);
        stageTiming.toFunded.totalDays += days;
        stageTiming.toFunded.count++;
      }
    }

    const conversionTiming = {
      avgDaysToOnboarding:
        stageTiming.toOnboarding.count > 0
          ? Math.round(
              (stageTiming.toOnboarding.totalDays /
                stageTiming.toOnboarding.count) *
                10,
            ) / 10
          : null,
      avgDaysToCommitted:
        stageTiming.toCommitted.count > 0
          ? Math.round(
              (stageTiming.toCommitted.totalDays /
                stageTiming.toCommitted.count) *
                10,
            ) / 10
          : null,
      avgDaysToFunded:
        stageTiming.toFunded.count > 0
          ? Math.round(
              (stageTiming.toFunded.totalDays /
                stageTiming.toFunded.count) *
                10,
            ) / 10
          : null,
      totalInvestors: investors.length,
      onboardingCompleted: investors.filter(
        (i) => i.onboardingCompletedAt,
      ).length,
      ndaSigned: investors.filter((i) => i.ndaSigned).length,
      committed: investors.filter(
        (i) =>
          i.investments[0] &&
          ["COMMITTED", "DOCS_APPROVED", "FUNDED", "COMPLETED"].includes(
            i.investments[0].status,
          ),
      ).length,
      funded: investors.filter(
        (i) =>
          i.investments[0] &&
          ["FUNDED", "COMPLETED"].includes(i.investments[0].status),
      ).length,
    };

    // === SLA Dashboard ===
    const sla = {
      wireConfirmation: {
        slaDays: WIRE_SLA_DAYS,
        onTrack: pendingWires.length - overdueWires.length,
        overdue: overdueWires.length,
        avgDays:
          avgConfirmDays !== null
            ? Math.round(avgConfirmDays * 10) / 10
            : null,
      },
      documentReview: {
        slaHours: DOC_REVIEW_SLA_HOURS,
        onTrack: pendingDocs.length - overdueDocs.length,
        overdue: overdueDocs.length,
        avgHours:
          documentMetrics.length > 0
            ? Math.round(
                (documentMetrics.reduce(
                  (sum, d) => sum + (d.avgReviewHours || 0),
                  0,
                ) /
                  documentMetrics.filter((d) => d.avgReviewHours !== null)
                    .length) *
                  10,
              ) / 10 || null
            : null,
      },
      signing: {
        totalPending: signatureDocuments.filter(
          (d) => d.status !== "COMPLETED" && d.status !== "VOIDED",
        ).length,
        avgDays: signatureMetrics.avgSigningDays,
      },
    };

    return NextResponse.json({
      fundId: fund.id,
      fundName: fund.name,
      wireReconciliation,
      documentMetrics,
      signatureMetrics,
      conversionTiming,
      sla,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[REPORTS_OPERATIONAL] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
