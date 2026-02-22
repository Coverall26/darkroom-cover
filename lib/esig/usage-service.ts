import prisma from "@/lib/prisma";
import { resolveTier, clearTierCache } from "@/lib/tier/resolver";
import { reportError } from "@/lib/error";

// ---------------------------------------------------------------------------
// EsigUsage Service — E-Signature Usage Tracking & Enforcement
//
// Tracks e-signature usage per team per billing period (monthly).
// Enforces tier limits before allowing new document creation/sending.
//
// Usage lifecycle:
//   1. GP creates signature document → recordDocumentCreated()
//   2. GP sends document for signing → recordDocumentSent()
//   3. All recipients sign → recordDocumentCompleted()
//
// Enforcement:
//   - canCreateDocument(teamId) — checks tier + usage
//   - canSendDocument(teamId) — checks tier + usage
//   - enforceEsigLimit(teamId) — throws if over limit
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EsigUsageSummary {
  teamId: string;
  periodStart: Date;
  periodEnd: Date;
  documentsCreated: number;
  documentsSent: number;
  documentsComplete: number;
  limit: number | null; // null = unlimited
  remaining: number | null; // null = unlimited
  isOverLimit: boolean;
}

export interface EsigUsageHistory {
  periods: Array<{
    periodStart: Date;
    periodEnd: Date;
    documentsCreated: number;
    documentsSent: number;
    documentsComplete: number;
  }>;
  totalAllTime: {
    documentsCreated: number;
    documentsSent: number;
    documentsComplete: number;
  };
}

// ---------------------------------------------------------------------------
// Period Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the first and last moment of the current billing month.
 * Billing months are aligned to calendar months (UTC).
 */
export function getCurrentBillingPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
  return { start, end };
}

/**
 * Returns the billing period for a given date.
 */
export function getBillingPeriodForDate(date: Date): {
  start: Date;
  end: Date;
} {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999),
  );
  return { start, end };
}

// ---------------------------------------------------------------------------
// Usage Record Management
// ---------------------------------------------------------------------------

/**
 * Get or create the usage record for the current billing period.
 */
async function getOrCreateCurrentRecord(teamId: string) {
  const { start, end } = getCurrentBillingPeriod();

  return prisma.esigUsageRecord.upsert({
    where: {
      teamId_periodStart: { teamId, periodStart: start },
    },
    create: {
      teamId,
      periodStart: start,
      periodEnd: end,
      documentsCreated: 0,
      documentsSent: 0,
      documentsComplete: 0,
    },
    update: {}, // No-op update — just returns existing record
  });
}

/**
 * Record a document creation event.
 * Call this when a GP creates a new SignatureDocument.
 */
export async function recordDocumentCreated(
  teamId: string,
  signatureDocumentId?: string,
): Promise<void> {
  try {
    const { start } = getCurrentBillingPeriod();

    await prisma.esigUsageRecord.upsert({
      where: {
        teamId_periodStart: { teamId, periodStart: start },
      },
      create: {
        teamId,
        periodStart: start,
        periodEnd: getCurrentBillingPeriod().end,
        documentsCreated: 1,
        documentsSent: 0,
        documentsComplete: 0,
        signatureDocumentId,
      },
      update: {
        documentsCreated: { increment: 1 },
      },
    });

    // Clear tier cache so usage reflects immediately
    clearTierCache(teamId);
  } catch (error) {
    reportError(error as Error);
  }
}

/**
 * Record a document sent for signing event.
 * Call this when a GP sends a SignatureDocument to recipients.
 */
export async function recordDocumentSent(teamId: string): Promise<void> {
  try {
    const { start, end } = getCurrentBillingPeriod();

    await prisma.esigUsageRecord.upsert({
      where: {
        teamId_periodStart: { teamId, periodStart: start },
      },
      create: {
        teamId,
        periodStart: start,
        periodEnd: end,
        documentsCreated: 0,
        documentsSent: 1,
        documentsComplete: 0,
      },
      update: {
        documentsSent: { increment: 1 },
      },
    });
  } catch (error) {
    reportError(error as Error);
  }
}

/**
 * Record a document completion event.
 * Call this when all recipients have signed a SignatureDocument.
 */
