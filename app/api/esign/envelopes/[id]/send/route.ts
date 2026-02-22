/**
 * POST /api/esign/envelopes/[id]/send — Send envelope to recipients
 *
 * Transitions envelope from DRAFT/PREPARING → SENT.
 * Sends signing emails to appropriate recipients based on signing mode.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { sendEnvelope } from "@/lib/esign/envelope-service";
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

    // Verify envelope belongs to team
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

    const sent = await sendEnvelope(id, user.id);

    // TODO: Wire actual email sending via Resend for each SENT recipient
    // For each recipient with status SENT, send signing email with:
    // - signingToken URL
    // - envelope.emailSubject
    // - envelope.emailMessage
    // - org branding

    return NextResponse.json(sent);
  } catch (error) {
    reportError(error as Error);
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("Cannot send") || message.includes("No signers")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
