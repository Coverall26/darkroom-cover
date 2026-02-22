"use client";

import { ReactNode } from "react";
import { useTier } from "@/lib/hooks/use-tier";
import { UpgradeBanner } from "./UpgradeBanner";

interface FeatureGateProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on whether the current org's tier
 * allows the specified feature. Shows an UpgradeBanner if the feature is gated.
 *
 * Usage:
 *   <FeatureGate feature="kanban">
 *     <KanbanBoard />
 *   </FeatureGate>
 */
export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { tier, limits, isLoading } = useTier();

  if (isLoading) {
    return null; // Don't flash content while loading
  }

  // Check feature access based on tier limits
  const featureAllowed = checkFeature(feature, limits);

  if (featureAllowed) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <UpgradeBanner
      feature={feature}
      currentTier={tier}
      targetTier={getTargetTier(feature)}
    />
  );
}

function checkFeature(
  feature: string,
  limits: { hasKanban?: boolean; hasOutreachQueue?: boolean; hasEmailTracking?: boolean; hasLpOnboarding?: boolean; hasAiFeatures?: boolean } | null,
): boolean {
  if (!limits) return false;

  switch (feature) {
    case "kanban":
      return limits.hasKanban ?? false;
    case "outreach_queue":
    case "sequences":
      return limits.hasOutreachQueue ?? false;
    case "email_tracking":
      return limits.hasEmailTracking ?? false;
    case "lp_onboarding":
      return limits.hasLpOnboarding ?? false;
    case "ai_features":
    case "ai_digest":
      return limits.hasAiFeatures ?? false;
    default:
      return true; // Unknown features default to allowed
  }
}

function getTargetTier(feature: string): string {
  switch (feature) {
    case "kanban":
    case "outreach_queue":
    case "email_tracking":
    case "sequences":
      return "CRM_PRO";
    case "lp_onboarding":
      return "FUNDROOM";
    case "ai_features":
    case "ai_digest":
      return "CRM_PRO"; // AI is an add-on, suggest CRM_PRO as base
    default:
      return "CRM_PRO";
  }
}
