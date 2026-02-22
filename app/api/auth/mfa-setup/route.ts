import { NextRequest, NextResponse } from "next/server";

import { requireAuthAppRouter } from "@/lib/auth/rbac";
import {
  generateTotpSecret,
  buildTotpUri,
  verifyTotpCode,
  encryptMfaSecret,
  decryptMfaSecret,
  generateRecoveryCodes,
  formatRecoveryCode,
} from "@/lib/auth/mfa";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterStrictRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/mfa-setup — Generate TOTP secret + QR URI
 * PUT  /api/auth/mfa-setup — Verify TOTP code and enable MFA
 * DELETE /api/auth/mfa-setup — Disable MFA
 *
 * Requires active session.
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterStrictRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  const userId = auth.userId;
  const email = auth.email;

  // Step 1: Generate a new TOTP secret
  try {
    const secret = generateTotpSecret();
    const uri = buildTotpUri(secret, email);

    // Store encrypted secret temporarily (not yet enabled)
    const encrypted = encryptMfaSecret(secret);
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: encrypted },
    });

    return NextResponse.json({
      secret,
      uri,
      qrData: uri,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const blocked = await appRouterStrictRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  const userId = auth.userId;

  // Step 2: Verify code and enable MFA
  try {
    const body = await req.json();
    const { code } = body;

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json({ error: "Valid 6-digit code required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaEnabled: true },
    });

    if (!user?.mfaSecret) {
      return NextResponse.json({ error: "MFA setup not initiated" }, { status: 400 });
    }

    if (user.mfaEnabled) {
      return NextResponse.json({ error: "MFA is already enabled" }, { status: 400 });
    }

    // Decrypt and verify the TOTP code
    const secret = decryptMfaSecret(user.mfaSecret);
    const valid = verifyTotpCode(secret, code);

    if (!valid) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    // Generate recovery codes
    const recoveryCodes = generateRecoveryCodes(10);
    const encryptedCodes = recoveryCodes.map((c: string) => encryptMfaSecret(c));

    // Enable MFA
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaVerifiedAt: new Date(),
        mfaRecoveryCodes: encryptedCodes,
      },
    });

    // Audit log
    const teamMembership = await prisma.userTeam.findFirst({
      where: { userId, status: "ACTIVE" },
      select: { teamId: true },
    });

    if (teamMembership) {
      await logAuditEvent({
        teamId: teamMembership.teamId,
        userId,
        eventType: "MFA_ENABLED",
        resourceType: "User",
        resourceId: userId,
      });
    }

    return NextResponse.json({
      enabled: true,
      recoveryCodes: recoveryCodes.map(formatRecoveryCode),
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const blocked = await appRouterStrictRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  const userId = auth.userId;

  // Disable MFA
  try {
    const body = await req.json();
    const { code } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Verification code required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaEnabled: true },
    });

    if (!user?.mfaEnabled || !user.mfaSecret) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }

    const secret = decryptMfaSecret(user.mfaSecret);
    const valid = verifyTotpCode(secret, code);

    if (!valid) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaVerifiedAt: null,
        mfaRecoveryCodes: [],
      },
    });

    const teamMembership = await prisma.userTeam.findFirst({
      where: { userId, status: "ACTIVE" },
      select: { teamId: true },
    });

    if (teamMembership) {
      await logAuditEvent({
        teamId: teamMembership.teamId,
        userId,
        eventType: "MFA_DISABLED",
        resourceType: "User",
        resourceId: userId,
      });
    }

    return NextResponse.json({ disabled: true });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
