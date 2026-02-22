import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { NextResponse } from "next/server";

/**
 * Authenticate a GP team member with ADMIN/OWNER role.
 * Returns user, team membership info, or an error response.
 */
export async function authenticateGP(teamId: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const membership = await prisma.userTeam.findFirst({
    where: {
      userId: session.user.id,
      teamId,
      role: { in: ["ADMIN", "OWNER", "SUPER_ADMIN"] },
    },
  });

  if (!membership) {
    return {
      error: NextResponse.json(
        { error: "Forbidden: Admin or Owner role required" },
        { status: 403 },
      ),
    };
  }

  return { userId: session.user.id, teamId, role: membership.role };
}

/**
 * Authenticate any logged-in user (for LP marketplace browsing).
 */
export async function authenticateUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { userId: session.user.id, email: session.user.email };
}
