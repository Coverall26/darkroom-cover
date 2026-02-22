/**
 * CRM Stripe Product & Price Configuration
 *
 * Three-tier CRM subscription model:
 *   FREE:     $0/mo — 20 contacts, 10 e-sigs/mo, 40 signers, table view, 2 templates
 *   CRM_PRO:  $20/mo — Unlimited contacts, 25 e-sigs/mo, 100 signers, Kanban, 5 templates
 *   FUNDROOM: $79/mo — Unlimited everything, compliance pipeline, LP onboarding
 *
 * Plus optional AI CRM add-on:
 *   AI_CRM:   +$49/mo — AI drafts, sequences, digest (stacks on paid tiers)
 *
 * These are SEPARATE from the existing SaaS billing plans (ee/stripe/constants.ts),
 * which are Team-scoped. CRM billing is Organization-scoped.
 *
 * Usage:
 *   import { CRM_PLANS, getCrmPriceId, getCrmPlanFromPriceId } from "@/lib/stripe/crm-products";
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CrmPlanSlug = "FREE" | "CRM_PRO" | "FUNDROOM";

export interface CrmPlanPrice {
  monthly: {
    amount: number; // USD cents
    priceId: string; // Stripe Price ID (set via env or setup script)
  };
  yearly: {
    amount: number; // USD cents
    priceId: string;
  };
}

export interface CrmPlan {
  name: string;
  slug: CrmPlanSlug;
  description: string;
  monthlyPriceDollars: number; // Display price in whole dollars
  yearlyPriceDollars: number; // Per-month when billed yearly
  price: CrmPlanPrice;
  features: string[];
}

export interface CrmAddonConfig {
  name: string;
  slug: string;
  description: string;
  monthlyPriceDollars: number;
  yearlyPriceDollars: number;
  price: CrmPlanPrice;
  trialDays: number;
  features: string[];
}

// ---------------------------------------------------------------------------
// Environment-based Price ID resolution
// ---------------------------------------------------------------------------

const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

/**
 * CRM Price IDs — set via environment variables or Stripe setup script.
 * Placeholder values are used until real Stripe products are created.
 */
const CRM_PRICE_IDS = {
  CRM_PRO: {
    monthly: isProduction
      ? (process.env.STRIPE_CRM_PRO_MONTHLY_PRICE_ID ?? "price_crm_pro_monthly_prod")
      : (process.env.STRIPE_CRM_PRO_MONTHLY_PRICE_ID ?? "price_crm_pro_monthly_test"),
    yearly: isProduction
      ? (process.env.STRIPE_CRM_PRO_YEARLY_PRICE_ID ?? "price_crm_pro_yearly_prod")
      : (process.env.STRIPE_CRM_PRO_YEARLY_PRICE_ID ?? "price_crm_pro_yearly_test"),
  },
  FUNDROOM: {
    monthly: isProduction
      ? (process.env.STRIPE_FUNDROOM_MONTHLY_PRICE_ID ?? "price_fundroom_monthly_prod")
      : (process.env.STRIPE_FUNDROOM_MONTHLY_PRICE_ID ?? "price_fundroom_monthly_test"),
    yearly: isProduction
      ? (process.env.STRIPE_FUNDROOM_YEARLY_PRICE_ID ?? "price_fundroom_yearly_prod")
      : (process.env.STRIPE_FUNDROOM_YEARLY_PRICE_ID ?? "price_fundroom_yearly_test"),
  },
  AI_CRM: {
    monthly: isProduction
      ? (process.env.STRIPE_AI_CRM_MONTHLY_PRICE_ID ?? "price_ai_crm_monthly_prod")
      : (process.env.STRIPE_AI_CRM_MONTHLY_PRICE_ID ?? "price_ai_crm_monthly_test"),
    yearly: isProduction
      ? (process.env.STRIPE_AI_CRM_YEARLY_PRICE_ID ?? "price_ai_crm_yearly_prod")
      : (process.env.STRIPE_AI_CRM_YEARLY_PRICE_ID ?? "price_ai_crm_yearly_test"),
  },
};

// ---------------------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------------------

