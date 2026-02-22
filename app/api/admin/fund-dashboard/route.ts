import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { getFundProgress } from "@/lib/funds/tranche-service";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAppRouter();
    if (auth instanceof NextResponse) return auth;

    // Get all admin teams for cross-fund dashboard
    const userTeams = await prisma.userTeam.findMany({
      where: {
        userId: auth.userId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
      select: {
        teamId: true,
        role: true,
        hasFundroomAccess: true,
      },
    });

    const teamIds = userTeams.map((ut) => ut.teamId);

    const funds = await prisma.fund.findMany({
      where: { teamId: { in: teamIds } },
      take: 100, // Cap funds per team
      include: {
        investments: { take: 5000 },
        distributions: { take: 5000 },
        capitalCalls: { take: 1000 },
      },
      orderBy: { createdAt: "desc" },
    });

    const fundIds = funds.map((f) => f.id);
    const manualInvestments = await prisma.manualInvestment.findMany({
      where: {
        fundId: { in: fundIds },
        status: "ACTIVE",
      },
      take: 5000,
    });

    const manualByFund = new Map<string, typeof manualInvestments>();
    manualInvestments.forEach((mi: any) => {
      if (!manualByFund.has(mi.fundId)) {
        manualByFund.set(mi.fundId, []);
      }
      manualByFund.get(mi.fundId)!.push(mi);
    });

    let totalRaised = 0;
    let totalDistributed = 0;
    let totalCommitments = 0;
    let totalInvestors = new Set<string>();

    // Fetch tranche progress for all funds
    const trancheProgressMap = new Map<string, any>();
    await Promise.all(
      funds.map(async (fund) => {
        const progress = await getFundProgress(fund.id);
        if (progress) {
          trancheProgressMap.set(fund.id, progress);
        }
      }),
    );

    const fundData = funds.map((fund) => {
      const fundManualInvestments = manualByFund.get(fund.id) || [];

      const platformCommitments = fund.investments.reduce(
        (sum, inv) => sum + Number(inv.commitmentAmount),
        0
      );
      const manualCommitments = fundManualInvestments.reduce(
        (sum: number, mi: any) => sum + Number(mi.commitmentAmount),
        0
      );
      const commitments = platformCommitments + manualCommitments;

      const platformFunded = fund.investments.reduce(
        (sum, inv) => sum + Number(inv.fundedAmount),
        0
      );
      const manualFunded = fundManualInvestments.reduce(
        (sum: number, mi: any) => sum + Number(mi.fundedAmount),
        0
      );
      const funded = platformFunded + manualFunded;

      const distributed = fund.distributions.reduce(
        (sum, d) => sum + Number(d.totalAmount),
        0
      );

      totalRaised += funded;
      totalDistributed += distributed;
      totalCommitments += commitments;
      fund.investments.forEach((inv) => totalInvestors.add(inv.investorId));
      fundManualInvestments.forEach((mi: any) => totalInvestors.add(mi.investorId));

      const fundInvestorIds = new Set<string>();
      fund.investments.forEach((inv) => fundInvestorIds.add(inv.investorId));
      fundManualInvestments.forEach((mi: any) => fundInvestorIds.add(mi.investorId));
      const totalInvestorCount = fundInvestorIds.size;

      const trancheProgress = trancheProgressMap.get(fund.id);

      return {
        id: fund.id,
        name: fund.name,
        status: fund.status,
        targetRaise: Number(fund.targetRaise),
        currentRaise: Number(fund.currentRaise),
        commitments,
        funded,
        distributed,
        investorCount: totalInvestorCount,
        capitalCallCount: fund.capitalCalls.length,
        distributionCount: fund.distributions.length,
        closingDate: fund.closingDate,
        progress: Number(fund.targetRaise) > 0
          ? Math.round((funded / Number(fund.targetRaise)) * 100)
          : 0,
        manualInvestmentCount: fundManualInvestments.length,
        trancheProgress: trancheProgress
          ? {
              totalUnits: trancheProgress.totalUnits,
              unitsSold: trancheProgress.unitsSold,
              unitsAvailable: trancheProgress.unitsAvailable,
              percentRaised: trancheProgress.percentRaised,
              activeTranche: trancheProgress.activeTranche,
              tranches: trancheProgress.tranches,
            }
          : null,
      };
    });

    const chartData = fundData.map((f) => ({
      name: f.name.length > 15 ? f.name.slice(0, 15) + "..." : f.name,
      raised: f.funded,
      distributed: f.distributed,
      target: f.targetRaise,
    }));

    const transactions = await prisma.transaction.findMany({
      where: { fundId: { in: fundIds } },
      include: {
        investor: { select: { id: true, entityName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const transactionsByInvestor = await prisma.transaction.groupBy({
      by: ["investorId", "type"],
      where: { fundId: { in: fundIds } },
      _sum: { amount: true },
      _count: { id: true },
    });

    const investorIds = [...new Set(transactionsByInvestor.map((t) => t.investorId))];
    const investors = await prisma.investor.findMany({
      where: { id: { in: investorIds } },
      select: { id: true, entityName: true },
    });
    const investorMap = new Map(investors.map((i) => [i.id, i.entityName]));

    const anonymizeInvestor = (investorId: string, entityName: string | null): string => {
      const name = entityName || "Investor";
      if (name.length <= 3) return name[0] + "***";
      return name.slice(0, 2) + "***" + name.slice(-1);
    };

    const investorIdMap = new Map<string, string>();
    let investorCounter = 1;
    investorIds.forEach((id) => {
      investorIdMap.set(id, `INV-${String(investorCounter++).padStart(3, "0")}`);
    });

    const aggregatedTransactions = transactionsByInvestor.map((t) => ({
      investorId: investorIdMap.get(t.investorId) || "INV-000",
      investorName: anonymizeInvestor(t.investorId, investorMap.get(t.investorId) || null),
      type: t.type,
      totalAmount: Number(t._sum.amount || 0),
      count: t._count.id,
    }));

    const recentTransactions = transactions.slice(0, 50).map((t, index) => ({
      id: t.id,
      investorId: `INV-${String(index + 1).padStart(3, "0")}`,
      investorName: anonymizeInvestor(t.investorId, t.investor?.entityName || null),
      type: t.type,
      amount: Number(t.amount),
      status: t.status,
      createdAt: t.createdAt,
    }));

    return NextResponse.json({
      funds: fundData,
      totals: {
        totalRaised: totalRaised.toFixed(2),
        totalDistributed: totalDistributed.toFixed(2),
        totalCommitments: totalCommitments.toFixed(2),
        totalInvestors: totalInvestors.size,
        totalFunds: funds.length,
      },
      chartData,
      transactions: recentTransactions,
      transactionSummary: aggregatedTransactions,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching fund dashboard:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
