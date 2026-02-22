/**
 * Tests for failure-tracker module.
 */

import {
  trackClientError,
  trackApiFailure,
  trackAuthFailure,
  trackPaymentFailure,
  trackUploadFailure,
  trackIntegrationError,
  trackCSPViolation,
  trackRenderError,
  trackNetworkError,
} from "@/lib/tracking/failure-tracker";

// Mock analytics-events
jest.mock("@/lib/tracking/analytics-events", () => ({
  trackFailure: jest.fn(),
}));

import { trackFailure } from "@/lib/tracking/analytics-events";

const mockTrackFailure = trackFailure as jest.MockedFunction<typeof trackFailure>;

describe("failure-tracker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("trackClientError", () => {
    it("tracks client error with message and stack", () => {
      trackClientError("TypeError: Cannot read property", "Error\n    at foo.js:10", "App");
      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "client_error",
        properties: expect.objectContaining({
          message: "TypeError: Cannot read property",
          stack: "Error\n    at foo.js:10",
          component: "App",
        }),
      });
    });

    it("truncates long messages", () => {
      const longMessage = "a".repeat(1000);
      trackClientError(longMessage);
      const call = mockTrackFailure.mock.calls[0][0];
      const props = call.properties as { message: string };
      expect(props.message.length).toBeLessThanOrEqual(500);
    });

    it("deduplicates repeated errors", () => {
      trackClientError("same error", undefined, "Comp1");
      trackClientError("same error", undefined, "Comp1");
      // Second call should be deduped
      expect(mockTrackFailure).toHaveBeenCalledTimes(1);
    });
  });

  describe("trackApiFailure", () => {
    it("tracks API errors with status >= 400", () => {
      trackApiFailure("/api/teams/123/documents", "GET", 404, "Not found", 150);
      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "api_error",
        properties: {
          endpoint: "/api/teams/123/documents",
          method: "GET",
          status: 404,
          message: "Not found",
          duration: 150,
        },
      });
    });

    it("ignores successful requests", () => {
      trackApiFailure("/api/test", "GET", 200);
      expect(mockTrackFailure).not.toHaveBeenCalled();
    });

    it("ignores 3xx redirects", () => {
      trackApiFailure("/api/test", "GET", 302);
      expect(mockTrackFailure).not.toHaveBeenCalled();
    });
  });

  describe("trackAuthFailure", () => {
    it("tracks auth failures", () => {
      trackAuthFailure("session_expired", "user@example.com");
      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "auth_failure",
        properties: { type: "session_expired", email: "user@example.com" },
      });
    });
  });

  describe("trackPaymentFailure", () => {
    it("tracks payment failures", () => {
      trackPaymentFailure("stripe", "Card declined", "team-1");
      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "payment_failure",
        properties: { provider: "stripe", error: "Card declined", teamId: "team-1" },
      });
    });
  });

  describe("trackUploadFailure", () => {
    it("tracks upload failures", () => {
      trackUploadFailure("application/pdf", 5000000, "File too large");
      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "upload_failure",
        properties: { fileType: "application/pdf", fileSize: 5000000, error: "File too large" },
      });
    });
  });

  describe("trackIntegrationError", () => {
    it("tracks integration errors", () => {
      trackIntegrationError("persona", "verify_identity", "API timeout");
      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "integration_error",
        properties: { provider: "persona", operation: "verify_identity", error: "API timeout" },
      });
    });
  });

  describe("trackCSPViolation", () => {
    it("tracks CSP violations", () => {
      trackCSPViolation("script-src", "https://evil.com/script.js", "https://app.fundroom.ai");
      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "csp_violation",
        properties: {
          directive: "script-src",
          blockedUri: "https://evil.com/script.js",
          documentUri: "https://app.fundroom.ai",
        },
      });
    });
  });

  describe("trackRenderError", () => {
    it("tracks render errors", () => {
      trackRenderError("DocumentViewer", "Cannot destructure null");
      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "render_error",
        properties: expect.objectContaining({
          component: "DocumentViewer",
          error: "Cannot destructure null",
        }),
      });
    });
  });

  describe("trackNetworkError", () => {
    it("tracks network errors", () => {
      trackNetworkError("https://api.fundroom.ai/data", "timeout");
      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "network_error",
        properties: { url: "https://api.fundroom.ai/data", type: "timeout" },
      });
    });
  });
});
