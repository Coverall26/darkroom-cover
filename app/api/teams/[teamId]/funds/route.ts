import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

/**
 * GET /api/teams/[teamId]/funds
 *
 * List all funds for a team. Requires admin role.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!teamId || typeof teamId !== "string") {
    return NextResponse.json({ error: "Team ID required" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        teams: {
          where: { teamId },
        },
      },
    });

    if (!user || user.teams.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userRole = user.teams[0].role;
    if (!["ADMIN", "OWNER", "SUPER_ADMIN"].includes(userRole)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const funds = await prisma.fund.findMany({
      where: { teamId },
      include: {
        _count: {
          select: { investments: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      funds: funds.map((fund: {
        id: string;
        name: string;
        description: string | null;
        status: string;
        ndaGateEnabled: boolean;
        targetRaise: { toString(): string };
        currentRaise: { toString(): string };
        _count: { investments: number };
      }) => ({
        id: fund.id,
        name: fund.name,
        description: fund.description,
        status: fund.status,
        ndaGateEnabled: fund.ndaGateEnabled,
        targetRaise: fund.targetRaise.toString(),
        currentRaise: fund.currentRaise.toString(),
        _count: fund._count,
      })),
    });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
