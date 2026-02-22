import {
  acceptAllConsent,
  buildConsentCookieHeader,
  CONSENT_COOKIE_NAME,
  createConsentPreferences,
  getDefaultPreferences,
  hasConsent,
  hasConsentBeenGiven,
  parseConsentCookie,
  rejectNonEssentialConsent,
  serializeConsentPreferences,
} from "@/lib/tracking/cookie-consent";

describe("cookie-consent", () => {
  describe("parseConsentCookie", () => {
    it("returns null for undefined input", () => {
      expect(parseConsentCookie(undefined)).toBeNull();
    });

    it("returns null for null input", () => {
      expect(parseConsentCookie(null)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseConsentCookie("")).toBeNull();
    });

    it("returns null for malformed JSON", () => {
      expect(parseConsentCookie("not-json")).toBeNull();
    });

    it("returns null for missing required fields", () => {
      const value = encodeURIComponent(JSON.stringify({ analytics: true }));
      expect(parseConsentCookie(value)).toBeNull();
    });

    it("parses valid consent cookie", () => {
      const prefs = {
        necessary: true,
        analytics: true,
        marketing: false,
        preferences: true,
        timestamp: 1700000000000,
        version: 1,
      };
      const value = encodeURIComponent(JSON.stringify(prefs));
      const result = parseConsentCookie(value);

      expect(result).not.toBeNull();
      expect(result!.necessary).toBe(true);
      expect(result!.analytics).toBe(true);
      expect(result!.marketing).toBe(false);
      expect(result!.preferences).toBe(true);
      expect(result!.timestamp).toBe(1700000000000);
    });

    it("forces necessary to true even if false in cookie", () => {
      const prefs = {
        necessary: false,
        analytics: true,
        marketing: true,
        preferences: true,
        timestamp: 1700000000000,
      };
      const value = encodeURIComponent(JSON.stringify(prefs));
      const result = parseConsentCookie(value);

      expect(result!.necessary).toBe(true);
    });
  });

  describe("serializeConsentPreferences", () => {
    it("serializes to URL-encoded JSON", () => {
      const prefs = acceptAllConsent();
      const serialized = serializeConsentPreferences(prefs);

      // Should be URL-encoded
      expect(serialized).not.toContain("{");
      expect(serialized).toContain("%7B");

      // Should round-trip
      const parsed = parseConsentCookie(serialized);
      expect(parsed!.analytics).toBe(true);
      expect(parsed!.marketing).toBe(true);
    });
  });

  describe("acceptAllConsent", () => {
    it("sets all categories to true", () => {
      const prefs = acceptAllConsent();
      expect(prefs.necessary).toBe(true);
      expect(prefs.analytics).toBe(true);
      expect(prefs.marketing).toBe(true);
      expect(prefs.preferences).toBe(true);
      expect(prefs.timestamp).toBeGreaterThan(0);
      expect(prefs.version).toBe(1);
    });
  });

  describe("rejectNonEssentialConsent", () => {
    it("sets only necessary to true", () => {
      const prefs = rejectNonEssentialConsent();
      expect(prefs.necessary).toBe(true);
      expect(prefs.analytics).toBe(false);
      expect(prefs.marketing).toBe(false);
      expect(prefs.preferences).toBe(false);
      expect(prefs.timestamp).toBeGreaterThan(0);
    });
  });

  describe("createConsentPreferences", () => {
    it("creates preferences with specific categories", () => {
      const prefs = createConsentPreferences({
        analytics: true,
        marketing: false,
      });
      expect(prefs.analytics).toBe(true);
      expect(prefs.marketing).toBe(false);
      expect(prefs.preferences).toBe(false);
    });

    it("defaults unchecked categories to false", () => {
      const prefs = createConsentPreferences({});
      expect(prefs.analytics).toBe(false);
      expect(prefs.marketing).toBe(false);
      expect(prefs.preferences).toBe(false);
    });
  });

  describe("hasConsent", () => {
    it("always returns true for necessary", () => {
      expect(hasConsent(null, "necessary")).toBe(true);
    });

    it("returns false for analytics when no consent given", () => {
      expect(hasConsent(null, "analytics")).toBe(false);
    });

    it("returns true for consented category", () => {
      const prefs = acceptAllConsent();
      expect(hasConsent(prefs, "analytics")).toBe(true);
    });

    it("returns false for rejected category", () => {
      const prefs = rejectNonEssentialConsent();
      expect(hasConsent(prefs, "marketing")).toBe(false);
    });
  });

  describe("hasConsentBeenGiven", () => {
    it("returns false for null", () => {
      expect(hasConsentBeenGiven(null)).toBe(false);
    });

    it("returns false for zero timestamp", () => {
      expect(hasConsentBeenGiven(getDefaultPreferences())).toBe(false);
    });

    it("returns true when consent has been given", () => {
      expect(hasConsentBeenGiven(acceptAllConsent())).toBe(true);
    });
  });

  describe("buildConsentCookieHeader", () => {
    it("builds a valid Set-Cookie header", () => {
      const prefs = acceptAllConsent();
      const header = buildConsentCookieHeader(prefs);

      expect(header).toContain(`${CONSENT_COOKIE_NAME}=`);
      expect(header).toContain("Path=/");
      expect(header).toContain("Max-Age=");
      expect(header).toContain("SameSite=Lax");
    });
  });
});
