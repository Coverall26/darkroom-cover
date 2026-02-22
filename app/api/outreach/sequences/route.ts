/**
 * GET/POST /api/outreach/sequences — Sequence CRUD.
 *
 * GET: List sequences for the org.
 * POST: Create a new sequence with steps.
 * Requires AI_CRM add-on.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { resolveOrgTier } from "@/lib/tier/crm-tier";
import { resolveCrmRole, hasCrmPermission } from "@/lib/auth/crm-roles";
import { OutreachStepCondition } from "@prisma/client";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET — List sequences
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
        team: { select: { id: true, organizationId: true } },
      },
    });
    if (!userTeam?.team?.organizationId) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    const orgId = userTeam.team.organizationId;

    // CRM role check: VIEWER+ can list sequences (read-only)
    const crmRole = resolveCrmRole(userTeam.role, userTeam.crmRole);

    const sequences = await prisma.outreachSequence.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
        _count: { select: { enrollments: true } },
      },
    });

    // Get active enrollment counts per sequence
    const sequencesWithStats = await Promise.all(
      sequences.map(async (seq) => {
        const activeCount = await prisma.sequenceEnrollment.count({
          where: { sequenceId: seq.id, status: "ACTIVE" },
        });
        const completedCount = await prisma.sequenceEnrollment.count({
          where: { sequenceId: seq.id, status: "COMPLETED" },
        });
        return {
          ...seq,
          stats: {
            totalEnrolled: seq._count.enrollments,
            active: activeCount,
            completed: completedCount,
          },
        };
      }),
    );

    return NextResponse.json({ sequences: sequencesWithStats });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Create sequence
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
        team: { select: { id: true, organizationId: true } },
      },
    });
    if (!userTeam?.team?.organizationId) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    const orgId = userTeam.team.organizationId;

    // CRM role check: MANAGER required to create sequences
    const crmRole = resolveCrmRole(userTeam.role, userTeam.crmRole);
    if (!hasCrmPermission(crmRole, "MANAGER")) {
      return NextResponse.json(
        { error: "Forbidden: CRM MANAGER role required to create sequences" },
        { status: 403 },
      );
    }

    // Check AI CRM
    const tier = await resolveOrgTier(orgId);
    if (!tier.hasAiFeatures) {
      return NextResponse.json(
        {
          error: "Sequences require the AI CRM add-on",
          upgradeUrl: "/admin/settings?tab=billing",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { name, description, steps } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Sequence name is required" },
        { status: 400 },
      );
    }

    if (!Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json(
        { error: "At least one step is required" },
        { status: 400 },
      );
    }

    if (steps.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 steps per sequence" },
        { status: 400 },
      );
    }

    // Validate each step
    const VALID_CONDITIONS = [
      "ALWAYS",
      "IF_NO_REPLY",
      "IF_NOT_OPENED",
      "IF_NOT_CLICKED",
    ];

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (!s.templateId && !s.aiPrompt) {
        return NextResponse.json(
          { error: `Step ${i + 1} must have a templateId or aiPrompt` },
          { status: 400 },
        );
      }
      if (s.delayDays !== undefined && (s.delayDays < 0 || s.delayDays > 90)) {
        return NextResponse.json(
          { error: `Step ${i + 1} delay must be between 0 and 90 days` },
          { status: 400 },
        );
      }
      if (s.condition && !VALID_CONDITIONS.includes(s.condition)) {
        return NextResponse.json(
          {
            error: `Step ${i + 1} condition must be one of: ${VALID_CONDITIONS.join(", ")}`,
          },
          { status: 400 },
        );
      }
    }

    const sequence = await prisma.outreachSequence.create({
      data: {
        orgId,
        name: name.trim(),
        description: description?.trim() || null,
        steps: {
          create: steps.map(
            (
              s: {
                delayDays?: number;
                templateId?: string;
                aiPrompt?: string;
                condition?: string;
              },
              i: number,
            ) => ({
              stepOrder: i,
              delayDays: s.delayDays ?? 3,
              templateId: s.templateId || null,
              aiPrompt: s.aiPrompt || null,
              condition: (s.condition || "ALWAYS") as OutreachStepCondition,
            }),
          ),
        },
      },
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
      },
    });

    return NextResponse.json(sequence, { status: 201 });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
