/**
 * LP Current Tranche API
 *
 * GET — Returns the current active tranche for LP display during onboarding.
 * Used by the LP commitment step to show current price and availability.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  getActiveTranche,
  getFundProgress,
} from "@/lib/funds/tranche-service";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const auth = await requireLPAuthAppRouter();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const fundId = searchParams.get("fundId");

    // If no fundId, try to get from investor profile
    let resolvedFundId = fundId || undefined;

    if (!resolvedFundId) {
      const investor = await prisma.investor.findFirst({
        where: { userId: auth.userId },
        select: { fundId: true },
      });

      resolvedFundId = investor?.fundId || undefined;
    }

    if (!resolvedFundId) {
      return NextResponse.json(
        { error: "Fund ID required" },
        { status: 400 },
      );
    }

    const fund = await prisma.fund.findUnique({
      where: { id: resolvedFundId },
      select: {
        id: true,
        name: true,
        status: true,
        targetRaise: true,
        minimumInvestment: true,
        managementFeePct: true,
        carryPct: true,
        hurdleRate: true,
        waterfallType: true,
        termYears: true,
        extensionYears: true,
      },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const activeTranche = await getActiveTranche(resolvedFundId);
    const progress = await getFundProgress(resolvedFundId);

    return NextResponse.json({
      fund: {
        id: fund.id,
        name: fund.name,
        status: fund.status,
        targetRaise: parseFloat(fund.targetRaise.toString()),
        minimumInvestment: parseFloat(fund.minimumInvestment.toString()),
        economics: {
          managementFeePct: fund.managementFeePct
            ? parseFloat(fund.managementFeePct.toString())
            : null,
          carryPct: fund.carryPct
            ? parseFloat(fund.carryPct.toString())
            : null,
          hurdleRate: fund.hurdleRate
            ? parseFloat(fund.hurdleRate.toString())
            : null,
          waterfallType: fund.waterfallType,
          termYears: fund.termYears,
          extensionYears: fund.extensionYears,
        },
      },
      activeTranche,
      progress: progress
        ? {
            percentRaised: progress.percentRaised,
            totalUnits: progress.totalUnits,
            unitsSold: progress.unitsSold,
            unitsAvailable: progress.unitsAvailable,
          }
        : null,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
