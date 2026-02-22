/**
 * useTier — SWR hook for CRM tier limits and usage.
 *
 * Calls GET /api/tier to fetch the current org's tier, limits, and usage.
 * Used by CRM components to conditionally render features.
 *
 * Usage:
 *   const { tier, limits, usage, isLoading } = useTier();
 *   if (tier === 'FREE' && !limits.hasKanban) { ... }
 */

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export interface TierUsageData {
  contactCount: number;
  contactLimit: number | null;
  esigUsedThisMonth: number;
  esigLimit: number | null;
  signerCount: number;
  signerLimit: number | null;
  pendingContactCount: number;
}

export interface TierLimitsData {
  tier: string;
  aiCrmEnabled: boolean;
  maxContacts: number | null;
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

export interface TierData {
  tier: string;
  aiCrmEnabled: boolean;
  productMode: string;
  limits: TierLimitsData;
  usage: TierUsageData;
}

export function useTier() {
  const { data, error, isLoading, mutate } = useSWR<TierData>(
    "/api/tier",
    fetcher,
    {
      revalidateOnFocus: false,
      refreshInterval: 60_000, // Refresh every 60 seconds
      dedupingInterval: 30_000,
    },
  );

  return {
    tier: data?.tier ?? "FREE",
    aiCrmEnabled: data?.aiCrmEnabled ?? false,
    productMode: data?.productMode ?? "GP_FUND",
    limits: data?.limits ?? null,
    usage: data?.usage ?? null,
    isLoading,
    error,
    mutate,
  };
}
