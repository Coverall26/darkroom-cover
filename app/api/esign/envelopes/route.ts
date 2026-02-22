/**
 * POST /api/esign/envelopes — Create a new standalone e-signature envelope
 * GET  /api/esign/envelopes — List envelopes for the authenticated user's team
 *
 * Envelopes can be sent to ANY email address without requiring the recipient
 * to be in a dataroom, investor pipeline, or contact list.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { createEnvelope } from "@/lib/esign/envelope-service";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

// ============================================================================
// GET — List envelopes
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const blocked = await appRouterRateLimit(req);
    if (blocked) return blocked;

    const auth = await requireAuthAppRouter();
    if (auth instanceof NextResponse) return auth;

    // Get user's team
    const userTeam = await prisma.userTeam.findFirst({
      where: {
        user: { email: auth.email },
        status: "ACTIVE",
      },
      select: { teamId: true },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "No active team" }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20", 10), 100);

    const where: Record<string, unknown> = { teamId: userTeam.teamId };
    if (status) {
      where.status = status;
    }

    const [envelopes, total] = await Promise.all([
      prisma.envelope.findMany({
        where,
        include: {
          recipients: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              order: true,
              status: true,
              signedAt: true,
              viewedAt: true,
            },
          },
          createdBy: {
            select: { name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.envelope.count({ where }),
    ]);

    // Status counts for dashboard
    const statusCounts = await prisma.envelope.groupBy({
      by: ["status"],
      where: { teamId: userTeam.teamId },
      _count: { id: true },
    });

    const counts = statusCounts.reduce(
      (acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      envelopes,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      statusCounts: counts,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ============================================================================
// POST — Create envelope
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const blocked = await appRouterRateLimit(req);
    if (blocked) return blocked;

    const auth = await requireAuthAppRouter();
    if (auth instanceof NextResponse) return auth;

    const user = await prisma.user.findUnique({
      where: { email: auth.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get user's team
    const userTeam = await prisma.userTeam.findFirst({
      where: {
        userId: user.id,
        status: "ACTIVE",
      },
      select: { teamId: true, role: true },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "No active team" }, { status: 403 });
    }

    const body = await req.json();

    // Validate required fields
    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!body.recipients || !Array.isArray(body.recipients) || body.recipients.length === 0) {
      return NextResponse.json({ error: "At least one recipient is required" }, { status: 400 });
    }

    // Validate each recipient
    for (const r of body.recipients) {
      if (!r.name || !r.email) {
        return NextResponse.json(
          { error: "Each recipient must have a name and email" },
          { status: 400 }
        );
      }
      // Basic email validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
        return NextResponse.json(
          { error: `Invalid email address: ${r.email}` },
          { status: 400 }
        );
      }
    }

    // Validate signing mode
    const validModes = ["SEQUENTIAL", "PARALLEL", "MIXED"];
    if (body.signingMode && !validModes.includes(body.signingMode)) {
      return NextResponse.json(
        { error: `Invalid signing mode. Must be one of: ${validModes.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate expiration
    let expiresAt: Date | undefined;
    if (body.expiresAt) {
      expiresAt = new Date(body.expiresAt);
      if (isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        return NextResponse.json(
          { error: "Expiration date must be in the future" },
          { status: 400 }
        );
      }
    }

    const envelope = await createEnvelope({
      teamId: userTeam.teamId,
      createdById: user.id,
      title: body.title.trim(),
      description: body.description?.trim(),
      signingMode: body.signingMode || "SEQUENTIAL",
      emailSubject: body.emailSubject?.trim(),
      emailMessage: body.emailMessage?.trim(),
      expiresAt,
      reminderEnabled: body.reminderEnabled ?? true,
      reminderDays: body.reminderDays ?? 3,
      maxReminders: body.maxReminders ?? 3,
      recipients: body.recipients,
      sourceFile: body.sourceFile,
      sourceStorageType: body.sourceStorageType,
      sourceFileName: body.sourceFileName,
      sourceMimeType: body.sourceMimeType,
      sourceFileSize: body.sourceFileSize,
      sourceNumPages: body.sourceNumPages,
    });

    return NextResponse.json(envelope, { status: 201 });
  } catch (error) {
    reportError(error as Error);
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("required") || message.includes("SIGNER")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
