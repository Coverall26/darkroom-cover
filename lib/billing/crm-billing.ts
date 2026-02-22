/**
 * CRM Billing Utilities — Upgrade, downgrade, and subscription management.
 *
 * Handles the business logic for CRM tier changes:
 *   - Upgrade: FREE → CRM_PRO → FUNDROOM (immediate)
 *   - Downgrade: FUNDROOM → CRM_PRO → FREE (end of period)
 *   - AI CRM add-on: subscribe/cancel independently
 *
 * Usage:
 *   import { handleCrmUpgrade, handleCrmDowngrade, getCrmBillingStatus } from "@/lib/billing/crm-billing";
 */

import prisma from "@/lib/prisma";
import { stripeInstance } from "@/ee/stripe";
import { reportError } from "@/lib/error";
import { invalidateTierCache } from "@/lib/tier/crm-tier";
import {
  CRM_PLANS,
  AI_CRM_ADDON,
  getCrmPriceId,
  isDowngrade,
  type CrmPlanSlug,
} from "@/lib/stripe/crm-products";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrmBillingStatus {
  currentTier: CrmPlanSlug;
  aiCrmEnabled: boolean;
  aiCrmTrialEndsAt: Date | null;
  stripeCustomerId: string | null;
  subscriptionStatus: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  monthlyPrice: number; // Total monthly cost in dollars
}

export interface UpgradeResult {
  success: boolean;
  error?: string;
  checkoutUrl?: string;
  newTier?: string;
}

export interface DowngradeResult {
  success: boolean;
  error?: string;
  effectiveDate?: Date;
}

// ---------------------------------------------------------------------------
// Billing status
// ---------------------------------------------------------------------------

/**
 * Get the complete CRM billing status for an organization.
 */
export async function getCrmBillingStatus(orgId: string): Promise<CrmBillingStatus> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      subscriptionTier: true,
      aiCrmEnabled: true,
      aiCrmTrialEndsAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
    },
  });

  if (!org) {
    throw new Error(`Organization not found: ${orgId}`);
  }

  const tier = (org.subscriptionTier || "FREE") as CrmPlanSlug;
  let currentPeriodEnd: Date | null = null;
  let cancelAtPeriodEnd = false;

  // Fetch subscription details from Stripe if available
  if (org.stripeSubscriptionId && org.stripeCustomerId) {
    try {
      const stripe = stripeInstance();
      const subscription = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
      currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      cancelAtPeriodEnd = subscription.cancel_at_period_end;
    } catch {
      // Stripe error — continue with DB data only
    }
  }

  // Calculate monthly price
  const basePlan = CRM_PLANS[tier];
  let monthlyPrice = basePlan?.monthlyPriceDollars ?? 0;
  if (org.aiCrmEnabled) {
    monthlyPrice += AI_CRM_ADDON.monthlyPriceDollars;
  }

  return {
    currentTier: tier,
    aiCrmEnabled: org.aiCrmEnabled,
    aiCrmTrialEndsAt: org.aiCrmTrialEndsAt,
    stripeCustomerId: org.stripeCustomerId,
    subscriptionStatus: org.subscriptionStatus || "ACTIVE",
    currentPeriodEnd,
    cancelAtPeriodEnd,
    monthlyPrice,
  };
}

// ---------------------------------------------------------------------------
// Upgrade
// ---------------------------------------------------------------------------

/**
 * Handle a CRM plan upgrade via Stripe subscription update.
 *
 * If the org has an existing subscription, this changes the plan immediately
 * with prorated billing. If not, returns a checkout URL.
 */
export async function handleCrmUpgrade(
  orgId: string,
  targetTier: CrmPlanSlug,
  period: "monthly" | "yearly" = "monthly",
): Promise<UpgradeResult> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      subscriptionTier: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  });

  if (!org) {
    return { success: false, error: "Organization not found" };
  }

  const currentTier = (org.subscriptionTier || "FREE") as CrmPlanSlug;

  // Validate upgrade direction
  if (isDowngrade(currentTier, targetTier)) {
    return { success: false, error: "Use handleCrmDowngrade for downgrades." };
  }

  if (currentTier === targetTier) {
    return { success: false, error: "Already on this plan." };
  }

  const newPriceId = getCrmPriceId(targetTier, period);
  if (!newPriceId) {
    return { success: false, error: "Target plan price not configured." };
  }

  // If org has an existing Stripe subscription, update it directly (proration)
  if (org.stripeSubscriptionId && org.stripeCustomerId) {
    try {
      const stripe = stripeInstance();
      const subscription = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
      const itemId = subscription.items.data[0]?.id;

      if (!itemId) {
        return { success: false, error: "No subscription item found." };
      }

      await stripe.subscriptions.update(org.stripeSubscriptionId, {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: "create_prorations",
        metadata: {
          orgId,
          system: "crm",
          plan: targetTier,
        },
      });

      // Update DB immediately (webhook will also fire, but this gives instant feedback)
      await prisma.organization.update({
        where: { id: orgId },
        data: {
          subscriptionTier: targetTier,
          subscriptionStatus: "ACTIVE",
        },
      });

      invalidateTierCache(orgId);

      return { success: true, newTier: targetTier };
    } catch (error) {
      reportError(error as Error);
      return { success: false, error: "Failed to update subscription." };
    }
  }

  // No existing subscription — need checkout
  return {
    success: false,
    error: "No existing subscription. Use checkout endpoint instead.",
  };
}

