import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterAuthRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/\d/, "Password must contain at least one number")
    .regex(
      /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
      "Password must contain at least one special character",
    ),
  name: z.string().trim().min(2).max(100),
});

/**
 * POST /api/auth/register
 *
 * Create new user with password + name.
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterAuthRateLimit(req);
  if (blocked) return blocked;

  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.errors[0]?.message || "Invalid registration data",
    }, { status: 400 });
  }

  const { email, password, name } = parsed.data;

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, password: true },
    });

    if (existingUser) {
      if (existingUser.password) {
        // User already has a password — don't reveal this for security
        return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
      }
      // User exists but has no password (e.g., created via magic link)
      // Set their password
      const hashedPassword = await bcrypt.hash(password, 12);
      await prisma.user.update({
        where: { email },
        data: { password: hashedPassword, name: name || undefined },
      });

      await logAuditEvent({
        eventType: "USER_PASSWORD_SET",
        userId: existingUser.id,
        resourceType: "User",
        resourceId: existingUser.id,
        metadata: { method: "registration", hasExistingAccount: true },
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      });

      return NextResponse.json({ message: "Password set successfully" });
    }

    // Create new user with hashed password
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: "GP",
      },
    });

    await logAuditEvent({
      eventType: "USER_REGISTERED",
      userId: user.id,
      resourceType: "User",
      resourceId: user.id,
      metadata: { method: "email_password", source: "signup_page" },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    return NextResponse.json({ message: "Account created", userId: user.id }, { status: 201 });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
