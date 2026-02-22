/**
 * Fund Mode Toggle API
 *
 * PATCH /api/teams/[teamId]/funds/[fundId]/fund-mode — Switch between FUND and STARTUP
 *
 * ADMIN, OWNER, SUPER_ADMIN roles.
 * Blocks mode switch when fund has active investors or transactions.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; fundId: string }>;
};

const VALID_ROLES: Role[] = ["ADMIN", "OWNER", "SUPER_ADMIN"];
const VALID_MODES = ["FUND", "STARTUP"];

/**
 * PATCH /api/teams/[teamId]/funds/[fundId]/fund-mode
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const { teamId, fundId } = await params;

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const membership = await prisma.userTeam.findFirst({
      where: {
        userId: session.user.id,
        teamId,
        role: { in: VALID_ROLES },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify fund belongs to team
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: { id: true, entityMode: true, name: true },
    });
    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const body = await req.json();
    const { mode } = body;

    if (!mode || !VALID_MODES.includes(mode)) {
      return NextResponse.json(
        { error: `Invalid mode. Must be one of: ${VALID_MODES.join(", ")}` },
        { status: 400 },
      );
    }

    // If same mode, no-op
    if (fund.entityMode === mode) {
      return NextResponse.json({ entityMode: mode, changed: false });
    }

    // Block mode switch if fund has active investors or completed transactions
    const [investorCount, transactionCount] = await Promise.all([
      prisma.investment.count({
        where: {
          fundId,
          status: { notIn: ["CANCELLED"] },
        },
      }),
      prisma.transaction.count({
        where: {
          fundId,
          status: { in: ["COMPLETED", "PROOF_UPLOADED"] },
        },
      }),
    ]);

    if (investorCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot switch fund mode: ${investorCount} active investor(s). Remove all investments first.`,
        },
        { status: 409 },
      );
    }

    if (transactionCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot switch fund mode: ${transactionCount} completed transaction(s) exist.`,
        },
        { status: 409 },
      );
    }

    const previousMode = fund.entityMode;

    await prisma.fund.update({
      where: { id: fundId },
      data: { entityMode: mode },
    });

    // Audit log
    await logAuditEvent({
      eventType: "SETTINGS_UPDATED",
      userId: session.user.id,
      teamId,
      resourceType: "Fund",
      resourceId: fundId,
      metadata: {
        action: "fund_mode_changed",
        previousMode,
        newMode: mode,
        fundName: fund.name,
      },
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({
      entityMode: mode,
      changed: true,
      previousMode,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
