/**
 * Cookie Consent Management
 *
 * Manages user consent preferences for tracking cookies.
 * Stores preferences in a first-party cookie and provides
 * hooks/utilities for checking consent before setting tracking cookies.
 *
 * Categories:
 * - necessary: Always allowed (auth, CSRF, session)
 * - analytics: Tinybird, PostHog page/event tracking
 * - marketing: UTM attribution, referrer tracking
 * - preferences: UI state cookies (sidebar, banner dismissals)
 */

export const CONSENT_COOKIE_NAME = "fr_cookie_consent";
export const CONSENT_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

export type ConsentCategory = "necessary" | "analytics" | "marketing" | "preferences";

export interface ConsentPreferences {
  necessary: true; // Always true, cannot be disabled
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  timestamp: number; // When consent was given/updated
  version: number; // Schema version for future migrations
}

const CONSENT_VERSION = 1;

const DEFAULT_PREFERENCES: ConsentPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
  timestamp: 0,
  version: CONSENT_VERSION,
};

/**
 * Parse consent preferences from cookie value.
 * Returns null if cookie is missing or malformed.
 */
export function parseConsentCookie(cookieValue: string | undefined | null): ConsentPreferences | null {
  if (!cookieValue) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(cookieValue));

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.analytics !== "boolean" ||
      typeof parsed.marketing !== "boolean" ||
      typeof parsed.preferences !== "boolean" ||
      typeof parsed.timestamp !== "number"
    ) {
      return null;
    }

    return {
      necessary: true,
      analytics: parsed.analytics,
      marketing: parsed.marketing,
      preferences: parsed.preferences,
      timestamp: parsed.timestamp,
      version: parsed.version ?? CONSENT_VERSION,
    };
  } catch {
    return null;
  }
}

/**
 * Serialize consent preferences to a cookie-safe string.
 */
export function serializeConsentPreferences(prefs: ConsentPreferences): string {
  return encodeURIComponent(JSON.stringify(prefs));
}

/**
 * Build the Set-Cookie header value for consent preferences.
 */
export function buildConsentCookieHeader(prefs: ConsentPreferences): string {
  const value = serializeConsentPreferences(prefs);
  const parts = [
    `${CONSENT_COOKIE_NAME}=${value}`,
    "Path=/",
    `Max-Age=${CONSENT_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

/**
 * Create consent preferences with all categories accepted.
 */
export function acceptAllConsent(): ConsentPreferences {
  return {
    necessary: true,
    analytics: true,
    marketing: true,
    preferences: true,
    timestamp: Date.now(),
    version: CONSENT_VERSION,
  };
}

/**
 * Create consent preferences with only necessary cookies.
 */
export function rejectNonEssentialConsent(): ConsentPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    timestamp: Date.now(),
    version: CONSENT_VERSION,
  };
}

/**
 * Create consent preferences with specific categories.
 */
export function createConsentPreferences(
  categories: Partial<Omit<ConsentPreferences, "necessary" | "timestamp" | "version">>
): ConsentPreferences {
  return {
    necessary: true,
    analytics: categories.analytics ?? false,
    marketing: categories.marketing ?? false,
    preferences: categories.preferences ?? false,
    timestamp: Date.now(),
    version: CONSENT_VERSION,
  };
}

/**
 * Check if a specific consent category is allowed.
 * Returns true for "necessary" always.
 * Returns false if no consent has been given yet (opt-in model).
 */
export function hasConsent(
  preferences: ConsentPreferences | null,
  category: ConsentCategory
): boolean {
  if (category === "necessary") return true;
  if (!preferences) return false;
  return preferences[category] === true;
}

/**
 * Check if consent has been given at all (banner was interacted with).
 */
export function hasConsentBeenGiven(preferences: ConsentPreferences | null): boolean {
  return preferences !== null && preferences.timestamp > 0;
}

/**
 * Get default preferences (no consent given).
 */
export function getDefaultPreferences(): ConsentPreferences {
  return { ...DEFAULT_PREFERENCES };
}