// ---------------------------------------------------------------------------
// Downgrade
// ---------------------------------------------------------------------------

/**
 * Handle a CRM plan downgrade.
 *
 * Downgrades take effect at the end of the current billing period.
 * FREE downgrade cancels the subscription entirely.
 */
export async function handleCrmDowngrade(
  orgId: string,
  targetTier: CrmPlanSlug,
  period: "monthly" | "yearly" = "monthly",
): Promise<DowngradeResult> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      subscriptionTier: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeAiSubscriptionId: true,
    },
  });

  if (!org) {
    return { success: false, error: "Organization not found" };
  }

  const currentTier = (org.subscriptionTier || "FREE") as CrmPlanSlug;

  if (!isDowngrade(currentTier, targetTier)) {
    return { success: false, error: "This is not a downgrade." };
  }

  if (!org.stripeSubscriptionId) {
    // Already effectively on free — just update DB
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        subscriptionTier: "FREE",
        subscriptionStatus: "ACTIVE",
      },
    });
    invalidateTierCache(orgId);
    return { success: true };
  }

  const stripe = stripeInstance();

  try {
    if (targetTier === "FREE") {
      // Cancel the subscription at period end
      const subscription = await stripe.subscriptions.update(org.stripeSubscriptionId, {
        cancel_at_period_end: true,
        cancellation_details: {
          comment: "User downgraded to Free plan.",
        },
      });

      // Also cancel AI add-on if active
      if (org.stripeAiSubscriptionId) {
        await stripe.subscriptions.update(org.stripeAiSubscriptionId, {
          cancel_at_period_end: true,
          cancellation_details: {
            comment: "Base plan cancelled — AI add-on also cancelled.",
          },
        }).catch((e) => reportError(e as Error));
      }

      const effectiveDate = new Date(subscription.current_period_end * 1000);
      return { success: true, effectiveDate };
    } else {
      // Downgrade to a lower paid tier (e.g., FUNDROOM → CRM_PRO)
      const newPriceId = getCrmPriceId(targetTier, period);
      if (!newPriceId) {
        return { success: false, error: "Target plan price not configured." };
      }

      const subscription = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
      const itemId = subscription.items.data[0]?.id;

      if (!itemId) {
        return { success: false, error: "No subscription item found." };
      }

      // Schedule the downgrade for end of period (no proration credit)
      await stripe.subscriptions.update(org.stripeSubscriptionId, {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: "none",
        metadata: {
          orgId,
          system: "crm",
          plan: targetTier,
          scheduledDowngrade: "true",
        },
      });

      const effectiveDate = new Date(subscription.current_period_end * 1000);
      return { success: true, effectiveDate };
    }
  } catch (error) {
    reportError(error as Error);
    return { success: false, error: "Failed to process downgrade." };
  }
}

// ---------------------------------------------------------------------------
// Reactivation
// ---------------------------------------------------------------------------

/**
 * Reactivate a cancelled CRM subscription before the period ends.
 */
export async function reactivateCrmSubscription(orgId: string): Promise<{ success: boolean; error?: string }> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { stripeSubscriptionId: true },
  });

  if (!org?.stripeSubscriptionId) {
    return { success: false, error: "No subscription to reactivate." };
  }

  try {
    const stripe = stripeInstance();
    await stripe.subscriptions.update(org.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    await prisma.organization.update({
      where: { id: orgId },
      data: { subscriptionStatus: "ACTIVE" },
    });

    invalidateTierCache(orgId);
    return { success: true };
  } catch (error) {
    reportError(error as Error);
    return { success: false, error: "Failed to reactivate subscription." };
  }
}
