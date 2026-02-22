/**
 * Tracking Cookies Module
 *
 * Sets and reads tracking cookies for visitor identification,
 * session tracking, UTM attribution, and referrer tracking.
 * All cookies respect the user's consent preferences.
 */

import { ConsentPreferences, hasConsent } from "./cookie-consent";

// Cookie names
export const VISITOR_ID_COOKIE = "fr_vid";
export const SESSION_ID_COOKIE = "fr_sid";
export const SESSION_START_COOKIE = "fr_ss";
export const UTM_COOKIE = "fr_utm";
export const REFERRER_COOKIE = "fr_ref";
export const LANDING_PAGE_COOKIE = "fr_lp";
export const DEVICE_ID_COOKIE = "fr_did";

// Cookie lifetimes
const VISITOR_ID_MAX_AGE = 2 * 365 * 24 * 60 * 60; // 2 years
const SESSION_MAX_AGE = 30 * 60; // 30 minutes (sliding)
const UTM_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const REFERRER_MAX_AGE = 30 * 24 * 60 * 60; // 30 days
const DEVICE_ID_MAX_AGE = 2 * 365 * 24 * 60 * 60; // 2 years

/**
 * Generate a unique visitor ID (UUID v4-like using crypto API).
 */
export function generateVisitorId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a session ID (shorter, timestamp-prefixed).
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

export interface UTMParams {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
}

/**
 * Extract UTM parameters from a URL search string.
 */
export function extractUTMParams(searchParams: URLSearchParams): UTMParams | null {
  const source = searchParams.get("utm_source");
  const medium = searchParams.get("utm_medium");
  const campaign = searchParams.get("utm_campaign");
  const term = searchParams.get("utm_term");
  const content = searchParams.get("utm_content");

  // Only create UTM data if at least one param is present
  if (!source && !medium && !campaign && !term && !content) {
    return null;
  }

  return { source, medium, campaign, term, content };
}

/**
 * Serialize UTM params to a cookie-safe string.
 */
export function serializeUTM(utm: UTMParams): string {
  return encodeURIComponent(JSON.stringify(utm));
}

/**
 * Parse UTM params from cookie value.
 */
export function parseUTM(cookieValue: string | undefined | null): UTMParams | null {
  if (!cookieValue) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(cookieValue));
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      source: parsed.source ?? null,
      medium: parsed.medium ?? null,
      campaign: parsed.campaign ?? null,
      term: parsed.term ?? null,
      content: parsed.content ?? null,
    };
  } catch {
    return null;
  }
}

export interface CookieSetOptions {
  name: string;
  value: string;
  maxAge: number;
  path?: string;
  sameSite?: "Strict" | "Lax" | "None";
  secure?: boolean;
  httpOnly?: boolean;
}

/**
 * Build cookie string from options.
 */
export function buildCookieString(opts: CookieSetOptions): string {
  const parts = [
    `${opts.name}=${opts.value}`,
    `Path=${opts.path ?? "/"}`,
    `Max-Age=${opts.maxAge}`,
    `SameSite=${opts.sameSite ?? "Lax"}`,
  ];
  if (opts.secure !== false && process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  if (opts.httpOnly) {
    parts.push("HttpOnly");
  }
  return parts.join("; ");
}

/**
 * Get all tracking cookie headers that should be set for a request.
 * Respects consent preferences — only returns cookies for consented categories.
 *
 * Called from middleware to set cookies on the response.
 */
export function getTrackingCookieHeaders(
  consent: ConsentPreferences | null,
  existingCookies: Record<string, string>,
  url: URL,
  referrer: string | null,
): string[] {
  const headers: string[] = [];

  // Analytics cookies: visitor ID + session ID
  if (hasConsent(consent, "analytics")) {
    // Visitor ID — persistent, set once
    if (!existingCookies[VISITOR_ID_COOKIE]) {
      const vid = generateVisitorId();
      headers.push(
        buildCookieString({
          name: VISITOR_ID_COOKIE,
          value: vid,
          maxAge: VISITOR_ID_MAX_AGE,
          httpOnly: true,
        })
      );
    }

    // Session ID — sliding window, refreshed on each request
    const sid = existingCookies[SESSION_ID_COOKIE] || generateSessionId();
    headers.push(
      buildCookieString({
        name: SESSION_ID_COOKIE,
        value: sid,
        maxAge: SESSION_MAX_AGE,
      })
    );

    // Session start timestamp — set once per session
    if (!existingCookies[SESSION_START_COOKIE]) {
      headers.push(
        buildCookieString({
          name: SESSION_START_COOKIE,
          value: Date.now().toString(),
          maxAge: SESSION_MAX_AGE,
        })
      );
    }

    // Device ID — like visitor ID but survives cookie clears (HttpOnly)
    if (!existingCookies[DEVICE_ID_COOKIE]) {
      headers.push(
        buildCookieString({
          name: DEVICE_ID_COOKIE,
          value: generateVisitorId(),
          maxAge: DEVICE_ID_MAX_AGE,
          httpOnly: true,
        })
      );
    }
  }

  // Marketing cookies: UTM params + referrer + landing page
  if (hasConsent(consent, "marketing")) {
    // UTM parameters — only set if present in URL
    const utmParams = extractUTMParams(url.searchParams);
    if (utmParams) {
      headers.push(
        buildCookieString({
          name: UTM_COOKIE,
          value: serializeUTM(utmParams),
          maxAge: UTM_MAX_AGE,
        })
      );
    }

    // External referrer — only set on first visit (not from same domain)
    if (
      referrer &&
      !existingCookies[REFERRER_COOKIE] &&
      !isSameDomain(referrer, url.hostname)
    ) {
      headers.push(
        buildCookieString({
          name: REFERRER_COOKIE,
          value: encodeURIComponent(referrer),
          maxAge: REFERRER_MAX_AGE,
        })
      );
    }

    // Landing page — first page URL of the session
    if (!existingCookies[LANDING_PAGE_COOKIE]) {
      headers.push(
        buildCookieString({
          name: LANDING_PAGE_COOKIE,
          value: encodeURIComponent(url.pathname + url.search),
          maxAge: UTM_MAX_AGE,
        })
      );
    }
  }

  return headers;
}

/**
 * Check if a referrer URL is from the same domain.
 */
function isSameDomain(referrer: string, hostname: string): boolean {
  try {
    const refHost = new URL(referrer).hostname;
    return refHost === hostname || refHost.endsWith(`.${hostname}`) || hostname.endsWith(`.${refHost}`);
  } catch {
    return false;
  }
}

/**
 * Parse existing cookies from a cookie header string.
 */
export function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(";");

  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) continue;
    const name = pair.substring(0, eqIndex).trim();
    const value = pair.substring(eqIndex + 1).trim();
    if (name) {
      cookies[name] = value;
    }
  }

  return cookies;
}

/**
 * Build a cookie deletion header (expires immediately).
 */
export function buildDeleteCookieHeader(name: string): string {
  return `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Get all tracking cookie names that should be deleted when consent is revoked.
 */
export function getRevocableCookieNames(category: "analytics" | "marketing" | "preferences"): string[] {
  switch (category) {
    case "analytics":
      return [VISITOR_ID_COOKIE, SESSION_ID_COOKIE, SESSION_START_COOKIE, DEVICE_ID_COOKIE];
    case "marketing":
      return [UTM_COOKIE, REFERRER_COOKIE, LANDING_PAGE_COOKIE];
    case "preferences":
      return ["hideProBanner", "hideProAnnualBanner", "hideTrialBanner", "sidebar:state"];
    default:
      return [];
  }
}
