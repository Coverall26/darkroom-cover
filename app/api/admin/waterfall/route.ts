import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const fundId = searchParams.get("fundId");

  const fundWhere = fundId
    ? { id: fundId, teamId: auth.teamId }
    : { teamId: auth.teamId };

  const funds = await prisma.fund.findMany({
    where: fundWhere,
    include: {
      aggregate: true,
      investments: {
        include: {
          investor: {
            include: {
              user: {
                select: { name: true, email: true },
              },
            },
          },
        },
      },
      distributions: {
        where: { status: "COMPLETED" },
      },
    },
  });

  const waterfallData = funds.map((fund) => {
    const customSettings = (fund.customSettings as any) || {};
    const preferredReturn = customSettings.preferredReturn || 8;
    const carriedInterest = customSettings.carriedInterest || 20;
    const catchUpPercentage = customSettings.catchUpPercentage || 100;
    const hurdleRate = customSettings.hurdleRate || 0;

    const totalCapitalContributed = fund.investments.reduce(
      (sum, inv) => sum + Number(inv.fundedAmount),
      0
    );

    const totalDistributions = fund.distributions.reduce(
      (sum, d) => sum + Number(d.totalAmount),
      0
    );

    const totalProceeds = totalDistributions;

    const prefReturnAmount = totalCapitalContributed * (preferredReturn / 100);
    let remainingProceeds = totalProceeds;

    const returnOfCapital = Math.min(remainingProceeds, totalCapitalContributed);
    remainingProceeds -= returnOfCapital;

    const preferredReturnPaid = Math.min(remainingProceeds, prefReturnAmount);
    remainingProceeds -= preferredReturnPaid;

    const profitAfterPref = remainingProceeds;
    const targetGPCatchUp = (returnOfCapital + preferredReturnPaid + profitAfterPref) * (carriedInterest / 100);
    const gpCatchUp = Math.min(remainingProceeds, targetGPCatchUp);
    remainingProceeds -= gpCatchUp;

    const lpCarriedInterest = remainingProceeds * ((100 - carriedInterest) / 100);
    const gpCarriedInterest = remainingProceeds * (carriedInterest / 100);

    const tiers = [
      {
        name: "Return of Capital",
        type: "return_of_capital",
        lpShare: 100,
        gpShare: 0,
        amount: returnOfCapital,
        lpAmount: returnOfCapital,
        gpAmount: 0,
      },
      {
        name: `Preferred Return (${preferredReturn}%)`,
        type: "preferred_return",
        lpShare: 100,
        gpShare: 0,
        amount: preferredReturnPaid,
        lpAmount: preferredReturnPaid,
        gpAmount: 0,
      },
      {
        name: "GP Catch-Up",
        type: "catch_up",
        lpShare: 0,
        gpShare: 100,
        amount: gpCatchUp,
        lpAmount: 0,
        gpAmount: gpCatchUp,
      },
      {
        name: `Carried Interest (${100 - carriedInterest}/${carriedInterest})`,
        type: "carried_interest",
        lpShare: 100 - carriedInterest,
        gpShare: carriedInterest,
        amount: lpCarriedInterest + gpCarriedInterest,
        lpAmount: lpCarriedInterest,
        gpAmount: gpCarriedInterest,
      },
    ];

    const totalLP = returnOfCapital + preferredReturnPaid + lpCarriedInterest;
    const totalGP = gpCatchUp + gpCarriedInterest;

    const investorBreakdown = fund.investments.map((inv) => {
      const ownershipPct = totalCapitalContributed > 0
        ? Number(inv.fundedAmount) / totalCapitalContributed
        : 0;

      return {
        investorId: inv.investorId,
        investorName: inv.investor.entityName || inv.investor.user.name || inv.investor.user.email,
        capitalContributed: Number(inv.fundedAmount),
        commitment: Number(inv.commitmentAmount),
        ownershipPercentage: ownershipPct * 100,
        estimatedDistribution: totalLP * ownershipPct,
        returnOfCapital: returnOfCapital * ownershipPct,
        preferredReturn: preferredReturnPaid * ownershipPct,
        profitShare: lpCarriedInterest * ownershipPct,
        multiple: Number(inv.fundedAmount) > 0
          ? (totalLP * ownershipPct) / Number(inv.fundedAmount)
          : 0,
      };
    });

    return {
      fundId: fund.id,
      fundName: fund.name,
      status: fund.status,
      config: {
        preferredReturn,
        carriedInterest,
        catchUpPercentage,
        hurdleRate,
      },
      summary: {
        totalCapitalContributed,
        totalProceeds,
        totalLP,
        totalGP,
        lpMultiple: totalCapitalContributed > 0 ? totalLP / totalCapitalContributed : 0,
        lpSharePercentage: totalProceeds > 0 ? (totalLP / totalProceeds) * 100 : 0,
        gpSharePercentage: totalProceeds > 0 ? (totalGP / totalProceeds) * 100 : 0,
      },
      tiers,
      investorBreakdown,
    };
  });

  return NextResponse.json({
    funds: waterfallData,
    generatedAt: new Date().toISOString(),
  });
}
