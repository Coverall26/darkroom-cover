/**
 * GET/PATCH/DELETE /api/outreach/templates/[id] — Single template operations.
 *
 * GET: Return template by ID.
 * PATCH: Update template name, subject, body, or category.
 * DELETE: Delete template (system templates cannot be deleted).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { resolveCrmRole, hasCrmPermission } from "@/lib/auth/crm-roles";

export const dynamic = "force-dynamic";

const VALID_CATEGORIES = [
  "INVITATION",
  "FOLLOW_UP",
  "COMMITMENT",
  "WIRE",
  "UPDATE",
  "CUSTOM",
];

// ---------------------------------------------------------------------------
// Helper: resolve org from session
// ---------------------------------------------------------------------------

async function resolveOrgAndRole(userId: string) {
  const userTeam = await prisma.userTeam.findFirst({
    where: { userId },
    select: {
      role: true,
      crmRole: true,
      team: { select: { organizationId: true } },
    },
  });
  if (!userTeam?.team?.organizationId) return null;
  return {
    orgId: userTeam.team.organizationId,
    crmRole: resolveCrmRole(userTeam.role, userTeam.crmRole),
  };
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

    const ctx = await resolveOrgAndRole(session.user.id);
    if (!ctx) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    // CRM role check: VIEWER+ can view templates (read-only)

    const { id } = await params;
    const template = await prisma.emailTemplate.findFirst({
      where: { id, orgId: ctx.orgId },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(template);
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
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

    const ctx = await resolveOrgAndRole(session.user.id);
    if (!ctx) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    // CRM role check: CONTRIBUTOR required to edit templates
    if (!hasCrmPermission(ctx.crmRole, "CONTRIBUTOR")) {
      return NextResponse.json(
        { error: "Forbidden: CRM CONTRIBUTOR role required to edit templates" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const template = await prisma.emailTemplate.findFirst({
      where: { id, orgId: ctx.orgId },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json(
          { error: "Template name cannot be empty" },
          { status: 400 },
        );
      }
      if (body.name.length > 100) {
        return NextResponse.json(
          { error: "Template name too long (max 100 chars)" },
          { status: 400 },
        );
      }
      data.name = body.name.trim();
    }

    if (body.subject !== undefined) {
      if (typeof body.subject !== "string" || !body.subject.trim()) {
        return NextResponse.json(
          { error: "Subject cannot be empty" },
          { status: 400 },
        );
      }
      if (body.subject.length > 500) {
        return NextResponse.json(
          { error: "Subject too long (max 500 chars)" },
          { status: 400 },
        );
      }
      data.subject = body.subject.trim();
    }

    if (body.body !== undefined) {
      if (typeof body.body !== "string" || !body.body.trim()) {
        return NextResponse.json(
          { error: "Body cannot be empty" },
          { status: 400 },
        );
      }
      if (body.body.length > 50_000) {
        return NextResponse.json(
          { error: "Body too long (max 50,000 chars)" },
          { status: 400 },
        );
      }
      data.body = body.body.trim();
    }

    if (body.category !== undefined) {
      if (body.category !== null && !VALID_CATEGORIES.includes(body.category)) {
        return NextResponse.json(
          { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` },
          { status: 400 },
        );
      }
      data.category = body.category;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    const updated = await prisma.emailTemplate.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
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

    const ctx = await resolveOrgAndRole(session.user.id);
    if (!ctx) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    // CRM role check: MANAGER required to delete templates
    if (!hasCrmPermission(ctx.crmRole, "MANAGER")) {
      return NextResponse.json(
        { error: "Forbidden: CRM MANAGER role required to delete templates" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const template = await prisma.emailTemplate.findFirst({
      where: { id, orgId: ctx.orgId },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }

    if (template.isSystem) {
      return NextResponse.json(
        { error: "System templates cannot be deleted" },
        { status: 403 },
      );
    }

    await prisma.emailTemplate.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
