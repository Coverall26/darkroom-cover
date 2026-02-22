/**
 * PATCH /api/teams/[teamId]/crm-role — Update a team member's CRM role.
 *
 * Body: { userId: string, crmRole: "VIEWER" | "CONTRIBUTOR" | "MANAGER" }
 * Auth: Requires ADMIN+ team role.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

const VALID_CRM_ROLES = ["VIEWER", "CONTRIBUTOR", "MANAGER"];
const ADMIN_ROLES = ["OWNER", "SUPER_ADMIN", "ADMIN"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { teamId } = await params;

    // Verify requester is admin of this team
    const requesterTeam = await prisma.userTeam.findFirst({
      where: { teamId, userId: session.user.id },
      select: { role: true },
    });

    if (!requesterTeam || !ADMIN_ROLES.includes(requesterTeam.role)) {
      return NextResponse.json(
        { error: "Forbidden: Admin role required to manage CRM roles" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { userId, crmRole } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    if (!crmRole || !VALID_CRM_ROLES.includes(crmRole)) {
      return NextResponse.json(
        { error: `crmRole must be one of: ${VALID_CRM_ROLES.join(", ")}` },
        { status: 400 },
      );
    }

    // Verify target user is a member of this team
    const targetMember = await prisma.userTeam.findFirst({
      where: { teamId, userId },
      select: { role: true, userId: true },
    });

    if (!targetMember) {
      return NextResponse.json(
        { error: "User is not a member of this team" },
        { status: 404 },
      );
    }

    // Update CRM role
    await prisma.userTeam.update({
      where: {
        userId_teamId: { userId, teamId },
      },
      data: { crmRole },
    });

    return NextResponse.json({ success: true, userId, crmRole });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
