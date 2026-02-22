import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { CustomUser } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * PUT /api/teams/[teamId]/toggle-fundroom-access
 *
 * Toggle a user's hasFundroomAccess on a team.
 * Only admins can change fundroom access. Super admins always have access.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { userId, hasFundroomAccess } = body;

    if (!userId || typeof hasFundroomAccess !== "boolean") {
      return NextResponse.json({ error: "Missing userId or hasFundroomAccess" }, { status: 400 });
    }

    const currentUser = await prisma.userTeam.findUnique({
      where: {
        userId_teamId: {
          userId: (session.user as CustomUser).id,
          teamId,
        },
      },
    });

    if (!currentUser || !["ADMIN", "OWNER", "SUPER_ADMIN"].includes(currentUser.role)) {
      return NextResponse.json({ error: "Only admins can change fundroom access" }, { status: 403 });
    }

    const targetUser = await prisma.userTeam.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found in team" }, { status: 404 });
    }

    if (targetUser.role === "ADMIN") {
      return NextResponse.json({ error: "Super admins always have fundroom access" }, { status: 400 });
    }

    await prisma.userTeam.update({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
      data: {
        hasFundroomAccess,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
