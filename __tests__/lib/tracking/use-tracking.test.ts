/**
 * @jest-environment jsdom
 */

/**
 * Tests for useTracking hook.
 */

import { renderHook, act } from "@testing-library/react";

// Mock cookie-consent
jest.mock("@/lib/tracking/cookie-consent", () => ({
  CONSENT_COOKIE_NAME: "fr_consent",
  parseConsentCookie: jest.fn(),
  hasConsent: jest.fn(),
  hasConsentBeenGiven: jest.fn(),
}));

// Mock analytics-events
jest.mock("@/lib/tracking/analytics-events", () => ({
  trackEvent: jest.fn(),
  trackFunnel: jest.fn(),
  trackFailure: jest.fn(),
  trackPageView: jest.fn(),
}));

// Mock failure-tracker
jest.mock("@/lib/tracking/failure-tracker", () => ({
  initFailureTracking: jest.fn(),
}));

// Mock tracking-cookies
jest.mock("@/lib/tracking/tracking-cookies", () => ({
  VISITOR_ID_COOKIE: "fr_visitor_id",
  SESSION_ID_COOKIE: "fr_session_id",
  SESSION_START_COOKIE: "fr_session_start",
}));

// Mock js-cookie
jest.mock("js-cookie", () => ({
  get: jest.fn(),
}));

import Cookies from "js-cookie";
import {
  parseConsentCookie,
  hasConsent,
  hasConsentBeenGiven,
} from "@/lib/tracking/cookie-consent";
import {
  trackEvent,
  trackFunnel,
  trackFailure,
  trackPageView,
} from "@/lib/tracking/analytics-events";
import { initFailureTracking } from "@/lib/tracking/failure-tracker";
import { useTracking } from "@/lib/tracking/use-tracking";

const mockParseConsentCookie = parseConsentCookie as jest.MockedFunction<typeof parseConsentCookie>;
const mockHasConsent = hasConsent as jest.MockedFunction<typeof hasConsent>;
const mockHasConsentBeenGiven = hasConsentBeenGiven as jest.MockedFunction<typeof hasConsentBeenGiven>;
const mockTrackEvent = trackEvent as jest.MockedFunction<typeof trackEvent>;
const mockTrackFunnel = trackFunnel as jest.MockedFunction<typeof trackFunnel>;
const mockTrackFailure = trackFailure as jest.MockedFunction<typeof trackFailure>;
const mockTrackPageView = trackPageView as jest.MockedFunction<typeof trackPageView>;
const mockInitFailureTracking = initFailureTracking as jest.MockedFunction<typeof initFailureTracking>;
const mockCookiesGet = Cookies.get as jest.MockedFunction<typeof Cookies.get>;

