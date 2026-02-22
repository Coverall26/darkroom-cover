"use client";

import { ArrowUpCircle } from "lucide-react";
import Link from "next/link";

interface UpgradeBannerProps {
  feature: string;
  currentTier: string;
  targetTier?: string;
  message?: string;
}

const TIER_LABELS: Record<string, string> = {
  FREE: "Free",
  CRM_PRO: "CRM Pro ($20/mo)",
  FUNDROOM: "FundRoom Pipeline ($79/mo)",
};

const FEATURE_LABELS: Record<string, string> = {
  contacts: "Unlimited contacts",
  kanban: "Kanban board view",
  outreach_queue: "Outreach queue",
  email_tracking: "Email open & click tracking",
  lp_onboarding: "LP onboarding pipeline",
  ai_features: "AI-powered CRM features",
  sequences: "Automated outreach sequences",
  ai_digest: "AI investor digest",
  esig: "E-signature capacity",
  custom_branding: "Custom branding",
  api_access: "API access",
  deal_pipeline: "Deal pipeline",
};

/**
 * Renders a contextual upgrade message with an [Upgrade] button.
 * Used when a feature is gated behind a higher tier.
 */
export function UpgradeBanner({ feature, currentTier, targetTier, message }: UpgradeBannerProps) {
  const featureLabel = FEATURE_LABELS[feature] || feature;
  const tierLabel = targetTier ? TIER_LABELS[targetTier] : null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/50">
      <ArrowUpCircle className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
          {message || `${featureLabel} requires an upgrade`}
        </p>
        {!message && (
          <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">
            {tierLabel
              ? `Available on ${tierLabel} and above.`
              : `Not available on your current plan (${TIER_LABELS[currentTier] || currentTier}).`}
          </p>
        )}
      </div>
      <Link
        href="/admin/settings?tab=billing"
        className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Upgrade
      </Link>
    </div>
  );
}
