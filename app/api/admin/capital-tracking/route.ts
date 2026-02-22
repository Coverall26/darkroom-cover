import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { requireGPAccessAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fundId = searchParams.get("fundId");

    if (!fundId) {
      return NextResponse.json(
        { error: "Fund ID is required" },
        { status: 400 },
      );
    }

    // Look up fund first to get its teamId for RBAC check
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      include: { aggregate: true },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Fund not found" },
        { status: 404 },
      );
    }

    // Authenticate + authorize via RBAC (OWNER/ADMIN/SUPER_ADMIN/MANAGER)
    const auth = await requireGPAccessAppRouter(fund.teamId);
    if (auth instanceof NextResponse) return auth;

    const investments = await prisma.investment.findMany({
      where: { fundId },
      take: 5000, // Cap to prevent unbounded queries
      include: {
        investor: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
        tranches: {
          orderBy: { trancheNumber: "asc" },
        },
      },
    });

    const capitalCalls = await prisma.capitalCall.findMany({
      where: { fundId },
      take: 5000,
      include: {
        responses: true,
      },
    });

    const distributions = await prisma.distribution.findMany({
      where: { fundId },
      take: 5000,
    });

    const transactions = await prisma.transaction.findMany({
      where: { fundId },
      take: 10000,
    });

    const totalCommitted = investments.reduce(
      (sum, inv) => sum + Number(inv.commitmentAmount),
      0
    );

    const totalCalled = capitalCalls.reduce(
      (sum, call) => sum + Number(call.amount),
      0
    );

    const totalFunded = investments.reduce(
      (sum, inv) => sum + Number(inv.fundedAmount),
      0
    );

    const totalDistributed = distributions.reduce(
      (sum, dist) => sum + Number(dist.totalAmount),
      0
    );

    const uncalledCapital = totalCommitted - totalCalled;
    const netPosition = totalFunded - totalDistributed;
    const fundedPercentage = totalCommitted > 0 ? (totalFunded / totalCommitted) * 100 : 0;

    const statusCounts: Record<string, { count: number; amount: number }> = {};
    for (const inv of investments) {
      const status = inv.status;
      if (!statusCounts[status]) {
        statusCounts[status] = { count: 0, amount: 0 };
      }
      statusCounts[status].count++;
      statusCounts[status].amount += Number(inv.commitmentAmount);
    }

    const byStatus = Object.entries(statusCounts).map(([status, data]) => ({
      status,
      count: data.count,
      amount: data.amount,
    }));

    const investorCapital = investments.map((inv) => {
      const calledAmount = capitalCalls.reduce((sum, call) => {
        const response = call.responses.find((r) => r.investorId === inv.investorId);
        return sum + (response ? Number(response.amountDue) : 0);
      }, 0);

      const fundedAmount = Number(inv.fundedAmount);
      const commitmentAmount = Number(inv.commitmentAmount);

      const investorDistributed = transactions
        .filter((t) => t.investorId === inv.investorId && t.type === "DISTRIBUTION" && t.status === "COMPLETED")
        .reduce((sum, t) => sum + Number(t.amount), 0);

      return {
        id: inv.investor.id,
        name: inv.investor.user?.name || "",
        email: inv.investor.user?.email || "",
        entityName: inv.investor.entityName,
        commitment: commitmentAmount,
        called: calledAmount,
        funded: fundedAmount,
        distributed: investorDistributed,
        uncalled: commitmentAmount - calledAmount,
        fundedPct: commitmentAmount > 0 ? (fundedAmount / commitmentAmount) * 100 : 0,
        isStaged: (inv as any).isStaged || false,
        trancheCount: (inv as any).trancheCount || null,
        tranches: ((inv as any).tranches || []).map((t: any) => ({
          id: t.id,
          trancheNumber: t.trancheNumber,
          label: t.label,
          amount: Number(t.amount),
          fundedAmount: Number(t.fundedAmount),
          scheduledDate: t.scheduledDate?.toISOString().split("T")[0] || null,
          status: t.status,
        })),
      };
    });

    return NextResponse.json({
      metrics: {
        totalCommitted,
        totalCalled,
        totalFunded,
        totalDistributed,
        uncalledCapital,
        netPosition,
        fundedPercentage,
        investorCount: investments.length,
        averageCommitment: investments.length > 0 ? totalCommitted / investments.length : 0,
        byStatus,
      },
      investors: investorCapital,
    });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Capital tracking error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
