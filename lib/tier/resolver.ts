/**
 * TierResolver — Unified tier resolution service for FundRoom.
 *
 * Merges three systems into a single coherent interface:
 *   1. SaaS Billing Plans (Team.plan + ee/limits/constants.ts)
 *   2. Platform Activation (FundroomActivation + PlatformSettings paywall)
 *   3. Fund Investment Tiers (Subscription + FundPricingTier models)
 *
 * Usage:
 *   const tier = await resolveTier(teamId);
 *   if (!tier.canSign) return res.status(403).json({ error: "E-signature not available on your plan" });
 *   if (tier.usage.documents >= tier.limits.documents) return res.status(403).json({ error: "Document limit reached" });
 */

import prisma from "@/lib/prisma";

import {
  BUSINESS_PLAN_LIMITS,
  DATAROOMS_PLAN_LIMITS,
  DATAROOMS_PLUS_PLAN_LIMITS,
  DATAROOMS_PREMIUM_PLAN_LIMITS,
  FREE_PLAN_LIMITS,
  PRO_PLAN_LIMITS,
  TPlanLimits,
} from "@/ee/limits/constants";
import { PLAN_NAME_MAP } from "@/ee/stripe/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlanSlug =
  | "free"
  | "pro"
  | "business"
  | "datarooms"
  | "datarooms-plus"
  | "datarooms-premium";

export type ActivationStatus =
  | "ACTIVE"
  | "PENDING"
  | "SUSPENDED"
  | "DEACTIVATED"
  | "NONE";

export type SubscriptionStatus =
  | "active"
  | "paused"
  | "cancelled"
  | "expired"
  | "trialing"
  | "none";

export interface TierLimits {
  users: number | null; // null = unlimited
  links: number | null;
  documents: number | null;
  domains: number;
  datarooms: number;
  customDomainOnPro: boolean;
  customDomainInDataroom: boolean;
  advancedLinkControlsOnPro: boolean | null;
  conversationsInDataroom: boolean;
  esignatures: number | null; // null = unlimited (based on plan)
}

export interface TierUsage {
  documents: number;
  links: number;
  users: number;
  datarooms: number;
  domains: number;
  esignatures: number;
}

export interface TierCapabilities {
  // Dataroom features (free tier)
  canCreateDataroom: boolean;
  canShareLinks: boolean;
  canViewAnalytics: boolean;

  // Document features
  canAddDocuments: boolean;
  canAddLinks: boolean;
  canAddUsers: boolean;
  canAddDomains: boolean;

  // FundRoom premium features (require activation)
  canSign: boolean;
  canManageFund: boolean;
  canOnboardLP: boolean;
  canTrackWire: boolean;
  canUseApprovalQueue: boolean;
  canExportFormD: boolean;

  // Plan-level features
  canUseBranding: boolean;
  canUseCustomDomain: boolean;
  canUseWatermark: boolean;
  canUseScreenshotProtection: boolean;
  canUseWebhooks: boolean;
  canUseNDA: boolean;
  canUseGranularPermissions: boolean;
  canUseAPI: boolean;
  canUseSSO: boolean;
  canUseWhitelabel: boolean;
}

export interface ResolvedTier {
  // Plan identity
  planSlug: PlanSlug;
  planName: string;
  isTrial: boolean;
  isFreePlan: boolean;
  isPaidPlan: boolean;

  // Subscription state
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;

  // FundRoom activation
  activationStatus: ActivationStatus;
  fundroomActive: boolean;

  // Resource limits & usage
  limits: TierLimits;
  usage: TierUsage;

  // Computed capabilities
  capabilities: TierCapabilities;
}

// ---------------------------------------------------------------------------
// Plan → Limits map
// ---------------------------------------------------------------------------

const PLAN_LIMITS_MAP: Record<string, TPlanLimits> = {
  free: FREE_PLAN_LIMITS,
  pro: PRO_PLAN_LIMITS,
  business: BUSINESS_PLAN_LIMITS,
  datarooms: DATAROOMS_PLAN_LIMITS,
  "datarooms-plus": DATAROOMS_PLUS_PLAN_LIMITS,
  "datarooms-premium": DATAROOMS_PREMIUM_PLAN_LIMITS,
};

// Plans that include e-signature capability
const ESIG_PLANS = new Set<string>([
  "business",
  "datarooms",
  "datarooms-plus",
  "datarooms-premium",
]);

// Plans that include branding removal
const BRANDING_PLANS = new Set<string>([
  "pro",
  "business",
  "datarooms",
  "datarooms-plus",
  "datarooms-premium",
]);

// Plans that include webhooks
const WEBHOOK_PLANS = new Set<string>([
  "business",
  "datarooms",
  "datarooms-plus",
  "datarooms-premium",
]);

// Plans that include NDA / agreements
const NDA_PLANS = new Set<string>([
  "datarooms",
  "datarooms-plus",
  "datarooms-premium",
]);

