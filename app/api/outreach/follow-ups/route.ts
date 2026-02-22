/**
 * GET/POST /api/outreach/follow-ups — Follow-up scheduling and tracking.
 *
 * GET: List contacts with scheduled follow-ups, ordered by nextFollowUpAt.
 *      Optional filters: ?status=overdue|today|upcoming|all
 * POST: Schedule a follow-up for a contact.
 *       Body: { contactId, followUpAt, notes? }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { resolveCrmRole, hasCrmPermission } from "@/lib/auth/crm-roles";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET — List follow-ups
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userTeam = await prisma.userTeam.findFirst({
      where: { userId: session.user.id },
      select: {
        role: true,
        crmRole: true,
        team: { select: { id: true } },
      },
    });
    if (!userTeam?.team) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    const teamId = userTeam.team.id;

    // CRM role check: VIEWER+ can list follow-ups (read-only)

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "all";

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Build where clause based on status filter
    const baseWhere = {
      teamId,
      nextFollowUpAt: { not: null } as Record<string, unknown>,
      unsubscribedAt: null,
    };

    switch (status) {
      case "overdue":
        baseWhere.nextFollowUpAt = { lt: today };
        break;
      case "today":
        baseWhere.nextFollowUpAt = { gte: today, lt: tomorrow };
        break;
      case "upcoming":
        baseWhere.nextFollowUpAt = { gte: tomorrow };
        break;
      case "all":
      default:
        // Just ensure nextFollowUpAt is set
        break;
    }

    const contacts = await prisma.contact.findMany({
      where: baseWhere,
      orderBy: { nextFollowUpAt: "asc" },
      take: 100,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        company: true,
        status: true,
        engagementScore: true,
        nextFollowUpAt: true,
        lastContactedAt: true,
        lastEmailedAt: true,
        assignedToId: true,
        assignedTo: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    // Compute counts
    const allFollowUps = await prisma.contact.findMany({
      where: { teamId, nextFollowUpAt: { not: null }, unsubscribedAt: null },
      select: { nextFollowUpAt: true },
    });

    const counts = {
      overdue: 0,
      today: 0,
      upcoming: 0,
      total: allFollowUps.length,
    };

    for (const c of allFollowUps) {
      if (!c.nextFollowUpAt) continue;
      if (c.nextFollowUpAt < today) counts.overdue++;
      else if (c.nextFollowUpAt >= today && c.nextFollowUpAt < tomorrow) counts.today++;
      else counts.upcoming++;
    }

    return NextResponse.json({ contacts, counts });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Schedule a follow-up
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userTeam = await prisma.userTeam.findFirst({
      where: { userId: session.user.id },
      select: {
        role: true,
        crmRole: true,
        team: { select: { id: true } },
      },
    });
    if (!userTeam?.team) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    // CRM role check: CONTRIBUTOR required to schedule follow-ups
    const crmRole = resolveCrmRole(userTeam.role, userTeam.crmRole);
    if (!hasCrmPermission(crmRole, "CONTRIBUTOR")) {
      return NextResponse.json(
        { error: "Forbidden: CRM CONTRIBUTOR role required to schedule follow-ups" },
        { status: 403 },
      );
    }

    const teamId = userTeam.team.id;
    const body = await req.json();
    const { contactId, followUpAt, notes } = body;

    if (!contactId || typeof contactId !== "string") {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 },
      );
    }
    if (!followUpAt || typeof followUpAt !== "string") {
      return NextResponse.json(
        { error: "followUpAt date is required" },
        { status: 400 },
      );
    }

    const followUpDate = new Date(followUpAt);
    if (isNaN(followUpDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid followUpAt date" },
        { status: 400 },
      );
    }

    // Verify contact belongs to team
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, teamId },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 },
      );
    }

    // Update follow-up date
    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: { nextFollowUpAt: followUpDate },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        nextFollowUpAt: true,
      },
    });

    // Create activity for the follow-up scheduling
    await prisma.contactActivity.create({
      data: {
        contactId,
        type: "TASK_COMPLETED",
        actorId: session.user.id,
        description: `Follow-up scheduled for ${followUpDate.toLocaleDateString()}${notes ? `: ${notes}` : ""}`,
        metadata: {
          action: "follow_up_scheduled",
          followUpAt: followUpDate.toISOString(),
          notes: notes ?? null,
        },
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
