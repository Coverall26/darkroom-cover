/**
 * useTracking Hook
 *
 * React hook that provides tracking functions scoped to the current
 * user's consent preferences. Automatically checks consent before
 * firing analytics or marketing events.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Cookies from "js-cookie";

import {
  CONSENT_COOKIE_NAME,
  type ConsentCategory,
  type ConsentPreferences,
  hasConsent,
  hasConsentBeenGiven,
  parseConsentCookie,
} from "./cookie-consent";
import {
  trackEvent,
  trackFailure,
  trackFunnel,
  trackPageView,
  type EngagementEvent,
  type FailureEvent,
  type FunnelEvent,
} from "./analytics-events";
import { initFailureTracking } from "./failure-tracker";
import {
  SESSION_ID_COOKIE,
  SESSION_START_COOKIE,
  VISITOR_ID_COOKIE,
} from "./tracking-cookies";

export interface TrackingContext {
  /** Current visitor ID from cookie */
  visitorId: string | null;
  /** Current session ID from cookie */
  sessionId: string | null;
  /** Whether consent has been given */
  hasConsent: boolean;
  /** Check if a specific category is consented */
  isConsentedFor: (category: ConsentCategory) => boolean;
  /** Track a funnel event (requires analytics consent) */
  trackFunnel: (event: FunnelEvent) => void;
  /** Track an engagement event (requires analytics consent) */
  trackEngagement: (event: EngagementEvent) => void;
  /** Track a failure event (always fires - legitimate interest) */
  trackFailure: (event: FailureEvent) => void;
  /** Track a page view */
  trackPage: (path: string, title?: string) => void;
}

/**
 * Hook that provides consent-aware tracking functions.
 */
export function useTracking(): TrackingContext {
  const [consent, setConsent] = useState<ConsentPreferences | null>(null);
  const failureTrackingInitialized = useRef(false);

  // Read consent on mount and listen for changes
  useEffect(() => {
    const readConsent = () => {
      const prefs = parseConsentCookie(Cookies.get(CONSENT_COOKIE_NAME));
      setConsent(prefs);
    };

    readConsent();

    // Listen for consent changes from the banner
    const handleConsentUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<ConsentPreferences>;
      setConsent(customEvent.detail);
    };

    window.addEventListener("fr:consent-updated", handleConsentUpdate);
    return () => window.removeEventListener("fr:consent-updated", handleConsentUpdate);
  }, []);

  // Initialize failure tracking once (doesn't require consent)
  useEffect(() => {
    if (!failureTrackingInitialized.current) {
      failureTrackingInitialized.current = true;
      initFailureTracking();
    }
  }, []);

  const visitorId = typeof document !== "undefined"
    ? Cookies.get(VISITOR_ID_COOKIE) ?? null
    : null;

  const sessionId = typeof document !== "undefined"
    ? Cookies.get(SESSION_ID_COOKIE) ?? null
    : null;

  const isConsentedFor = useCallback(
    (category: ConsentCategory) => hasConsent(consent, category),
    [consent],
  );

  const wrappedTrackFunnel = useCallback(
    (event: FunnelEvent) => {
      if (hasConsent(consent, "analytics")) {
        trackFunnel(event);
      }
    },
    [consent],
  );

  const wrappedTrackEngagement = useCallback(
    (event: EngagementEvent) => {
      if (hasConsent(consent, "analytics")) {
        trackEvent(event);
      }
    },
    [consent],
  );

  const wrappedTrackFailure = useCallback(
    (event: FailureEvent) => {
      // Failure events always fire (legitimate interest for service reliability)
      trackFailure(event);
    },
    [],
  );

  const wrappedTrackPage = useCallback(
    (path: string, title?: string) => {
      if (hasConsent(consent, "analytics")) {
        trackPageView(path, title);
      }
    },
    [consent],
  );

  return {
    visitorId,
    sessionId,
    hasConsent: hasConsentBeenGiven(consent),
    isConsentedFor,
    trackFunnel: wrappedTrackFunnel,
    trackEngagement: wrappedTrackEngagement,
    trackFailure: wrappedTrackFailure,
    trackPage: wrappedTrackPage,
  };
}
