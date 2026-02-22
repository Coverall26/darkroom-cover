import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import {
  getAumHistory,
  takeAumSnapshot,
} from "@/lib/funds/aum-calculator";
import type { AumPeriod } from "@/lib/funds/aum-calculator";

export const dynamic = "force-dynamic";

const VALID_PERIODS = ["DAILY", "WEEKLY", "MONTHLY", "ANNUAL"];

/**
 * Inline GP auth check (equivalent to getUserWithRole for App Router).
 * Returns the user's team IDs or a NextResponse error.
 */
async function authenticateGP(): Promise<
  | { userId: string; teamIds: string[] }
  | NextResponse
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 },
    );
  }

  const { default: prisma } = await import("@/lib/prisma");

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      role: true,
      teams: { select: { teamId: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.role !== "GP") {
    return NextResponse.json(
      { error: "GP access required" },
      { status: 403 },
    );
  }

  const teamIds = user.teams.map((t) => t.teamId);
  if (teamIds.length === 0) {
    return NextResponse.json({ error: "No team access" }, { status: 403 });
  }

  return { userId: user.id, teamIds };
}

/**
 * GET /api/admin/reports/aum/history?fundId=xxx&period=DAILY&from=...&to=...&limit=90
 *
 * Returns historical AUM snapshots for charting and trend analysis.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateGP();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const fundId = searchParams.get("fundId");
    const period = searchParams.get("period");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limitParam = searchParams.get("limit");

    if (!fundId) {
      return NextResponse.json(
        { error: "fundId is required" },
        { status: 400 },
      );
    }

    if (period && !VALID_PERIODS.includes(period)) {
      return NextResponse.json(
        { error: `period must be one of: ${VALID_PERIODS.join(", ")}` },
        { status: 400 },
      );
    }

    const parsedLimit = limitParam
      ? Math.min(parseInt(limitParam, 10) || 90, 1000)
      : 90;

    const snapshots = await getAumHistory(fundId, {
      period: period as AumPeriod | undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: parsedLimit,
    });

    return NextResponse.json({
      fundId,
      period: period || "ALL",
      count: snapshots.length,
      snapshots: snapshots.map((s) => ({
        date: s.date.toISOString(),
        period: s.period,
        grossAum: parseFloat(s.grossAum.toString()),
        netAum: parseFloat(s.netAum.toString()),
        nav: parseFloat(s.nav.toString()),
        totalCommitted: parseFloat(s.totalCommitted.toString()),
        totalFunded: parseFloat(s.totalFunded.toString()),
        totalDistributed: parseFloat(s.totalDistributed.toString()),
        deductions: {
          managementFees: parseFloat(s.managementFees.toString()),
          performanceFees: parseFloat(s.performanceFees.toString()),
          orgFees: parseFloat(s.orgFees.toString()),
          expenses: parseFloat(s.expenses.toString()),
          total: parseFloat(s.totalDeductions.toString()),
        },
        rates: {
          managementFeeRate: s.managementFeeRate
            ? parseFloat(s.managementFeeRate.toString())
            : null,
          carryRate: s.carryRate
            ? parseFloat(s.carryRate.toString())
            : null,
          orgFeeRate: s.orgFeeRate
            ? parseFloat(s.orgFeeRate.toString())
            : null,
          expenseRate: s.expenseRate
            ? parseFloat(s.expenseRate.toString())
            : null,
        },
        investorCount: s.investorCount,
      })),
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching AUM history:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/reports/aum/history
 *
 * Manually trigger an AUM snapshot for a fund.
 * Body: { fundId: string, period?: AumPeriod }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateGP();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { fundId, period } = body;

    if (!fundId || typeof fundId !== "string") {
      return NextResponse.json(
        { error: "fundId is required" },
        { status: 400 },
      );
    }

    if (period && !VALID_PERIODS.includes(period)) {
      return NextResponse.json(
        { error: `period must be one of: ${VALID_PERIODS.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await takeAumSnapshot(
      fundId,
      period as AumPeriod | undefined,
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        snapshotId: result.snapshotId,
        message: "AUM snapshot created",
      },
      { status: 201 },
    );
  } catch (error) {
    reportError(error as Error);
    console.error("Error creating AUM snapshot:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
