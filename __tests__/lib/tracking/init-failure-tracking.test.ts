/**
 * @jest-environment jsdom
 */

/**
 * Tests for initFailureTracking in failure-tracker module.
 *
 * This file focuses on the complex initFailureTracking function that patches
 * window.fetch and registers global error/rejection listeners.
 */

// Mock analytics-events
jest.mock("@/lib/tracking/analytics-events", () => ({
  trackFailure: jest.fn(),
}));

import { trackFailure } from "@/lib/tracking/analytics-events";
import { initFailureTracking, trackClientError } from "@/lib/tracking/failure-tracker";

const mockTrackFailure = trackFailure as jest.MockedFunction<typeof trackFailure>;

/** Create a mock Response-like object (Response constructor isn't available in jsdom) */
function createMockResponse(
  _body: string,
  init: { status: number; statusText?: string } = { status: 200 },
) {
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    statusText: init.statusText ?? "",
    headers: new Headers(),
    text: () => Promise.resolve(_body),
    json: () => Promise.resolve({}),
  };
}

describe("initFailureTracking", () => {
  let originalFetch: typeof window.fetch;
  let errorListeners: ((event: ErrorEvent) => void)[];
  let rejectionListeners: ((event: PromiseRejectionEvent) => void)[];

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = window.fetch;
    errorListeners = [];
    rejectionListeners = [];

    // Capture event listeners
    jest.spyOn(window, "addEventListener").mockImplementation((type, handler) => {
      if (type === "error") {
        errorListeners.push(handler as (event: ErrorEvent) => void);
      } else if (type === "unhandledrejection") {
        rejectionListeners.push(handler as (event: PromiseRejectionEvent) => void);
      }
    });
  });

  afterEach(() => {
    window.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("registers error and unhandledrejection listeners", () => {
    initFailureTracking();

    expect(window.addEventListener).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
    expect(window.addEventListener).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function),
    );
  });

  it("patches window.fetch", () => {
    const prePatchFetch = window.fetch;
    initFailureTracking();
    expect(window.fetch).not.toBe(prePatchFetch);
    expect(window.fetch.name).toBe("patchedFetch");
  });

  describe("error listener", () => {
    it("tracks unhandled errors via trackClientError", () => {
      initFailureTracking();
      expect(errorListeners.length).toBeGreaterThan(0);

      const errorEvent = {
        message: "Uncaught TypeError: undefined is not a function",
        error: { stack: "TypeError: ...\n  at foo.js:10:5" },
        filename: "foo.js",
        lineno: 10,
        colno: 5,
      } as unknown as ErrorEvent;

      errorListeners[0](errorEvent);

      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "client_error",
        properties: expect.objectContaining({
          message: "Uncaught TypeError: undefined is not a function",
          component: "foo.js:10:5",
        }),
      });
    });

    it("handles errors with no filename", () => {
      initFailureTracking();

      const errorEvent = {
        message: "Script error",
        error: null,
        filename: "",
        lineno: 0,
        colno: 0,
      } as unknown as ErrorEvent;

      errorListeners[0](errorEvent);

      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "client_error",
        properties: expect.objectContaining({
          message: "Script error",
          component: undefined,
        }),
      });
    });

    it("uses 'Unknown error' when message is empty", () => {
      initFailureTracking();

      const errorEvent = {
        message: "",
        error: null,
        filename: "",
        lineno: 0,
        colno: 0,
      } as unknown as ErrorEvent;

      errorListeners[0](errorEvent);

      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "client_error",
        properties: expect.objectContaining({
          message: "Unknown error",
        }),
      });
    });
  });

  describe("unhandledrejection listener", () => {
    it("tracks Error rejections with message and stack", () => {
      initFailureTracking();
      expect(rejectionListeners.length).toBeGreaterThan(0);

      const error = new Error("Promise failed");
      const event = {
        reason: error,
      } as unknown as PromiseRejectionEvent;

      rejectionListeners[0](event);

      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "client_error",
        properties: expect.objectContaining({
          message: "Promise failed",
          component: "unhandledrejection",
        }),
      });
    });

    it("tracks string rejections", () => {
      initFailureTracking();

      const event = {
        reason: "Something went wrong",
      } as unknown as PromiseRejectionEvent;

      rejectionListeners[0](event);

      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "client_error",
        properties: expect.objectContaining({
          message: "Something went wrong",
          component: "unhandledrejection",
        }),
      });
    });

    it("tracks non-Error, non-string rejections with default message", () => {
      initFailureTracking();

      const event = {
        reason: { code: 42 },
      } as unknown as PromiseRejectionEvent;

      rejectionListeners[0](event);

      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "client_error",
        properties: expect.objectContaining({
          message: "Unhandled promise rejection",
          component: "unhandledrejection",
        }),
      });
    });
  });

  describe("patched fetch", () => {
    it("returns responses normally for successful requests", async () => {
      const mockResponse = createMockResponse("ok", { status: 200 });
      const fakeFetch = jest.fn().mockResolvedValue(mockResponse);
      window.fetch = fakeFetch;

      initFailureTracking();
      const response = await window.fetch("/api/test");

      expect(response).toBe(mockResponse);
    });

    it("tracks API errors for status >= 400", async () => {
      const mockResponse = createMockResponse("Not Found", {
        status: 404,
        statusText: "Not Found",
      });
      const fakeFetch = jest.fn().mockResolvedValue(mockResponse);
      window.fetch = fakeFetch;

      initFailureTracking();
      await window.fetch("/api/teams/123/docs");

      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "api_error",
        properties: expect.objectContaining({
          endpoint: "/api/teams/123/docs",
          method: "GET",
          status: 404,
        }),
      });
    });

    it("uses method from init options", async () => {
      const mockResponse = createMockResponse("", { status: 500 });
      const fakeFetch = jest.fn().mockResolvedValue(mockResponse);
      window.fetch = fakeFetch;

      initFailureTracking();
      await window.fetch("/api/data", { method: "POST" });

      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "api_error",
        properties: expect.objectContaining({
          method: "POST",
          status: 500,
        }),
      });
    });

    it("skips tracking for tracking endpoints to avoid loops", async () => {
      const mockResponse = createMockResponse("", { status: 500 });
      const fakeFetch = jest.fn().mockResolvedValue(mockResponse);
      window.fetch = fakeFetch;

      initFailureTracking();

      const trackingEndpoints = [
        "/ingest/events",
        "/api/record_view",
        "/api/record_click",
        "/api/record_video_view",
        "/api/csp-report",
        "/api/analytics/track",
        "/api/tracking/events",
      ];

      for (const url of trackingEndpoints) {
        await window.fetch(url);
      }

      // None of the tracking endpoints should trigger failure tracking
      expect(mockTrackFailure).not.toHaveBeenCalled();
    });

    it("tracks network errors when fetch throws", async () => {
      const fakeFetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      window.fetch = fakeFetch;

      initFailureTracking();

      await expect(window.fetch("/api/data")).rejects.toThrow("Failed to fetch");

      // Should track both network error and API failure
      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "network_error",
        properties: expect.objectContaining({
          url: "/api/data",
          type: "unknown",
        }),
      });
    });

    it("tracks offline network errors", async () => {
      const fakeFetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
      window.fetch = fakeFetch;

      // Simulate offline
      Object.defineProperty(navigator, "onLine", {
        value: false,
        configurable: true,
      });

      initFailureTracking();
      await expect(window.fetch("/api/data")).rejects.toThrow();

      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "network_error",
        properties: expect.objectContaining({
          type: "offline",
        }),
      });

      // Restore
      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
      });
    });

    it("re-throws the original error", async () => {
      const originalError = new TypeError("Connection refused");
      const fakeFetch = jest.fn().mockRejectedValue(originalError);
      window.fetch = fakeFetch;

      initFailureTracking();

      await expect(window.fetch("/api/test")).rejects.toBe(originalError);
    });

    it("handles URL input types correctly", async () => {
      const mockResponse = createMockResponse("", { status: 500 });
      const fakeFetch = jest.fn().mockResolvedValue(mockResponse);
      window.fetch = fakeFetch;

      initFailureTracking();

      // String URL
      await window.fetch("https://api.example.com/data");
      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "api_error",
        properties: expect.objectContaining({
          endpoint: "https://api.example.com/data",
        }),
      });

      mockTrackFailure.mockClear();

      // URL object
      await window.fetch(new URL("https://api.example.com/other"));
      expect(mockTrackFailure).toHaveBeenCalledWith({
        name: "api_error",
        properties: expect.objectContaining({
          endpoint: "https://api.example.com/other",
        }),
      });
    });
  });
});
