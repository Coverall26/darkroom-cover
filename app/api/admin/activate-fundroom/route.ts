import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/activate-fundroom
 *
 * GP activates FundRoom features for their team (and optionally a specific fund).
 * MVP: Creates a FundroomActivation record as ACTIVE immediately.
 * Phase 2: Will trigger Stripe Checkout before activation.
 *
 * Body: { teamId, fundId?, mode? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { teamId, fundId, mode } = body;

  if (!teamId) {
    return NextResponse.json(
      { error: "teamId is required" },
      { status: 400 },
    );
  }

  const auth = await requireAdminAppRouter(teamId);
  if (auth instanceof NextResponse) return auth;

  try {
    // If fundId provided, verify it belongs to this team
    if (fundId) {
      const fund = await prisma.fund.findFirst({
        where: { id: fundId, teamId },
        select: { id: true },
      });
      if (!fund) {
        return NextResponse.json(
          {
            error:
              "Fund not found or does not belong to this team",
          },
          { status: 404 },
        );
      }
    }

    // Check if already activated
    const existing = await prisma.fundroomActivation.findFirst({
      where: {
        teamId,
        fundId: fundId || null,
        status: "ACTIVE",
      },
    });

    if (existing) {
      return NextResponse.json({
        activated: true,
        activationId: existing.id,
        message: "FundRoom is already active for this team.",
      });
    }

    // Create activation record
    const activation = await prisma.fundroomActivation.create({
      data: {
        teamId,
        fundId: fundId || null,
        status: "ACTIVE",
        activatedBy: auth.userId,
        activatedAt: new Date(),
        mode: mode || "GP_FUND",
      },
    });

    // Audit log (fire-and-forget)
    await logAuditEvent({
      teamId,
      userId: auth.userId,
      eventType: "FUNDROOM_ACTIVATED",
      resourceType: "FundroomActivation",
      resourceId: activation.id,
      metadata: { fundId: fundId || null, mode: mode || "GP_FUND" },
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({
      activated: true,
      activationId: activation.id,
      message: "FundRoom activated successfully.",
    });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
