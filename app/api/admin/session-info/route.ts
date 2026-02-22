import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/session-info
 *
 * Returns last login info for the authenticated user.
 * Masks IP addresses for privacy.
 */
export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    // Find the most recent login event for this user (excluding current session)
    const lastLogin = await prisma.auditLog.findFirst({
      where: {
        userId: auth.userId,
        eventType: "USER_LOGIN",
      },
      orderBy: { createdAt: "desc" },
      skip: 1, // Skip current session login
      select: {
        createdAt: true,
        ipAddress: true,
        userAgent: true,
      },
    });

    return NextResponse.json({
      lastLogin: lastLogin
        ? {
            timestamp: lastLogin.createdAt.toISOString(),
            ipAddress: lastLogin.ipAddress
              ? maskIp(lastLogin.ipAddress)
              : null,
            browser: lastLogin.userAgent
              ? parseBrowserName(lastLogin.userAgent)
              : null,
          }
        : null,
    });
  } catch (error: unknown) {
    console.error("Error fetching session info:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function maskIp(ip: string): string {
  // Show only first two octets for privacy
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  return "Web Browser";
}

function parseBrowserName(ua: string): string {
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Opera") || ua.includes("OPR")) return "Opera";
  return "Web Browser";
}
