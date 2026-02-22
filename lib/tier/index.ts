/**
 * TierResolver barrel export.
 *
 * Usage:
 *   import { resolveTier, canAccess, isOverLimit } from "@/lib/tier";
 */
export {
  resolveTier,
  canAccess,
  getLimit,
  isFundroomActive,
  isOverLimit,
  clearTierCache,
} from "./resolver";

export type {
  ResolvedTier,
  TierCapabilities,
  TierLimits,
  TierUsage,
  PlanSlug,
  ActivationStatus,
  SubscriptionStatus,
} from "./resolver";