// Plans that include granular file-level permissions
const PERMISSION_PLANS = new Set<string>([
  "datarooms",
  "datarooms-plus",
  "datarooms-premium",
]);

// Plans that include API access
const API_PLANS = new Set<string>(["datarooms-premium"]);

// Plans that include SSO
const SSO_PLANS = new Set<string>(["datarooms-premium"]);

// Plans that include whitelabeling
const WHITELABEL_PLANS = new Set<string>(["datarooms-premium"]);

// Plans that include watermark
const WATERMARK_PLANS = new Set<string>([
  "datarooms",
  "datarooms-plus",
  "datarooms-premium",
]);

// Plans that include screenshot protection
const SCREENSHOT_PLANS = new Set<string>([
  "business",
  "datarooms",
  "datarooms-plus",
  "datarooms-premium",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the base plan slug from a compound plan string (e.g. "free+drtrial" → "free") */
function getBasePlan(plan: string): PlanSlug {
  const base = plan.split("+")[0];
  if (base in PLAN_LIMITS_MAP) return base as PlanSlug;
  return "free";
}

/** Check if the plan string contains a trial suffix */
function isTrial(plan: string): boolean {
  return plan.includes("drtrial");
}

/** Derive subscription status from Team date fields */
function deriveSubscriptionStatus(team: {
  plan: string;
  pausedAt: Date | null;
  cancelledAt: Date | null;
  endsAt: Date | null;
  startsAt: Date | null;
  subscriptionId: string | null;
}): SubscriptionStatus {
  if (!team.subscriptionId) {
    if (isTrial(team.plan)) return "trialing";
    return "none";
  }
  if (team.pausedAt) return "paused";
  if (team.cancelledAt) return "cancelled";
  if (team.endsAt && new Date(team.endsAt) < new Date()) return "expired";
  return "active";
}

// ---------------------------------------------------------------------------
// In-memory cache (per-team, 30s TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
  tier: ResolvedTier;
  fetchedAt: number;
}

const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30 seconds

/** Clear a specific team's cached tier, or all caches */
export function clearTierCache(teamId?: string): void {
  if (teamId) {
    _cache.delete(teamId);
  } else {
    _cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the full tier for a team — plan, limits, usage, capabilities.
 *
 * This is the single source of truth for "what can this team do?"
 * Caches results for 30 seconds to avoid per-request DB queries.
 */
export async function resolveTier(teamId: string): Promise<ResolvedTier> {
  // Check cache
  const cached = _cache.get(teamId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.tier;
  }

  // Fetch team + counts + activation in parallel
  const [team, activation, esigCount] = await Promise.all([
    prisma.team.findUnique({
      where: { id: teamId },
      select: {
        plan: true,
        limits: true,
        stripeId: true,
        subscriptionId: true,
        startsAt: true,
        endsAt: true,
        pausedAt: true,
        cancelledAt: true,
        featureFlags: true,
        _count: {
          select: {
            documents: true,
            links: true,
            users: true,
            invitations: true,
            datarooms: true,
            domains: true,
            signatureDocuments: true,
          },
        },
      },
    }),
    prisma.fundroomActivation.findFirst({
      where: { teamId, fundId: null },
      select: { status: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.signatureDocument.count({
      where: { teamId },
    }),
  ]);

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  // --- Plan resolution ---
  const planSlug = getBasePlan(team.plan);
  const planName = PLAN_NAME_MAP[planSlug] || "Free";
  const trial = isTrial(team.plan);
  const isFreePlanFlag = planSlug === "free";
  const subscriptionStatus = deriveSubscriptionStatus(team);

  // --- Limits resolution (merge plan defaults with team overrides) ---
  const defaultLimits = PLAN_LIMITS_MAP[planSlug] || FREE_PLAN_LIMITS;
  let teamOverrides: Record<string, unknown> = {};
  if (team.limits && typeof team.limits === "object") {
    teamOverrides = team.limits as Record<string, unknown>;
  }

  // For paid plans, null in defaults means unlimited — always preserve unlimited
  const effectiveUsers =
    defaultLimits.users === null
      ? null
      : (teamOverrides.users as number | null) ?? defaultLimits.users;
  const effectiveLinks =
    defaultLimits.links === null
      ? null
      : (teamOverrides.links as number | null) ?? defaultLimits.links;
  const effectiveDocs =
    defaultLimits.documents === null
      ? null
      : (teamOverrides.documents as number | null) ?? defaultLimits.documents;

  const limits: TierLimits = {
    users: trial && isFreePlanFlag ? 3 : effectiveUsers,
    links: effectiveLinks,
    documents: effectiveDocs,
    domains: (teamOverrides.domains as number) ?? defaultLimits.domains,
    datarooms: (teamOverrides.datarooms as number) ?? defaultLimits.datarooms,
    customDomainOnPro:
      (teamOverrides.customDomainOnPro as boolean) ??
      defaultLimits.customDomainOnPro,
    customDomainInDataroom:
      (teamOverrides.customDomainInDataroom as boolean) ??
      defaultLimits.customDomainInDataroom,
    advancedLinkControlsOnPro:
      (teamOverrides.advancedLinkControlsOnPro as boolean | null) ??
      defaultLimits.advancedLinkControlsOnPro,
    conversationsInDataroom: true, // Self-hosted: always enabled
    esignatures: ESIG_PLANS.has(planSlug) ? null : 0, // Unlimited for paid plans, 0 for free
  };

  // --- Usage ---
  const usage: TierUsage = {
    documents: team._count.documents,
    links: team._count.links,
    users: team._count.users + team._count.invitations,
    datarooms: team._count.datarooms,
    domains: team._count.domains,
    esignatures: esigCount,
  };

  // --- Activation ---
  const activationStatus: ActivationStatus =
    (activation?.status as ActivationStatus) ?? "NONE";
  const fundroomActive =
    activationStatus === "ACTIVE" ||
    process.env.PAYWALL_BYPASS === "true";

  // --- Capabilities ---
  const isPaused = subscriptionStatus === "paused";
  const isExpired = subscriptionStatus === "expired";
  const isCancelled = subscriptionStatus === "cancelled";
  const isRestricted = isPaused || isExpired || isCancelled;

  const capabilities: TierCapabilities = {
    // Free-tier features (always available unless subscription is restricted)
    canCreateDataroom: !isRestricted || !isPaused,
    canShareLinks: !isPaused,
    canViewAnalytics: true,

    // Resource limits (check usage vs limits)
    canAddDocuments:
      !isPaused &&
      (limits.documents === null || usage.documents < limits.documents),
    canAddLinks:
      !isPaused && (limits.links === null || usage.links < limits.links),
    canAddUsers:
      !isPaused && (limits.users === null || usage.users < limits.users),
    canAddDomains: limits.domains > 0 && usage.domains < limits.domains,

    // FundRoom premium features (require activation + plan)
    canSign: fundroomActive && ESIG_PLANS.has(planSlug) && !isRestricted,
    canManageFund: fundroomActive && !isRestricted,
    canOnboardLP: fundroomActive && !isRestricted,
    canTrackWire: fundroomActive && !isRestricted,
    canUseApprovalQueue: fundroomActive && !isRestricted,
    canExportFormD: fundroomActive && !isRestricted,

    // Plan-level feature flags
    canUseBranding: BRANDING_PLANS.has(planSlug),
    canUseCustomDomain: limits.customDomainOnPro || limits.customDomainInDataroom,
    canUseWatermark: WATERMARK_PLANS.has(planSlug),
    canUseScreenshotProtection: SCREENSHOT_PLANS.has(planSlug),
    canUseWebhooks: WEBHOOK_PLANS.has(planSlug),
    canUseNDA: NDA_PLANS.has(planSlug),
    canUseGranularPermissions: PERMISSION_PLANS.has(planSlug),
    canUseAPI: API_PLANS.has(planSlug),
    canUseSSO: SSO_PLANS.has(planSlug),
    canUseWhitelabel: WHITELABEL_PLANS.has(planSlug),
  };

  const tier: ResolvedTier = {
    planSlug,
    planName,
    isTrial: trial,
    isFreePlan: isFreePlanFlag,
    isPaidPlan: !isFreePlanFlag,
    subscriptionStatus,
    stripeCustomerId: team.stripeId ?? null,
    stripeSubscriptionId: team.subscriptionId ?? null,
    activationStatus,
    fundroomActive,
    limits,
    usage,
    capabilities,
  };

  // Store in cache
  _cache.set(teamId, { tier, fetchedAt: Date.now() });

  return tier;
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Quick check: can the team use a specific capability? */
export async function canAccess(
  teamId: string,
  capability: keyof TierCapabilities,
): Promise<boolean> {
  const tier = await resolveTier(teamId);
  return tier.capabilities[capability];
}

/** Quick check: get the limit for a specific resource */
export async function getLimit(
  teamId: string,
  resource: keyof TierLimits,
): Promise<number | null | boolean> {
  const tier = await resolveTier(teamId);
  return tier.limits[resource];
}

/** Quick check: is the team's FundRoom activation active? */
export async function isFundroomActive(teamId: string): Promise<boolean> {
  const tier = await resolveTier(teamId);
  return tier.fundroomActive;
}

/** Quick check: has the team exceeded a resource limit? */
export async function isOverLimit(
  teamId: string,
  resource: "documents" | "links" | "users" | "datarooms" | "domains" | "esignatures",
): Promise<boolean> {
  const tier = await resolveTier(teamId);
  const limit = tier.limits[resource];
  if (limit === null) return false; // unlimited
  if (typeof limit === "boolean") return false; // boolean flag, not a count
  return tier.usage[resource] >= limit;
}
