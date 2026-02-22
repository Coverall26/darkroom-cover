/**
 * CRM Tier Gate Checks — Limit enforcement utilities.
 *
 * Each function returns { allowed, error?, meta? }.
 * Used by API routes and the withTierCheck middleware.
 */

import prisma from "@/lib/prisma";
import { resolveOrgTier, CrmTierLimits } from "./crm-tier";

export interface GateResult {
  allowed: boolean;
  error?: string;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Contact limit
// ---------------------------------------------------------------------------

/**
 * Check if org can add a new contact (FREE tier: 20 max).
 */
export async function checkContactLimit(orgId: string): Promise<GateResult> {
  const tier = await resolveOrgTier(orgId);
  if (tier.maxContacts === null) {
    return { allowed: true };
  }

  // Count contacts across all teams in this org
  const teams = await prisma.team.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  });
  const teamIds = teams.map((t) => t.id);

  const current = teamIds.length > 0
    ? await prisma.contact.count({ where: { teamId: { in: teamIds } } })
    : 0;

  if (current >= tier.maxContacts) {
    return {
      allowed: false,
      error: "CONTACT_LIMIT_REACHED",
      meta: {
        current,
        limit: tier.maxContacts,
        upgradeUrl: "/admin/settings?tab=billing",
      },
    };
  }

  return { allowed: true, meta: { current, limit: tier.maxContacts } };
}

// ---------------------------------------------------------------------------
// E-signature limit
// ---------------------------------------------------------------------------

/**
 * Get current month key in YYYY-MM format.
 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Check if org has remaining e-signature capacity this month.
 */
export async function checkEsigLimit(orgId: string): Promise<GateResult> {
  const tier = await resolveOrgTier(orgId);
  if (tier.maxEsigsPerMonth === null) {
    return { allowed: true };
  }

  const month = getCurrentMonth();

  // Upsert to ensure record exists for this month
  const usage = await prisma.esigUsage.upsert({
    where: { orgId_month: { orgId, month } },
    create: { orgId, month, signaturesUsed: 0, signersStored: 0 },
    update: {},
    select: { signaturesUsed: true },
  });

  if (usage.signaturesUsed >= tier.maxEsigsPerMonth) {
    return {
      allowed: false,
      error: "ESIG_LIMIT_REACHED",
      meta: {
        used: usage.signaturesUsed,
        limit: tier.maxEsigsPerMonth,
        month,
        upgradeUrl: "/admin/settings?tab=billing",
      },
    };
  }

  return {
    allowed: true,
    meta: { used: usage.signaturesUsed, limit: tier.maxEsigsPerMonth },
  };
}

/**
 * Increment the e-signature usage counter for the current month.
 * Call after a signature is completed.
 */
export async function incrementEsigUsage(orgId: string): Promise<void> {
  const month = getCurrentMonth();
  await prisma.esigUsage.upsert({
    where: { orgId_month: { orgId, month } },
    create: { orgId, month, signaturesUsed: 1, signersStored: 0 },
    update: { signaturesUsed: { increment: 1 } },
  });
}

// ---------------------------------------------------------------------------
// Signer storage limit
// ---------------------------------------------------------------------------

/**
 * Check if org has remaining signer storage capacity.
 */
export async function checkSignerStorage(orgId: string): Promise<GateResult> {
  const tier = await resolveOrgTier(orgId);
  if (tier.maxSignerStorage === null) {
    return { allowed: true };
  }

  // Count distinct signers across the org's teams
  const teams = await prisma.team.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  });
  const teamIds = teams.map((t) => t.id);

  // Count unique signer emails across all signature documents
  const signerCount = teamIds.length > 0
    ? await prisma.signatureRecipient.count({
        where: {
          document: { teamId: { in: teamIds } },
        },
      })
    : 0;

  if (signerCount >= tier.maxSignerStorage) {
    return {
      allowed: false,
      error: "SIGNER_STORAGE_LIMIT_REACHED",
      meta: {
        current: signerCount,
        limit: tier.maxSignerStorage,
        upgradeUrl: "/admin/settings?tab=billing",
      },
    };
  }

  return { allowed: true, meta: { current: signerCount, limit: tier.maxSignerStorage } };
}

// ---------------------------------------------------------------------------
// Feature access
// ---------------------------------------------------------------------------

type FeatureKey =
  | "kanban"
  | "outreach_queue"
  | "email_tracking"
  | "lp_onboarding"
  | "ai_features"
  | "sequences"
  | "ai_digest";

const FEATURE_MAP: Record<FeatureKey, keyof CrmTierLimits> = {
  kanban: "hasKanban",
  outreach_queue: "hasOutreachQueue",
  email_tracking: "hasEmailTracking",
  lp_onboarding: "hasLpOnboarding",
  ai_features: "hasAiFeatures",
  sequences: "hasOutreachQueue",
  ai_digest: "hasAiFeatures",
};

/**
 * Generic feature access check.
 */
export async function checkFeatureAccess(
  orgId: string,
  feature: string,
): Promise<GateResult> {
  const tier = await resolveOrgTier(orgId);
  const mapped = FEATURE_MAP[feature as FeatureKey];

  if (!mapped) {
    return { allowed: true }; // Unknown features default to allowed
  }

  const value = tier[mapped];
  if (typeof value === "boolean" && !value) {
    return {
      allowed: false,
      error: "FEATURE_GATED",
      meta: {
        feature,
        currentTier: tier.tier,
        upgradeUrl: "/admin/settings?tab=billing",
      },
    };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Template limit
// ---------------------------------------------------------------------------

/**
 * Check if org can create more email templates.
 * FREE: 2 (system only: INVITATION + FOLLOW_UP)
 * CRM_PRO/FUNDROOM: 5 (all system)
 * AI_CRM add-on: unlimited + custom
 */
export async function getTemplateLimit(orgId: string): Promise<{
  limit: number | null;
  used: number;
  canCreate: boolean;
}> {
  const tier = await resolveOrgTier(orgId);

  const used = await prisma.emailTemplate.count({
    where: { orgId },
  });

  const limit = tier.emailTemplateLimit;

  return {
    limit,
    used,
    canCreate: limit === null || used < limit,
  };
}
