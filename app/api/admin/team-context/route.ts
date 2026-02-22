import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { enforceRBACAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/team-context
 *
 * Returns the authenticated GP's team context: teamId, orgId, funds, and mode.
 * Used by admin pages that need org-level context (e.g. Document Template Manager).
 */
export async function GET() {
  try {
    // Verify admin access (no specific teamId — discovers team from membership)
    const auth = await enforceRBACAppRouter({
      roles: ["OWNER", "SUPER_ADMIN", "ADMIN"],
      requireTeamId: false,
    });
    if (auth instanceof NextResponse) return auth;

    // Find the user's admin team membership with org and fund info
    const membership = await prisma.userTeam.findFirst({
      where: {
        userId: auth.userId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      },
      include: {
        team: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                featureFlags: true,
                logo: true,
                brandColor: true,
              },
            },
            funds: {
              select: {
                id: true,
                name: true,
                entityMode: true,
                fundSubType: true,
                featureFlags: true,
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "No admin team found" },
        { status: 403 },
      );
    }

    const team = membership.team;
    const org = team.organization;

    // Resolve mode from org feature flags or first fund
    const orgFlags = org?.featureFlags as Record<string, unknown> | null;
    let mode = (orgFlags?.mode as string) || "GP_FUND";

    // If no org mode, check first fund
    if (!orgFlags?.mode && team.funds.length > 0) {
      const firstFund = team.funds[0];
      if (firstFund.entityMode === "STARTUP") {
        mode = "STARTUP";
      }
    }

    // Get instrument type from first fund if startup
    let instrumentType: string | null = null;
    if (mode === "STARTUP" && team.funds.length > 0) {
      instrumentType = team.funds[0].fundSubType || null;
    }

    return NextResponse.json({
      teamId: team.id,
      teamName: team.name,
      orgId: org?.id || null,
      orgName: org?.name || team.name,
      mode,
      instrumentType,
      logoUrl: (org?.logo as string) || null,
      brandColor: (org?.brandColor as string) || "#0066FF",
      funds: team.funds.map((f) => ({
        id: f.id,
        name: f.name,
        entityMode: f.entityMode,
        fundSubType: f.fundSubType,
      })),
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