describe("useTracking", () => {
  let addEventListenerSpy: jest.SpyInstance;
  let removeEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParseConsentCookie.mockReturnValue(null);
    mockHasConsent.mockReturnValue(false);
    mockHasConsentBeenGiven.mockReturnValue(false);
    (mockCookiesGet as jest.Mock).mockReturnValue(undefined);
    addEventListenerSpy = jest.spyOn(window, "addEventListener").mockImplementation();
    removeEventListenerSpy = jest.spyOn(window, "removeEventListener").mockImplementation();
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it("reads consent cookie on mount", () => {
    renderHook(() => useTracking());
    expect(mockParseConsentCookie).toHaveBeenCalled();
  });

  it("listens for fr:consent-updated events", () => {
    renderHook(() => useTracking());
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "fr:consent-updated",
      expect.any(Function),
    );
  });

  it("removes consent listener on unmount", () => {
    const { unmount } = renderHook(() => useTracking());
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "fr:consent-updated",
      expect.any(Function),
    );
  });

  it("initializes failure tracking once", () => {
    renderHook(() => useTracking());
    expect(mockInitFailureTracking).toHaveBeenCalledTimes(1);
  });

  it("does not re-initialize failure tracking on re-render", () => {
    const { rerender } = renderHook(() => useTracking());
    rerender();
    rerender();
    expect(mockInitFailureTracking).toHaveBeenCalledTimes(1);
  });

  it("returns visitorId from cookies", () => {
    (mockCookiesGet as jest.Mock).mockImplementation((name: string) => {
      if (name === "fr_visitor_id") return "vid-123";
      return undefined;
    });

    const { result } = renderHook(() => useTracking());
    expect(result.current.visitorId).toBe("vid-123");
  });

  it("returns sessionId from cookies", () => {
    (mockCookiesGet as jest.Mock).mockImplementation((name: string) => {
      if (name === "fr_session_id") return "sid-456";
      return undefined;
    });

    const { result } = renderHook(() => useTracking());
    expect(result.current.sessionId).toBe("sid-456");
  });

  it("returns null for visitorId when cookie is not set", () => {
    const { result } = renderHook(() => useTracking());
    expect(result.current.visitorId).toBeNull();
  });

  it("returns hasConsent from hasConsentBeenGiven", () => {
    mockHasConsentBeenGiven.mockReturnValue(true);
    const { result } = renderHook(() => useTracking());
    expect(result.current.hasConsent).toBe(true);
  });

  describe("isConsentedFor", () => {
    it("delegates to hasConsent", () => {
      mockHasConsent.mockReturnValue(true);
      const { result } = renderHook(() => useTracking());
      const consented = result.current.isConsentedFor("analytics");
      expect(mockHasConsent).toHaveBeenCalledWith(null, "analytics");
      expect(consented).toBe(true);
    });
  });

  describe("trackFunnel", () => {
    it("calls trackFunnel when analytics consent is given", () => {
      mockHasConsent.mockReturnValue(true);
      const { result } = renderHook(() => useTracking());

      act(() => {
        result.current.trackFunnel({
          name: "funnel_signup_started",
          properties: { source: "organic" },
        });
      });

      expect(mockTrackFunnel).toHaveBeenCalledWith({
        name: "funnel_signup_started",
        properties: { source: "organic" },
      });
    });

    it("does not call trackFunnel when analytics consent is not given", () => {
      mockHasConsent.mockReturnValue(false);
      const { result } = renderHook(() => useTracking());

      act(() => {
        result.current.trackFunnel({
          name: "funnel_signup_started",
          properties: { source: "organic" },
        });
      });

      expect(mockTrackFunnel).not.toHaveBeenCalled();
    });
  });

  describe("trackEngagement", () => {
    it("calls trackEvent when analytics consent is given", () => {
      mockHasConsent.mockReturnValue(true);
      const { result } = renderHook(() => useTracking());

      act(() => {
        result.current.trackEngagement({
          name: "feature_used",
          properties: { feature: "dataroom" },
        });
      });

      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: "feature_used",
        properties: { feature: "dataroom" },
      });
    });

    it("does not call trackEvent when analytics consent is not given", () => {
      mockHasConsent.mockReturnValue(false);
      const { result } = renderHook(() => useTracking());

      act(() => {
        result.current.trackEngagement({
          name: "feature_used",
          properties: { feature: "dataroom" },
        });
      });

      expect(mockTrackEvent).not.toHaveBeenCalled();
    });
  });

  describe("trackFailure", () => {
    it("always fires regardless of consent", () => {
      mockHasConsent.mockReturnValue(false);
      const { result } = renderHook(() => useTracking());

      act(() => {
        result.current.trackFailure({
          name: "client_error",
          properties: { message: "err", url: "http://localhost" },
        });
      });

      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "client_error",
        properties: { message: "err", url: "http://localhost" },
      });
    });
  });

  describe("trackPage", () => {
    it("calls trackPageView when analytics consent is given", () => {
      mockHasConsent.mockReturnValue(true);
      const { result } = renderHook(() => useTracking());

      act(() => {
        result.current.trackPage("/dashboard", "Dashboard");
      });

      expect(mockTrackPageView).toHaveBeenCalledWith("/dashboard", "Dashboard");
    });

    it("does not call trackPageView without consent", () => {
      mockHasConsent.mockReturnValue(false);
      const { result } = renderHook(() => useTracking());

      act(() => {
        result.current.trackPage("/dashboard");
      });

      expect(mockTrackPageView).not.toHaveBeenCalled();
    });
  });
});
