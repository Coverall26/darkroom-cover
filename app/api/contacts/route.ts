/**
 * GET /api/contacts — Returns contacts for current org with tier-aware data.
 * POST /api/contacts — Create new contact.
 *
 * Query params (GET): status, search, tag, sortBy, sortDir, page, limit, fundId
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { resolveOrgTier } from "@/lib/tier/crm-tier";
import { checkContactLimit } from "@/lib/tier/gates";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { resolveCrmRole, type CrmRoleLevel } from "@/lib/auth/crm-roles";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveUserContext(userId: string) {
  const userTeam = await prisma.userTeam.findFirst({
    where: { userId, role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER", "MEMBER"] } },
    select: {
      userId: true,
      role: true,
      crmRole: true,
      team: { select: { id: true, organizationId: true } },
    },
  });
  return userTeam;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ctx = await resolveUserContext(session.user.id);
    if (!ctx?.team?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const teamId = ctx.team.id;
    const orgId = ctx.team.organizationId;
    const tier = await resolveOrgTier(orgId);

    // Parse query params
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const tag = searchParams.get("tag");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortDir = (searchParams.get("sortDir") || "desc") as "asc" | "desc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const engagement = searchParams.get("engagement"); // hot/warm/cool

    // Build where clause
    const where: Record<string, unknown> = { teamId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }
    if (tag) {
      where.tags = { path: [], array_contains: tag };
    }
    if (engagement === "hot") {
      where.engagementScore = { gte: 15 };
    } else if (engagement === "warm") {
      where.engagementScore = { gte: 5, lt: 15 };
    } else if (engagement === "cool") {
      where.engagementScore = { gte: 1, lt: 5 };
    }

    // Sort
    const validSortFields = ["createdAt", "updatedAt", "firstName", "lastName", "email", "engagementScore", "status", "source", "nextFollowUpAt"];
    const orderField = validSortFields.includes(sortBy) ? sortBy : "createdAt";

    // Query contacts
    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where: where as any,
        include: {
          contactActivities: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              type: true,
              description: true,
              createdAt: true,
              metadata: true,
            },
          },
          // Include investor profile for FUNDROOM+ tiers
          ...(tier.hasLpOnboarding
            ? {
                investor: {
                  select: {
                    id: true,
                    onboardingStep: true,
                    accreditationStatus: true,
                    entityType: true,
                    investments: {
                      select: {
                        id: true,
                        commitmentAmount: true,
                        fundedAmount: true,
                        status: true,
                        fund: { select: { id: true, name: true } },
                      },
                      take: 5,
                    },
                  },
                },
              }
            : {}),
        } as any,
        orderBy: { [orderField]: sortDir },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.contact.count({ where: where as any }),
    ]);

    // Get contact count for usage display
    const contactCount = await prisma.contact.count({ where: { teamId } });

    // Resolve CRM role for current user
    const effectiveCrmRole: CrmRoleLevel = resolveCrmRole(
      ctx.role || "MEMBER",
      ctx.crmRole,
    );

    return NextResponse.json({
      contacts,
      total,
      page,
      limit,
      tier: tier.tier,
      aiCrmEnabled: tier.aiCrmEnabled,
      pipelineStages: tier.pipelineStages,
      crmRole: effectiveCrmRole,
      usage: {
        contactCount,
        contactLimit: tier.maxContacts,
      },
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ctx = await resolveUserContext(session.user.id);
    if (!ctx?.team?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 403 });
    }

    const teamId = ctx.team.id;
    const orgId = ctx.team.organizationId;

    // CRM role check: CONTRIBUTOR+ required to create contacts
    const effectiveRole = resolveCrmRole(ctx.role || "MEMBER", ctx.crmRole);
    if (effectiveRole === "VIEWER") {
      return NextResponse.json(
        { error: "Forbidden: CRM CONTRIBUTOR role required to add contacts" },
        { status: 403 },
      );
    }

    // Check contact limit
    const limitCheck = await checkContactLimit(orgId);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: "CONTACT_LIMIT_REACHED", ...limitCheck.meta },
        { status: 403 },
      );
    }

    const body = await req.json();

    // Validate required fields
    if (!body.email || typeof body.email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    const email = body.email.trim().toLowerCase();

    // Check for duplicate
    const existing = await prisma.contact.findUnique({
      where: { teamId_email: { teamId, email } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Contact with this email already exists", contactId: existing.id },
        { status: 409 },
      );
    }

    // Create contact
    const contact = await prisma.contact.create({
      data: {
        teamId,
        email,
        firstName: body.firstName?.trim() || null,
        lastName: body.lastName?.trim() || null,
        phone: body.phone?.trim() || null,
        company: body.company?.trim() || null,
        title: body.title?.trim() || null,
        status: body.status || "PROSPECT",
        source: body.source || "MANUAL_ENTRY",
        tags: body.tags || null,
        customFields: body.customFields || null,
        notes: body.notes?.trim() || null,
        investorId: body.investorId || null,
      },
    });

    // Create CREATED activity
    await prisma.contactActivity.create({
      data: {
        contactId: contact.id,
        type: "CREATED",
        description: `Contact created via ${contact.source}`,
        actorId: session.user.id,
      },
    });

    // If source is DATAROOM_VIEWER, delete PendingContact with same email
    if (body.source === "DATAROOM_VIEWER" || body.source === "DATAROOM_VIEW") {
      await prisma.pendingContact.deleteMany({
        where: { orgId, email },
      }).catch((e) => reportError(e as Error)); // Non-blocking
    }

    // Audit log
    await logAuditEvent({
      eventType: "CONTACT_CREATED",
      userId: session.user.id,
      teamId,
      resourceType: "Contact",
      resourceId: contact.id,
      metadata: { email, source: contact.source },
    }).catch((e) => reportError(e as Error));

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
