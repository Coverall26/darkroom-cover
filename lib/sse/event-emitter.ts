/**
 * Server-Sent Events (SSE) Infrastructure — Phase 2 Prep
 *
 * In-process event emitter for real-time updates. API routes call `emitSSE()`
 * to broadcast events to connected clients. The SSE endpoint in
 * `app/api/sse/route.ts` subscribes to these events per-org.
 *
 * Phase 2 upgrade path: replace in-process EventEmitter with Redis pub/sub
 * for multi-instance support behind a load balancer.
 */

type SSEListener = (event: SSEEvent) => void;

export interface SSEEvent {
  /** Event type for client-side filtering (e.g., "investor.committed", "wire.confirmed") */
  type: string;
  /** Scoped to organization for multi-tenant isolation */
  orgId: string;
  /** Optional: scope to specific fund */
  fundId?: string;
  /** Arbitrary JSON payload */
  data: Record<string, unknown>;
  /** ISO timestamp */
  timestamp: string;
}

// In-process listener map: orgId → Set<listener>
const listeners = new Map<string, Set<SSEListener>>();

/**
 * Subscribe to SSE events for an organization.
 * Returns an unsubscribe function.
 */
export function subscribeSSE(orgId: string, listener: SSEListener): () => void {
  if (!listeners.has(orgId)) {
    listeners.set(orgId, new Set());
  }
  listeners.get(orgId)!.add(listener);

  return () => {
    const orgListeners = listeners.get(orgId);
    if (orgListeners) {
      orgListeners.delete(listener);
      if (orgListeners.size === 0) {
        listeners.delete(orgId);
      }
    }
  };
}

/**
 * Emit an SSE event to all connected clients for the given org.
 * Call this from any API route after a mutation (e.g., wire confirmed, doc approved).
 *
 * Fire-and-forget — never throws, never blocks the caller.
 */
export function emitSSE(event: Omit<SSEEvent, "timestamp">): void {
  try {
    const fullEvent: SSEEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    const orgListeners = listeners.get(event.orgId);
    if (orgListeners && orgListeners.size > 0) {
      for (const listener of orgListeners) {
        try {
          listener(fullEvent);
        } catch {
          // Never let a broken listener crash the emitter
        }
      }
    }
  } catch {
    // Fire-and-forget — silently ignore
  }
}

/**
 * Get the current number of connected listeners for an org.
 * Useful for health checks and monitoring.
 */
export function getListenerCount(orgId: string): number {
  return listeners.get(orgId)?.size ?? 0;
}

/**
 * Get total listener count across all orgs.
 */
export function getTotalListenerCount(): number {
  let total = 0;
  for (const orgListeners of listeners.values()) {
    total += orgListeners.size;
  }
  return total;
}

// --- Event Type Constants ---

export const SSE_EVENTS = {
  // Investor lifecycle
  INVESTOR_APPLIED: "investor.applied",
  INVESTOR_COMMITTED: "investor.committed",
  INVESTOR_FUNDED: "investor.funded",
  INVESTOR_STAGE_CHANGED: "investor.stage_changed",

  // Wire / payment
  WIRE_PROOF_UPLOADED: "wire.proof_uploaded",
  WIRE_CONFIRMED: "wire.confirmed",

  // Documents
  DOCUMENT_UPLOADED: "document.uploaded",
  DOCUMENT_APPROVED: "document.approved",
  DOCUMENT_REJECTED: "document.rejected",
  DOCUMENT_SIGNED: "document.signed",

  // Fund
  FUND_AGGREGATE_UPDATED: "fund.aggregate_updated",

  // Activity
  ACTIVITY_NEW: "activity.new",
  DASHBOARD_REFRESH: "dashboard.refresh",
} as const;
