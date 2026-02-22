import { posthog } from "posthog-js";

import { getPostHogConfig } from "@/lib/posthog";
import { AnalyticsEvents } from "@/lib/types";

export function useAnalytics() {
  const isPostHogEnabled = getPostHogConfig();

  /**
   * Capture an analytic event.
   * Wrapped in try/catch to prevent blocking if analytics is blocked by browser extensions.
   *
   * @param event The event name.
   * @param properties Properties to attach to the event.
   */
  const capture = (event: string, properties?: Record<string, unknown>) => {
    if (!isPostHogEnabled) {
      return;
    }

    try {
      posthog.capture(event, properties);
    } catch (e) {
      // Analytics blocked by extension - ignore silently
    }

    // Note: Legacy bridge removed — trackGenericEvent did not exist in
    // analytics-events.ts, and trackEvent() expects typed TrackingEvent
    // objects (not bare strings). The posthog.capture() call above already
    // tracks the event. Use trackEvent() directly for typed tracking.
  };

  const identify = (
    distinctId?: string,
    properties?: Record<string, unknown>,
  ) => {
    if (!isPostHogEnabled) {
      return;
    }

    try {
      posthog.identify(distinctId, properties);
    } catch (e) {
      // Analytics blocked by extension - ignore silently
    }
  };

  return {
    capture,
    identify,
  };
}

// Server-side tracking stubs — Jitsu removed (was never initialized in production).
// Use publishServerEvent() from lib/tracking/server-events.ts for server analytics.
// These exports kept for backward compatibility with existing callers.
export const identifyUser = (_userId: string) => {};
export const trackAnalytics = (_args: AnalyticsEvents) => {};
