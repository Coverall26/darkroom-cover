/**
 * GET/POST /api/outreach/templates — Email template CRUD.
 *
 * GET: List templates for the user's org. Optional ?category= filter.
 * POST: Create a new template. Enforces tier template limit.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { resolveOrgTier } from "@/lib/tier/crm-tier";
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
// GET — List templates
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
        team: { select: { organizationId: true } },
      },
    });
    if (!userTeam?.team?.organizationId) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    const orgId = userTeam.team.organizationId;

    // CRM role check: VIEWER+ can list templates (read-only)

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    const where: Record<string, unknown> = { orgId };
    if (category && VALID_CATEGORIES.includes(category)) {
      where.category = category;
    }

    const templates = await prisma.emailTemplate.findMany({
      where,
      orderBy: [{ isSystem: "desc" }, { updatedAt: "desc" }],
    });

    // Get tier limits for the frontend
    const tier = await resolveOrgTier(orgId);

    return NextResponse.json({
      templates,
      limits: {
        templateLimit: tier.emailTemplateLimit,
        currentCount: templates.filter((t) => !t.isSystem).length,
      },
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Create template
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
        team: { select: { organizationId: true } },
      },
    });
    if (!userTeam?.team?.organizationId) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    // CRM role check: CONTRIBUTOR required to create templates
    const crmRole = resolveCrmRole(userTeam.role, userTeam.crmRole);
    if (!hasCrmPermission(crmRole, "CONTRIBUTOR")) {
      return NextResponse.json(
        { error: "Forbidden: CRM CONTRIBUTOR role required to create templates" },
        { status: 403 },
      );
    }

    const orgId = userTeam.team.organizationId;

    const body = await req.json();
    const { name, subject, body: templateBody, category } = body;

    // Validate
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Template name is required" },
        { status: 400 },
      );
    }
    if (name.length > 100) {
      return NextResponse.json(
        { error: "Template name too long (max 100 chars)" },
        { status: 400 },
      );
    }
    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return NextResponse.json(
        { error: "Subject line is required" },
        { status: 400 },
      );
    }
    if (subject.length > 500) {
      return NextResponse.json(
        { error: "Subject too long (max 500 chars)" },
        { status: 400 },
      );
    }
    if (!templateBody || typeof templateBody !== "string" || !templateBody.trim()) {
      return NextResponse.json(
        { error: "Template body is required" },
        { status: 400 },
      );
    }
    if (templateBody.length > 50_000) {
      return NextResponse.json(
        { error: "Template body too long (max 50,000 chars)" },
        { status: 400 },
      );
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 },
      );
    }

    // Check tier template limit
    const tier = await resolveOrgTier(orgId);
    if (tier.emailTemplateLimit !== null) {
      const currentCount = await prisma.emailTemplate.count({
        where: { orgId, isSystem: false },
      });
      if (currentCount >= tier.emailTemplateLimit) {
        return NextResponse.json(
          {
            error: "TEMPLATE_LIMIT_REACHED",
            meta: {
              current: currentCount,
              limit: tier.emailTemplateLimit,
              upgradeUrl: "/admin/settings?tab=billing",
            },
          },
          { status: 403 },
        );
      }
    }

    const template = await prisma.emailTemplate.create({
      data: {
        orgId,
        name: name.trim(),
        subject: subject.trim(),
        body: templateBody.trim(),
        category: category || "CUSTOM",
        isSystem: false,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