export const CRM_PLANS: Record<CrmPlanSlug, CrmPlan> = {
  FREE: {
    name: "Free",
    slug: "FREE",
    description: "Get started with basic CRM features",
    monthlyPriceDollars: 0,
    yearlyPriceDollars: 0,
    price: {
      monthly: { amount: 0, priceId: "" },
      yearly: { amount: 0, priceId: "" },
    },
    features: [
      "Up to 20 contacts",
      "10 e-signatures per month",
      "40 signer storage",
      "Table view",
      "2 email templates",
      "Basic pipeline (Lead → Contacted → Interested → Converted)",
    ],
  },
  CRM_PRO: {
    name: "CRM Pro",
    slug: "CRM_PRO",
    description: "Full CRM with Kanban, outreach, and analytics",
    monthlyPriceDollars: 20,
    yearlyPriceDollars: 16,
    price: {
      monthly: { amount: 2000, priceId: CRM_PRICE_IDS.CRM_PRO.monthly },
      yearly: { amount: 1600, priceId: CRM_PRICE_IDS.CRM_PRO.yearly },
    },
    features: [
      "Unlimited contacts",
      "25 e-signatures per month",
      "100 signer storage",
      "Kanban board",
      "5 email templates",
      "Outreach queue",
      "Email tracking & analytics",
      "Advanced pipeline stages",
    ],
  },
  FUNDROOM: {
    name: "FundRoom",
    slug: "FUNDROOM",
    description: "Complete fund operations with compliance pipeline",
    monthlyPriceDollars: 79,
    yearlyPriceDollars: 63,
    price: {
      monthly: { amount: 7900, priceId: CRM_PRICE_IDS.FUNDROOM.monthly },
      yearly: { amount: 6300, priceId: CRM_PRICE_IDS.FUNDROOM.yearly },
    },
    features: [
      "Everything in CRM Pro",
      "Unlimited e-signatures",
      "Unlimited signer storage",
      "LP onboarding wizard",
      "Compliance pipeline (Lead → NDA → Accredited → Committed → Funded)",
      "Unlimited email templates",
      "Fund-specific analytics",
    ],
  },
};

export const AI_CRM_ADDON: CrmAddonConfig = {
  name: "AI CRM",
  slug: "AI_CRM",
  description: "AI-powered drafts, sequences, and investor digest",
  monthlyPriceDollars: 49,
  yearlyPriceDollars: 39,
  price: {
    monthly: { amount: 4900, priceId: CRM_PRICE_IDS.AI_CRM.monthly },
    yearly: { amount: 3900, priceId: CRM_PRICE_IDS.AI_CRM.yearly },
  },
  trialDays: 14,
  features: [
    "AI email drafts",
    "AI outreach sequences",
    "Weekly investor digest",
    "Contact enrichment",
    "Unlimited email templates",
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All CRM price IDs for reverse lookup */
const ALL_CRM_PRICE_IDS: Record<string, { slug: string; period: "monthly" | "yearly" }> = {};

// Build reverse lookup from CRM_PRO and FUNDROOM plans
for (const plan of [CRM_PLANS.CRM_PRO, CRM_PLANS.FUNDROOM]) {
  if (plan.price.monthly.priceId) {
    ALL_CRM_PRICE_IDS[plan.price.monthly.priceId] = { slug: plan.slug, period: "monthly" };
  }
  if (plan.price.yearly.priceId) {
    ALL_CRM_PRICE_IDS[plan.price.yearly.priceId] = { slug: plan.slug, period: "yearly" };
  }
}
// AI add-on
if (AI_CRM_ADDON.price.monthly.priceId) {
  ALL_CRM_PRICE_IDS[AI_CRM_ADDON.price.monthly.priceId] = { slug: "AI_CRM", period: "monthly" };
}
if (AI_CRM_ADDON.price.yearly.priceId) {
  ALL_CRM_PRICE_IDS[AI_CRM_ADDON.price.yearly.priceId] = { slug: "AI_CRM", period: "yearly" };
}

/**
 * Get the Stripe Price ID for a CRM plan and billing period.
 */
export function getCrmPriceId(
  slug: CrmPlanSlug | "AI_CRM",
  period: "monthly" | "yearly",
): string | null {
  if (slug === "FREE") return null;
  if (slug === "AI_CRM") return AI_CRM_ADDON.price[period].priceId || null;

  const plan = CRM_PLANS[slug];
  if (!plan) return null;
  return plan.price[period].priceId || null;
}

/**
 * Reverse-lookup: given a Stripe Price ID, return the CRM plan slug and period.
 */
export function getCrmPlanFromPriceId(
  priceId: string,
): { slug: string; period: "monthly" | "yearly" } | null {
  return ALL_CRM_PRICE_IDS[priceId] ?? null;
}

/**
 * Check if a given price ID belongs to the CRM billing system (vs SaaS billing).
 */
export function isCrmPriceId(priceId: string): boolean {
  return priceId in ALL_CRM_PRICE_IDS;
}

/**
 * Determine the upgrade path from current tier.
 */
export function getUpgradePath(currentTier: CrmPlanSlug): CrmPlanSlug | null {
  switch (currentTier) {
    case "FREE":
      return "CRM_PRO";
    case "CRM_PRO":
      return "FUNDROOM";
    case "FUNDROOM":
      return null; // Already at top tier
    default:
      return "CRM_PRO";
  }
}

/**
 * Check if a tier change is a downgrade.
 */
export function isDowngrade(from: CrmPlanSlug, to: CrmPlanSlug): boolean {
  const tierOrder: Record<CrmPlanSlug, number> = {
    FREE: 0,
    CRM_PRO: 1,
    FUNDROOM: 2,
  };
  return tierOrder[to] < tierOrder[from];
}
