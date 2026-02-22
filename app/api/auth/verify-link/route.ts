import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { z } from "zod";

import { SESSION_COOKIE_NAME } from "@/lib/constants/auth-cookies";
import { generateChecksum } from "@/lib/utils/generate-checksum";
import prisma from "@/lib/prisma";
import { serverInstance as rollbar } from "@/lib/rollbar";
import { reportError } from "@/lib/error";
import { appRouterAuthRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

const VerifyLinkBodySchema = z.object({
  id: z.string().min(1),
  checksum: z.string().min(1),
  action: z.enum(["validate", "verify"]).optional(),
});

/**
 * POST /api/auth/verify-link
 *
 * Validate/consume magic link token, create session.
 * Atomic $transaction to prevent race conditions.
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterAuthRateLimit(req);
  if (blocked) return blocked;

  const body = await req.json();
  const parsed = VerifyLinkBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ valid: false, error: "Missing required parameters" }, { status: 400 });
  }

  const { id, checksum, action } = parsed.data;
  const isValidateOnly = action === "validate";

  try {
    const expectedChecksum = generateChecksum(id);
    const checksumMatch = checksum === expectedChecksum;

    if (!checksumMatch) {
      return NextResponse.json({ valid: false, error: "Invalid verification link" }, { status: 400 });
    }

    const magicLink = await prisma.magicLinkCallback.findUnique({
      where: { token: id },
    });

    if (!magicLink) {
      return NextResponse.json({
        valid: false,
        error: "This link has already been used or is invalid. Please request a new login link.",
      }, { status: 400 });
    }

    if (magicLink.consumed) {
      return NextResponse.json({
        valid: false,
        error: "This link has already been used. Please request a new login link.",
      }, { status: 400 });
    }

    if (magicLink.expires < new Date()) {
      await prisma.magicLinkCallback.delete({ where: { id: magicLink.id } });
      return NextResponse.json({
        valid: false,
        error: "This link has expired. Please request a new login link.",
      }, { status: 400 });
    }

    if (isValidateOnly) {
      return NextResponse.json({ valid: true });
    }

    const email = magicLink.identifier.toLowerCase();

    // Wrap user upsert + magic link consumption in a transaction to prevent
    // race conditions where the magic link stays unconsumed if the user
    // upsert succeeds but the update fails (or vice versa).
    const { user, adminTeam } = await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
      const txUser = await tx.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          emailVerified: new Date(),
        },
      });

      // Mark magic link as consumed within the same transaction
      await tx.magicLinkCallback.update({
        where: { id: magicLink.id },
        data: { consumed: true },
      });

      const txAdminTeam = await tx.userTeam.findFirst({
        where: {
          userId: txUser.id,
          role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
          status: "ACTIVE",
        },
      });

      return { user: txUser, adminTeam: txAdminTeam };
    });

    const role = adminTeam ? "GP" : (user.role || "LP");

    // Build JWT payload matching NextAuth's expected structure
    const jwtPayload = {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.image,
      role,
      loginPortal: "VISITOR",
      createdAt: user.createdAt?.toISOString(),
    };

    const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds
    const sessionToken = await encode({
      token: jwtPayload,
      secret: process.env.NEXTAUTH_SECRET!,
      maxAge,
    });

    // Get the protocol from the request for proper cookie settings
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const isSecure = process.env.NODE_ENV === "production" || protocol === "https";

    // Use stored callbackUrl from MagicLinkCallback if available
    let redirectUrl = "/viewer-redirect";
    if (magicLink.callbackUrl) {
      try {
        const storedUrl = new URL(magicLink.callbackUrl);
        const nestedCallbackUrl = storedUrl.searchParams.get("callbackUrl");
        if (nestedCallbackUrl) {
          const decoded = decodeURIComponent(nestedCallbackUrl);
          if (decoded.startsWith("/") && !decoded.startsWith("//")) {
            redirectUrl = decoded;
          }
        }
      } catch {
        // If parsing fails, fall back to default
      }
    }

    rollbar.info("[VERIFY-LINK] Sign-in completed successfully", {
      userId: user.id,
      role,
      redirectUrl,
    });

    // Build the redirect response with Set-Cookie header
    const baseUrl = req.nextUrl.origin;
    const response = NextResponse.redirect(new URL(redirectUrl, baseUrl), 302);

    // Build cookie parts matching NextAuth's cookie config exactly
    const cookieParts = [
      `${SESSION_COOKIE_NAME}=${sessionToken}`,
      "Path=/",
      "HttpOnly",
      `Max-Age=${maxAge}`,
      "SameSite=Lax",
    ];
    if (isSecure) {
      cookieParts.push("Secure");
    }
    response.headers.set("Set-Cookie", cookieParts.join("; "));

    return response;
  } catch (error) {
    reportError(error as Error);
    rollbar.error("[VERIFY-LINK] Validation error", { error: String(error) });
    return NextResponse.json({ valid: false, error: "Invalid verification link" }, { status: 400 });
  }
}
