import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import type { Role } from "@prisma/client";

/**
 * GET /api/teams/[teamId]/funds/[fundId]/capital-calls/[callId]/responses
 * List all LP responses for a specific capital call.
 * Includes investor details, payment status, and proof info.
 */

const GP_ROLES: Role[] = ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"];

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
    // Verify GP access
    const userTeam = await prisma.userTeam.findFirst({
      where: { teamId, userId: session.user.id, role: { in: GP_ROLES }, status: "ACTIVE" },
    });
    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
    });
    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    // Verify call belongs to fund
    const call = await prisma.capitalCall.findFirst({
      where: { id: callId, fundId },
      select: { id: true, status: true, amount: true },
    });
    if (!call) {
      return NextResponse.json(
        { error: "Capital call not found" },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");

    const responses = await prisma.capitalCallResponse.findMany({
      where: {
        capitalCallId: callId,
        ...(statusFilter ? { status: statusFilter as any } : {}),
      },
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
    });

    // Serialize decimals
    const serialized = responses.map((r) => ({
      ...r,
      amountDue: r.amountDue.toNumber(),
      amountPaid: r.amountPaid.toNumber(),
    }));

    // Summary stats
    const totalDue = serialized.reduce((sum, r) => sum + r.amountDue, 0);
    const totalPaid = serialized.reduce((sum, r) => sum + r.amountPaid, 0);

    return NextResponse.json({
      responses: serialized,
      summary: {
        totalResponses: responses.length,
        totalDue,
        totalPaid,
        outstanding: totalDue - totalPaid,
        funded: responses.filter((r) => r.status === "FUNDED").length,
        pending: responses.filter((r) => r.status === "PENDING").length,
        partiallyFunded: responses.filter(
          (r) => r.status === "PARTIAL",
        ).length,
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
