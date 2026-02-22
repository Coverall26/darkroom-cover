import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";
import { publishServerEvent } from "@/lib/tracking/server-events";
import { sendNdaSignedConfirmation } from "@/lib/emails/send-nda-signed-confirmation";

export const dynamic = "force-dynamic";

/**
 * POST /api/lp/sign-nda
 * Records NDA acceptance for an LP investor.
 * Timestamps and audit-logs the NDA signing event.
 * For FundRoom Sign e-signature, use the /api/sign/[token] endpoint instead.
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { fundId, ndaAccepted, signatureMethod, signatureData } = body;

    if (!ndaAccepted) {
      return NextResponse.json(
        { error: "NDA must be accepted to proceed" },
        { status: 400 },
      );
    }

    // Find the investor profile
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { investorProfile: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const investor = user.investorProfile;
    if (!investor) {
      return NextResponse.json(
        { error: "Investor profile not found. Please complete registration first." },
        { status: 404 },
      );
    }

    // Update NDA status
    const now = new Date();
    await prisma.investor.update({
      where: { id: investor.id },
      data: {
        ndaSigned: true,
        ndaSignedAt: now,
        onboardingStep: Math.max(investor.onboardingStep || 0, 5),
      },
    });

    // Resolve teamId for audit logging
    const teamId = fundId
      ? (
          await prisma.fund.findUnique({
            where: { id: fundId },
            select: { teamId: true },
          })
        )?.teamId
      : null;

    // Audit log the NDA signing
    await logAuditEvent({
      eventType: "NDA_SIGNED",
      userId: user.id,
      teamId: teamId || undefined,
      resourceType: "Investor",
      resourceId: investor.id,
      metadata: {
        fundId: fundId || null,
        signedAt: now.toISOString(),
        signatureMethod: signatureMethod || "CHECKBOX", // TYPED, DRAWN, or CHECKBOX
        ...(signatureMethod === "TYPED" && signatureData?.typedName
          ? { typedName: String(signatureData.typedName).slice(0, 255) }
          : {}),
        ...(signatureMethod === "DRAWN" ? { hasDrawnSignature: true } : {}),
        ipAddress:
          req.headers.get("x-forwarded-for") ||
          req.headers.get("x-real-ip"),
        userAgent: req.headers.get("user-agent"),
      },
    });

    // Fire-and-forget: Track LP NDA signing
    publishServerEvent("funnel_lp_nda_signed", {
      userId: user.id,
      investorId: investor.id,
    }).catch((e) => reportError(e as Error));

    // Fire-and-forget: Send LP NDA confirmation email
    sendNdaSignedConfirmation({
      userId: user.id,
      investorId: investor.id,
      fundId: fundId || null,
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({
      success: true,
      ndaSigned: true,
      ndaSignedAt: now.toISOString(),
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
