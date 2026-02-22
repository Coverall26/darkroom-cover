/**
 * Tests for analytics-events module.
 *
 * Since these functions depend on PostHog (which won't be initialized in tests),
 * we verify the logic around event construction and availability checks.
 */

import {
  trackEvent,
  trackFailure,
  trackFunnel,
  trackPageView,
  setTrackingUser,
  resetTrackingUser,
  type FunnelEvent,
  type EngagementEvent,
  type FailureEvent,
} from "@/lib/tracking/analytics-events";

// Mock posthog-js
jest.mock("posthog-js", () => ({
  posthog: {
    capture: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
  },
}));

// Mock PostHog config
jest.mock("@/lib/posthog", () => ({
  getPostHogConfig: jest.fn(() => null), // default: disabled
}));

import { posthog } from "posthog-js";
import { getPostHogConfig } from "@/lib/posthog";

const mockGetPostHogConfig = getPostHogConfig as jest.MockedFunction<typeof getPostHogConfig>;
const mockCapture = posthog.capture as jest.MockedFunction<typeof posthog.capture>;
const mockIdentify = posthog.identify as jest.MockedFunction<typeof posthog.identify>;
const mockReset = posthog.reset as jest.MockedFunction<typeof posthog.reset>;

describe("analytics-events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostHogConfig.mockReturnValue(null);
  });

  describe("trackEvent", () => {
    it("does nothing when PostHog is not configured", () => {
      const event: EngagementEvent = {
        name: "page_viewed",
        properties: { path: "/dashboard" },
      };
      trackEvent(event);
      expect(mockCapture).not.toHaveBeenCalled();
    });

    it("captures event when PostHog is configured", () => {
      mockGetPostHogConfig.mockReturnValue({ key: "test-key", host: "/ingest" });
      const event: EngagementEvent = {
        name: "page_viewed",
        properties: { path: "/dashboard", title: "Dashboard" },
      };
      trackEvent(event);
      expect(mockCapture).toHaveBeenCalledWith(
        "page_viewed",
        expect.objectContaining({
          path: "/dashboard",
          title: "Dashboard",
          tracked_at: expect.any(String),
        }),
      );
    });
  });

  describe("trackFunnel", () => {
    it("captures funnel events via PostHog", () => {
      mockGetPostHogConfig.mockReturnValue({ key: "test-key", host: "/ingest" });
      const event: FunnelEvent = {
        name: "funnel_signup_completed",
        properties: { userId: "user-1", method: "email" },
      };
      trackFunnel(event);
      expect(mockCapture).toHaveBeenCalledWith(
        "funnel_signup_completed",
        expect.objectContaining({ userId: "user-1", method: "email" }),
      );
    });
  });

  describe("trackFailure", () => {
    it("captures failure events with _is_error flag", () => {
      mockGetPostHogConfig.mockReturnValue({ key: "test-key", host: "/ingest" });
      const event: FailureEvent = {
        name: "client_error",
        properties: { message: "test error", url: "https://app.fundroom.ai" },
      };
      trackFailure(event);
      expect(mockCapture).toHaveBeenCalledWith(
        "client_error",
        expect.objectContaining({
          message: "test error",
          _is_error: true,
        }),
      );
    });
  });

  describe("trackPageView", () => {
    it("captures page_viewed event", () => {
      mockGetPostHogConfig.mockReturnValue({ key: "test-key", host: "/ingest" });
      trackPageView("/settings", "Settings");
      expect(mockCapture).toHaveBeenCalledWith(
        "page_viewed",
        expect.objectContaining({
          path: "/settings",
          title: "Settings",
        }),
      );
    });
  });

  describe("setTrackingUser", () => {
    it("does nothing when PostHog is not configured", () => {
      setTrackingUser({ id: "user-1", email: "test@example.com" });
      expect(mockIdentify).not.toHaveBeenCalled();
    });

    it("identifies user when PostHog is configured", () => {
      mockGetPostHogConfig.mockReturnValue({ key: "test-key", host: "/ingest" });
      setTrackingUser({ id: "user-1", email: "test@example.com", teamId: "team-1" });
      expect(mockIdentify).toHaveBeenCalledWith(
        "test@example.com",
        expect.objectContaining({
          userId: "user-1",
          email: "test@example.com",
          teamId: "team-1",
        }),
      );
    });
  });

  describe("resetTrackingUser", () => {
    it("resets PostHog when configured", () => {
      mockGetPostHogConfig.mockReturnValue({ key: "test-key", host: "/ingest" });
      resetTrackingUser();
      expect(mockReset).toHaveBeenCalled();
    });
  });

  describe("setTrackingUser edge cases", () => {
    it("falls back to user.id when email is not provided", () => {
      mockGetPostHogConfig.mockReturnValue({ key: "test-key", host: "/ingest" });
      setTrackingUser({ id: "user-42" });
      expect(mockIdentify).toHaveBeenCalledWith(
        "user-42",
        expect.objectContaining({ userId: "user-42" }),
      );
    });
  });

  describe("trackPageView edge cases", () => {
    it("passes referrer as undefined when document is not available (node env)", () => {
      mockGetPostHogConfig.mockReturnValue({ key: "test-key", host: "/ingest" });
      trackPageView("/test");
      expect(mockCapture).toHaveBeenCalledWith(
        "page_viewed",
        expect.objectContaining({
          path: "/test",
        }),
      );
      // In Node env, document is undefined, so referrer is undefined
      const callProps = mockCapture.mock.calls[0][1]!;
      expect("referrer" in callProps).toBe(true);
    });
  });

  describe("trackFailure edge cases", () => {
    it("does nothing when PostHog is not available", () => {
      const event: FailureEvent = {
        name: "client_error",
        properties: { message: "err", url: "http://localhost" },
      };
      trackFailure(event);
      expect(mockCapture).not.toHaveBeenCalled();
    });
  });

  describe("error resilience", () => {
    it("does not throw when PostHog capture throws", () => {
      mockGetPostHogConfig.mockReturnValue({ key: "test-key", host: "/ingest" });
      mockCapture.mockImplementation(() => {
        throw new Error("PostHog error");
      });

      expect(() => {
        trackEvent({ name: "page_viewed", properties: { path: "/test" } });
      }).not.toThrow();
    });

  });
});
