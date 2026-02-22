/**
 * Server-Side Event Publishing
 *
 * Sends tracking events to Tinybird from server-side code (API routes,
 * auth callbacks, etc.) using the project's standard @chronark/zod-bird SDK.
 *
 * Falls back to console.log when Tinybird is not configured.
 *
 * IMPORTANT: This file is server-only. Do NOT import from client components.
 * The barrel export (lib/tracking/index.ts) does NOT re-export this module.
 * Import directly: import { publishServerEvent } from "@/lib/tracking/server-events";
 *
 * Usage:
 *   publishServerEvent("funnel_signup_completed", { userId, method: "email" });
 *
 * PII RULES:
 *   - NEVER send email addresses, names, or other PII
 *   - Use userId only for user identification
 *   - See docs/TRACKING_RULES.md for the full policy
 */

import "server-only";

import { Tinybird } from "@chronark/zod-bird";
import { z } from "zod";

/** Zod schema for server-side funnel/tracking events — no PII fields allowed. */
const serverEventSchema = z.object({
  event_name: z.string(),
  timestamp: z.string(),
  // User identification (ID only, never email/name)
  userId: z.string().optional(),
  // Context
  teamId: z.string().optional(),
  orgId: z.string().optional(),
  portal: z.string().optional(),
  method: z.string().optional(),
  source: z.string().optional(),
  // Deal/investor tracking
  dealId: z.string().optional(),
  investorId: z.string().optional(),
  // Billing
  plan: z.string().optional(),
  priceId: z.string().optional(),
  // Error context (no sensitive payment details)
  errorType: z.string().optional(),
  declineCode: z.string().optional(),
});

type ServerEvent = z.infer<typeof serverEventSchema>;

/**
 * Lazily initialised Tinybird ingest endpoint.
 * Returns null when TINYBIRD_TOKEN is not set (dev/test environments).
 */
function createIngestEndpoint() {
  const token = process.env.TINYBIRD_TOKEN;
  if (!token) return null;

  const tb = new Tinybird({
    token,
    baseUrl:
      process.env.TINYBIRD_HOST || "https://api.us-west-2.aws.tinybird.co",
  });

  return tb.buildIngestEndpoint({
    datasource: "server_events__v1",
    event: serverEventSchema,
  });
}

let _ingest: ReturnType<typeof createIngestEndpoint> | undefined;
function getIngest() {
  if (_ingest === undefined) {
    _ingest = createIngestEndpoint();
  }
  return _ingest;
}

/**
 * Publish a server-side tracking event.
 *
 * @param eventName - A descriptive event name (e.g. "funnel_signup_completed")
 * @param properties - Key/value properties (must NOT include PII like email/name)
 *
 * Behaviour:
 *  - If TINYBIRD_TOKEN is set, publishes via @chronark/zod-bird with schema validation.
 *  - Otherwise, logs to console so events are visible during development.
 *  - Errors are caught and logged — this function never throws.
 *  - Callers should NOT await this function (fire-and-forget).
 */
export async function publishServerEvent(
  eventName: string,
  properties: Omit<Partial<ServerEvent>, "event_name" | "timestamp"> = {},
): Promise<void> {
  const timestamp = new Date().toISOString();

  const payload: ServerEvent = {
    event_name: eventName,
    timestamp,
    ...properties,
  };

  const ingest = getIngest();

  if (!ingest) {
    // Dev/test fallback: log to console so events are visible
    console.log(`[FUNNEL] ${eventName}`, payload);
    return;
  }

  try {
    await ingest(payload);
  } catch (error) {
    console.warn("[SERVER_EVENTS] Tinybird publish error:", error);
  }
}
