import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const {
      fundId,
      initialThresholdEnabled,
      initialThresholdAmount,
      fullAuthorizedAmount,
      // Legacy fields for backward compatibility
      thresholdEnabled,
      thresholdAmount,
      // Fund Economics fields (optional)
      managementFeePct,
      carryPct,
      hurdleRate,
      waterfallType,
      termYears,
      extensionYears,
    } = body;

    if (!fundId) {
      return NextResponse.json({ error: "Fund ID required" }, { status: 400 });
    }

    const effectiveThresholdEnabled = initialThresholdEnabled ?? thresholdEnabled;
    const effectiveThresholdAmount = initialThresholdAmount ?? thresholdAmount;

    if (effectiveThresholdEnabled && (!effectiveThresholdAmount || effectiveThresholdAmount <= 0)) {
      return NextResponse.json(
        { error: "Initial threshold amount must be greater than 0 when enabled" },
        { status: 400 }
      );
    }

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

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip") ||
      "";
    const userAgent = request.headers.get("user-agent") || "";

    // Build economics update (only include fields explicitly provided)
    const economicsUpdate: Record<string, any> = {};
    const economicsPreviousValue: Record<string, any> = {};
    const economicsNewValue: Record<string, any> = {};

    if (managementFeePct !== undefined) {
      economicsPreviousValue.managementFeePct = fund.managementFeePct ? Number(fund.managementFeePct) * 100 : null;
      economicsUpdate.managementFeePct = managementFeePct ? parseFloat(managementFeePct) / 100 : null;
      economicsNewValue.managementFeePct = managementFeePct ? parseFloat(managementFeePct) : null;
    }
    if (carryPct !== undefined) {
      economicsPreviousValue.carryPct = fund.carryPct ? Number(fund.carryPct) * 100 : null;
      economicsUpdate.carryPct = carryPct ? parseFloat(carryPct) / 100 : null;
      economicsNewValue.carryPct = carryPct ? parseFloat(carryPct) : null;
    }
    if (hurdleRate !== undefined) {
      economicsPreviousValue.hurdleRate = fund.hurdleRate ? Number(fund.hurdleRate) * 100 : null;
      economicsUpdate.hurdleRate = hurdleRate ? parseFloat(hurdleRate) / 100 : null;
      economicsNewValue.hurdleRate = hurdleRate ? parseFloat(hurdleRate) : null;
    }
    if (waterfallType !== undefined) {
      economicsPreviousValue.waterfallType = fund.waterfallType;
      economicsUpdate.waterfallType = waterfallType || null;
      economicsNewValue.waterfallType = waterfallType || null;
    }
    if (termYears !== undefined) {
      economicsPreviousValue.termYears = fund.termYears;
      economicsUpdate.termYears = termYears ? parseInt(termYears) : null;
      economicsNewValue.termYears = termYears ? parseInt(termYears) : null;
    }
    if (extensionYears !== undefined) {
      economicsPreviousValue.extensionYears = fund.extensionYears;
      economicsUpdate.extensionYears = extensionYears ? parseInt(extensionYears) : null;
      economicsNewValue.extensionYears = extensionYears ? parseInt(extensionYears) : null;
    }

    const hasEconomicsUpdate = Object.keys(economicsUpdate).length > 0;
    const hasThresholdUpdate = effectiveThresholdEnabled !== undefined;

    // Early return if nothing to update
    if (!hasEconomicsUpdate && !hasThresholdUpdate) {
      return NextResponse.json({ success: true });
    }

    const auditEntry = {
      timestamp: new Date().toISOString(),
      ip,
      userAgent,
      action: hasEconomicsUpdate ? "UPDATE_FUND_SETTINGS" : "UPDATE_THRESHOLD_SETTINGS",
      userId: user.id,
      previousValue: {
        initialThresholdEnabled: fund.initialThresholdEnabled || fund.aggregate?.initialThresholdEnabled || false,
        initialThresholdAmount: fund.initialThresholdAmount
          ? Number(fund.initialThresholdAmount)
          : fund.aggregate?.initialThresholdAmount
            ? Number(fund.aggregate.initialThresholdAmount)
            : null,
        fullAuthorizedAmount: fund.fullAuthorizedAmount
          ? Number(fund.fullAuthorizedAmount)
          : fund.aggregate?.fullAuthorizedAmount
            ? Number(fund.aggregate.fullAuthorizedAmount)
            : null,
        ...(hasEconomicsUpdate ? economicsPreviousValue : {}),
      },
      newValue: {
        initialThresholdEnabled: effectiveThresholdEnabled,
        initialThresholdAmount: effectiveThresholdEnabled ? effectiveThresholdAmount : null,
        fullAuthorizedAmount: fullAuthorizedAmount || null,
        ...(hasEconomicsUpdate ? economicsNewValue : {}),
      },
    };

    // Build threshold update data (only if threshold fields were provided)
    const thresholdUpdate: Record<string, any> = {};
    if (hasThresholdUpdate) {
      thresholdUpdate.initialThresholdEnabled = effectiveThresholdEnabled;
      thresholdUpdate.initialThresholdAmount = effectiveThresholdEnabled ? effectiveThresholdAmount : null;
      thresholdUpdate.fullAuthorizedAmount = fullAuthorizedAmount || null;
      thresholdUpdate.capitalCallThresholdEnabled = effectiveThresholdEnabled;
      thresholdUpdate.capitalCallThreshold = effectiveThresholdEnabled ? effectiveThresholdAmount : null;
    }

    // Update Fund model with threshold and/or economics fields
    await prisma.fund.update({
      where: { id: fundId },
      data: {
        ...thresholdUpdate,
        ...economicsUpdate,
      },
    });

    // Update or create FundAggregate (only when threshold fields change)
    if (hasThresholdUpdate) {
      const existingAudit = (fund.aggregate?.audit as any[]) || [];

      if (fund.aggregate) {
        await prisma.fundAggregate.update({
          where: { id: fund.aggregate.id },
          data: {
            initialThresholdEnabled: effectiveThresholdEnabled,
            initialThresholdAmount: effectiveThresholdEnabled ? effectiveThresholdAmount : null,
            fullAuthorizedAmount: fullAuthorizedAmount || null,
            // Keep legacy fields in sync
            thresholdEnabled: effectiveThresholdEnabled,
            thresholdAmount: effectiveThresholdEnabled ? effectiveThresholdAmount : null,
            audit: [...existingAudit, auditEntry],
          },
        });
      } else {
        await prisma.fundAggregate.create({
          data: {
            fundId,
            initialThresholdEnabled: effectiveThresholdEnabled,
            initialThresholdAmount: effectiveThresholdEnabled ? effectiveThresholdAmount : null,
            fullAuthorizedAmount: fullAuthorizedAmount || null,
            thresholdEnabled: effectiveThresholdEnabled,
            thresholdAmount: effectiveThresholdEnabled ? effectiveThresholdAmount : null,
            audit: [auditEntry],
          },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        eventType: hasEconomicsUpdate ? "FUND_SETTINGS_UPDATE" : "FUND_THRESHOLD_UPDATE",
        userId: user.id,
        teamId: fund.teamId,
        resourceType: "FUND",
        resourceId: fundId,
        ipAddress: ip,
        userAgent,
        metadata: auditEntry,
      },
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Error updating fund settings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
