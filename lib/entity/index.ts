/**
 * Entity module — investor entity type management for FundRoom AI.
 *
 * Handles the 5 entity types (Individual, LLC, Trust, 401k/IRA, Other)
 * with type-specific fields, validation, PO Box checking, and
 * auto-fill helpers for documents and subscription agreements.
 */

export {
  ENTITY_TYPES,
  ENTITY_TYPE_OPTIONS,
  RETIREMENT_ACCOUNT_TYPES,
  TRUST_TYPES,
  ACCREDITATION_METHODS,
} from "./types";

export type {
  EntityType,
  EntityFields,
  EntityCommonFields,
  IndividualFields,
  LLCFields,
  TrustFields,
  RetirementFields,
  OtherFields,
  MailingAddress,
  EntityTypeOption,
} from "./types";

export {
  validateEntityOnboarding,
  validateEntityCompliance,
  validateNotPOBox,
  validateSSN,
  validateEIN,
  validatePhone,
  validateZip,
  maskTaxId,
  getTaxIdLabel,
} from "./validation";

export {
  buildDocumentAutoFill,
  getSignatoryInfo,
} from "./autofill";
