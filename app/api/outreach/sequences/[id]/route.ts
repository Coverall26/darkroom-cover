/**
 * GET/PATCH/DELETE /api/outreach/sequences/[id] — Single sequence operations.
 *
 * GET: Return sequence with steps and enrollment stats.
 * PATCH: Update sequence name, description, isActive.
 * DELETE: Delete sequence (cancels all active enrollments first).
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
// Helper: resolve org + CRM role
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

    // CRM role check: VIEWER+ can view sequences (read-only)

    const { id } = await params;
    const sequence = await prisma.outreachSequence.findFirst({
      where: { id, orgId: ctx.orgId },
      include: {
        steps: { orderBy: { stepOrder: "asc" } },
        enrollments: {
          orderBy: { updatedAt: "desc" },
          take: 50,
          select: {
            id: true,
            contactId: true,
            currentStep: true,
            status: true,
            nextStepAt: true,
            pausedReason: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!sequence) {
      return NextResponse.json(
        { error: "Sequence not found" },
        { status: 404 },
      );
    }

    // Get stats
    const [activeCount, completedCount, cancelledCount] = await Promise.all([
      prisma.sequenceEnrollment.count({
        where: { sequenceId: id, status: "ACTIVE" },
      }),
      prisma.sequenceEnrollment.count({
        where: { sequenceId: id, status: "COMPLETED" },
      }),
      prisma.sequenceEnrollment.count({
        where: { sequenceId: id, status: "CANCELLED" },
      }),
    ]);

    return NextResponse.json({
      ...sequence,
      stats: {
        active: activeCount,
        completed: completedCount,
        cancelled: cancelledCount,
        total: activeCount + completedCount + cancelledCount,
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

    // CRM role check: MANAGER required to modify sequences
    if (!hasCrmPermission(ctx.crmRole, "MANAGER")) {
      return NextResponse.json(
        { error: "Forbidden: CRM MANAGER role required to modify sequences" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const sequence = await prisma.outreachSequence.findFirst({
      where: { id, orgId: ctx.orgId },
    });

    if (!sequence) {
      return NextResponse.json(
        { error: "Sequence not found" },
        { status: 404 },
      );
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json(
          { error: "Sequence name cannot be empty" },
          { status: 400 },
        );
      }
      data.name = body.name.trim();
    }

    if (body.description !== undefined) {
      data.description = body.description?.trim() || null;
    }

    if (body.isActive !== undefined) {
      data.isActive = Boolean(body.isActive);

      // If deactivating, pause all active enrollments
      if (!body.isActive) {
        await prisma.sequenceEnrollment.updateMany({
          where: { sequenceId: id, status: "ACTIVE" },
          data: {
            status: "PAUSED",
            pausedReason: "sequence_deactivated",
            nextStepAt: null,
          },
        });
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    const updated = await prisma.outreachSequence.update({
      where: { id },
      data,
      include: { steps: { orderBy: { stepOrder: "asc" } } },
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

    // CRM role check: MANAGER required to delete sequences
    if (!hasCrmPermission(ctx.crmRole, "MANAGER")) {
      return NextResponse.json(
        { error: "Forbidden: CRM MANAGER role required to delete sequences" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const sequence = await prisma.outreachSequence.findFirst({
      where: { id, orgId: ctx.orgId },
    });

    if (!sequence) {
      return NextResponse.json(
        { error: "Sequence not found" },
        { status: 404 },
      );
    }

    // Cancel all active enrollments before delete (cascade will handle the rest)
    await prisma.sequenceEnrollment.updateMany({
      where: { sequenceId: id, status: { in: ["ACTIVE", "PAUSED"] } },
      data: {
        status: "CANCELLED",
        pausedReason: "sequence_deleted",
        nextStepAt: null,
      },
    });

    // Cascade delete: steps + enrollments
    await prisma.outreachSequence.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
