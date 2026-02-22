import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

import { verifyAdminMagicLink } from "@/lib/auth/admin-magic-link";
import { SESSION_COOKIE_NAME } from "@/lib/constants/auth-cookies";
import prisma from "@/lib/prisma";
import { appRouterAuthRateLimit } from "@/lib/security/rate-limiter";
import { serverInstance as rollbar } from "@/lib/rollbar";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/admin-magic-verify
 *
 * Verify admin magic link, create session, redirect.
 */
export async function GET(req: NextRequest) {
  const blocked = await appRouterAuthRateLimit(req);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const redirect = searchParams.get("redirect");

  const baseUrl = req.nextUrl.origin;

  if (!token || !email) {
    return NextResponse.redirect(new URL("/admin/login?error=InvalidLink", baseUrl));
  }

  try {
    const isValid = await verifyAdminMagicLink({ token, email });

    if (!isValid) {
      return NextResponse.redirect(new URL("/admin/login?error=ExpiredLink", baseUrl));
    }

    // Use upsert to handle race condition where two magic links for same email
    // might be clicked simultaneously. Also ensures admin users always have GP role.
    const user = await prisma.user.upsert({
      where: { email: email.toLowerCase() },
      update: {
        role: "GP", // Ensure admin always has GP role
      },
      create: {
        email: email.toLowerCase(),
        emailVerified: new Date(),
        role: "GP",
      },
    });

    // Create JWT token (matching NextAuth's JWT strategy)
    const jwtPayload = {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.image,
      role: "GP",
      loginPortal: "ADMIN",
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
    const isProduction = process.env.NODE_ENV === "production" || protocol === "https";

    // Build cookie - match NextAuth's cookie config exactly (NO Domain attribute)
    const cookieParts = [
      `${SESSION_COOKIE_NAME}=${sessionToken}`,
      "Path=/",
      "HttpOnly",
      `Max-Age=${maxAge}`,
      "SameSite=Lax",
    ];
    if (isProduction) {
      cookieParts.push("Secure");
    }

    // Validate redirect path to prevent open redirect attacks
    const ALLOWED_REDIRECT_PREFIXES = ["/hub", "/datarooms", "/admin", "/dashboard", "/settings", "/lp"];
    const DEFAULT_REDIRECT = "/hub";

    let redirectPath = DEFAULT_REDIRECT;
    if (redirect && typeof redirect === "string") {
      const isRelativePath = redirect.startsWith("/") && !redirect.startsWith("//");
      const isAllowedPath = ALLOWED_REDIRECT_PREFIXES.some((prefix: string) => redirect.startsWith(prefix));

      if (isRelativePath && isAllowedPath) {
        redirectPath = redirect;
      }
    }

    rollbar.info("[ADMIN_MAGIC_VERIFY] Sign-in completed successfully", {
      userId: user.id,
      redirectPath,
    });

    // Use 302 redirect with cookie header
    const response = NextResponse.redirect(new URL(redirectPath, baseUrl), 302);
    response.headers.set("Set-Cookie", cookieParts.join("; "));
    return response;
  } catch (error) {
    reportError(error as Error);
    rollbar.error("[ADMIN_MAGIC_VERIFY] Error", { error: String(error) });
    return NextResponse.redirect(new URL("/admin/login?error=VerificationFailed", baseUrl));
  }
}
