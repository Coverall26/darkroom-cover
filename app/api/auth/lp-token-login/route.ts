import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

import { SESSION_COOKIE_NAME } from "@/lib/constants/auth-cookies";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterAuthRateLimit } from "@/lib/security/rate-limiter";
import { logAuditEvent } from "@/lib/audit/audit-logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/lp-token-login
 *
 * Exchange one-time LP token for session.
 * Token is generated during LP registration and is single-use.
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterAuthRateLimit(req);
  if (blocked) return blocked;

  const body = await req.json();
  const { token } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  try {
    // Look up the one-time token
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    // Check expiry
    if (verificationToken.expires < new Date()) {
      // Clean up expired token
      await prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: verificationToken.identifier,
            token: verificationToken.token,
          },
        },
      }).catch((e: unknown) => reportError(e as Error));
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    // Verify it's an LP one-time token
    if (!verificationToken.identifier.startsWith("lp-onetime:")) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const userId = verificationToken.identifier.replace("lp-onetime:", "");

    // Atomically delete token + look up user in a transaction to prevent
    // race conditions where concurrent requests consume the same token
    const [, user, adminTeam] = await prisma.$transaction([
      prisma.verificationToken.delete({
        where: {
          identifier_token: {
            identifier: verificationToken.identifier,
            token: verificationToken.token,
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
          createdAt: true,
        },
      }),
      prisma.userTeam.findFirst({
        where: {
          userId,
          role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
          status: "ACTIVE",
        },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const role = adminTeam ? "GP" : (user.role || "LP");

    // Build JWT payload matching NextAuth's expected structure
    const jwtPayload = {
      sub: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.image,
      role,
      loginPortal: "VISITOR" as const,
      createdAt: user.createdAt?.toISOString(),
    };

    const maxAge = 30 * 24 * 60 * 60; // 30 days
    const sessionToken = await encode({
      token: jwtPayload,
      secret: process.env.NEXTAUTH_SECRET!,
      maxAge,
    });

    // Set session cookie — matching auth-options.ts cookie config exactly
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const isSecure = process.env.NODE_ENV === "production" || protocol === "https";

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

    // Audit log the token login (fire-and-forget)
    logAuditEvent({
      eventType: "USER_LOGIN",
      userId: user.id,
      resourceType: "User",
      resourceId: user.id,
      metadata: { method: "lp-onetime-token", loginPortal: "VISITOR" },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    }).catch((e: unknown) => reportError(e as Error));

    const response = NextResponse.json({ success: true });
    response.headers.set("Set-Cookie", cookieParts.join("; "));
    return response;
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
