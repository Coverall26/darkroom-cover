/**
 * Failure Tracker
 *
 * Enhanced client-side error and failure tracking.
 * Captures unhandled errors, API failures, network issues,
 * and CSP violations, forwarding them to the analytics pipeline
 * and Rollbar for comprehensive launch monitoring.
 */

import { trackFailure, type FailureEvent } from "./analytics-events";

// Circular buffer to deduplicate errors in a short time window
const recentErrors = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000; // 5 seconds
const MAX_RECENT_ERRORS = 100;

/**
 * Generate a dedup key for an error.
 */
function errorKey(message: string, source?: string): string {
  return `${message}::${source ?? "unknown"}`;
}

/**
 * Check if this error was recently reported (dedup).
 */
function isDuplicate(key: string): boolean {
  const lastSeen = recentErrors.get(key);
  if (lastSeen && Date.now() - lastSeen < DEDUP_WINDOW_MS) {
    return true;
  }

  // Evict oldest entries if map is too large
  if (recentErrors.size >= MAX_RECENT_ERRORS) {
    const oldest = recentErrors.entries().next().value;
    if (oldest) {
      recentErrors.delete(oldest[0]);
    }
  }

  recentErrors.set(key, Date.now());
  return false;
}

/**
 * Track a client-side JavaScript error.
 */
export function trackClientError(
  message: string,
  stack?: string,
  component?: string,
): void {
  const key = errorKey(message, component);
  if (isDuplicate(key)) return;

  trackFailure({
    name: "client_error",
    properties: {
      message: message.substring(0, 500), // Limit size
      stack: stack?.substring(0, 1000),
      component,
      url: typeof window !== "undefined" ? window.location.href : "",
    },
  });
}

/**
 * Track an API response failure.
 */
export function trackApiFailure(
  endpoint: string,
  method: string,
  status: number,
  message?: string,
  duration?: number,
): void {
  // Only track actual errors (4xx, 5xx)
  if (status < 400) return;

  const key = errorKey(`${method} ${endpoint} ${status}`);
  if (isDuplicate(key)) return;

  trackFailure({
    name: "api_error",
    properties: {
      endpoint: endpoint.substring(0, 200),
      method,
      status,
      message: message?.substring(0, 300),
      duration: duration ?? 0,
    },
  });
}

/**
 * Track an authentication failure.
 */
export function trackAuthFailure(
  type: "login" | "session_expired" | "token_invalid" | "unauthorized",
  email?: string,
): void {
  trackFailure({
    name: "auth_failure",
    properties: { type, email },
  });
}

/**
 * Track a payment processing failure.
 */
export function trackPaymentFailure(
  provider: "stripe" | "plaid",
  error: string,
  teamId?: string,
): void {
  trackFailure({
    name: "payment_failure",
    properties: { provider, error: error.substring(0, 300), teamId },
  });
}

/**
 * Track a file upload failure.
 */
export function trackUploadFailure(
  fileType: string,
  fileSize: number,
  error: string,
): void {
  trackFailure({
    name: "upload_failure",
    properties: { fileType, fileSize, error: error.substring(0, 300) },
  });
}

/**
 * Track a third-party integration error.
 */
export function trackIntegrationError(
  provider: string,
  operation: string,
  error: string,
): void {
  trackFailure({
    name: "integration_error",
    properties: { provider, operation, error: error.substring(0, 300) },
  });
}

/**
 * Track a CSP violation report.
 */
export function trackCSPViolation(
  directive: string,
  blockedUri: string,
  documentUri: string,
): void {
  const key = errorKey(`csp:${directive}:${blockedUri}`);
  if (isDuplicate(key)) return;

  trackFailure({
    name: "csp_violation",
    properties: { directive, blockedUri, documentUri },
  });
}

/**
 * Track a React render/component error.
 */
export function trackRenderError(
  component: string,
  error: string,
): void {
  const key = errorKey(`render:${component}:${error}`);
  if (isDuplicate(key)) return;

  trackFailure({
    name: "render_error",
    properties: {
      component,
      error: error.substring(0, 500),
      url: typeof window !== "undefined" ? window.location.href : "",
    },
  });
}

/**
 * Track a network failure.
 */
export function trackNetworkError(
  url: string,
  type: "timeout" | "offline" | "dns" | "unknown",
): void {
  const key = errorKey(`network:${type}:${url}`);
  if (isDuplicate(key)) return;

  trackFailure({
    name: "network_error",
    properties: { url: url.substring(0, 200), type },
  });
}

/**
 * Initialize global error listeners for automatic failure tracking.
 * Call this once during app initialization (client-side only).
 */
export function initFailureTracking(): void {
  if (typeof window === "undefined") return;

  // Capture unhandled errors
  window.addEventListener("error", (event) => {
    trackClientError(
      event.message || "Unknown error",
      event.error?.stack,
      event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    );
  });

  // Capture unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    const stack = reason instanceof Error ? reason.stack : undefined;

    trackClientError(message, stack, "unhandledrejection");
  });

  // Monitor fetch failures by patching global fetch
  const originalFetch = window.fetch;
  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const start = Date.now();

    try {
      const response = await originalFetch.call(window, input, init);
      const duration = Date.now() - start;

      // Track API errors (skip analytics/tracking endpoints to avoid loops)
      if (response.status >= 400 && !isTrackingEndpoint(url)) {
        trackApiFailure(url, method, response.status, response.statusText, duration);
      }

      return response;
    } catch (error) {
      const duration = Date.now() - start;

      // Determine network error type
      if (!navigator.onLine) {
        trackNetworkError(url, "offline");
      } else if (error instanceof TypeError && error.message.includes("timeout")) {
        trackNetworkError(url, "timeout");
      } else if (!isTrackingEndpoint(url)) {
        trackNetworkError(url, "unknown");
      }

      // Also track as API failure
      if (!isTrackingEndpoint(url)) {
        trackApiFailure(url, method, 0, String(error), duration);
      }

      throw error;
    }
  };
}

/**
 * Check if a URL is a tracking/analytics endpoint (to avoid infinite loops).
 */
function isTrackingEndpoint(url: string): boolean {
  return (
    url.includes("/ingest") ||
    url.includes("/api/record_view") ||
    url.includes("/api/record_click") ||
    url.includes("/api/record_video_view") ||
    url.includes("/api/csp-report") ||
    url.includes("/api/analytics") ||
    url.includes("/api/tracking")
  );
}
