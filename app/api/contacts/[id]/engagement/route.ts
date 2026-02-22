/**
 * GET /api/contacts/[id]/engagement — Get engagement breakdown for a contact.
 * POST /api/contacts/[id]/engagement — Recalculate engagement score.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { resolveCrmRole, hasCrmPermission } from "@/lib/auth/crm-roles";
import { recalculateContactEngagement } from "@/lib/crm/contact-service";

export const dynamic = "force-dynamic";

async function resolveUserTeam(userId: string) {
  return prisma.userTeam.findFirst({
    where: { userId },
    select: {
      role: true,
      crmRole: true,
      team: { select: { id: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// GET — Engagement breakdown (read-only)
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const ctx = await resolveUserTeam(session.user.id);
    if (!ctx?.team) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    const role = resolveCrmRole(ctx.role, ctx.crmRole);
    if (!hasCrmPermission(role, "VIEWER")) {
      return NextResponse.json({ error: "Insufficient CRM permissions" }, { status: 403 });
    }

    // Verify contact belongs to team
    const contact = await prisma.contact.findFirst({
      where: { id, teamId: ctx.team.id },
      select: {
        id: true,
        engagementScore: true,
        lastEngagedAt: true,
        lastContactedAt: true,
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Get activity breakdown without recalculating
    const activities = await prisma.contactActivity.findMany({
      where: { contactId: id },
      select: { type: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const byType: Record<string, number> = {};
    let emailSent = 0;
    let emailOpened = 0;
    let emailClicked = 0;
    let emailReplied = 0;

    for (const a of activities) {
      const t = a.type as string;
      byType[t] = (byType[t] ?? 0) + 1;
      if (t === "EMAIL_SENT") emailSent++;
      if (t === "EMAIL_OPENED") emailOpened++;
      if (t === "LINK_CLICKED") emailClicked++;
      if (t === "EMAIL_REPLIED") emailReplied++;
    }

    return NextResponse.json({
      contactId: contact.id,
      engagementScore: contact.engagementScore,
      lastEngagedAt: contact.lastEngagedAt,
      lastContactedAt: contact.lastContactedAt,
      activityCount: activities.length,
      activityByType: byType,
      emailMetrics: {
        sent: emailSent,
        opened: emailOpened,
        clicked: emailClicked,
        replied: emailReplied,
        openRate: emailSent > 0 ? Math.round((emailOpened / emailSent) * 100) : 0,
        clickRate: emailSent > 0 ? Math.round((emailClicked / emailSent) * 100) : 0,
      },
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — Trigger full recalculation
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const ctx = await resolveUserTeam(session.user.id);
    if (!ctx?.team) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    const role = resolveCrmRole(ctx.role, ctx.crmRole);
    if (!hasCrmPermission(role, "CONTRIBUTOR")) {
      return NextResponse.json({ error: "Insufficient CRM permissions" }, { status: 403 });
    }

    // Verify contact belongs to team
    const contact = await prisma.contact.findFirst({
      where: { id, teamId: ctx.team.id },
      select: { id: true },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const breakdown = await recalculateContactEngagement(id, ctx.team.id);

    return NextResponse.json({
      contactId: id,
      engagementScore: breakdown.total,
      tier: breakdown.tier,
      byType: breakdown.byType,
      emailMetrics: breakdown.emailMetrics,
      activityCount: breakdown.activityCount,
      lastActivityAt: breakdown.lastActivityAt,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
