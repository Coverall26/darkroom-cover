/**
 * Tracking Module Index
 *
 * Re-exports all tracking utilities for convenient imports.
 */

// Cookie consent
export {
  acceptAllConsent,
  buildConsentCookieHeader,
  CONSENT_COOKIE_MAX_AGE,
  CONSENT_COOKIE_NAME,
  type ConsentCategory,
  type ConsentPreferences,
  createConsentPreferences,
  getDefaultPreferences,
  hasConsent,
  hasConsentBeenGiven,
  parseConsentCookie,
  rejectNonEssentialConsent,
  serializeConsentPreferences,
} from "./cookie-consent";

// Tracking cookies
export {
  buildCookieString,
  buildDeleteCookieHeader,
  DEVICE_ID_COOKIE,
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
  type UTMParams,
  UTM_COOKIE,
  VISITOR_ID_COOKIE,
} from "./tracking-cookies";

// Analytics events
export {
  type EngagementEvent,
  type FailureEvent,
  type FunnelEvent,
  resetTrackingUser,
  setTrackingUser,
  trackEvent,
  trackFailure,
  trackFunnel,
  trackPageView,
  type TrackingEvent,
} from "./analytics-events";

// Failure tracker
export {
  initFailureTracking,
  trackApiFailure,
  trackAuthFailure,
  trackClientError,
  trackCSPViolation,
  trackIntegrationError,
  trackNetworkError,
  trackPaymentFailure,
  trackRenderError,
  trackUploadFailure,
} from "./failure-tracker";

// Server-side event publishing (Tinybird)
// NOTE: publishServerEvent is NOT re-exported here because this barrel is
// imported by client components. Import directly:
//   import { publishServerEvent } from "@/lib/tracking/server-events";
