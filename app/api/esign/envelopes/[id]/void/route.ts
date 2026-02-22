/**
 * POST /api/esign/envelopes/[id]/void — Void (cancel) an in-flight envelope
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { voidEnvelope } from "@/lib/esign/envelope-service";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

export async function POST(
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
      select: { teamId: true },
    });

    if (!envelope) {
      return NextResponse.json({ error: "Envelope not found" }, { status: 404 });
    }

    if (envelope.teamId !== userTeam.teamId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const voided = await voidEnvelope(id, user.id, body.reason);

    return NextResponse.json(voided);
  } catch (error) {
    reportError(error as Error);
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("Cannot void")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
