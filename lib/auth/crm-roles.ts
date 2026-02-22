/**
 * CRM Role Enforcement
 *
 * Implements a 3-level CRM permission system that sits on top of team RBAC:
 *   - VIEWER:      Read-only pipeline access. Cannot modify contacts or send emails.
 *   - CONTRIBUTOR:  Can add/edit contacts, notes, follow-ups. Cannot send outreach emails.
 *   - MANAGER:      Full CRM access. Emails, sequences, AI drafts, outreach settings.
 *
 * CRM roles are stored on UserTeam.crmRole (nullable). When null, the team role
 * is used to infer a default CRM role:
 *   OWNER / SUPER_ADMIN / ADMIN → MANAGER
 *   MANAGER                     → CONTRIBUTOR
 *   MEMBER                      → VIEWER
 *
 * Usage (Pages Router):
 *   const crm = await enforceCrmRole(req, res, "CONTRIBUTOR", teamId);
 *   if (!crm) return; // 401/403 already sent
 *
 * Usage (App Router):
 *   const crm = await enforceCrmRoleAppRouter("CONTRIBUTOR", teamId);
 *   if (crm instanceof NextResponse) return crm;
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CrmRoleLevel = "VIEWER" | "CONTRIBUTOR" | "MANAGER";

export interface CrmRoleResult {
  userId: string;
  email: string;
  teamId: string;
  teamRole: string;
  crmRole: CrmRoleLevel;
}

// ---------------------------------------------------------------------------
// CRM role hierarchy (higher number = more permissions)
// ---------------------------------------------------------------------------

const CRM_ROLE_HIERARCHY: Record<CrmRoleLevel, number> = {
  VIEWER: 0,
  CONTRIBUTOR: 1,
  MANAGER: 2,
};

/**
 * Derive a CRM role from the team-level Role when no explicit crmRole is set.
 */
function defaultCrmRoleFromTeamRole(teamRole: string): CrmRoleLevel {
  switch (teamRole) {
    case "OWNER":
    case "SUPER_ADMIN":
    case "ADMIN":
      return "MANAGER";
    case "MANAGER":
      return "CONTRIBUTOR";
    case "MEMBER":
    default:
      return "VIEWER";
  }
}

/**
 * Resolve the effective CRM role for a user.
 * Explicit crmRole on UserTeam takes priority; otherwise derived from team role.
 */
export function resolveCrmRole(
  teamRole: string,
  explicitCrmRole: string | null | undefined,
): CrmRoleLevel {
  if (
    explicitCrmRole &&
    (explicitCrmRole === "VIEWER" ||
      explicitCrmRole === "CONTRIBUTOR" ||
      explicitCrmRole === "MANAGER")
  ) {
    return explicitCrmRole as CrmRoleLevel;
  }
  return defaultCrmRoleFromTeamRole(teamRole);
}

/**
 * Check if a CRM role meets or exceeds the minimum required level.
 */
export function hasCrmPermission(
  effectiveRole: CrmRoleLevel,
  minimumRequired: CrmRoleLevel,
): boolean {
  return CRM_ROLE_HIERARCHY[effectiveRole] >= CRM_ROLE_HIERARCHY[minimumRequired];
}

// ---------------------------------------------------------------------------
// Pages Router enforcement
// ---------------------------------------------------------------------------

/**
 * Enforce CRM role on a Pages Router API route.
 * Returns CrmRoleResult if authorized, or null (with 401/403 already sent).
 */
export async function enforceCrmRole(
  req: NextApiRequest,
  res: NextApiResponse,
  minimumRole: CrmRoleLevel,
  teamId?: string,
): Promise<CrmRoleResult | null> {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const user = session.user as CustomUser;
  const resolvedTeamId =
    teamId ||
    (req.query.teamId as string) ||
    (req.body?.teamId as string);

  if (!resolvedTeamId) {
    res.status(400).json({ error: "teamId is required" });
    return null;
  }

  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: user.id,
      teamId: resolvedTeamId,
      status: "ACTIVE",
    },
    select: {
      role: true,
      crmRole: true,
    },
  });

  if (!userTeam) {
    res.status(403).json({ error: "Forbidden: not a team member" });
    return null;
  }

  const effectiveCrmRole = resolveCrmRole(userTeam.role, userTeam.crmRole);

  if (!hasCrmPermission(effectiveCrmRole, minimumRole)) {
    res.status(403).json({
      error: `Forbidden: CRM ${minimumRole} role required`,
      requiredRole: minimumRole,
      currentRole: effectiveCrmRole,
    });
    return null;
  }

  return {
    userId: user.id,
    email: user.email || "",
    teamId: resolvedTeamId,
    teamRole: userTeam.role,
    crmRole: effectiveCrmRole,
  };
}

// ---------------------------------------------------------------------------
// App Router enforcement
// ---------------------------------------------------------------------------

/**
 * Enforce CRM role on an App Router API route.
 * Returns CrmRoleResult if authorized, or NextResponse error.
 */
export async function enforceCrmRoleAppRouter(
  minimumRole: CrmRoleLevel,
  teamId?: string,
): Promise<CrmRoleResult | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as CustomUser;

  if (!teamId) {
    // Try to resolve from user's first team
    const userTeam = await prisma.userTeam.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      select: { teamId: true, role: true, crmRole: true },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden: no team membership" }, { status: 403 });
    }

    const effectiveCrmRole = resolveCrmRole(userTeam.role, userTeam.crmRole);
    if (!hasCrmPermission(effectiveCrmRole, minimumRole)) {
      return NextResponse.json(
        {
          error: `Forbidden: CRM ${minimumRole} role required`,
          requiredRole: minimumRole,
          currentRole: effectiveCrmRole,
        },
        { status: 403 },
      );
    }

    return {
      userId: user.id,
      email: user.email || "",
      teamId: userTeam.teamId,
      teamRole: userTeam.role,
      crmRole: effectiveCrmRole,
    };
  }

  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: user.id,
      teamId,
      status: "ACTIVE",
    },
    select: {
      role: true,
      crmRole: true,
    },
  });

  if (!userTeam) {
    return NextResponse.json({ error: "Forbidden: not a team member" }, { status: 403 });
  }

  const effectiveCrmRole = resolveCrmRole(userTeam.role, userTeam.crmRole);

  if (!hasCrmPermission(effectiveCrmRole, minimumRole)) {
    return NextResponse.json(
      {
        error: `Forbidden: CRM ${minimumRole} role required`,
        requiredRole: minimumRole,
        currentRole: effectiveCrmRole,
      },
      { status: 403 },
    );
  }

  return {
    userId: user.id,
    email: user.email || "",
    teamId,
    teamRole: userTeam.role,
    crmRole: effectiveCrmRole,
  };
}
