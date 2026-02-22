import {
  buildCookieString,
  buildDeleteCookieHeader,
  extractUTMParams,
  generateSessionId,
  generateVisitorId,
  getRevocableCookieNames,
  getTrackingCookieHeaders,
  LANDING_PAGE_COOKIE,
  parseCookieHeader,
  parseUTM,
  REFERRER_COOKIE,
  serializeUTM,
  SESSION_ID_COOKIE,
  SESSION_START_COOKIE,
  UTM_COOKIE,
  VISITOR_ID_COOKIE,
} from "@/lib/tracking/tracking-cookies";
import { acceptAllConsent, rejectNonEssentialConsent } from "@/lib/tracking/cookie-consent";

describe("tracking-cookies", () => {
  describe("generateVisitorId", () => {
    it("generates a UUID-like string", () => {
      const id = generateVisitorId();
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("generates unique IDs", () => {
      const id1 = generateVisitorId();
      const id2 = generateVisitorId();
      expect(id1).not.toBe(id2);
    });
  });

  describe("generateSessionId", () => {
    it("generates a non-empty string", () => {
      const sid = generateSessionId();
      expect(sid.length).toBeGreaterThan(0);
    });

    it("contains a timestamp component", () => {
      const sid = generateSessionId();
      expect(sid).toContain("-");
    });
  });

  describe("extractUTMParams", () => {
    it("returns null when no UTM params present", () => {
      const params = new URLSearchParams("foo=bar");
      expect(extractUTMParams(params)).toBeNull();
    });

    it("extracts all UTM params", () => {
      const params = new URLSearchParams(
        "utm_source=google&utm_medium=cpc&utm_campaign=launch&utm_term=fund&utm_content=hero"
      );
      const utm = extractUTMParams(params);
      expect(utm).toEqual({
        source: "google",
        medium: "cpc",
        campaign: "launch",
        term: "fund",
        content: "hero",
      });
    });

    it("handles partial UTM params", () => {
      const params = new URLSearchParams("utm_source=twitter");
      const utm = extractUTMParams(params);
      expect(utm).not.toBeNull();
      expect(utm!.source).toBe("twitter");
      expect(utm!.medium).toBeNull();
    });
  });

  describe("serializeUTM / parseUTM", () => {
    it("round-trips UTM params", () => {
      const utm = { source: "google", medium: "cpc", campaign: "test", term: null, content: null };
      const serialized = serializeUTM(utm);
      const parsed = parseUTM(serialized);
      expect(parsed).toEqual(utm);
    });

    it("parseUTM returns null for empty input", () => {
      expect(parseUTM(null)).toBeNull();
      expect(parseUTM(undefined)).toBeNull();
      expect(parseUTM("")).toBeNull();
    });

    it("parseUTM returns null for invalid JSON", () => {
      expect(parseUTM("not-json")).toBeNull();
    });
  });

  describe("buildCookieString", () => {
    it("builds a valid cookie string", () => {
      const cookie = buildCookieString({
        name: "test",
        value: "value",
        maxAge: 3600,
      });
      expect(cookie).toContain("test=value");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Max-Age=3600");
      expect(cookie).toContain("SameSite=Lax");
    });

    it("includes HttpOnly when specified", () => {
      const cookie = buildCookieString({
        name: "test",
        value: "value",
        maxAge: 3600,
        httpOnly: true,
      });
      expect(cookie).toContain("HttpOnly");
    });
  });

  describe("buildDeleteCookieHeader", () => {
    it("builds a cookie deletion header", () => {
      const header = buildDeleteCookieHeader("test_cookie");
      expect(header).toBe("test_cookie=; Path=/; Max-Age=0; SameSite=Lax");
    });
  });

  describe("parseCookieHeader", () => {
    it("returns empty object for null", () => {
      expect(parseCookieHeader(null)).toEqual({});
    });

    it("parses cookie header string", () => {
      const cookies = parseCookieHeader("foo=bar; baz=qux; test=123");
      expect(cookies).toEqual({ foo: "bar", baz: "qux", test: "123" });
    });

    it("handles cookies with = in value", () => {
      const cookies = parseCookieHeader("token=abc=def=ghi");
      expect(cookies.token).toBe("abc=def=ghi");
    });
  });

  describe("getTrackingCookieHeaders", () => {
    it("returns empty array when no consent", () => {
      const headers = getTrackingCookieHeaders(
        null,
        {},
        new URL("https://app.fundroom.ai/dashboard"),
        null,
      );
      expect(headers).toEqual([]);
    });

    it("returns empty array when consent rejected", () => {
      const headers = getTrackingCookieHeaders(
        rejectNonEssentialConsent(),
        {},
        new URL("https://app.fundroom.ai/dashboard"),
        null,
      );
      expect(headers).toEqual([]);
    });

    it("sets analytics cookies when analytics consented", () => {
      const consent = acceptAllConsent();
      const headers = getTrackingCookieHeaders(
        consent,
        {},
        new URL("https://app.fundroom.ai/dashboard"),
        null,
      );

      const cookieNames = headers.map((h) => h.split("=")[0]);
      expect(cookieNames).toContain(VISITOR_ID_COOKIE);
      expect(cookieNames).toContain(SESSION_ID_COOKIE);
      expect(cookieNames).toContain(SESSION_START_COOKIE);
    });

    it("does not duplicate visitor ID if already set", () => {
      const consent = acceptAllConsent();
      const headers = getTrackingCookieHeaders(
        consent,
        { [VISITOR_ID_COOKIE]: "existing-id" },
        new URL("https://app.fundroom.ai/dashboard"),
        null,
      );

      const vidHeaders = headers.filter((h) => h.startsWith(VISITOR_ID_COOKIE));
      expect(vidHeaders).toHaveLength(0);
    });

    it("sets UTM cookie when UTM params present", () => {
      const consent = acceptAllConsent();
      const headers = getTrackingCookieHeaders(
        consent,
        {},
        new URL("https://app.fundroom.ai/dashboard?utm_source=google&utm_medium=cpc"),
        null,
      );

      const utmHeaders = headers.filter((h) => h.startsWith(UTM_COOKIE));
      expect(utmHeaders).toHaveLength(1);
    });

    it("sets referrer cookie for external referrer", () => {
      const consent = acceptAllConsent();
      const headers = getTrackingCookieHeaders(
        consent,
        {},
        new URL("https://app.fundroom.ai/dashboard"),
        "https://google.com/search",
      );

      const refHeaders = headers.filter((h) => h.startsWith(REFERRER_COOKIE));
      expect(refHeaders).toHaveLength(1);
    });

    it("does not set referrer cookie for same-domain referrer", () => {
      const consent = acceptAllConsent();
      const headers = getTrackingCookieHeaders(
        consent,
        {},
        new URL("https://app.fundroom.ai/dashboard"),
        "https://app.fundroom.ai/login",
      );

      const refHeaders = headers.filter((h) => h.startsWith(REFERRER_COOKIE));
      expect(refHeaders).toHaveLength(0);
    });

    it("sets landing page cookie on first visit", () => {
      const consent = acceptAllConsent();
      const headers = getTrackingCookieHeaders(
        consent,
        {},
        new URL("https://app.fundroom.ai/pricing?plan=pro"),
        null,
      );

      const lpHeaders = headers.filter((h) => h.startsWith(LANDING_PAGE_COOKIE));
      expect(lpHeaders).toHaveLength(1);
      expect(lpHeaders[0]).toContain(encodeURIComponent("/pricing?plan=pro"));
    });
  });

  describe("getRevocableCookieNames", () => {
    it("returns analytics cookie names", () => {
      const names = getRevocableCookieNames("analytics");
      expect(names).toContain(VISITOR_ID_COOKIE);
      expect(names).toContain(SESSION_ID_COOKIE);
    });

    it("returns marketing cookie names", () => {
      const names = getRevocableCookieNames("marketing");
      expect(names).toContain(UTM_COOKIE);
      expect(names).toContain(REFERRER_COOKIE);
    });

    it("returns preferences cookie names", () => {
      const names = getRevocableCookieNames("preferences");
      expect(names).toContain("hideProBanner");
      expect(names).toContain("sidebar:state");
    });
  });
});
