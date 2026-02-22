/**
 * GET /api/esign/envelopes/[id]/status — Get signing progress for an envelope
 *
 * Returns which signers are in the current group, who has signed,
 * and which groups are waiting (for sequential/mixed mode).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { getSigningStatus } from "@/lib/esign/signing-session";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

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

    // Verify envelope belongs to team
    const envelope = await prisma.envelope.findUnique({
      where: { id },
      select: { teamId: true },
    });

    if (!envelope) {
      return NextResponse.json(
        { error: "Envelope not found" },
        { status: 404 }
      );
    }

    if (envelope.teamId !== userTeam.teamId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const status = await getSigningStatus(id);

    return NextResponse.json(status);
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
