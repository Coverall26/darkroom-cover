import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * GET /api/funds/[fundId]/settings
 *
 * Returns fund settings including investor portal toggles, economics, wire instructions.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fundId: string }> },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const { fundId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!fundId) {
    return NextResponse.json({ error: "Fund ID required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      teams: {
        include: {
          team: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
  });

  if (!fund) {
    return NextResponse.json({ error: "Fund not found" }, { status: 404 });
  }

  const hasAccess = user.teams.some(
    (ut: { teamId: string; role: string }) => ut.teamId === fund.teamId && ["ADMIN", "OWNER", "SUPER_ADMIN"].includes(ut.role),
  );

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    fund: {
      id: fund.id,
      name: fund.name,
      entityMode: fund.entityMode,
      ndaGateEnabled: fund.ndaGateEnabled,
      stagedCommitmentsEnabled: fund.stagedCommitmentsEnabled,
      callFrequency: fund.callFrequency,
      minimumInvestment: fund.minimumInvestment ? Number(fund.minimumInvestment) : null,
      capitalCallThresholdEnabled: fund.capitalCallThresholdEnabled,
      capitalCallThreshold: fund.capitalCallThreshold ? Number(fund.capitalCallThreshold) : null,
      managementFeePct: fund.managementFeePct ? Number(fund.managementFeePct) * 100 : null,
      carryPct: fund.carryPct ? Number(fund.carryPct) * 100 : null,
      hurdleRate: fund.hurdleRate ? Number(fund.hurdleRate) * 100 : null,
      waterfallType: fund.waterfallType,
      currency: fund.currency,
      termYears: fund.termYears,
      extensionYears: fund.extensionYears,
      highWaterMark: fund.highWaterMark,
      gpCommitmentAmount: fund.gpCommitmentAmount ? Number(fund.gpCommitmentAmount) : null,
      gpCommitmentPct: fund.gpCommitmentPct ? Number(fund.gpCommitmentPct) * 100 : null,
      investmentPeriodYears: fund.investmentPeriodYears,
      preferredReturnMethod: fund.preferredReturnMethod,
      recyclingEnabled: fund.recyclingEnabled,
      clawbackProvision: fund.clawbackProvision,
      wireInstructions: fund.wireInstructions,
      wireInstructionsUpdatedAt: fund.wireInstructionsUpdatedAt,
      featureFlags: fund.featureFlags,
      currentRaise: Number(fund.currentRaise),
      targetRaise: Number(fund.targetRaise),
      status: fund.status,
      regulationDExemption: fund.regulationDExemption,
    },
  });
}

