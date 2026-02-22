/**
 * CRM Tier Resolution — Organization-level subscription tier for CRM features.
 *
 * Four-tier model:
 *   FREE:     20 contacts, 10 e-sigs/mo, 40 signers, table view, 2 templates
 *   CRM_PRO:  Unlimited contacts, 25 e-sigs/mo, 100 signers, Kanban, 5 templates
 *   FUNDROOM: Unlimited everything, compliance pipeline, LP onboarding
 *   AI_CRM:   +$49/mo add-on — AI drafts, sequences, digest (stacks on paid tiers)
 *
 * Usage:
 *   const tier = await resolveOrgTier(orgId);
 *   if (tier.maxContacts !== null && usage >= tier.maxContacts) { ... }
 */

import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CrmSubscriptionTier = "FREE" | "CRM_PRO" | "FUNDROOM";

export interface CrmTierLimits {
  tier: CrmSubscriptionTier;
  aiCrmEnabled: boolean;
  maxContacts: number | null; // null = unlimited
  maxEsigsPerMonth: number | null;
  maxSignerStorage: number | null;
  emailTemplateLimit: number | null;
  hasKanban: boolean;
  hasOutreachQueue: boolean;
  hasEmailTracking: boolean;
  hasLpOnboarding: boolean;
  hasAiFeatures: boolean;
  pipelineStages: string[];
}

// ---------------------------------------------------------------------------
// Tier configuration
// ---------------------------------------------------------------------------

const TIER_CONFIGS: Record<CrmSubscriptionTier, Omit<CrmTierLimits, "tier" | "aiCrmEnabled">> = {
  FREE: {
    maxContacts: 20,
    maxEsigsPerMonth: 10,
    maxSignerStorage: 40,
    emailTemplateLimit: 2,
    hasKanban: false,
    hasOutreachQueue: false,
    hasEmailTracking: false,
    hasLpOnboarding: false,
    hasAiFeatures: false,
    pipelineStages: ["LEAD", "CONTACTED", "INTERESTED", "CONVERTED"],
  },
  CRM_PRO: {
    maxContacts: null,
    maxEsigsPerMonth: 25,
    maxSignerStorage: 100,
    emailTemplateLimit: 5,
    hasKanban: true,
    hasOutreachQueue: true,
    hasEmailTracking: true,
    hasLpOnboarding: false,
    hasAiFeatures: false,
    pipelineStages: ["LEAD", "CONTACTED", "INTERESTED", "CONVERTED"],
  },
  FUNDROOM: {
    maxContacts: null,
    maxEsigsPerMonth: null,
    maxSignerStorage: null,
    emailTemplateLimit: 5,
    hasKanban: true,
    hasOutreachQueue: true,
    hasEmailTracking: true,
    hasLpOnboarding: true,
    hasAiFeatures: false,
    pipelineStages: ["LEAD", "NDA_SIGNED", "ACCREDITED", "COMMITTED", "FUNDED"],
  },
};

// ---------------------------------------------------------------------------
// In-memory cache (60s TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
  limits: CrmTierLimits;
  expiry: number;
}

const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

/**
 * Invalidate the tier cache for a specific org, or all orgs.
 * Call after subscription changes.
 */
export function invalidateTierCache(orgId?: string): void {
  if (orgId) {
    _cache.delete(orgId);
  } else {
    _cache.clear();
  }
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the CRM tier limits for an organization.
 * Reads Organization.subscriptionTier and Organization.aiCrmEnabled.
 * Cached for 60 seconds.
 */
export async function resolveOrgTier(orgId: string): Promise<CrmTierLimits> {
  const now = Date.now();
  const cached = _cache.get(orgId);
  if (cached && now < cached.expiry) {
    return cached.limits;
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      subscriptionTier: true,
      aiCrmEnabled: true,
      aiCrmTrialEndsAt: true,
      subscriptionStatus: true,
    },
  });

  if (!org) {
    throw new Error(`Organization not found: ${orgId}`);
  }

  const tier = (org.subscriptionTier || "FREE") as CrmSubscriptionTier;
  const config = TIER_CONFIGS[tier] || TIER_CONFIGS.FREE;

  // Check AI CRM trial expiry
  let aiEnabled = org.aiCrmEnabled;
  if (aiEnabled && org.aiCrmTrialEndsAt) {
    if (new Date(org.aiCrmTrialEndsAt) < new Date()) {
      aiEnabled = false; // Trial expired
    }
  }

  // If subscription is past due for 7+ days, treat as FREE for feature access
  const effectiveConfig =
    org.subscriptionStatus === "PAST_DUE" ? TIER_CONFIGS.FREE : config;

  const limits: CrmTierLimits = {
    tier,
    aiCrmEnabled: aiEnabled,
    ...effectiveConfig,
    // AI CRM overrides
    hasAiFeatures: aiEnabled,
    emailTemplateLimit: aiEnabled ? null : effectiveConfig.emailTemplateLimit,
    hasOutreachQueue: aiEnabled || effectiveConfig.hasOutreachQueue,
  };

  _cache.set(orgId, { limits, expiry: now + CACHE_TTL_MS });
  return limits;
}
