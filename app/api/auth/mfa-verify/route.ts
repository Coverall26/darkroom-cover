import { NextRequest, NextResponse } from "next/server";

import { requireAuthAppRouter } from "@/lib/auth/rbac";
import { verifyTotpCode, decryptMfaSecret } from "@/lib/auth/mfa";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterMfaRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/mfa-verify
 *
 * Verifies a TOTP code or recovery code for an active session.
 * Called after login when org requires MFA.
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterMfaRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  const userId = auth.userId;

  try {
    const body = await req.json();
    const { code, type = "totp" } = body;

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Verification code required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        mfaSecret: true,
        mfaEnabled: true,
        mfaRecoveryCodes: true,
      },
    });

    if (!user?.mfaEnabled || !user.mfaSecret) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }

    let verified = false;

    if (type === "recovery") {
      // Verify recovery code
      const cleanCode = code.replace(/-/g, "").toUpperCase();
      const remainingCodes: string[] = [];
      let found = false;

      for (const encrypted of user.mfaRecoveryCodes) {
        try {
          const decrypted = decryptMfaSecret(encrypted);
          if (!found && decrypted.toUpperCase() === cleanCode) {
            found = true;
            // Don't add this code back (one-time use)
          } else {
            remainingCodes.push(encrypted);
          }
        } catch {
          remainingCodes.push(encrypted);
        }
      }

      if (found) {
        verified = true;
        // Remove the used recovery code
        await prisma.user.update({
          where: { id: userId },
          data: { mfaRecoveryCodes: remainingCodes },
        });
      }
    } else {
      // Verify TOTP code
      if (code.length !== 6 || !/^\d{6}$/.test(code)) {
        return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
      }

      const secret = decryptMfaSecret(user.mfaSecret);
      verified = verifyTotpCode(secret, code);
    }

    if (!verified) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    // Update verification timestamp
    await prisma.user.update({
      where: { id: userId },
      data: { mfaVerifiedAt: new Date() },
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
        eventType: "MFA_VERIFIED",
        resourceType: "User",
        resourceId: userId,
        metadata: { method: type },
      });
    }

    return NextResponse.json({ verified: true });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
