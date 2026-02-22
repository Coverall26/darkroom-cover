import { NextRequest, NextResponse } from "next/server";

import { reportError } from "@/lib/error";
import { isUserAdminAsync } from "@/lib/constants/admins";
import { createAdminMagicLink } from "@/lib/auth/admin-magic-link";
import { sendEmail, isResendConfigured } from "@/lib/resend";
import AdminLoginLinkEmail from "@/components/emails/admin-login-link";
import { appRouterAuthRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/admin-login
 *
 * Send admin magic link email.
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterAuthRateLimit(req);
  if (blocked) return blocked;

  const body = await req.json();
  const { email, redirectPath } = body;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const emailLower = email.toLowerCase().trim();

  // Check if user is an admin (static list + database lookup)
  const isAdmin = await isUserAdminAsync(emailLower);

  if (!isAdmin) {
    return NextResponse.json({ error: "Access denied. You are not an administrator." }, { status: 403 });
  }

  // Pre-flight: check that email service is configured
  if (!isResendConfigured()) {
    return NextResponse.json({
      error: "Email service is not configured. Contact your administrator to set RESEND_API_KEY.",
    }, { status: 503 });
  }

  // Get base URL from request headers or environment
  const protocol = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const baseUrl = process.env.NEXTAUTH_URL || `${protocol}://${host}`;

  try {
    const result = await createAdminMagicLink({
      email: emailLower,
      redirectPath: redirectPath || "/hub",
      baseUrl,
    });

    if (!result) {
      return NextResponse.json({ error: "Failed to create login link. Check NEXTAUTH_SECRET is set." }, { status: 500 });
    }

    // Send the magic link email
    await sendEmail({
      to: emailLower,
      subject: "Your Admin Login Link - FundRoom",
      react: AdminLoginLinkEmail({ url: result.magicLink }),
    });

    return NextResponse.json({ success: true, message: "Login link sent to your email" });
  } catch (error) {
    reportError(error as Error, { path: "/api/auth/admin-login", action: "send-magic-link" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
