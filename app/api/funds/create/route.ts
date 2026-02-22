import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const {
      name,
      description,
      entityMode,
      style,
      targetRaise,
      minimumInvestment,
      aumTarget,
      callFrequency,
      thresholdEnabled,
      thresholdAmount,
      stagedCommitmentsEnabled,
      teamId,
      fundSubType,
      managementFeePct,
      carryPct,
      hurdleRate,
      waterfallType,
      termYears,
      extensionYears,
      highWaterMark,
      gpCommitmentAmount,
      gpCommitmentPct,
      recyclingEnabled,
      keyPersonEnabled,
      keyPersonName,
      noFaultDivorceThreshold,
      investmentPeriodYears,
      preferredReturnMethod,
      clawbackProvision,
      mgmtFeeOffsetPct,
      regulationDExemption,
      marketplaceInterest,
      marketplaceDescription,
      marketplaceCategory,
      wireInstructions,
      currency,
    } = body;

    if (!name || !targetRaise || !minimumInvestment || !teamId) {
      return NextResponse.json(
        { error: "Missing required fields: name, targetRaise, minimumInvestment, teamId" },
        { status: 400 }
      );
    }

    const parsedTargetRaise = parseFloat(targetRaise);
    const parsedMinimumInvestment = parseFloat(minimumInvestment);

    if (isNaN(parsedTargetRaise) || parsedTargetRaise <= 0 || parsedTargetRaise > 100_000_000_000) {
      return NextResponse.json(
        { error: "targetRaise must be a positive number up to $100B" },
        { status: 400 }
      );
    }

    if (isNaN(parsedMinimumInvestment) || parsedMinimumInvestment <= 0 || parsedMinimumInvestment > parsedTargetRaise) {
      return NextResponse.json(
        { error: "minimumInvestment must be a positive number not exceeding targetRaise" },
        { status: 400 }
      );
    }

    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        users: {
          some: {
            userId: auth.userId,
            role: { in: ["ADMIN", "OWNER", "SUPER_ADMIN"] },
          },
        },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: "Team not found or insufficient permissions" },
        { status: 403 }
      );
    }

    // Validate entityMode if provided
    const validEntityModes = ["FUND", "STARTUP"];
    const resolvedEntityMode = entityMode && validEntityModes.includes(entityMode) ? entityMode : "FUND";

    // Validate fund economics fields (only for FUND mode, all optional)
    const parsedManagementFee = managementFeePct ? parseFloat(managementFeePct) : null;
    if (parsedManagementFee !== null && (isNaN(parsedManagementFee) || parsedManagementFee < 0 || parsedManagementFee > 10)) {
      return NextResponse.json(
        { error: "managementFeePct must be between 0 and 10 (percent)" },
        { status: 400 }
      );
    }

    const parsedCarry = carryPct ? parseFloat(carryPct) : null;
    if (parsedCarry !== null && (isNaN(parsedCarry) || parsedCarry < 0 || parsedCarry > 50)) {
      return NextResponse.json(
        { error: "carryPct must be between 0 and 50 (percent)" },
        { status: 400 }
      );
    }

    const parsedHurdle = hurdleRate ? parseFloat(hurdleRate) : null;
    if (parsedHurdle !== null && (isNaN(parsedHurdle) || parsedHurdle < 0 || parsedHurdle > 20)) {
      return NextResponse.json(
        { error: "hurdleRate must be between 0 and 20 (percent)" },
        { status: 400 }
      );
    }

    const validWaterfallTypes = ["EUROPEAN", "AMERICAN", "DEAL_BY_DEAL"];
    if (waterfallType && !validWaterfallTypes.includes(waterfallType)) {
      return NextResponse.json(
        { error: "waterfallType must be one of: EUROPEAN, AMERICAN, DEAL_BY_DEAL" },
        { status: 400 }
      );
    }

    const parsedTermYears = termYears ? parseInt(termYears) : null;
    if (parsedTermYears !== null && (isNaN(parsedTermYears) || parsedTermYears < 1 || parsedTermYears > 30)) {
      return NextResponse.json(
        { error: "termYears must be an integer between 1 and 30" },
        { status: 400 }
      );
    }

    const parsedExtensionYears = extensionYears ? parseInt(extensionYears) : null;
    if (parsedExtensionYears !== null && (isNaN(parsedExtensionYears) || parsedExtensionYears < 0 || parsedExtensionYears > 5)) {
      return NextResponse.json(
        { error: "extensionYears must be an integer between 0 and 5" },
        { status: 400 }
      );
    }

    // Validate and parse new fund fields
    const parsedGpCommitment = gpCommitmentAmount ? parseFloat(gpCommitmentAmount) : null;
    const parsedGpCommitmentPct = gpCommitmentPct ? parseFloat(gpCommitmentPct) : null;
    const parsedNoFaultThreshold = noFaultDivorceThreshold ? parseFloat(noFaultDivorceThreshold) : null;
    const parsedInvestmentPeriod = investmentPeriodYears ? parseInt(investmentPeriodYears) : null;

    const fund = await prisma.fund.create({
      data: {
        teamId,
        name,
        description: description || null,
        entityMode: resolvedEntityMode,
        style: style || null,
        fundSubType: fundSubType || null,
        targetRaise: parsedTargetRaise,
        minimumInvestment: parsedMinimumInvestment,
        currency: currency || "USD",
        aumTarget: aumTarget ? parseFloat(aumTarget) : null,
        callFrequency: callFrequency || "AS_NEEDED",
        capitalCallThresholdEnabled: thresholdEnabled || false,
        capitalCallThreshold: thresholdAmount ? parseFloat(thresholdAmount) : null,
        stagedCommitmentsEnabled: stagedCommitmentsEnabled || false,
        // Fund Economics (store percentages as decimals: 2.5% → 0.0250)
        managementFeePct: parsedManagementFee !== null ? parsedManagementFee / 100 : null,
        carryPct: parsedCarry !== null ? parsedCarry / 100 : null,
        hurdleRate: parsedHurdle !== null ? parsedHurdle / 100 : null,
        waterfallType: waterfallType || null,
        termYears: parsedTermYears,
        extensionYears: parsedExtensionYears,
        highWaterMark: highWaterMark ?? false,
        gpCommitmentAmount: parsedGpCommitment,
        gpCommitmentPct: parsedGpCommitmentPct !== null ? parsedGpCommitmentPct / 100 : null,
        recyclingEnabled: recyclingEnabled ?? false,
        keyPersonEnabled: keyPersonEnabled ?? false,
        keyPersonName: keyPersonEnabled ? (keyPersonName || null) : null,
        noFaultDivorceThreshold: parsedNoFaultThreshold,
        investmentPeriodYears: parsedInvestmentPeriod,
        preferredReturnMethod: preferredReturnMethod || "COMPOUNDED",
        clawbackProvision: clawbackProvision ?? true,
        mgmtFeeOffsetPct: mgmtFeeOffsetPct ? parseFloat(mgmtFeeOffsetPct) : null,
        regulationDExemption: regulationDExemption || null,
        marketplaceInterest: marketplaceInterest ?? false,
        marketplaceDescription: marketplaceDescription || null,
        marketplaceCategory: marketplaceCategory || null,
        marketplaceInterestDate: marketplaceInterest ? new Date() : null,
        wireInstructions: wireInstructions || null,
        createdBy: auth.userId,
        audit: [
          {
            timestamp: new Date().toISOString(),
            userId: auth.userId,
            action: "FUND_CREATED",
            details: {
              name,
              fundSubType,
              targetRaise,
              minimumInvestment,
              managementFeePct: parsedManagementFee,
              carryPct: parsedCarry,
              hurdleRate: parsedHurdle,
              waterfallType,
              termYears: parsedTermYears,
              highWaterMark,
            },
          },
        ],
      },
    });

    await prisma.fundAggregate.create({
      data: {
        fundId: fund.id,
        totalInbound: 0,
        totalOutbound: 0,
        totalCommitted: 0,
        thresholdEnabled: thresholdEnabled || false,
        thresholdAmount: thresholdAmount ? parseFloat(thresholdAmount) : null,
        audit: [
          {
            timestamp: new Date().toISOString(),
            action: "AGGREGATE_CREATED",
            fundId: fund.id,
          },
        ],
      },
    });

    return NextResponse.json({ 
      success: true, 
      fund: { id: fund.id, name: fund.name } 
    });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Fund creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
