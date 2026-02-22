import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports/aum?fundId=xxx&includeDeductions=true
 *
 * AUM report for GP's funds. Returns per-fund AUM metrics with aggregate totals.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Inline getUserWithRole logic for App Router
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      role: true,
      teams: {
        select: { teamId: true },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.role !== "GP") {
    return NextResponse.json({ error: "GP access required" }, { status: 403 });
  }

  const teamIds = user.teams.map((t) => t.teamId);
  if (teamIds.length === 0) {
    return NextResponse.json({ error: "No team access" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const fundId = searchParams.get("fundId");
    const includeDeductions = searchParams.get("includeDeductions") !== "false";

    const funds = await prisma.fund.findMany({
      where: fundId
        ? { id: fundId, teamId: { in: teamIds } }
        : { teamId: { in: teamIds } },
      include: {
        aggregate: true,
        investments: {
          where: {
            status: {
              in: [
                "COMMITTED",
                "DOCS_APPROVED",
                "PARTIALLY_FUNDED",
                "FUNDED",
              ],
            },
          },
        },
        capitalCalls: {
          where: { status: "COMPLETED" },
        },
        distributions: {
          where: { status: "COMPLETED" },
        },
      },
    });

    const aumReports = funds.map((fund: any) => {
      const totalCommitted = fund.investments.reduce(
        (sum: number, inv: any) =>
          sum + parseFloat(inv.commitmentAmount.toString()),
        0,
      );

      const totalFunded = fund.investments.reduce(
        (sum: number, inv: any) =>
          sum + parseFloat(inv.fundedAmount.toString()),
        0,
      );

      const totalDistributed = fund.distributions.reduce(
        (sum: number, dist: any) =>
          sum + parseFloat(dist.totalAmount.toString()),
        0,
      );

      const grossAUM = totalFunded;

      let deductions = {
        managementFees: 0,
        performanceFees: 0,
        orgFees: 0,
        expenses: 0,
        total: 0,
      };

      if (includeDeductions) {
        deductions = calculateDeductions(fund, grossAUM);
      }

      const netAUM = grossAUM - deductions.total;

      const unrealizedGains = 0;
      const realizedGains = 0;

      const nav = netAUM + unrealizedGains;

      const fundAgeMo = Math.floor(
        (Date.now() - new Date(fund.createdAt).getTime()) /
          (1000 * 60 * 60 * 24 * 30),
      );

      const rates = {
        managementFeePct: fund.managementFeePct
          ? parseFloat(fund.managementFeePct.toString())
          : 0.02,
        carryPct: fund.carryPct
          ? parseFloat(fund.carryPct.toString())
          : 0.2,
        orgFeePct: fund.orgFeePct
          ? parseFloat(fund.orgFeePct.toString())
          : 0.005,
        expenseRatioPct: fund.expenseRatioPct
          ? parseFloat(fund.expenseRatioPct.toString())
          : 0.003,
      };

      return {
        fundId: fund.id,
        fundName: fund.name,
        entityMode: fund.entityMode,
        status: fund.status,
        aumCalculationFrequency: fund.aumCalculationFrequency || "DAILY",
        metrics: {
          totalCommitted,
          totalFunded,
          totalDistributed,
          grossAUM,
          netAUM,
          nav,
          unrealizedGains,
          realizedGains,
        },
        rates,
        deductions,
        ratios: {
          fundedRatio:
            totalCommitted > 0
              ? round2((totalFunded / totalCommitted) * 100)
              : 0,
          distributedRatio:
            totalFunded > 0
              ? round2((totalDistributed / totalFunded) * 100)
              : 0,
          expenseRatio:
            grossAUM > 0
              ? round2((deductions.total / grossAUM) * 100)
              : 0,
        },
        investorCount: fund.investments.length,
        capitalCallsCount: fund.capitalCalls.length,
        distributionsCount: fund.distributions.length,
        fundAgeMo,
        thresholds: {
          initialEnabled: fund.initialThresholdEnabled,
          initialAmount: fund.initialThresholdAmount?.toString(),
          initialMet: fund.aggregate?.initialThresholdMet || false,
          fullAuthorized: fund.fullAuthorizedAmount?.toString(),
          progress:
            fund.aggregate?.fullAuthorizedProgress?.toString() || "0",
        },
        asOf: new Date().toISOString(),
      };
    });

    const aggregateTotals = aumReports.reduce(
      (totals: any, report: any) => ({
        totalCommitted:
          totals.totalCommitted + report.metrics.totalCommitted,
        totalFunded: totals.totalFunded + report.metrics.totalFunded,
        totalDistributed:
          totals.totalDistributed + report.metrics.totalDistributed,
        grossAUM: totals.grossAUM + report.metrics.grossAUM,
        netAUM: totals.netAUM + report.metrics.netAUM,
        totalDeductions:
          totals.totalDeductions + report.deductions.total,
        investorCount: totals.investorCount + report.investorCount,
      }),
      {
        totalCommitted: 0,
        totalFunded: 0,
        totalDistributed: 0,
        grossAUM: 0,
        netAUM: 0,
        totalDeductions: 0,
        investorCount: 0,
      },
    );

    return NextResponse.json({
      funds: aumReports,
      aggregate: aggregateTotals,
      fundCount: aumReports.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Error generating AUM report:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * Calculate fee deductions using the fund's own configured rates.
 * Falls back to industry-standard defaults if rates are not set.
 */
function calculateDeductions(fund: any, grossAUM: number) {
  const fundAgeYears =
    (Date.now() - new Date(fund.createdAt).getTime()) /
    (1000 * 60 * 60 * 24 * 365.25);

  const mgmtRate = fund.managementFeePct
    ? parseFloat(fund.managementFeePct.toString())
    : 0.02;
  const orgRate = fund.orgFeePct
    ? parseFloat(fund.orgFeePct.toString())
    : 0.005;
  const expenseRate = fund.expenseRatioPct
    ? parseFloat(fund.expenseRatioPct.toString())
    : 0.003;

  const managementFees = grossAUM * mgmtRate * fundAgeYears;
  const performanceFees = 0;
  const orgFees = grossAUM * orgRate;
  const expenses = grossAUM * expenseRate * fundAgeYears;
  const total = managementFees + performanceFees + orgFees + expenses;

  return {
    managementFees: round2(managementFees),
    performanceFees: round2(performanceFees),
    orgFees: round2(orgFees),
    expenses: round2(expenses),
    total: round2(total),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
