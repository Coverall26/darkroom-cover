import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import type { Role } from "@prisma/client";

/**
 * Team-scoped RBAC authentication helper for Pages Router API routes.
 *
 * Usage:
 *   const auth = await withTeamAuthPages(req, res, teamId);
 *   if (!auth) return; // Response already sent
 *   // auth.userId, auth.teamId, auth.orgId, auth.role are available
 */

const ROLE_HIERARCHY: Record<Role, number> = {
  MEMBER: 0,
  MANAGER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
  OWNER: 4,
};

export interface PagesTeamAuthResult {
  userId: string;
  userEmail: string;
  teamId: string;
  orgId: string | null;
  role: Role;
  teamName: string;
}

/**
 * Authenticate user and verify team membership for Pages Router.
 *
 * @returns Auth result, or null if response was already sent (401/403).
 */
export async function withTeamAuthPages(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string,
  options: { minRole?: Role } = {},
): Promise<PagesTeamAuthResult | null> {
  const { minRole = "MEMBER" } = options;

  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const membership = await prisma.userTeam.findFirst({
    where: {
      userId: session.user.id,
      teamId,
    },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          organizationId: true,
        },
      },
    },
  });

  if (!membership) {
    res.status(403).json({ error: "Forbidden: not a member of this team" });
    return null;
  }

  const userLevel = ROLE_HIERARCHY[membership.role] ?? 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

  if (userLevel < requiredLevel) {
    res
      .status(403)
      .json({ error: `Forbidden: requires ${minRole} role or higher` });
    return null;
  }

  return {
    userId: session.user.id,
    userEmail: session.user.email!,
    teamId: membership.team.id,
    orgId: membership.team.organizationId,
    role: membership.role,
    teamName: membership.team.name,
  };
}
