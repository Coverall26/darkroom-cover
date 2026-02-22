import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { isAdminEmail } from "@/lib/constants/admins";
import { reportError } from "@/lib/error";
import { appRouterAuthRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/check-admin
 *
 * Check if email is admin (static list + DB lookup).
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterAuthRateLimit(req);
  if (blocked) return blocked;

  const body = await req.json();
  const { email } = body;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const emailLower = email.toLowerCase().trim();

  // First check static admin list
  if (isAdminEmail(emailLower)) {
    return NextResponse.json({ isAdmin: true });
  }

  // Then check database for admin roles (OWNER, SUPER_ADMIN, ADMIN)
  try {
    const adminTeam = await prisma.userTeam.findFirst({
      where: {
        user: { email: { equals: emailLower, mode: "insensitive" } },
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
    });

    return NextResponse.json({ isAdmin: !!adminTeam });
  } catch (error) {
    reportError(error as Error);
    // Fall back to static check only
    return NextResponse.json({ isAdmin: isAdminEmail(emailLower) });
  }
}