export async function recordDocumentCompleted(teamId: string): Promise<void> {
  try {
    const { start, end } = getCurrentBillingPeriod();

    await prisma.esigUsageRecord.upsert({
      where: {
        teamId_periodStart: { teamId, periodStart: start },
      },
      create: {
        teamId,
        periodStart: start,
        periodEnd: end,
        documentsCreated: 0,
        documentsSent: 0,
        documentsComplete: 1,
      },
      update: {
        documentsComplete: { increment: 1 },
      },
    });
  } catch (error) {
    reportError(error as Error);
  }
}

// ---------------------------------------------------------------------------
// Enforcement
// ---------------------------------------------------------------------------

/**
 * Check if a team can create a new e-signature document.
 * Returns true if allowed, false if over limit or plan doesn't include esig.
 */
export async function canCreateDocument(teamId: string): Promise<boolean> {
  const tier = await resolveTier(teamId);

  // Plan doesn't include e-signatures
  if (!tier.capabilities.canSign) {
    return false;
  }

  // Unlimited e-signatures (null limit)
  if (tier.limits.esignatures === null) {
    return true;
  }

  // Check current period usage against limit
  const record = await getOrCreateCurrentRecord(teamId);
  return record.documentsCreated < tier.limits.esignatures;
}

/**
 * Check if a team can send a document for signing.
 * Separate from creation check — allows drafts without consuming quota.
 */
export async function canSendDocument(teamId: string): Promise<boolean> {
  const tier = await resolveTier(teamId);

  if (!tier.capabilities.canSign) {
    return false;
  }

  // Unlimited
  if (tier.limits.esignatures === null) {
    return true;
  }

  const record = await getOrCreateCurrentRecord(teamId);
  return record.documentsSent < tier.limits.esignatures;
}

/**
 * Enforce e-signature limit. Throws an error if the team is over limit.
 * Use this as a guard in API routes before creating/sending documents.
 */
export async function enforceEsigLimit(teamId: string): Promise<void> {
  const allowed = await canCreateDocument(teamId);
  if (!allowed) {
    const tier = await resolveTier(teamId);
    if (!tier.capabilities.canSign) {
      throw new EsigNotAvailableError(
        "E-signatures are not available on your current plan. Upgrade to Business or higher.",
      );
    }
    throw new EsigLimitExceededError(
      `E-signature limit reached for this billing period. Your plan allows ${tier.limits.esignatures} documents per month.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Usage Summary & History
// ---------------------------------------------------------------------------

/**
 * Get current period usage summary for a team.
 */
export async function getUsageSummary(
  teamId: string,
): Promise<EsigUsageSummary> {
  const [tier, record] = await Promise.all([
    resolveTier(teamId),
    getOrCreateCurrentRecord(teamId),
  ]);

  const limit = tier.limits.esignatures;
  const remaining =
    limit === null ? null : Math.max(0, limit - record.documentsCreated);
  const isOverLimit =
    limit !== null && record.documentsCreated >= limit;

  return {
    teamId,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    documentsCreated: record.documentsCreated,
    documentsSent: record.documentsSent,
    documentsComplete: record.documentsComplete,
    limit,
    remaining,
    isOverLimit,
  };
}

/**
 * Get usage history for a team (last N billing periods).
 */
export async function getUsageHistory(
  teamId: string,
  periods: number = 12,
): Promise<EsigUsageHistory> {
  const records = await prisma.esigUsageRecord.findMany({
    where: { teamId },
    orderBy: { periodStart: "desc" },
    take: periods,
  });

  const totalAllTime = records.reduce(
    (acc, r) => ({
      documentsCreated: acc.documentsCreated + r.documentsCreated,
      documentsSent: acc.documentsSent + r.documentsSent,
      documentsComplete: acc.documentsComplete + r.documentsComplete,
    }),
    { documentsCreated: 0, documentsSent: 0, documentsComplete: 0 },
  );

  return {
    periods: records.map((r) => ({
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      documentsCreated: r.documentsCreated,
      documentsSent: r.documentsSent,
      documentsComplete: r.documentsComplete,
    })),
    totalAllTime,
  };
}

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

export class EsigNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EsigNotAvailableError";
  }
}

export class EsigLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EsigLimitExceededError";
  }
}
