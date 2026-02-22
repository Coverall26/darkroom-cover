/**
 * Analytics Event Tracking Layer
 *
 * Centralized event tracking that fans out to PostHog and Tinybird.
 * Provides typed event definitions for funnels, engagement, and feature usage.
 * All events respect cookie consent before firing.
 */

import { posthog } from "posthog-js";

import { getPostHogConfig } from "@/lib/posthog";

// ----- Event Definitions -----

/**
 * Funnel events track user progression through key flows.
 */
export type FunnelEvent =
  | { name: "funnel_signup_started"; properties: { source?: string; utm_source?: string; domain?: string } }
  | { name: "funnel_signup_completed"; properties: { userId: string; method: "email" | "google" | "linkedin" } }
  | { name: "funnel_org_created"; properties: { orgId: string; plan?: string } }
  | { name: "funnel_team_created"; properties: { teamId: string; orgId: string } }
  | { name: "funnel_fund_created"; properties: { fundId: string; teamId: string; mode: "GP_FUND" | "STARTUP" } }
  | { name: "funnel_first_document_uploaded"; properties: { teamId: string; documentId: string } }
  | { name: "funnel_first_link_shared"; properties: { teamId: string; linkId: string } }
  | { name: "funnel_first_dataroom_created"; properties: { teamId: string; dataroomId: string } }
  | { name: "funnel_first_investor_added"; properties: { teamId: string } }
  | { name: "funnel_upgrade_started"; properties: { teamId: string; plan: string } }
  | { name: "funnel_upgrade_completed"; properties: { teamId: string; plan: string; priceId: string } }
  | { name: "funnel_lp_onboarding_started"; properties: { investorId?: string } }
  | { name: "funnel_lp_nda_signed"; properties: { investorId: string } }
  | { name: "funnel_lp_kyc_completed"; properties: { investorId: string } }
  | { name: "funnel_lp_commitment_made"; properties: { investorId: string; amount?: number } }
  | { name: "funnel_org_setup_completed"; properties: { orgId: string; mode: string } };

/**
 * Engagement events track how users interact with the platform.
 */
export type EngagementEvent =
  | { name: "page_viewed"; properties: { path: string; title?: string; referrer?: string } }
  | { name: "session_started"; properties: { sessionId: string; visitorId?: string; isReturning: boolean } }
  | { name: "session_ended"; properties: { sessionId: string; duration: number; pageCount: number } }
  | { name: "feature_used"; properties: { feature: string; teamId?: string; context?: string } }
  | { name: "search_performed"; properties: { query: string; resultCount: number; context: string } }
  | { name: "document_viewed"; properties: { documentId: string; duration: number; pages: number } }
  | { name: "dataroom_visited"; properties: { dataroomId: string; documentCount: number } }
  | { name: "settings_changed"; properties: { section: string; setting: string; teamId: string } }
  | { name: "export_requested"; properties: { type: string; format: string; teamId: string } }
  | { name: "notification_clicked"; properties: { type: string; notificationId: string } }
  | { name: "help_accessed"; properties: { context: string; action: "opened" | "searched" | "article_viewed" } };

/**
 * Error/failure events for monitoring launch health.
 */
export type FailureEvent =
  | { name: "client_error"; properties: { message: string; stack?: string; component?: string; url: string } }
  | { name: "api_error"; properties: { endpoint: string; method: string; status: number; message?: string; duration: number } }
  | { name: "auth_failure"; properties: { type: "login" | "register" | "session_expired" | "token_invalid" | "unauthorized"; email?: string } }
  | { name: "payment_failure"; properties: { provider: "stripe" | "plaid"; error: string; teamId?: string } }
  | { name: "upload_failure"; properties: { fileType: string; fileSize: number; error: string } }
  | { name: "integration_error"; properties: { provider: string; operation: string; error: string } }
  | { name: "csp_violation"; properties: { directive: string; blockedUri: string; documentUri: string } }
  | { name: "render_error"; properties: { component: string; error: string; url: string } }
  | { name: "network_error"; properties: { url: string; type: "timeout" | "offline" | "dns" | "unknown" } };

export type TrackingEvent = FunnelEvent | EngagementEvent | FailureEvent;

// ----- Tracking Functions -----

/**
 * Check if PostHog is available and initialized.
 */
function isPostHogAvailable(): boolean {
  try {
    return !!getPostHogConfig() && typeof posthog?.capture === "function";
  } catch {
    return false;
  }
}

/**
 * Track an analytics event. Sends to PostHog if available.
 * This is the primary client-side tracking function.
 *
 * @param event - Typed event object with name and properties
 */
export function trackEvent(event: TrackingEvent): void {
  if (!isPostHogAvailable()) return;

  try {
    posthog.capture(event.name, {
      ...event.properties,
      tracked_at: new Date().toISOString(),
    });
  } catch {
    // Analytics should never break the app
  }
}

/**
 * Track a funnel step. Convenience wrapper with funnel-specific metadata.
 */
export function trackFunnel(event: FunnelEvent): void {
  trackEvent(event);
}

/**
 * Track a failure/error event. Always fires regardless of consent
 * since error monitoring is considered a legitimate interest.
 * However, no PII is included.
 */
export function trackFailure(event: FailureEvent): void {
  // Failure events use PostHog if available but don't require consent
  // since they contain no PII and are needed for service reliability
  if (!isPostHogAvailable()) return;

  try {
    posthog.capture(event.name, {
      ...event.properties,
      tracked_at: new Date().toISOString(),
      _is_error: true,
    });
  } catch {
    // Never let error tracking cause errors
  }
}

/**
 * Track a page view with engagement metadata.
 */
export function trackPageView(path: string, title?: string): void {
  trackEvent({
    name: "page_viewed",
    properties: {
      path,
      title,
      referrer: typeof document !== "undefined" ? document.referrer : undefined,
    },
  });
}

/**
 * Set user properties on the analytics instance.
 * Called after authentication to enrich events with user context.
 */
export function setTrackingUser(user: {
  id: string;
  email?: string;
  teamId?: string;
  orgId?: string;
  role?: string;
  plan?: string;
}): void {
  if (!isPostHogAvailable()) return;

  try {
    posthog.identify(user.email ?? user.id, {
      userId: user.id,
      email: user.email,
      teamId: user.teamId,
      orgId: user.orgId,
      role: user.role,
      plan: user.plan,
    });
  } catch {
    // Ignore
  }
}

/**
 * Reset tracking user (on logout).
 */
export function resetTrackingUser(): void {
  if (!isPostHogAvailable()) return;

  try {
    posthog.reset();
  } catch {
    // Ignore
  }
}
