/**
 * Funding Round Detail API
 *
 * GET    /api/teams/[teamId]/funds/[fundId]/funding-rounds/[roundId] — Get round detail
 * PUT    /api/teams/[teamId]/funds/[fundId]/funding-rounds/[roundId] — Update round
 * DELETE /api/teams/[teamId]/funds/[fundId]/funding-rounds/[roundId] — Delete round
 *
 * ADMIN, OWNER, SUPER_ADMIN, MANAGER roles.
 * Multi-tenant isolation: fund must belong to team.
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
  params: Promise<{ teamId: string; fundId: string; roundId: string }>;
};

const VALID_ROLES: Role[] = ["ADMIN", "OWNER", "SUPER_ADMIN", "MANAGER"];
const VALID_ROUND_STATUSES = ["COMPLETED", "ACTIVE", "PLANNED"];

async function authorizeGP(teamId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }

  const membership = await prisma.userTeam.findFirst({
    where: {
      userId: session.user.id,
      teamId,
      role: { in: VALID_ROLES },
    },
  });

  if (!membership) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
  }

  return { error: null, session };
}

/**
 * GET /api/teams/[teamId]/funds/[fundId]/funding-rounds/[roundId]
 */
export async function GET(req: NextRequest, { params }: Params) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const { teamId, fundId, roundId } = await params;
    const auth = await authorizeGP(teamId);
    if (auth.error) return auth.error;

    // Verify fund belongs to team
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: { id: true },
    });
    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const round = await prisma.fundingRound.findFirst({
      where: { id: roundId, fundId },
    });

    if (!round) {
      return NextResponse.json({ error: "Funding round not found" }, { status: 404 });
    }

    return NextResponse.json({
      round: {
        id: round.id,
        fundId: round.fundId,
        roundName: round.roundName,
        roundOrder: round.roundOrder,
        amountRaised: round.amountRaised.toString(),
        targetAmount: round.targetAmount?.toString() || null,
        preMoneyVal: round.preMoneyVal?.toString() || null,
        postMoneyVal: round.postMoneyVal?.toString() || null,
        leadInvestor: round.leadInvestor,
        investorCount: round.investorCount,
        roundDate: round.roundDate?.toISOString() || null,
        closeDate: round.closeDate?.toISOString() || null,
        status: round.status,
        isExternal: round.isExternal,
        externalNotes: round.externalNotes,
        instrumentType: round.instrumentType,
        valuationCap: round.valuationCap?.toString() || null,
        discount: round.discount?.toString() || null,
        createdAt: round.createdAt.toISOString(),
      },
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/teams/[teamId]/funds/[fundId]/funding-rounds/[roundId]
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const { teamId, fundId, roundId } = await params;
    const auth = await authorizeGP(teamId);
    if (auth.error) return auth.error;

    // Verify fund belongs to team
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: { id: true },
    });
    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const existing = await prisma.fundingRound.findFirst({
      where: { id: roundId, fundId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Funding round not found" }, { status: 404 });
    }

    const body = await req.json();

    // Validate round name if changed
    if (body.roundName !== undefined) {
      if (typeof body.roundName !== "string" || body.roundName.trim().length === 0) {
        return NextResponse.json({ error: "Round name is required" }, { status: 400 });
      }
      if (body.roundName.trim().length > 100) {
        return NextResponse.json({ error: "Round name must be under 100 characters" }, { status: 400 });
      }
      // Check uniqueness within fund (excluding this round)
      const duplicate = await prisma.fundingRound.findFirst({
        where: {
          fundId,
          roundName: body.roundName.trim(),
          id: { not: roundId },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `A round named "${body.roundName.trim()}" already exists for this fund` },
          { status: 409 },
        );
      }
    }

    // Validate status
    if (body.status !== undefined && !VALID_ROUND_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_ROUND_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    // If setting to ACTIVE, ensure no other active round
    if (body.status === "ACTIVE" && existing.status !== "ACTIVE") {
      const otherActive = await prisma.fundingRound.findFirst({
        where: { fundId, status: "ACTIVE", id: { not: roundId } },
      });
      if (otherActive) {
        return NextResponse.json(
          { error: `An active round already exists: "${otherActive.roundName}". Deactivate it first.` },
          { status: 409 },
        );
      }
    }

    const parseDecimal = (val: unknown): number | undefined => {
      if (val === undefined) return undefined;
      if (val === null || val === "") return 0;
      const n = typeof val === "string" ? parseFloat(val.replace(/[^0-9.-]/g, "")) : Number(val);
      return isNaN(n) ? undefined : n;
    };

    // Build update data (only include provided fields)
    const updateData: Record<string, unknown> = {};

    if (body.roundName !== undefined) updateData.roundName = body.roundName.trim();
    if (body.roundOrder !== undefined) updateData.roundOrder = parseInt(body.roundOrder);
    if (body.status !== undefined) updateData.status = body.status;
    if (body.isExternal !== undefined) updateData.isExternal = body.isExternal === true;
    if (body.externalNotes !== undefined) updateData.externalNotes = body.externalNotes?.trim() || null;
    if (body.leadInvestor !== undefined) updateData.leadInvestor = body.leadInvestor?.trim() || null;
    if (body.instrumentType !== undefined) updateData.instrumentType = body.instrumentType || null;

    const amountRaised = parseDecimal(body.amountRaised);
    if (amountRaised !== undefined) updateData.amountRaised = amountRaised;

    const targetAmount = parseDecimal(body.targetAmount);
    if (targetAmount !== undefined) updateData.targetAmount = targetAmount || null;

    const preMoneyVal = parseDecimal(body.preMoneyVal);
    if (preMoneyVal !== undefined) updateData.preMoneyVal = preMoneyVal || null;

    const postMoneyVal = parseDecimal(body.postMoneyVal);
    if (postMoneyVal !== undefined) updateData.postMoneyVal = postMoneyVal || null;

    if (body.investorCount !== undefined) updateData.investorCount = parseInt(body.investorCount) || 0;

    const valuationCap = parseDecimal(body.valuationCap);
    if (valuationCap !== undefined) updateData.valuationCap = valuationCap || null;

    const discount = parseDecimal(body.discount);
    if (discount !== undefined) updateData.discount = discount || null;

    if (body.roundDate !== undefined) {
      updateData.roundDate = body.roundDate ? new Date(body.roundDate) : null;
    }
    if (body.closeDate !== undefined) {
      updateData.closeDate = body.closeDate ? new Date(body.closeDate) : null;
    }

    const round = await prisma.fundingRound.update({
      where: { id: roundId },
      data: updateData,
    });

    // Audit log
    await logAuditEvent({
      eventType: "SETTINGS_UPDATED",
      userId: auth.session!.user!.id!,
      teamId,
      resourceType: "Fund",
      resourceId: fundId,
      metadata: {
        action: "funding_round_updated",
        roundId: round.id,
        roundName: round.roundName,
        status: round.status,
        changedFields: Object.keys(updateData),
      },
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({
      round: {
        id: round.id,
        fundId: round.fundId,
        roundName: round.roundName,
        roundOrder: round.roundOrder,
        amountRaised: round.amountRaised.toString(),
        targetAmount: round.targetAmount?.toString() || null,
        preMoneyVal: round.preMoneyVal?.toString() || null,
        postMoneyVal: round.postMoneyVal?.toString() || null,
        leadInvestor: round.leadInvestor,
        investorCount: round.investorCount,
        roundDate: round.roundDate?.toISOString() || null,
        closeDate: round.closeDate?.toISOString() || null,
        status: round.status,
        isExternal: round.isExternal,
        externalNotes: round.externalNotes,
        instrumentType: round.instrumentType,
        valuationCap: round.valuationCap?.toString() || null,
        discount: round.discount?.toString() || null,
        createdAt: round.createdAt.toISOString(),
      },
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/teams/[teamId]/funds/[fundId]/funding-rounds/[roundId]
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const { teamId, fundId, roundId } = await params;
    const auth = await authorizeGP(teamId);
    if (auth.error) return auth.error;

    // Verify fund belongs to team
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: { id: true },
    });
    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const round = await prisma.fundingRound.findFirst({
      where: { id: roundId, fundId },
    });
    if (!round) {
      return NextResponse.json({ error: "Funding round not found" }, { status: 404 });
    }

    // Cannot delete the active round
    if (round.status === "ACTIVE") {
      return NextResponse.json(
        { error: "Cannot delete the active round. Change its status first." },
        { status: 400 },
      );
    }

    await prisma.fundingRound.delete({
      where: { id: roundId },
    });

    // Audit log
    await logAuditEvent({
      eventType: "SETTINGS_UPDATED",
      userId: auth.session!.user!.id!,
      teamId,
      resourceType: "Fund",
      resourceId: fundId,
      metadata: {
        action: "funding_round_deleted",
        roundId: round.id,
        roundName: round.roundName,
        status: round.status,
      },
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({ success: true });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
