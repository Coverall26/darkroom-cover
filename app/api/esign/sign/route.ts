/**
 * Envelope Signing Endpoint
 *
 * GET  /api/esign/sign?token=xxx — Authenticate signer and get signing session
 * POST /api/esign/sign — Record signature completion
 *
 * Token-based authentication (no session required — supports external signers).
 */
import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/error";
import {
  authenticateSigner,
  recordSignerCompletion,
} from "@/lib/esign/signing-session";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * GET — Validate signing token and return session info.
 * Used by the signing UI to determine what the signer can see/do.
 */
export async function GET(req: NextRequest) {
  try {
    const blocked = await appRouterRateLimit(req);
    if (blocked) return blocked;

    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json(
        { error: "Signing token is required" },
        { status: 400 }
      );
    }

    const session = await authenticateSigner(token);

    return NextResponse.json({
      recipientId: session.recipientId,
      envelopeId: session.envelopeId,
      email: session.email,
      name: session.name,
      role: session.role,
      status: session.status,
      signingMode: session.signingMode,
      order: session.order,
      canSign: session.canSign,
      reason: session.reason,
      envelope: session.envelope,
    });
  } catch (error) {
    reportError(error as Error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Invalid signing token") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST — Record signer's signature completion.
 * Body: { signingToken, signatureImage?, signatureType?, esignConsent, fieldValues? }
 */
export async function POST(req: NextRequest) {
  try {
    const blocked = await appRouterRateLimit(req);
    if (blocked) return blocked;

    const body = await req.json();
    const { signingToken, signatureImage, signatureType, esignConsent, fieldValues } = body;

    if (!signingToken) {
      return NextResponse.json(
        { error: "Signing token is required" },
        { status: 400 }
      );
    }

    if (!esignConsent) {
      return NextResponse.json(
        { error: "ESIGN consent is required" },
        { status: 400 }
      );
    }

    const ipAddress =
      (req.headers.get("x-forwarded-for") || "").split(",")[0] || "unknown";
    const userAgent = req.headers.get("user-agent") || undefined;

    const result = await recordSignerCompletion({
      signingToken,
      signatureImage,
      signatureType,
      ipAddress,
      userAgent,
      esignConsent,
      fieldValues,
    });

    return NextResponse.json({
      success: result.success,
      isComplete: result.isEnvelopeComplete,
      nextRecipients: result.nextRecipients,
    });
  } catch (error) {
    reportError(error as Error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (
      message === "Invalid signing token" ||
      message.includes("Cannot sign") ||
      message.includes("already")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
