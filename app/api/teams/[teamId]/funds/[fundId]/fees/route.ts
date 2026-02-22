/**
 * Fund Fee Management API
 *
 * GET  /api/teams/[teamId]/funds/[fundId]/fees — Get fee settings + AUM config
 * PATCH /api/teams/[teamId]/funds/[fundId]/fees — Update fee rates + AUM frequency
 *
 * ADMIN, OWNER, and SUPER_ADMIN roles only.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; fundId: string }>;
};

const VALID_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "ANNUAL"] as const;
const VALID_WATERFALL_TYPES = ["EUROPEAN", "AMERICAN", "DEAL_BY_DEAL"] as const;

/**
 * GET /api/teams/[teamId]/funds/[fundId]/fees
 * Returns current fee rates and AUM calculation settings.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId, fundId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: {
        id: true,
        name: true,
        managementFeePct: true,
        carryPct: true,
        hurdleRate: true,
        orgFeePct: true,
        expenseRatioPct: true,
        waterfallType: true,
        aumCalculationFrequency: true,
        aumTarget: true,
        termYears: true,
        extensionYears: true,
        currency: true,
        createdAt: true,
      },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    return NextResponse.json({
      fundId: fund.id,
      fundName: fund.name,
      fees: {
        managementFeePct: fund.managementFeePct
          ? parseFloat(fund.managementFeePct.toString())
          : null,
        carryPct: fund.carryPct
          ? parseFloat(fund.carryPct.toString())
          : null,
        hurdleRate: fund.hurdleRate
          ? parseFloat(fund.hurdleRate.toString())
          : null,
        orgFeePct: fund.orgFeePct
          ? parseFloat(fund.orgFeePct.toString())
          : null,
        expenseRatioPct: fund.expenseRatioPct
          ? parseFloat(fund.expenseRatioPct.toString())
          : null,
        waterfallType: fund.waterfallType,
      },
      aumSettings: {
        calculationFrequency: fund.aumCalculationFrequency,
        aumTarget: fund.aumTarget
          ? parseFloat(fund.aumTarget.toString())
          : null,
      },
      terms: {
        termYears: fund.termYears,
        extensionYears: fund.extensionYears,
        currency: fund.currency,
      },
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching fund fees:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/teams/[teamId]/funds/[fundId]/fees
 * Update fee rates and AUM calculation frequency.
 *
 * Body (all fields optional):
 *   managementFeePct: number (e.g., 0.02 for 2%)
 *   carryPct: number (e.g., 0.20 for 20%)
 *   hurdleRate: number (e.g., 0.08 for 8%)
 *   orgFeePct: number (e.g., 0.005 for 0.5%)
 *   expenseRatioPct: number (e.g., 0.003 for 0.3%)
 *   waterfallType: "EUROPEAN" | "AMERICAN" | "DEAL_BY_DEAL"
 *   aumCalculationFrequency: "DAILY" | "WEEKLY" | "MONTHLY" | "ANNUAL"
 *   aumTarget: number
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { teamId, fundId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: {
        id: true,
        managementFeePct: true,
        carryPct: true,
        hurdleRate: true,
        orgFeePct: true,
        expenseRatioPct: true,
        waterfallType: true,
        aumCalculationFrequency: true,
        aumTarget: true,
      },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const body = await req.json();
    const updates: Record<string, any> = {};
    const changes: Record<string, { from: any; to: any }> = {};

    // Validate and collect fee rate updates
    if (body.managementFeePct !== undefined) {
      const val = parseFloat(body.managementFeePct);
      if (isNaN(val) || val < 0 || val > 1) {
        return NextResponse.json(
          { error: "managementFeePct must be between 0 and 1 (e.g., 0.02 for 2%)" },
          { status: 400 },
        );
      }
      updates.managementFeePct = val;
      changes.managementFeePct = {
        from: fund.managementFeePct?.toString() ?? null,
        to: val,
      };
    }

    if (body.carryPct !== undefined) {
      const val = parseFloat(body.carryPct);
      if (isNaN(val) || val < 0 || val > 1) {
        return NextResponse.json(
          { error: "carryPct must be between 0 and 1 (e.g., 0.20 for 20%)" },
          { status: 400 },
        );
      }
      updates.carryPct = val;
      changes.carryPct = {
        from: fund.carryPct?.toString() ?? null,
        to: val,
      };
    }

    if (body.hurdleRate !== undefined) {
      const val = parseFloat(body.hurdleRate);
      if (isNaN(val) || val < 0 || val > 1) {
        return NextResponse.json(
          { error: "hurdleRate must be between 0 and 1 (e.g., 0.08 for 8%)" },
          { status: 400 },
        );
      }
      updates.hurdleRate = val;
      changes.hurdleRate = {
        from: fund.hurdleRate?.toString() ?? null,
        to: val,
      };
    }

    if (body.orgFeePct !== undefined) {
      const val = parseFloat(body.orgFeePct);
      if (isNaN(val) || val < 0 || val > 1) {
        return NextResponse.json(
          { error: "orgFeePct must be between 0 and 1 (e.g., 0.005 for 0.5%)" },
          { status: 400 },
        );
      }
      updates.orgFeePct = val;
      changes.orgFeePct = {
        from: fund.orgFeePct?.toString() ?? null,
        to: val,
      };
    }

    if (body.expenseRatioPct !== undefined) {
      const val = parseFloat(body.expenseRatioPct);
      if (isNaN(val) || val < 0 || val > 1) {
        return NextResponse.json(
          { error: "expenseRatioPct must be between 0 and 1 (e.g., 0.003 for 0.3%)" },
          { status: 400 },
        );
      }
      updates.expenseRatioPct = val;
      changes.expenseRatioPct = {
        from: fund.expenseRatioPct?.toString() ?? null,
        to: val,
      };
    }

    if (body.waterfallType !== undefined) {
      if (!VALID_WATERFALL_TYPES.includes(body.waterfallType)) {
        return NextResponse.json(
          { error: `waterfallType must be one of: ${VALID_WATERFALL_TYPES.join(", ")}` },
          { status: 400 },
        );
      }
      updates.waterfallType = body.waterfallType;
      changes.waterfallType = {
        from: fund.waterfallType,
        to: body.waterfallType,
      };
    }

    if (body.aumCalculationFrequency !== undefined) {
      if (!VALID_FREQUENCIES.includes(body.aumCalculationFrequency)) {
        return NextResponse.json(
          { error: `aumCalculationFrequency must be one of: ${VALID_FREQUENCIES.join(", ")}` },
          { status: 400 },
        );
      }
      updates.aumCalculationFrequency = body.aumCalculationFrequency;
      changes.aumCalculationFrequency = {
        from: fund.aumCalculationFrequency,
        to: body.aumCalculationFrequency,
      };
    }

    if (body.aumTarget !== undefined) {
      if (body.aumTarget !== null) {
        const val = parseFloat(body.aumTarget);
        if (isNaN(val) || val < 0) {
          return NextResponse.json(
            { error: "aumTarget must be a positive number or null" },
            { status: 400 },
          );
        }
        updates.aumTarget = val;
      } else {
        updates.aumTarget = null;
      }
      changes.aumTarget = {
        from: fund.aumTarget?.toString() ?? null,
        to: body.aumTarget,
      };
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const updated = await prisma.fund.update({
      where: { id: fundId },
      data: updates,
    });

    // Audit log
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (user) {
      try {
        await logAuditEvent({
          eventType: "ADMIN_ACTION",
          userId: user.id,
          teamId,
          resourceType: "Fund",
          resourceId: fundId,
          metadata: {
            action: "UPDATE_FUND_FEES",
            changes,
          },
        });
      } catch {
        // Audit log failures are non-blocking
      }
    }

    return NextResponse.json({
      success: true,
      fundId: updated.id,
      updated: Object.keys(updates),
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Error updating fund fees:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
