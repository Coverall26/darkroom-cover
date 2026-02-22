import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fundId: string }> }
) {
  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const { fundId } = await params;

    const user = await prisma.user.findUnique({
      where: { email: auth.email },
      include: {
        teams: {
          where: { role: { in: ["ADMIN", "OWNER", "SUPER_ADMIN"] } },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      include: { aggregate: true },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const hasAccess = user.teams.some((ut) => ut.teamId === fund.teamId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const aggregate = fund.aggregate;

    // Get initial threshold values (prioritize new fields, fallback to legacy)
    const initialThresholdEnabled = fund.initialThresholdEnabled || 
      aggregate?.initialThresholdEnabled || 
      fund.capitalCallThresholdEnabled ||
      aggregate?.thresholdEnabled || 
      false;
    
    const initialThresholdAmount = fund.initialThresholdAmount 
      ? Number(fund.initialThresholdAmount)
      : aggregate?.initialThresholdAmount 
        ? Number(aggregate.initialThresholdAmount)
        : fund.capitalCallThreshold
          ? Number(fund.capitalCallThreshold)
          : aggregate?.thresholdAmount
            ? Number(aggregate.thresholdAmount)
            : null;

    // Full authorized amount
    const fullAuthorizedAmount = fund.fullAuthorizedAmount
      ? Number(fund.fullAuthorizedAmount)
      : aggregate?.fullAuthorizedAmount
        ? Number(aggregate.fullAuthorizedAmount)
        : null;

    // Aggregate values
    const totalCommitted = aggregate ? Number(aggregate.totalCommitted) : 0;
    const totalInbound = aggregate ? Number(aggregate.totalInbound) : 0;
    const totalOutbound = aggregate ? Number(aggregate.totalOutbound) : 0;

    // Threshold met status
    const initialThresholdMet = aggregate?.initialThresholdMet || 
      (initialThresholdAmount && totalCommitted >= initialThresholdAmount) ||
      false;

    // Progress calculations
    const fullAuthorizedProgress = fullAuthorizedAmount && fullAuthorizedAmount > 0
      ? Math.min(100, (totalCommitted / fullAuthorizedAmount) * 100)
      : aggregate?.fullAuthorizedProgress
        ? Number(aggregate.fullAuthorizedProgress)
        : 0;

    return NextResponse.json({
      // New fields
      initialThresholdEnabled,
      initialThresholdAmount,
      fullAuthorizedAmount,
      initialThresholdMet,
      fullAuthorizedProgress,
      // Aggregates
      totalCommitted,
      totalInbound,
      totalOutbound,
      // Legacy fields for backward compatibility
      thresholdEnabled: initialThresholdEnabled,
      thresholdAmount: initialThresholdAmount,
      // Fund Economics (convert decimals to display-friendly percentages)
      managementFeePct: fund.managementFeePct ? Number(fund.managementFeePct) * 100 : null,
      carryPct: fund.carryPct ? Number(fund.carryPct) * 100 : null,
      hurdleRate: fund.hurdleRate ? Number(fund.hurdleRate) * 100 : null,
      waterfallType: fund.waterfallType,
      termYears: fund.termYears,
      extensionYears: fund.extensionYears,
    });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Error fetching fund settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
