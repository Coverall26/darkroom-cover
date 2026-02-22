/**
 * Tracking Middleware
 *
 * Runs in the Next.js middleware pipeline to set tracking cookies
 * on responses. Respects cookie consent preferences.
 *
 * This does NOT block or redirect — it only appends Set-Cookie headers
 * to the response that's already being returned.
 */

import { NextResponse } from "next/server";

import {
  CONSENT_COOKIE_NAME,
  parseConsentCookie,
} from "@/lib/tracking/cookie-consent";
import {
  getTrackingCookieHeaders,
  parseCookieHeader,
} from "@/lib/tracking/tracking-cookies";

/**
 * Append tracking cookies to an existing response.
 * Call this from the main middleware (proxy.ts) after routing.
 */
export function appendTrackingCookies(
  response: NextResponse,
  cookieHeader: string | null,
  url: URL,
  referrer: string | null,
): NextResponse {
  try {
    const existingCookies = parseCookieHeader(cookieHeader);
    const consent = parseConsentCookie(existingCookies[CONSENT_COOKIE_NAME]);

    // No consent given yet — don't set any tracking cookies
    if (!consent || consent.timestamp === 0) {
      return response;
    }

    const cookieHeaders = getTrackingCookieHeaders(
      consent,
      existingCookies,
      url,
      referrer,
    );

    for (const header of cookieHeaders) {
      response.headers.append("Set-Cookie", header);
    }
  } catch {
    // Tracking middleware should never break the request
  }

  return response;
}
