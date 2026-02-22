import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { clearTierCache } from "@/lib/tier";

/**
 * GET /api/teams/[teamId]/fundroom-activation
 * Returns the FundRoom activation status for a team.
 * Auth: OWNER only.
 *
 * PATCH /api/teams/[teamId]/fundroom-activation
 * Manages FundRoom activation status for a team.
 * Auth: OWNER only (suspend/deactivate/reactivate are owner-only actions).
 * Body: { action: "activate" | "suspend" | "deactivate" | "reactivate", reason?: string, fundId?: string }
 */

const VALID_ACTIONS = ["activate", "suspend", "deactivate", "reactivate"] as const;
type ActivationAction = (typeof VALID_ACTIONS)[number];

async function requireTeamOwner(
  teamId: string,
): Promise<{ userId: string; email: string } | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const userTeam = await prisma.userTeam.findFirst({
    where: {
      teamId,
      user: { email: session.user.email },
      role: "OWNER",
      status: "ACTIVE",
    },
    include: { user: { select: { id: true, email: true } } },
  });

  if (!userTeam?.user?.email) return null;
  return { userId: userTeam.user.id, email: userTeam.user.email };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const owner = await requireTeamOwner(teamId);
    if (!owner) {
      return NextResponse.json({ error: "Unauthorized. Team owner access required." }, { status: 403 });
    }

    const activations = await prisma.fundroomActivation.findMany({
      where: { teamId },
      select: {
        id: true,
        status: true,
        fundId: true,
        mode: true,
        activatedAt: true,
        activatedBy: true,
        deactivatedAt: true,
        deactivatedBy: true,
        deactivationReason: true,
        setupProgress: true,
        setupCompletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    // Resolve activatedBy/deactivatedBy names
    const userIds = activations
      .flatMap((a) => [a.activatedBy, a.deactivatedBy])
      .filter((id): id is string => !!id);

    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: [...new Set(userIds)] } },
          select: { id: true, name: true, email: true },
        })
      : [];

    const userMap = new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));

    return NextResponse.json({
      activations: activations.map((a) => ({
        ...a,
        activatedByUser: a.activatedBy ? userMap.get(a.activatedBy) || null : null,
        deactivatedByUser: a.deactivatedBy ? userMap.get(a.deactivatedBy) || null : null,
      })),
    });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;
    const owner = await requireTeamOwner(teamId);
    if (!owner) {
      return NextResponse.json({ error: "Unauthorized. Team owner access required." }, { status: 403 });
    }

    const body = await req.json();
    const { action, reason, fundId } = body as { action: string; reason?: string; fundId?: string };

    if (!action || !VALID_ACTIONS.includes(action as ActivationAction)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}` },
        { status: 400 },
      );
    }

    // Find existing activation
    const where = fundId
      ? { teamId, fundId }
      : { teamId, fundId: null as string | null };

    const existing = await prisma.fundroomActivation.findFirst({
      where,
      orderBy: { updatedAt: "desc" },
    });

    switch (action as ActivationAction) {
      case "activate": {
        if (existing?.status === "ACTIVE") {
          return NextResponse.json({
            success: true,
            message: "Already active.",
            activation: existing,
          });
        }

        const activation = existing
          ? await prisma.fundroomActivation.update({
              where: { id: existing.id },
              data: {
                status: "ACTIVE",
                activatedBy: owner.userId,
                activatedAt: new Date(),
                deactivatedAt: null,
                deactivatedBy: null,
                deactivationReason: null,
              },
            })
          : await prisma.fundroomActivation.create({
              data: {
                teamId,
                fundId: fundId || null,
                status: "ACTIVE",
                activatedBy: owner.userId,
                activatedAt: new Date(),
                mode: "GP_FUND",
              },
            });

        // Clear cached tier so activation status is reflected immediately
        clearTierCache(teamId);

        await logAuditEvent({
          teamId,
          userId: owner.userId,
          eventType: "FUNDROOM_ACTIVATED",
          resourceType: "FundroomActivation",
          resourceId: activation.id,
          metadata: { fundId: fundId || null, previousStatus: existing?.status },
        }).catch((e) => reportError(e as Error));

        return NextResponse.json({ success: true, activation });
      }

      case "suspend": {
        if (!existing) {
          return NextResponse.json({ error: "No activation record found" }, { status: 404 });
        }
        if (existing.status === "SUSPENDED") {
          return NextResponse.json({
            success: true,
            message: "Already suspended.",
            activation: existing,
          });
        }
        if (existing.status !== "ACTIVE") {
          return NextResponse.json(
            { error: `Cannot suspend from status: ${existing.status}. Must be ACTIVE.` },
            { status: 400 },
          );
        }

        const suspended = await prisma.fundroomActivation.update({
          where: { id: existing.id },
          data: {
            status: "SUSPENDED",
            deactivatedAt: new Date(),
            deactivatedBy: owner.userId,
            deactivationReason: reason || "Suspended by team owner",
          },
        });

        // Clear cached tier so suspended capabilities take effect immediately
        clearTierCache(teamId);

        await logAuditEvent({
          teamId,
          userId: owner.userId,
          eventType: "FUNDROOM_DEACTIVATED",
          resourceType: "FundroomActivation",
          resourceId: suspended.id,
          metadata: { action: "suspend", reason },
        }).catch((e) => reportError(e as Error));

        return NextResponse.json({ success: true, activation: suspended });
      }

      case "deactivate": {
        if (!existing) {
          return NextResponse.json({ error: "No activation record found" }, { status: 404 });
        }
        if (existing.status === "DEACTIVATED") {
          return NextResponse.json({
            success: true,
            message: "Already deactivated.",
            activation: existing,
          });
        }

        const deactivated = await prisma.fundroomActivation.update({
          where: { id: existing.id },
          data: {
            status: "DEACTIVATED",
            deactivatedAt: new Date(),
            deactivatedBy: owner.userId,
            deactivationReason: reason || "Deactivated by team owner",
          },
        });

        // Clear cached tier so deactivated capabilities take effect immediately
        clearTierCache(teamId);

        await logAuditEvent({
          teamId,
          userId: owner.userId,
          eventType: "FUNDROOM_DEACTIVATED",
          resourceType: "FundroomActivation",
          resourceId: deactivated.id,
          metadata: { action: "deactivate", reason },
        }).catch((e) => reportError(e as Error));

        return NextResponse.json({ success: true, activation: deactivated });
      }

      case "reactivate": {
        if (!existing) {
          return NextResponse.json({ error: "No activation record found" }, { status: 404 });
        }
        if (existing.status === "ACTIVE") {
          return NextResponse.json({
            success: true,
            message: "Already active.",
            activation: existing,
          });
        }
        if (existing.status !== "SUSPENDED" && existing.status !== "DEACTIVATED") {
          return NextResponse.json(
            { error: `Cannot reactivate from status: ${existing.status}. Must be SUSPENDED or DEACTIVATED.` },
            { status: 400 },
          );
        }

        const reactivated = await prisma.fundroomActivation.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            activatedBy: owner.userId,
            activatedAt: new Date(),
            deactivatedAt: null,
            deactivatedBy: null,
            deactivationReason: null,
          },
        });

        // Clear cached tier so reactivated capabilities take effect immediately
        clearTierCache(teamId);

        await logAuditEvent({
          teamId,
          userId: owner.userId,
          eventType: "FUNDROOM_ACTIVATED",
          resourceType: "FundroomActivation",
          resourceId: reactivated.id,
          metadata: { action: "reactivate", previousStatus: existing.status },
        }).catch((e) => reportError(e as Error));

        return NextResponse.json({ success: true, activation: reactivated });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
