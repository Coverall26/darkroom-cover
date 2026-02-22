import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Fund ID required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        teams: {
          include: {
            team: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    const isGP = user.teams.some(
      (t) => t.role === "ADMIN" || t.role === "OWNER" || t.role === "SUPER_ADMIN"
    );

    if (!isGP) {
      return NextResponse.json({ error: "GP access required" }, { status: 403 });
    }

    const teamIds = user.teams.map((t) => t.teamId);

    const fund = await prisma.fund.findFirst({
      where: {
        id,
        teamId: { in: teamIds },
      },
      include: {
        aggregate: true,
        investments: {
          include: {
            investor: {
              include: {
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        capitalCalls: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        distributions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    // Get threshold values (prioritize new fields, fallback to legacy)
    const initialThresholdEnabled = fund.initialThresholdEnabled ||
      fund.aggregate?.initialThresholdEnabled ||
      fund.capitalCallThresholdEnabled ||
      fund.aggregate?.thresholdEnabled ||
      false;
    const initialThresholdAmount = fund.initialThresholdAmount
      ? Number(fund.initialThresholdAmount)
      : fund.aggregate?.initialThresholdAmount
        ? Number(fund.aggregate.initialThresholdAmount)
        : fund.capitalCallThreshold
          ? Number(fund.capitalCallThreshold)
          : fund.aggregate?.thresholdAmount
            ? Number(fund.aggregate.thresholdAmount)
            : null;
    const fullAuthorizedAmount = fund.fullAuthorizedAmount
      ? Number(fund.fullAuthorizedAmount)
      : fund.aggregate?.fullAuthorizedAmount
        ? Number(fund.aggregate.fullAuthorizedAmount)
        : null;
    const totalCommitted = fund.aggregate ? Number(fund.aggregate.totalCommitted) : Number(fund.currentRaise);
    const initialThresholdMet = !initialThresholdEnabled || !initialThresholdAmount || totalCommitted >= initialThresholdAmount;

    const response = {
      id: fund.id,
      teamId: fund.teamId,
      name: fund.name,
      description: fund.description,
      style: fund.style,
      status: fund.status,
      entityMode: fund.entityMode,
      fundSubType: fund.fundSubType,
      regulationDExemption: fund.regulationDExemption,
      targetRaise: Number(fund.targetRaise),
      currentRaise: Number(fund.currentRaise),
      minimumInvestment: Number(fund.minimumInvestment),
      aumTarget: fund.aumTarget ? Number(fund.aumTarget) : null,
      callFrequency: fund.callFrequency,
      capitalCallThresholdEnabled: fund.capitalCallThresholdEnabled,
      capitalCallThreshold: fund.capitalCallThreshold
        ? Number(fund.capitalCallThreshold)
        : null,
      // Fund economics
      managementFeePct: fund.managementFeePct ? Number(fund.managementFeePct) * 100 : null,
      carryPct: fund.carryPct ? Number(fund.carryPct) * 100 : null,
      hurdleRate: fund.hurdleRate ? Number(fund.hurdleRate) * 100 : null,
      waterfallType: fund.waterfallType,
      termYears: fund.termYears,
      extensionYears: fund.extensionYears,
      highWaterMark: fund.highWaterMark,
      gpCommitmentAmount: fund.gpCommitmentAmount ? Number(fund.gpCommitmentAmount) : null,
      gpCommitmentPct: fund.gpCommitmentPct ? Number(fund.gpCommitmentPct) * 100 : null,
      investmentPeriodYears: fund.investmentPeriodYears,
      preferredReturnMethod: fund.preferredReturnMethod,
      recyclingEnabled: fund.recyclingEnabled,
      clawbackProvision: fund.clawbackProvision,
      // New threshold fields
      initialThresholdEnabled,
      initialThresholdAmount,
      fullAuthorizedAmount,
      initialThresholdMet,
      stagedCommitmentsEnabled: fund.stagedCommitmentsEnabled,
      marketplaceInterest: fund.marketplaceInterest,
      closingDate: fund.closingDate?.toISOString() || null,
      createdAt: fund.createdAt.toISOString(),
      aggregate: fund.aggregate
        ? {
            totalInbound: Number(fund.aggregate.totalInbound),
            totalOutbound: Number(fund.aggregate.totalOutbound),
            totalCommitted: Number(fund.aggregate.totalCommitted),
            thresholdEnabled: fund.aggregate.thresholdEnabled,
            thresholdAmount: fund.aggregate.thresholdAmount
              ? Number(fund.aggregate.thresholdAmount)
              : null,
            // New threshold fields in aggregate
            initialThresholdEnabled: fund.aggregate.initialThresholdEnabled,
            initialThresholdAmount: fund.aggregate.initialThresholdAmount
              ? Number(fund.aggregate.initialThresholdAmount)
              : null,
            fullAuthorizedAmount: fund.aggregate.fullAuthorizedAmount
              ? Number(fund.aggregate.fullAuthorizedAmount)
              : null,
            initialThresholdMet: fund.aggregate.initialThresholdMet,
            initialThresholdMetAt: fund.aggregate.initialThresholdMetAt?.toISOString() || null,
            fullAuthorizedProgress: fund.aggregate.fullAuthorizedProgress
              ? Number(fund.aggregate.fullAuthorizedProgress)
              : 0,
          }
        : null,
      investors: fund.investments.map((inv) => ({
        id: inv.investor.id,
        name: inv.investor.user.name || "Unknown",
        email: inv.investor.user.email || "",
        commitment: Number(inv.commitmentAmount),
        funded: Number(inv.fundedAmount),
        status: inv.status,
      })),
      capitalCalls: fund.capitalCalls.map((call) => ({
        id: call.id,
        callNumber: call.callNumber,
        amount: Number(call.amount),
        dueDate: call.dueDate.toISOString(),
        status: call.status,
      })),
      distributions: fund.distributions.map((dist) => ({
        id: dist.id,
        distributionNumber: dist.distributionNumber,
        totalAmount: Number(dist.totalAmount),
        distributionDate: dist.distributionDate.toISOString(),
        status: dist.status,
      })),
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Fund details error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
