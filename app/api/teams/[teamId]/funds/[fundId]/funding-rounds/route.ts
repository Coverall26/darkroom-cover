/**
 * Funding Rounds API
 *
 * POST /api/teams/[teamId]/funds/[fundId]/funding-rounds — Create a funding round
 * GET  /api/teams/[teamId]/funds/[fundId]/funding-rounds — List all funding rounds
 *
 * ADMIN, OWNER, SUPER_ADMIN, and MANAGER roles.
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
  params: Promise<{ teamId: string; fundId: string }>;
};

const VALID_ROLES: Role[] = ["ADMIN", "OWNER", "SUPER_ADMIN", "MANAGER"];

const VALID_ROUND_STATUSES = ["COMPLETED", "ACTIVE", "PLANNED"];

const VALID_INSTRUMENT_TYPES = [
  "SAFE",
  "Convertible Note",
  "Priced Round",
  "CONVERTIBLE_NOTE",
  "PRICED_ROUND",
];

async function authorizeGP(teamId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
      orgId: null,
    };
  }

  const membership = await prisma.userTeam.findFirst({
    where: {
      userId: session.user.id,
      teamId,
      role: { in: VALID_ROLES },
    },
    include: {
      team: { select: { organizationId: true } },
    },
  });

  if (!membership) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      session: null,
      orgId: null,
    };
  }

  return {
    error: null,
    session,
    orgId: membership.team.organizationId || "",
  };
}

/**
 * GET /api/teams/[teamId]/funds/[fundId]/funding-rounds
 * Returns all funding rounds for the fund, ordered by roundOrder.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const { teamId, fundId } = await params;
    const auth = await authorizeGP(teamId);
    if (auth.error) return auth.error;

    // Verify fund belongs to team
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: { id: true, entityMode: true },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const rounds = await prisma.fundingRound.findMany({
      where: { fundId },
      orderBy: { roundOrder: "asc" },
    });

    return NextResponse.json({
      rounds: rounds.map((r) => ({
        id: r.id,
        fundId: r.fundId,
        roundName: r.roundName,
        roundOrder: r.roundOrder,
        amountRaised: r.amountRaised.toString(),
        targetAmount: r.targetAmount?.toString() || null,
        preMoneyVal: r.preMoneyVal?.toString() || null,
        postMoneyVal: r.postMoneyVal?.toString() || null,
        leadInvestor: r.leadInvestor,
        investorCount: r.investorCount,
        roundDate: r.roundDate?.toISOString() || null,
        closeDate: r.closeDate?.toISOString() || null,
        status: r.status,
        isExternal: r.isExternal,
        externalNotes: r.externalNotes,
        instrumentType: r.instrumentType,
        valuationCap: r.valuationCap?.toString() || null,
        discount: r.discount?.toString() || null,
        createdAt: r.createdAt.toISOString(),
      })),
      entityMode: fund.entityMode,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/teams/[teamId]/funds/[fundId]/funding-rounds
 * Creates a new funding round.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const { teamId, fundId } = await params;
    const auth = await authorizeGP(teamId);
    if (auth.error) return auth.error;

    // Verify fund belongs to team
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: { id: true, entityMode: true },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const body = await req.json();

    // Validate required fields
    const { roundName, status, isExternal } = body;

    if (!roundName || typeof roundName !== "string" || roundName.trim().length === 0) {
      return NextResponse.json(
        { error: "Round name is required" },
        { status: 400 },
      );
    }

    if (roundName.trim().length > 100) {
      return NextResponse.json(
        { error: "Round name must be under 100 characters" },
        { status: 400 },
      );
    }

    if (status && !VALID_ROUND_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_ROUND_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    // Check for duplicate round names within the same fund
    const existing = await prisma.fundingRound.findFirst({
      where: {
        fundId,
        roundName: roundName.trim(),
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `A round named "${roundName.trim()}" already exists for this fund` },
        { status: 409 },
      );
    }

    // Only one ACTIVE round allowed
    if (status === "ACTIVE") {
      const activeRound = await prisma.fundingRound.findFirst({
        where: { fundId, status: "ACTIVE" },
      });
      if (activeRound) {
        return NextResponse.json(
          { error: `An active round already exists: "${activeRound.roundName}". Deactivate it first.` },
          { status: 409 },
        );
      }
    }

    // Parse numeric fields
    const parseDecimal = (val: unknown): number | null => {
      if (val === undefined || val === null || val === "") return null;
      const n = typeof val === "string" ? parseFloat(val.replace(/[^0-9.-]/g, "")) : Number(val);
      return isNaN(n) ? null : n;
    };

    const amountRaised = parseDecimal(body.amountRaised) || 0;
    const targetAmount = parseDecimal(body.targetAmount);
    const preMoneyVal = parseDecimal(body.preMoneyVal);
    const postMoneyVal = parseDecimal(body.postMoneyVal);
    const investorCount = parseInt(body.investorCount) || 0;
    const valuationCap = parseDecimal(body.valuationCap);
    const discount = parseDecimal(body.discount);

    // Bounds validation
    if (amountRaised < 0 || amountRaised > 100_000_000_000) {
      return NextResponse.json(
        { error: "Amount raised must be between $0 and $100B" },
        { status: 400 },
      );
    }

    if (targetAmount !== null && (targetAmount < 0 || targetAmount > 100_000_000_000)) {
      return NextResponse.json(
        { error: "Target amount must be between $0 and $100B" },
        { status: 400 },
      );
    }

    if (discount !== null && (discount < 0 || discount > 100)) {
      return NextResponse.json(
        { error: "Discount must be between 0% and 100%" },
        { status: 400 },
      );
    }

    if (body.instrumentType && !VALID_INSTRUMENT_TYPES.includes(body.instrumentType)) {
      return NextResponse.json(
        { error: `Invalid instrument type` },
        { status: 400 },
      );
    }

    // Auto-calculate roundOrder: next available order number
    const lastRound = await prisma.fundingRound.findFirst({
      where: { fundId },
      orderBy: { roundOrder: "desc" },
      select: { roundOrder: true },
    });
    const roundOrder = body.roundOrder
      ? parseInt(body.roundOrder)
      : (lastRound?.roundOrder ?? 0) + 1;

    const round = await prisma.fundingRound.create({
      data: {
        fundId,
        roundName: roundName.trim(),
        roundOrder,
        amountRaised,
        targetAmount,
        preMoneyVal,
        postMoneyVal,
        leadInvestor: body.leadInvestor?.trim() || null,
        investorCount,
        roundDate: body.roundDate ? new Date(body.roundDate) : null,
        closeDate: body.closeDate ? new Date(body.closeDate) : null,
        status: status || "PLANNED",
        isExternal: isExternal === true,
        externalNotes: body.externalNotes?.trim() || null,
        instrumentType: body.instrumentType || null,
        valuationCap,
        discount,
        orgId: auth.orgId || "",
      },
    });

    // Audit log
    await logAuditEvent({
      eventType: "FUND_CREATED",
      userId: auth.session!.user!.id!,
      teamId,
      resourceType: "Fund",
      resourceId: fundId,
      metadata: {
        action: "funding_round_created",
        roundId: round.id,
        roundName: round.roundName,
        status: round.status,
        isExternal: round.isExternal,
        amountRaised: amountRaised.toString(),
      },
    }).catch((e) => reportError(e as Error));

    return NextResponse.json(
      {
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
      },
      { status: 201 },
    );
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
