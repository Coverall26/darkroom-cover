import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { reportError } from "@/lib/error";
import {
  CONSENT_COOKIE_NAME,
  CONSENT_COOKIE_MAX_AGE,
  parseConsentCookie,
  serializeConsentPreferences,
  type ConsentPreferences,
} from "@/lib/tracking/cookie-consent";
import {
  buildDeleteCookieHeader,
  getRevocableCookieNames,
} from "@/lib/tracking/tracking-cookies";

export const dynamic = "force-dynamic";

/**
 * GET /api/tracking/consent
 *
 * Returns the current consent preferences.
 */
export async function GET() {
  const cookieStore = await cookies();
  const consentCookie = cookieStore.get(CONSENT_COOKIE_NAME);
  const preferences = parseConsentCookie(consentCookie?.value);

  return NextResponse.json({
    hasConsent: preferences !== null && preferences.timestamp > 0,
    preferences,
  });
}

/**
 * POST /api/tracking/consent
 *
 * Updates consent preferences. Also deletes tracking cookies
 * for categories that were revoked.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const preferences: ConsentPreferences = {
      necessary: true,
      analytics: body.analytics === true,
      marketing: body.marketing === true,
      preferences: body.preferences === true,
      timestamp: Date.now(),
      version: 1,
    };

    const response = NextResponse.json({ success: true, preferences });

    // Set the consent cookie
    response.cookies.set(CONSENT_COOKIE_NAME, serializeConsentPreferences(preferences), {
      path: "/",
      maxAge: CONSENT_COOKIE_MAX_AGE,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    // Delete cookies for revoked categories
    const categoriesToCheck: Array<"analytics" | "marketing" | "preferences"> = [
      "analytics",
      "marketing",
      "preferences",
    ];

    for (const category of categoriesToCheck) {
      if (!preferences[category]) {
        const cookieNames = getRevocableCookieNames(category);
        for (const name of cookieNames) {
          response.headers.append("Set-Cookie", buildDeleteCookieHeader(name));
        }
      }
    }

    return response;
  } catch (error) {
    reportError(error, { path: "/api/tracking/consent", action: "update-consent" });
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
