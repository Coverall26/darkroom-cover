/**
 * GET /api/contacts/[id] — Get contact details.
 * PATCH /api/contacts/[id] — Update contact fields.
 * DELETE /api/contacts/[id] — Delete contact.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { resolveCrmRole, hasCrmPermission, type CrmRoleLevel } from "@/lib/auth/crm-roles";

export const dynamic = "force-dynamic";

async function resolveUserTeam(userId: string) {
  return prisma.userTeam.findFirst({
    where: { userId },
    select: {
      role: true,
      crmRole: true,
      team: { select: { id: true, organizationId: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// GET
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

    const contact = await prisma.contact.findFirst({
      where: { id, teamId: ctx.team.id },
      include: {
        contactNotes: {
          orderBy: { createdAt: "desc" },
          include: {
            author: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        contactActivities: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            actor: { select: { id: true, name: true, email: true } },
          },
        },
        investor: {
          select: {
            id: true,
            onboardingStep: true,
            accreditationStatus: true,
            entityType: true,
            ndaSigned: true,
            investments: {
              select: {
                id: true,
                commitmentAmount: true,
                fundedAmount: true,
                status: true,
                subscriptionDate: true,
                fund: { select: { id: true, name: true } },
              },
            },
          },
        },
        assignedTo: { select: { id: true, name: true, email: true, image: true } },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json(contact);
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

export async function PATCH(
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

    // CRM role check: CONTRIBUTOR+ required to update contacts
    const crmRole = resolveCrmRole(ctx.role || "MEMBER", ctx.crmRole);
    if (!hasCrmPermission(crmRole, "CONTRIBUTOR")) {
      return NextResponse.json(
        { error: "Forbidden: CRM CONTRIBUTOR role required to edit contacts" },
        { status: 403 },
      );
    }

    const existing = await prisma.contact.findFirst({
      where: { id, teamId: ctx.team.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const body = await req.json();

    // Allowed fields for update
    const updatable: Record<string, unknown> = {};
    if (body.firstName !== undefined) updatable.firstName = body.firstName?.trim() || null;
    if (body.lastName !== undefined) updatable.lastName = body.lastName?.trim() || null;
    if (body.phone !== undefined) updatable.phone = body.phone?.trim() || null;
    if (body.company !== undefined) updatable.company = body.company?.trim() || null;
    if (body.title !== undefined) updatable.title = body.title?.trim() || null;
    if (body.tags !== undefined) updatable.tags = body.tags;
    if (body.customFields !== undefined) updatable.customFields = body.customFields;
    if (body.notes !== undefined) updatable.notes = body.notes?.trim() || null;
    if (body.assignedToId !== undefined) updatable.assignedToId = body.assignedToId || null;

    if (Object.keys(updatable).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.contact.update({
      where: { id },
      data: updatable,
    });

    // Log activity
    await prisma.contactActivity.create({
      data: {
        contactId: id,
        type: "PROFILE_UPDATED",
        description: `Contact updated: ${Object.keys(updatable).join(", ")}`,
        actorId: session.user.id,
        metadata: { fields: Object.keys(updatable) },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export async function DELETE(
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

    // CRM role check: MANAGER required to delete contacts
    const crmRole = resolveCrmRole(ctx.role || "MEMBER", ctx.crmRole);
    if (!hasCrmPermission(crmRole, "MANAGER")) {
      return NextResponse.json(
        { error: "Forbidden: CRM MANAGER role required to delete contacts" },
        { status: 403 },
      );
    }

    const existing = await prisma.contact.findFirst({
      where: { id, teamId: ctx.team.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Hard delete (cascade removes notes + activities via Prisma)
    await prisma.contact.delete({ where: { id } });

    // Audit log
    await logAuditEvent({
      eventType: "CONTACT_DELETED",
      userId: session.user.id,
      teamId: ctx.team.id,
      resourceType: "Contact",
      resourceId: id,
      metadata: { email: existing.email },
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({ success: true });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
