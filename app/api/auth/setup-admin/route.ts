import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterStrictRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/setup-admin
 *
 * Sets or updates the password for the authenticated admin user.
 * Requires an active session with OWNER/ADMIN/SUPER_ADMIN team role.
 *
 * Body: { password: string, currentPassword?: string }
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterStrictRateLimit(req);
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json();
  const { password, currentPassword } = body;

  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const sessionEmail = (session.user.email as string).toLowerCase().trim();

  try {
    const user = await prisma.user.findUnique({
      where: { email: sessionEmail },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const adminTeam = await prisma.userTeam.findFirst({
      where: {
        userId: user.id,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
      include: {
        team: { select: { id: true, name: true } },
      },
    });

    if (!adminTeam) {
      return NextResponse.json({ error: "Only admin users can set a password via this endpoint" }, { status: 403 });
    }

    if (user.password) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password required to change password" }, { status: 400 });
      }
      const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentValid) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    try {
      await logAuditEvent({
        eventType: "ADMIN_ACTION",
        resourceType: "User",
        resourceId: user.id,
        userId: user.id,
        teamId: adminTeam.team.id,
        metadata: { action: user.password ? "password_changed" : "password_set", method: "setup-admin" },
      });
    } catch {
      // Audit log failure shouldn't block the operation
    }

    return NextResponse.json({
      success: true,
      message: user.password
        ? "Password updated successfully"
        : "Password set successfully. You can now log in with email and password.",
    });
  } catch (error) {
    reportError(error as Error, { path: "/api/auth/setup-admin", action: "set-password" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
