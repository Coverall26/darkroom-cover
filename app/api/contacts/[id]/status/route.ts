/**
 * PUT /api/contacts/[id]/status — Update contact pipeline status.
 * Writes audit event with old and new status in metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

const VALID_STATUSES = [
  "PROSPECT", "LEAD", "OPPORTUNITY", "CUSTOMER", "WON", "LOST", "ARCHIVED",
];

export async function PUT(
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
    const userTeam = await prisma.userTeam.findFirst({
      where: { userId: session.user.id },
      select: { team: { select: { id: true, organizationId: true } } },
    });
    if (!userTeam?.team) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    const contact = await prisma.contact.findFirst({
      where: { id, teamId: userTeam.team.id },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const body = await req.json();
    const newStatus = body.status;

    if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }

    const oldStatus = contact.status;
    if (oldStatus === newStatus) {
      return NextResponse.json(contact);
    }

    // Determine conversion/closure timestamps
    const updateData: Record<string, unknown> = {
      status: newStatus,
    };

    // Set convertedAt when moving from early stages to OPPORTUNITY+
    const earlyStages = ["PROSPECT", "LEAD"];
    const convertedStages = ["OPPORTUNITY", "CUSTOMER", "WON"];
    if (earlyStages.includes(oldStatus) && convertedStages.includes(newStatus) && !contact.convertedAt) {
      updateData.convertedAt = new Date();
    }

    // Set closedAt for WON or LOST
    if ((newStatus === "WON" || newStatus === "LOST") && !contact.closedAt) {
      updateData.closedAt = new Date();
    }

    const updated = await prisma.contact.update({
      where: { id },
      data: updateData,
    });

    // Create activity
    await prisma.contactActivity.create({
      data: {
        contactId: id,
        type: "STATUS_CHANGE",
        description: `Status changed from ${oldStatus} to ${newStatus}`,
        actorId: session.user.id,
        metadata: { previousStatus: oldStatus, newStatus },
      },
    });

    // Audit log
    await logAuditEvent({
      eventType: "CONTACT_STATUS_CHANGED",
      userId: session.user.id,
      teamId: userTeam.team.id,
      resourceType: "Contact",
      resourceId: id,
      metadata: { previousStatus: oldStatus, newStatus },
    }).catch((e) => reportError(e as Error));

    return NextResponse.json(updated);
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
