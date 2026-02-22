/**
 * POST /api/esign/envelopes/[id]/decline — Signer declines to sign
 *
 * Called by the signer (authenticated via signing token, not session).
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { declineEnvelope } from "@/lib/esign/envelope-service";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const blocked = await appRouterRateLimit(req);
    if (blocked) return blocked;

    const { id } = await params;
    const body = await req.json();

    // Authenticate via signing token (no session required — external signers)
    const { signingToken, reason } = body;

    if (!signingToken) {
      return NextResponse.json(
        { error: "Signing token is required" },
        { status: 400 }
      );
    }

    // Find the recipient by signing token
    const recipient = await prisma.envelopeRecipient.findUnique({
      where: { signingToken },
      include: { envelope: true },
    });

    if (!recipient) {
      return NextResponse.json(
        { error: "Invalid signing token" },
        { status: 404 }
      );
    }

    if (recipient.envelopeId !== id) {
      return NextResponse.json(
        { error: "Token does not match envelope" },
        { status: 400 }
      );
    }

    const ipAddress =
      (req.headers.get("x-forwarded-for") || "").split(",")[0] || "unknown";
    const userAgent = req.headers.get("user-agent") || undefined;

    const declined = await declineEnvelope(
      id,
      recipient.id,
      reason,
      ipAddress,
      userAgent
    );

    // TODO: Send notification to envelope creator that signer declined
    // TODO: Send notification to other recipients that signing was declined

    return NextResponse.json({
      status: declined.status,
      declinedAt: declined.declinedAt,
    });
  } catch (error) {
    reportError(error as Error);
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("already") || message.includes("does not belong")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
