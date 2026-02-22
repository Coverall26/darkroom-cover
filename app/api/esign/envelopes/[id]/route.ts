/**
 * GET    /api/esign/envelopes/[id] — Get envelope details
 * PATCH  /api/esign/envelopes/[id] — Update envelope (title, message, recipients while DRAFT)
 * DELETE /api/esign/envelopes/[id] — Delete envelope (DRAFT only) or void (sent)
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { voidEnvelope } from "@/lib/esign/envelope-service";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

// ============================================================================
// GET — Get envelope details
// ============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const blocked = await appRouterRateLimit(req);
    if (blocked) return blocked;

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Get user's team
    const userTeam = await prisma.userTeam.findFirst({
      where: {
        user: { email: session.user.email },
        status: "ACTIVE",
      },
      select: { teamId: true },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "No active team" }, { status: 403 });
    }

    const envelope = await prisma.envelope.findUnique({
      where: { id },
      include: {
        recipients: {
          orderBy: { order: "asc" },
        },
        filings: true,
        createdBy: {
          select: { name: true, email: true },
        },
      },
    });

    if (!envelope) {
      return NextResponse.json({ error: "Envelope not found" }, { status: 404 });
    }

    if (envelope.teamId !== userTeam.teamId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json(envelope);
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ============================================================================
// PATCH — Update envelope (DRAFT only)
// ============================================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const blocked = await appRouterRateLimit(req);
    if (blocked) return blocked;

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const userTeam = await prisma.userTeam.findFirst({
      where: {
        user: { email: session.user.email },
        status: "ACTIVE",
      },
      select: { teamId: true },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "No active team" }, { status: 403 });
    }

    const envelope = await prisma.envelope.findUnique({
      where: { id },
    });

    if (!envelope) {
      return NextResponse.json({ error: "Envelope not found" }, { status: 404 });
    }

    if (envelope.teamId !== userTeam.teamId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (envelope.status !== "DRAFT" && envelope.status !== "PREPARING") {
      return NextResponse.json(
        { error: "Can only edit envelopes in DRAFT or PREPARING status" },
        { status: 400 }
      );
    }

    const body = await req.json();

    // Build update data — only allow safe fields
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = body.title.trim();
    if (body.description !== undefined) updateData.description = body.description?.trim() || null;
    if (body.emailSubject !== undefined) updateData.emailSubject = body.emailSubject?.trim() || null;
    if (body.emailMessage !== undefined) updateData.emailMessage = body.emailMessage?.trim() || null;
    if (body.signingMode !== undefined) {
      if (!["SEQUENTIAL", "PARALLEL", "MIXED"].includes(body.signingMode)) {
        return NextResponse.json({ error: "Invalid signing mode" }, { status: 400 });
      }
      updateData.signingMode = body.signingMode;
    }
    if (body.expiresAt !== undefined) {
      updateData.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    }
    if (body.reminderEnabled !== undefined) updateData.reminderEnabled = Boolean(body.reminderEnabled);
    if (body.reminderDays !== undefined) updateData.reminderDays = Number(body.reminderDays);
    if (body.status === "PREPARING") updateData.status = "PREPARING";

    const updated = await prisma.envelope.update({
      where: { id },
      data: updateData,
      include: {
        recipients: { orderBy: { order: "asc" } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ============================================================================
// DELETE — Delete (DRAFT) or void (sent) envelope
// ============================================================================

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const blocked = await appRouterRateLimit(req);
    if (blocked) return blocked;

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    const userTeam = await prisma.userTeam.findFirst({
      where: {
        user: { email: session.user.email },
        status: "ACTIVE",
      },
      select: { teamId: true },
    });

    if (!userTeam || !user) {
      return NextResponse.json({ error: "No active team" }, { status: 403 });
    }

    const envelope = await prisma.envelope.findUnique({
      where: { id },
    });

    if (!envelope) {
      return NextResponse.json({ error: "Envelope not found" }, { status: 404 });
    }

    if (envelope.teamId !== userTeam.teamId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (envelope.status === "DRAFT" || envelope.status === "PREPARING") {
      // Hard delete draft envelopes
      await prisma.envelope.delete({ where: { id } });
      return NextResponse.json({ message: "Envelope deleted" });
    }

    if (envelope.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Cannot delete a completed envelope" },
        { status: 400 }
      );
    }

    // For sent/in-progress envelopes, void instead of delete
    const body = await req.json().catch(() => ({}));
    const voided = await voidEnvelope(id, user.id, body.reason);
    return NextResponse.json(voided);
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