/**
 * PATCH /api/funds/[fundId]/settings
 *
 * Update fund settings (investor portal, economics, wire instructions, LP visibility).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ fundId: string }> },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const { fundId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!fundId) {
    return NextResponse.json({ error: "Fund ID required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      teams: {
        include: {
          team: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
  });

  if (!fund) {
    return NextResponse.json({ error: "Fund not found" }, { status: 404 });
  }

  const hasAccess = user.teams.some(
    (ut: { teamId: string; role: string }) => ut.teamId === fund.teamId && ["ADMIN", "OWNER", "SUPER_ADMIN"].includes(ut.role),
  );

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const updateData: Record<string, unknown> = {};

    // Boolean toggles
    const booleanFields = [
      "ndaGateEnabled",
      "stagedCommitmentsEnabled",
      "capitalCallThresholdEnabled",
      "highWaterMark",
      "recyclingEnabled",
      "clawbackProvision",
    ] as const;

    for (const field of booleanFields) {
      if (typeof body[field] === "boolean") {
        updateData[field] = body[field];
      }
    }

    // String fields with validation
    if (body.callFrequency && ["AS_NEEDED", "MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"].includes(body.callFrequency)) {
      updateData.callFrequency = body.callFrequency;
    }

    if (body.waterfallType && ["EUROPEAN", "AMERICAN", "DEAL_BY_DEAL"].includes(body.waterfallType)) {
      updateData.waterfallType = body.waterfallType;
    }

    if (body.currency && typeof body.currency === "string" && body.currency.length <= 5) {
      updateData.currency = body.currency;
    }

    // Numeric fields
    if (body.minimumInvestment !== undefined) {
      const val = parseFloat(body.minimumInvestment);
      if (!isNaN(val) && val >= 0 && val <= 100000000000) {
        updateData.minimumInvestment = val;
      }
    }

    if (body.capitalCallThreshold !== undefined) {
      updateData.capitalCallThreshold = body.capitalCallThreshold
        ? parseFloat(body.capitalCallThreshold)
        : null;
    }

    if (body.termYears !== undefined) {
      const val = parseInt(body.termYears, 10);
      if (!isNaN(val) && val >= 0 && val <= 99) {
        updateData.termYears = val;
      }
    }

    if (body.extensionYears !== undefined) {
      const val = parseInt(body.extensionYears, 10);
      if (!isNaN(val) && val >= 0 && val <= 10) {
        updateData.extensionYears = val;
      }
    }

    if (body.investmentPeriodYears !== undefined) {
      const val = parseInt(body.investmentPeriodYears, 10);
      if (!isNaN(val) && val >= 0 && val <= 30) {
        updateData.investmentPeriodYears = val;
      }
    }

    if (body.preferredReturnMethod && ["SIMPLE", "COMPOUND", "NONE"].includes(body.preferredReturnMethod)) {
      updateData.preferredReturnMethod = body.preferredReturnMethod;
    }

    // GP Commitment Amount
    if (body.gpCommitmentAmount !== undefined) {
      const val = parseFloat(body.gpCommitmentAmount);
      if (!isNaN(val) && val >= 0 && val <= 100000000000) {
        updateData.gpCommitmentAmount = val;
      }
    }

    // Percentage fields (client sends display value, stored as decimal)
    const pctFields = [
      { key: "managementFeePct", max: 100 },
      { key: "carryPct", max: 100 },
      { key: "hurdleRate", max: 100 },
      { key: "gpCommitmentPct", max: 100 },
    ] as const;

    for (const { key, max } of pctFields) {
      if (body[key] !== undefined && body[key] !== null) {
        const val = parseFloat(body[key]);
        if (!isNaN(val) && val >= 0 && val <= max) {
          updateData[key] = val / 100; // 2.00 → 0.02
        }
      }
    }

    // Wire instructions (JSON)
    if (body.wireInstructions !== undefined) {
      updateData.wireInstructions = body.wireInstructions;
      updateData.wireInstructionsUpdatedAt = new Date();
      updateData.wireInstructionsUpdatedBy = user.id;
    }

    // Feature flags merge (LP visibility toggles stored in featureFlags JSON)
    if (body.featureFlags !== undefined && typeof body.featureFlags === "object") {
      const existing = (fund.featureFlags as Record<string, unknown>) || {};
      updateData.featureFlags = { ...existing, ...body.featureFlags };
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updatedFund = await prisma.fund.update({
      where: { id: fundId },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        eventType: "FUND_SETTINGS_UPDATE",
        userId: user.id,
        teamId: fund.teamId,
        resourceType: "FUND",
        resourceId: fundId,
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0] || "",
        userAgent: req.headers.get("user-agent") || "",
        metadata: {
          updatedFields: Object.keys(updateData),
          previousValues: Object.fromEntries(
            Object.keys(updateData).map((k) => [k, (fund as Record<string, unknown>)[k]]),
          ),
        },
      },
    }).catch((e: unknown) => reportError(e as Error));

    return NextResponse.json({
      fund: {
        id: updatedFund.id,
        name: updatedFund.name,
        entityMode: updatedFund.entityMode,
        ndaGateEnabled: updatedFund.ndaGateEnabled,
        stagedCommitmentsEnabled: updatedFund.stagedCommitmentsEnabled,
        callFrequency: updatedFund.callFrequency,
        minimumInvestment: updatedFund.minimumInvestment ? Number(updatedFund.minimumInvestment) : null,
        capitalCallThresholdEnabled: updatedFund.capitalCallThresholdEnabled,
        capitalCallThreshold: updatedFund.capitalCallThreshold ? Number(updatedFund.capitalCallThreshold) : null,
        managementFeePct: updatedFund.managementFeePct ? Number(updatedFund.managementFeePct) * 100 : null,
        carryPct: updatedFund.carryPct ? Number(updatedFund.carryPct) * 100 : null,
        hurdleRate: updatedFund.hurdleRate ? Number(updatedFund.hurdleRate) * 100 : null,
        waterfallType: updatedFund.waterfallType,
        currency: updatedFund.currency,
        termYears: updatedFund.termYears,
        extensionYears: updatedFund.extensionYears,
        highWaterMark: updatedFund.highWaterMark,
        gpCommitmentAmount: updatedFund.gpCommitmentAmount ? Number(updatedFund.gpCommitmentAmount) : null,
        gpCommitmentPct: updatedFund.gpCommitmentPct ? Number(updatedFund.gpCommitmentPct) * 100 : null,
        investmentPeriodYears: updatedFund.investmentPeriodYears,
        preferredReturnMethod: updatedFund.preferredReturnMethod,
        recyclingEnabled: updatedFund.recyclingEnabled,
        clawbackProvision: updatedFund.clawbackProvision,
        wireInstructions: updatedFund.wireInstructions,
        wireInstructionsUpdatedAt: updatedFund.wireInstructionsUpdatedAt,
        featureFlags: updatedFund.featureFlags,
        currentRaise: Number(updatedFund.currentRaise),
        targetRaise: Number(updatedFund.targetRaise),
        status: updatedFund.status,
        regulationDExemption: updatedFund.regulationDExemption,
      },
    });
  } catch (error) {
    reportError(error as Error, { action: "fund_settings_update", fundId });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
