/**
 * Tests for middleware tracking integration.
 */

import { NextResponse } from "next/server";

import { appendTrackingCookies } from "@/lib/middleware/tracking";
import { CONSENT_COOKIE_NAME, acceptAllConsent, serializeConsentPreferences } from "@/lib/tracking/cookie-consent";
import { VISITOR_ID_COOKIE, SESSION_ID_COOKIE } from "@/lib/tracking/tracking-cookies";

describe("middleware/tracking", () => {
  describe("appendTrackingCookies", () => {
    it("does not set cookies when no consent cookie exists", () => {
      const response = NextResponse.next();
      const result = appendTrackingCookies(
        response,
        null,
        new URL("https://app.fundroom.ai/dashboard"),
        null,
      );

      const setCookies = result.headers.getSetCookie();
      // Should not add any tracking cookies
      const trackingCookies = setCookies.filter(
        (c) => c.startsWith(VISITOR_ID_COOKIE) || c.startsWith(SESSION_ID_COOKIE),
      );
      expect(trackingCookies).toHaveLength(0);
    });

    it("sets tracking cookies when consent is given", () => {
      const consent = acceptAllConsent();
      const consentValue = serializeConsentPreferences(consent);
      const cookieHeader = `${CONSENT_COOKIE_NAME}=${consentValue}`;

      const response = NextResponse.next();
      const result = appendTrackingCookies(
        response,
        cookieHeader,
        new URL("https://app.fundroom.ai/dashboard"),
        null,
      );

      const setCookies = result.headers.getSetCookie();
      const cookieNames = setCookies.map((c) => c.split("=")[0]);

      expect(cookieNames).toContain(VISITOR_ID_COOKIE);
      expect(cookieNames).toContain(SESSION_ID_COOKIE);
    });

    it("does not crash on malformed cookie header", () => {
      const response = NextResponse.next();
      expect(() => {
        appendTrackingCookies(
          response,
          "malformed;;;===",
          new URL("https://app.fundroom.ai/dashboard"),
          null,
        );
      }).not.toThrow();
    });

    it("sets UTM cookies when UTM params in URL", () => {
      const consent = acceptAllConsent();
      const consentValue = serializeConsentPreferences(consent);
      const cookieHeader = `${CONSENT_COOKIE_NAME}=${consentValue}`;

      const response = NextResponse.next();
      const result = appendTrackingCookies(
        response,
        cookieHeader,
        new URL("https://app.fundroom.ai/?utm_source=google&utm_medium=cpc"),
        null,
      );

      const setCookies = result.headers.getSetCookie();
      const hasUtm = setCookies.some((c) => c.startsWith("fr_utm="));
      expect(hasUtm).toBe(true);
    });

    it("preserves the original response", () => {
      const response = NextResponse.next();
      response.headers.set("X-Custom-Header", "test-value");

      const result = appendTrackingCookies(
        response,
        null,
        new URL("https://app.fundroom.ai/"),
        null,
      );

      expect(result.headers.get("X-Custom-Header")).toBe("test-value");
    });
  });
});
