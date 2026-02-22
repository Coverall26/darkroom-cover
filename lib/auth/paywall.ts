import prisma from "@/lib/prisma";

/**
 * Paywall middleware for FundRoom features.
 *
 * Datarooms are free forever. FundRoom features (LP onboarding, e-signature
 * on investment docs, commitment tracking, wire confirmation, LP vaults)
 * require an active FundroomActivation record — or a paywall bypass.
 *
 * Bypass priority:
 *   1. PAYWALL_BYPASS env var (MVP fallback)
 *   2. PlatformSettings.paywallEnforced = false (DB-driven platform toggle)
 *   3. PlatformSettings.paywallBypassUntil > now (time-limited bypass)
 *   4. FundroomActivation record with status ACTIVE
 *
 * Usage in Pages Router:
 *   const allowed = await requireFundroomActive(teamId);
 *   if (!allowed) return res.status(402).json(PAYWALL_ERROR);
 *
 * Usage in App Router:
 *   const allowed = await requireFundroomActive(teamId);
 *   if (!allowed) return NextResponse.json(PAYWALL_ERROR, { status: 402 });
 */

/**
 * Get platform-level paywall bypass status from DB.
 * Cached in-memory for 60 seconds to avoid per-request DB queries.
 */
let _platformSettingsCache: { enforced: boolean; bypassUntil: Date | null; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds

async function getPlatformPaywallStatus(): Promise<{ enforced: boolean; bypassUntil: Date | null }> {
  const now = Date.now();
  if (_platformSettingsCache && now - _platformSettingsCache.fetchedAt < CACHE_TTL_MS) {
    return { enforced: _platformSettingsCache.enforced, bypassUntil: _platformSettingsCache.bypassUntil };
  }

  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { key: "default" },
      select: { paywallEnforced: true, paywallBypassUntil: true },
    });

    const result = {
      enforced: settings?.paywallEnforced ?? true,
      bypassUntil: settings?.paywallBypassUntil ?? null,
    };

    _platformSettingsCache = { ...result, fetchedAt: now };
    return result;
  } catch {
    // If PlatformSettings table doesn't exist yet, default to enforced
    return { enforced: true, bypassUntil: null };
  }
}

/**
 * Clear the platform settings cache (call after updating settings).
 */
export function clearPlatformSettingsCache(): void {
  _platformSettingsCache = null;
}

/**
 * Check if a team has an active FundRoom subscription.
 * Returns true if:
 *   1. PAYWALL_BYPASS env var is set to "true" (MVP launch), OR
 *   2. PlatformSettings.paywallEnforced is false (DB-driven platform toggle), OR
 *   3. PlatformSettings.paywallBypassUntil is in the future, OR
 *   4. A FundroomActivation record with status ACTIVE exists for the team.
 *
 * Optionally scoped to a specific fund (checks team-level OR fund-level activation).
 */
export async function requireFundroomActive(
  teamId: string,
  fundId?: string,
): Promise<boolean> {
  // 1. Environment variable bypass (MVP fallback)
  if (process.env.PAYWALL_BYPASS === "true") {
    return true;
  }

  // 2. Platform-level DB toggle
  const platform = await getPlatformPaywallStatus();
  if (!platform.enforced) {
    return true;
  }

  // 3. Time-limited platform bypass
  if (platform.bypassUntil && new Date(platform.bypassUntil) > new Date()) {
    return true;
  }

  // 4. Check team-level activation (status must be ACTIVE)
  const teamActivation = await prisma.fundroomActivation.findFirst({
    where: { teamId, status: "ACTIVE", fundId: null },
    select: { id: true },
  });

  if (teamActivation) return true;

  // If fundId provided, also check fund-specific activation
  if (fundId) {
    const fundActivation = await prisma.fundroomActivation.findFirst({
      where: { teamId, status: "ACTIVE", fundId },
      select: { id: true },
    });
    if (fundActivation) return true;
  }

  return false;
}

/**
 * Check paywall by fundId only (resolves team from fund).
 * Useful when the calling code only has a fundId.
 */
export async function requireFundroomActiveByFund(
  fundId: string,
): Promise<boolean> {
  if (process.env.PAYWALL_BYPASS === "true") {
    return true;
  }

  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
    select: { teamId: true },
  });

  if (!fund) return false;

  return requireFundroomActive(fund.teamId, fundId);
}

/**
 * Get the activation status for a team (for UI display).
 * Returns the activation record with status details.
 */
export async function getActivationStatus(
  teamId: string,
  fundId?: string,
): Promise<{
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "DEACTIVATED" | "NONE";
  activation: {
    id: string;
    status: string;
    activatedAt: Date | null;
    activatedBy: string | null;
    deactivatedAt: Date | null;
    deactivationReason: string | null;
    mode: string;
  } | null;
}> {
  const where = fundId
    ? { teamId, fundId }
    : { teamId, fundId: null };

  const activation = await prisma.fundroomActivation.findFirst({
    where,
    select: {
      id: true,
      status: true,
      activatedAt: true,
      activatedBy: true,
      deactivatedAt: true,
      deactivationReason: true,
      mode: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!activation) {
    return { status: "NONE", activation: null };
  }

  return {
    status: activation.status as "ACTIVE" | "PENDING" | "SUSPENDED" | "DEACTIVATED",
    activation,
  };
}

/**
 * Standard 402 error response body for paywall blocks.
 */
export const PAYWALL_ERROR = {
  error: "This feature requires a FundRoom subscription.",
} as const;
