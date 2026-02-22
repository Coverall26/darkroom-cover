/**
 * Barrel export for LP Onboarding step components.
 *
 * Steps are lazy-loaded via React.lazy() in page-client.tsx.
 * This file re-exports types and validation helpers that are
 * needed synchronously by the parent component.
 */

// Types
export type {
  FormData,
  FundContext,
  TrancheData,
  UpdateFieldFn,
  BaseStepProps,
} from "./types";

// Constants
export {
  INVESTOR_REPRESENTATIONS,
  US_STATES,
} from "./types";

// Validation helpers (used by parent for button disabled states)
export { canProceedStep1 } from "./PersonalInfoStep";
export { canProceedStep4 } from "./AccreditationStep";
export { canProceedStep5 } from "./NDAStep";
