import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getFile } from "@/lib/files/get-file";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/lp/fund-details
 * Returns comprehensive fund details for the authenticated LP investor,
 * including investments, distributions, capital calls, documents, and notes.
 * Respects LP visibility flags per fund.
 */
export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const auth = await requireLPAuthAppRouter();
    if (auth instanceof NextResponse) return auth;

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: {
        investorProfile: {
          include: {
            investments: {
              include: {
                fund: {
                  include: {
                    aggregate: true,
                    distributions: {
                      orderBy: { distributionDate: "desc" },
                      take: 5,
                    },
                    capitalCalls: {
                      orderBy: { dueDate: "desc" },
                      take: 5,
                    },
                    reports: {
                      orderBy: { createdAt: "desc" },
                      take: 5,
                    },
                  },
                },
              },
            },
            capitalCalls: {
              include: {
                capitalCall: {
                  include: { fund: true },
                },
              },
              orderBy: { createdAt: "desc" },
            },
            transactions: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
            documents: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
            notes: {
              orderBy: { createdAt: "desc" },
              take: 10,
              include: {
                team: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user?.investorProfile) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 404 },
      );
    }

    const investorProfile = user.investorProfile;

    // Collect LP visibility flags per fund (from featureFlags JSON)
    const fundVisibilityMap = new Map<string, Record<string, boolean>>();
    for (const inv of investorProfile.investments) {
      const ff = (inv.fund.featureFlags as Record<string, unknown>) || {};
      fundVisibilityMap.set(inv.fund.id, {
        showCapitalCalls: ff.showCapitalCalls !== false,
        showDistributions: ff.showDistributions !== false,
        showNAV: ff.showNAV !== false,
        showDocuments: ff.showDocuments !== false,
        showTransactions: ff.showTransactions !== false,
        showReports: ff.showReports !== false,
      });
    }

    // Derive a combined visibility (any fund showing = show for dashboard)
    const combinedVisibility = {
      showCapitalCalls: false,
      showDistributions: false,
      showNAV: false,
      showDocuments: false,
      showTransactions: false,
      showReports: false,
    };
    for (const vis of fundVisibilityMap.values()) {
      for (const key of Object.keys(combinedVisibility) as (keyof typeof combinedVisibility)[]) {
        if (vis[key]) combinedVisibility[key] = true;
      }
    }

    const funds = investorProfile.investments.map((inv) => {
      const fund = inv.fund;
      const vis = fundVisibilityMap.get(fund.id) || combinedVisibility;
      const aggregate = fund.aggregate;

      const commitmentAmount = parseFloat(inv.commitmentAmount.toString());
      const fundedAmount = parseFloat(inv.fundedAmount.toString());
      const fundedPercentage = commitmentAmount > 0
        ? Math.round((fundedAmount / commitmentAmount) * 100)
        : 0;

      const totalCommitted = aggregate
        ? parseFloat(aggregate.totalCommitted.toString())
        : 0;
      const initialThresholdAmount = aggregate?.initialThresholdAmount
        ? parseFloat(aggregate.initialThresholdAmount.toString())
        : 0;
      const thresholdProgress = initialThresholdAmount > 0
        ? Math.min(100, Math.round((totalCommitted / initialThresholdAmount) * 100))
        : 100;

      return {
        id: fund.id,
        name: fund.name,
        description: fund.description,
        status: fund.status,
        style: fund.style,
        economics: {
          managementFeePct: fund.managementFeePct ? Number(fund.managementFeePct) * 100 : null,
          carryPct: fund.carryPct ? Number(fund.carryPct) * 100 : null,
          hurdleRate: fund.hurdleRate ? Number(fund.hurdleRate) * 100 : null,
          waterfallType: fund.waterfallType,
          termYears: fund.termYears,
          extensionYears: fund.extensionYears,
        },
        investment: {
          id: inv.id,
          commitmentAmount,
          fundedAmount,
          fundedPercentage,
          status: inv.status,
          subscriptionDate: inv.subscriptionDate?.toISOString() || null,
        },
        metrics: {
          targetRaise: parseFloat(fund.targetRaise.toString()),
          currentRaise: parseFloat(fund.currentRaise.toString()),
          raiseProgress: parseFloat(fund.targetRaise.toString()) > 0
            ? Math.round((parseFloat(fund.currentRaise.toString()) / parseFloat(fund.targetRaise.toString())) * 100)
            : 0,
          totalCommitted,
          initialThresholdMet: aggregate?.initialThresholdMet || false,
          thresholdProgress,
        },
        recentDistributions: vis.showDistributions
          ? fund.distributions.map((d) => ({
              id: d.id,
              number: d.distributionNumber,
              amount: parseFloat(d.totalAmount.toString()),
              type: d.distributionType,
              date: d.distributionDate.toISOString(),
              status: d.status,
            }))
          : [],
        recentCapitalCalls: vis.showCapitalCalls
          ? fund.capitalCalls.map((cc) => ({
              id: cc.id,
              number: cc.callNumber,
              amount: parseFloat(cc.amount.toString()),
              purpose: cc.purpose,
              dueDate: cc.dueDate.toISOString(),
              status: cc.status,
            }))
          : [],
        reports: vis.showReports
          ? fund.reports.map((r) => ({
              id: r.id,
              type: r.reportType,
              period: r.reportPeriod,
              title: r.title,
              fileUrl: r.fileUrl,
              createdAt: r.createdAt.toISOString(),
            }))
          : [],
        lpVisibility: vis,
      };
    });

    // Filter capital calls
    const pendingCapitalCalls = combinedVisibility.showCapitalCalls
      ? investorProfile.capitalCalls
          .filter((ccr) => {
            if (ccr.status !== "PENDING") return false;
            const fundVis = fundVisibilityMap.get(ccr.capitalCall.fund.id);
            return !fundVis || fundVis.showCapitalCalls;
          })
          .map((ccr) => ({
            id: ccr.id,
            callNumber: ccr.capitalCall.callNumber,
            amountDue: parseFloat(ccr.amountDue.toString()),
            amountPaid: parseFloat(ccr.amountPaid.toString()),
            dueDate: ccr.capitalCall.dueDate.toISOString(),
            fundName: ccr.capitalCall.fund.name,
            fundId: ccr.capitalCall.fund.id,
            status: ccr.status,
          }))
      : [];

    // Filter transactions
    const recentTransactions = combinedVisibility.showTransactions
      ? investorProfile.transactions.map((tx) => ({
          id: tx.id,
          type: tx.type,
          amount: parseFloat(tx.amount.toString()),
          status: tx.status,
          description: tx.description,
          initiatedAt: tx.initiatedAt.toISOString(),
          completedAt: tx.completedAt?.toISOString() || null,
        }))
      : [];

    // Filter documents
    const documents = combinedVisibility.showDocuments
      ? await Promise.all(
          investorProfile.documents.map(async (doc) => {
            let fileUrl = null;
            try {
              if (doc.storageKey) {
                fileUrl = await getFile({
                  type: doc.storageType as any,
                  data: doc.storageKey,
                });
              }
            } catch (err) {
              reportError(err as Error);
            }
            return {
              id: doc.id,
              title: doc.title,
              documentType: doc.documentType,
              fileUrl,
              signedAt: doc.signedAt?.toISOString() || null,
              createdAt: doc.createdAt.toISOString(),
            };
          }),
        )
      : [];

    const notes = investorProfile.notes.map((note) => ({
      id: note.id,
      content: note.content,
      isFromInvestor: note.isFromInvestor,
      teamName: note.team.name,
      createdAt: note.createdAt.toISOString(),
    }));

    const totalCommitment = investorProfile.investments.reduce(
      (sum, inv) => sum + parseFloat(inv.commitmentAmount.toString()),
      0,
    );
    const totalFunded = investorProfile.investments.reduce(
      (sum, inv) => sum + parseFloat(inv.fundedAmount.toString()),
      0,
    );
    const totalDistributions = recentTransactions
      .filter((tx) => tx.type === "DISTRIBUTION" && tx.status === "COMPLETED")
      .reduce((sum, tx) => sum + tx.amount, 0);

    return NextResponse.json({
      summary: {
        totalCommitment,
        totalFunded,
        totalDistributions: combinedVisibility.showDistributions ? totalDistributions : 0,
        activeFunds: funds.filter((f) => f.status === "RAISING" || f.status === "ACTIVE").length,
        pendingCapitalCallsCount: pendingCapitalCalls.length,
        pendingCapitalCallsTotal: pendingCapitalCalls.reduce((sum, cc) => sum + cc.amountDue, 0),
      },
      funds,
      pendingCapitalCalls,
      recentTransactions,
      documents,
      notes,
      lpVisibility: combinedVisibility,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
