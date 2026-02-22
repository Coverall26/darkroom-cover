import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

/**
 * GET /api/teams/[teamId]/funds/[fundId]/capital-calls/[callId]
 * Get a single capital call with all response details.
 *
 * PATCH /api/teams/[teamId]/funds/[fundId]/capital-calls/[callId]
 * Update a capital call (only DRAFT status).
 *
 * DELETE /api/teams/[teamId]/funds/[fundId]/capital-calls/[callId]
 * Delete a capital call (only DRAFT status).
 */

import type { Role } from "@prisma/client";

const GP_ROLES: Role[] = ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"];

async function verifyGPAccess(
  teamId: string,
  fundId: string,
  userId: string,
) {
  const userTeam = await prisma.userTeam.findFirst({
    where: { teamId, userId, role: { in: GP_ROLES }, status: "ACTIVE" },
  });
  if (!userTeam) return null;

  const fund = await prisma.fund.findFirst({
    where: { id: fundId, teamId },
  });
  if (!fund) return null;

  return { userTeam, fund };
}

function serializeCall(call: any) {
  return {
    ...call,
    amount: call.amount?.toNumber?.() ?? call.amount,
    proRataPercentage: call.proRataPercentage?.toNumber?.() ?? null,
    responses: call.responses?.map((r: any) => ({
      ...r,
      amountDue: r.amountDue?.toNumber?.() ?? r.amountDue,
      amountPaid: r.amountPaid?.toNumber?.() ?? r.amountPaid,
    })),
  };
}

export async function GET(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ teamId: string; fundId: string; callId: string }>;
  },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId, fundId, callId } = await params;

  try {
    const access = await verifyGPAccess(teamId, fundId, session.user.id);
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const call = await prisma.capitalCall.findFirst({
      where: { id: callId, fundId },
      include: {
        responses: {
          include: {
            investor: {
              select: {
                id: true,
                entityName: true,
                entityType: true,
                user: { select: { email: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!call) {
      return NextResponse.json(
        { error: "Capital call not found" },
        { status: 404 },
      );
    }

    // Summary calculations
    const totalDue = call.responses.reduce(
      (sum, r) => sum + r.amountDue.toNumber(),
      0,
    );
    const totalPaid = call.responses.reduce(
      (sum, r) => sum + r.amountPaid.toNumber(),
      0,
    );
    const outstanding = totalDue - totalPaid;
    const percentFunded = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;

    return NextResponse.json({
      ...serializeCall(call),
      summary: {
        totalDue,
        totalPaid,
        outstanding,
        percentFunded: Math.round(percentFunded * 100) / 100,
        responseCount: call.responses.length,
        fundedCount: call.responses.filter((r) => r.status === "FUNDED")
          .length,
        pendingCount: call.responses.filter((r) => r.status === "PENDING")
          .length,
      },
    });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ teamId: string; fundId: string; callId: string }>;
  },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId, fundId, callId } = await params;

  try {
    const access = await verifyGPAccess(teamId, fundId, session.user.id);
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const call = await prisma.capitalCall.findFirst({
      where: { id: callId, fundId },
    });

    if (!call) {
      return NextResponse.json(
        { error: "Capital call not found" },
        { status: 404 },
      );
    }

    if (call.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Only DRAFT capital calls can be edited" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const updateData: Record<string, unknown> = {};

    if (body.amount !== undefined) {
      if (body.amount <= 0 || body.amount > 100_000_000_000) {
        return NextResponse.json(
          { error: "Amount must be between 0 and $100B" },
          { status: 400 },
        );
      }
      updateData.amount = body.amount;
    }

    if (body.purpose !== undefined) updateData.purpose = body.purpose;
    if (body.dueDate !== undefined) {
      const parsed = new Date(body.dueDate);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Invalid due date" },
          { status: 400 },
        );
      }
      updateData.dueDate = parsed;
    }
    if (body.notes !== undefined) updateData.notes = body.notes;

    const updated = await prisma.capitalCall.update({
      where: { id: callId },
      data: updateData as any,
      include: {
        responses: {
          include: {
            investor: {
              select: {
                id: true,
                entityName: true,
                user: { select: { email: true } },
              },
            },
          },
        },
      },
    });

    logAuditEvent({
      eventType: "CAPITAL_CALL_UPDATED",
      userId: session.user.id,
      teamId,
      resourceType: "CapitalCall",
      resourceId: callId,
      metadata: { updatedFields: Object.keys(updateData) },
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
      userAgent: req.headers.get("user-agent"),
    }).catch((e) => reportError(e as Error));

    return NextResponse.json(serializeCall(updated));
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ teamId: string; fundId: string; callId: string }>;
  },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId, fundId, callId } = await params;

  try {
    const access = await verifyGPAccess(teamId, fundId, session.user.id);
    if (!access) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const call = await prisma.capitalCall.findFirst({
      where: { id: callId, fundId },
    });

    if (!call) {
      return NextResponse.json(
        { error: "Capital call not found" },
        { status: 404 },
      );
    }

    if (call.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Only DRAFT capital calls can be deleted" },
        { status: 400 },
      );
    }

    // Delete responses first, then the call
    await prisma.$transaction([
      prisma.capitalCallResponse.deleteMany({
        where: { capitalCallId: callId },
      }),
      prisma.capitalCall.delete({ where: { id: callId } }),
    ]);

    logAuditEvent({
      eventType: "CAPITAL_CALL_CANCELLED",
      userId: session.user.id,
      teamId,
      resourceType: "CapitalCall",
      resourceId: callId,
      metadata: { action: "deleted_draft" },
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
      userAgent: req.headers.get("user-agent"),
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
