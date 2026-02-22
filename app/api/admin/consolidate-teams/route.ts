import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/consolidate-teams
 *
 * Consolidates the requesting admin's teams by moving all assets
 * (documents, datarooms) to the primary team and cleaning up empty teams.
 * Scoped to the requesting user's teams only (no cross-tenant impact).
 */
export async function POST() {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    // Use the requesting user's teams (org-scoped, not hardcoded)
    const requestingUser = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: {
        teams: {
          include: {
            team: true,
          },
        },
      },
    });

    if (!requestingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (requestingUser.teams.length <= 1) {
      return NextResponse.json(
        { error: "Only one team found — nothing to consolidate" },
        { status: 400 },
      );
    }

    const investorsUser = requestingUser;

    // Get the primary team (first team or the one with most documents)
    const teamsWithDocCounts = await Promise.all(
      investorsUser.teams.map(async (tu) => {
        const docCount = await prisma.document.count({
          where: { teamId: tu.teamId },
        });
        return { ...tu, docCount };
      }),
    );

    teamsWithDocCounts.sort((a, b) => b.docCount - a.docCount);
    const primaryTeam = teamsWithDocCounts[0]?.team;

    if (!primaryTeam) {
      return NextResponse.json(
        { error: "No team found for user" },
        { status: 404 },
      );
    }

    const results: string[] = [];
    results.push(
      `Primary team: ${primaryTeam.name} (ID: ${primaryTeam.id})`,
    );

    // Find other admin users within the same org teams
    const userTeamIds = investorsUser.teams.map((t) => t.teamId);
    const allAdminMemberships = await prisma.userTeam.findMany({
      where: {
        teamId: { in: userTeamIds },
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
        userId: { not: investorsUser.id },
      },
      include: {
        user: {
          include: {
            teams: {
              include: {
                team: {
                  include: {
                    documents: true,
                    datarooms: true,
                  },
                },
              },
            },
          },
        },
      },
      distinct: ["userId"],
    });

    const otherAdmins = allAdminMemberships.map((m) => m.user);

    // For each other admin, move their assets and add them to the primary team
    for (const admin of otherAdmins) {
      results.push(`Processing: ${admin.email}`);

      const alreadyOnTeam = admin.teams.some(
        (tu) => tu.teamId === primaryTeam.id,
      );

      if (!alreadyOnTeam) {
        await prisma.userTeam.create({
          data: {
            userId: admin.id,
            teamId: primaryTeam.id,
            role: "ADMIN",
          },
        });
        results.push(`  - Added to primary team as ADMIN`);
      } else {
        results.push(`  - Already on primary team`);
      }

      // Move documents from their other teams to primary team
      for (const tu of admin.teams) {
        if (tu.teamId === primaryTeam.id) continue;

        const oldTeam = tu.team;

        const docsToMove = await prisma.document.updateMany({
          where: { teamId: oldTeam.id },
          data: { teamId: primaryTeam.id },
        });
        if (docsToMove.count > 0) {
          results.push(
            `  - Moved ${docsToMove.count} documents from "${oldTeam.name}"`,
          );
        }

        const dataroomsToMove = await prisma.dataroom.updateMany({
          where: { teamId: oldTeam.id },
          data: { teamId: primaryTeam.id },
        });
        if (dataroomsToMove.count > 0) {
          results.push(
            `  - Moved ${dataroomsToMove.count} datarooms from "${oldTeam.name}"`,
          );
        }
      }
    }

    // Remove other team memberships for admin users
    for (const admin of otherAdmins) {
      for (const tu of admin.teams) {
        if (tu.teamId !== primaryTeam.id) {
          await prisma.userTeam.delete({
            where: {
              userId_teamId: {
                userId: admin.id,
                teamId: tu.teamId,
              },
            },
          });
          results.push(
            `  - Removed ${admin.email} from team "${tu.team.name}"`,
          );
        }
      }
    }

    // Also remove requesting user from any other teams
    for (const tu of investorsUser.teams) {
      if (tu.teamId !== primaryTeam.id) {
        await prisma.userTeam.delete({
          where: {
            userId_teamId: {
              userId: investorsUser.id,
              teamId: tu.teamId,
            },
          },
        });
        results.push(
          `Removed requesting user from team "${tu.team.name}"`,
        );
      }
    }

    // Delete empty teams — scoped to affected teams only
    const allAffectedTeamIds = investorsUser.teams.map((t) => t.teamId);
    const emptyTeams = await prisma.team.findMany({
      where: {
        id: { in: allAffectedTeamIds },
        users: {
          none: {},
        },
      },
    });

    for (const emptyTeam of emptyTeams) {
      await prisma.invitation.deleteMany({
        where: { teamId: emptyTeam.id },
      });
      await prisma.domain.deleteMany({ where: { teamId: emptyTeam.id } });
      await prisma.team.delete({ where: { id: emptyTeam.id } });
      results.push(`Deleted empty team: "${emptyTeam.name}"`);
    }

    // Final verification
    const finalTeamCount = await prisma.team.count();
    const finalAdminCheck = await prisma.userTeam.findMany({
      where: {
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
      take: 500,
      include: {
        user: { select: { email: true } },
        team: { select: { name: true } },
      },
    });

    results.push(`\nFinal state:`);
    results.push(`Total teams: ${finalTeamCount}`);
    results.push(`Admin team memberships:`);
    for (const membership of finalAdminCheck) {
      results.push(
        `  - ${membership.user.email} on "${membership.team.name}" as ${membership.role}`,
      );
    }

    return NextResponse.json({
      success: true,
      message: "Team consolidation complete",
      details: results,
    });
  } catch (error) {
    console.error("Team consolidation error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
