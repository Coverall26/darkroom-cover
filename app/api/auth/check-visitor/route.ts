import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { isAdminEmail } from "@/lib/constants/admins";
import { reportError } from "@/lib/error";
import { appRouterAuthRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/check-visitor
 *
 * Check if email has viewer/access authorization.
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

  try {
    // Check static list first
    let isAdmin = isAdminEmail(emailLower);

    // Also check database for admin roles (OWNER, SUPER_ADMIN, ADMIN)
    if (!isAdmin) {
      const adminTeam = await prisma.userTeam.findFirst({
        where: {
          user: { email: { equals: emailLower, mode: "insensitive" } },
          role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
          status: "ACTIVE",
        },
      });
      isAdmin = !!adminTeam;
    }

    if (isAdmin) {
      return NextResponse.json({
        isAuthorized: true,
        isAdmin: true,
        message: "Admin access - you will enter as a visitor through this portal",
      });
    }

    const existingViewer = await prisma.viewer.findFirst({
      where: {
        email: { equals: emailLower, mode: "insensitive" },
        accessRevokedAt: null,
      },
      select: { id: true, email: true, teamId: true },
    });

    if (existingViewer) {
      return NextResponse.json({
        isAuthorized: true,
        isAdmin: false,
        message: "Viewer access granted",
      });
    }

    const viewerWithGroups = await prisma.viewer.findFirst({
      where: {
        email: { equals: emailLower, mode: "insensitive" },
        groups: {
          some: {},
        },
      },
      select: { id: true, email: true },
    });

    if (viewerWithGroups) {
      return NextResponse.json({
        isAuthorized: true,
        isAdmin: false,
        message: "Viewer group access granted",
      });
    }

    const linkWithEmail = await prisma.link.findFirst({
      where: {
        allowList: { has: emailLower },
        deletedAt: null,
        isArchived: false,
      },
      select: { id: true, name: true },
    });

    if (linkWithEmail) {
      return NextResponse.json({
        isAuthorized: true,
        isAdmin: false,
        message: "Link access granted",
      });
    }

    return NextResponse.json({
      isAuthorized: false,
      isAdmin: false,
      message: "Email not found in approved access list",
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error", isAuthorized: false },
      { status: 500 },
    );
  }
}
