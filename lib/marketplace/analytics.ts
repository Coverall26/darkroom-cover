import type { DealStage, DealType } from "@prisma/client";

/**
 * Marketplace analytics event tracking.
 * Uses a fire-and-forget pattern — analytics failures never block business logic.
 *
 * Events are buffered in-memory and flushed in batches to Tinybird via
 * publishServerEvent. Each marketplace event is mapped to a server_events__v1
 * record with `marketplace_` prefix on the event_name.
 */

export type MarketplaceEvent =
  | { event: "deal.created"; dealId: string; teamId: string; dealType: DealType }
  | { event: "deal.stage_changed"; dealId: string; teamId: string; fromStage: DealStage; toStage: DealStage }
  | { event: "deal.deleted"; dealId: string; teamId: string }
  | { event: "interest.expressed"; dealId: string; teamId: string; investorId?: string; amount?: number }
  | { event: "interest.status_changed"; dealId: string; interestId: string; status: string }
  | { event: "allocation.created"; dealId: string; investorId: string; amount: number }
  | { event: "allocation.responded"; allocationId: string; accepted: boolean; amount?: number }
  | { event: "listing.published"; listingId: string; dealId: string; teamId: string }
  | { event: "listing.unpublished"; listingId: string; dealId: string }
  | { event: "listing.viewed"; listingId: string; userId?: string }
  | { event: "listing.saved"; listingId: string; userId?: string }
  | { event: "marketplace.searched"; query: string; filters?: Record<string, unknown>; resultCount: number };

// In-memory buffer for batching analytics events
const eventBuffer: Array<MarketplaceEvent & { timestamp: number }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 50;

/**
 * Track a marketplace analytics event.
 * Events are buffered and flushed in batches for efficiency.
 */
export function trackMarketplaceEvent(event: MarketplaceEvent): void {
  eventBuffer.push({
    ...event,
    timestamp: Date.now(),
  });

  // Flush if buffer is full
  if (eventBuffer.length >= MAX_BUFFER_SIZE) {
    flushEvents();
    return;
  }

  // Schedule flush
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushEvents();
    }, FLUSH_INTERVAL_MS);
  }
}

/**
 * Extract common properties from a marketplace event for server event publishing.
 * Maps marketplace-specific fields to the server_events__v1 schema.
 */
function extractServerEventProps(
  evt: MarketplaceEvent,
): Record<string, string | undefined> {
  const props: Record<string, string | undefined> = {};

  if ("teamId" in evt) props.teamId = evt.teamId;
  if ("dealId" in evt) props.dealId = evt.dealId;
  if ("investorId" in evt) props.investorId = evt.investorId;
  if ("userId" in evt) props.userId = evt.userId;
  // Marketplace-specific context encoded in source field
  if ("dealType" in evt) props.source = evt.dealType;
  if ("fromStage" in evt) props.method = `${evt.fromStage}→${evt.toStage}`;
  if ("status" in evt) props.source = evt.status;

  return props;
}

/**
 * Flush buffered events to Tinybird via publishServerEvent.
 * Each event is published as `marketplace_{event_type}` to server_events__v1.
 */
function flushEvents(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventBuffer.length === 0) return;

  const events = eventBuffer.splice(0, eventBuffer.length);

  // Publish to Tinybird (fire-and-forget, never blocks)
  publishMarketplaceEvents(events).catch((err) =>
    console.warn("[Marketplace Analytics] Batch publish error:", err),
  );
}

/**
 * Publish buffered marketplace events to Tinybird.
 * Lazily imports publishServerEvent to avoid circular deps and server-only issues.
 */
async function publishMarketplaceEvents(
  events: Array<MarketplaceEvent & { timestamp: number }>,
): Promise<void> {
  // Dynamic import — server-only module, lazy to avoid import-time errors
  const { publishServerEvent } = await import("@/lib/tracking/server-events");

  for (const evt of events) {
    const eventName = `marketplace_${evt.event.replace(/\./g, "_")}`;
    const props = extractServerEventProps(evt);

    // Fire-and-forget per the project convention — no await
    publishServerEvent(eventName, props);
  }
}

/**
 * Get a snapshot of pipeline metrics for a specific time range.
 * Used for dashboard KPI cards and reporting.
 */
export interface PipelineMetricsSnapshot {
  period: { start: Date; end: Date };
  newDeals: number;
  dealsAdvanced: number;
  dealsClosed: number;
  dealsPassed: number;
  totalInterestExpressed: number;
  totalAllocated: number;
  totalCommitted: number;
  avgDaysToClose: number;
}

/**
 * Compute pipeline metrics for a time range (from database, not analytics).
 */
export async function computePipelineMetrics(
  teamId: string,
  startDate: Date,
  endDate: Date,
): Promise<PipelineMetricsSnapshot> {
  // Import prisma lazily to avoid circular dependencies
  const { default: prisma } = await import("@/lib/prisma");

  const [newDeals, stageChanges, interests, allocations] = await Promise.all([
    // New deals in period
    prisma.deal.count({
      where: {
        teamId,
        createdAt: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
    }),

    // Stage changes in period
    prisma.dealStageHistory.findMany({
      where: {
        deal: { teamId },
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { toStage: true, fromStage: true },
    }),

    // Interest in period
    prisma.dealInterest.count({
      where: {
        deal: { teamId },
        createdAt: { gte: startDate, lte: endDate },
      },
    }),

    // Allocations in period
    prisma.dealAllocation.findMany({
      where: {
        deal: { teamId },
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { allocatedAmount: true, confirmedAmount: true, status: true },
    }),
  ]);

  const dealsAdvanced = stageChanges.filter(
    (sc) =>
      sc.fromStage &&
      !["PASSED", "WITHDRAWN"].includes(sc.toStage) &&
      !["PASSED", "WITHDRAWN"].includes(sc.fromStage),
  ).length;

  const dealsClosed = stageChanges.filter(
    (sc) => sc.toStage === "FUNDED",
  ).length;

  const dealsPassed = stageChanges.filter(
    (sc) => sc.toStage === "PASSED" || sc.toStage === "WITHDRAWN",
  ).length;

  const totalAllocated = allocations.reduce(
    (sum, a) => sum + Number(a.allocatedAmount),
    0,
  );
  const totalCommitted = allocations
    .filter((a) => a.status === "ACCEPTED")
    .reduce((sum, a) => sum + Number(a.confirmedAmount ?? a.allocatedAmount), 0);

  return {
    period: { start: startDate, end: endDate },
    newDeals,
    dealsAdvanced,
    dealsClosed,
    dealsPassed,
    totalInterestExpressed: interests,
    totalAllocated,
    totalCommitted,
    avgDaysToClose: 0, // Would need funded deals with full history to compute
  };
}
