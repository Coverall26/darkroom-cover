/**
 * Entity Type Architecture for FundRoom AI
 *
 * Supports 5 investor entity types with type-specific fields:
 * - INDIVIDUAL: Natural person investing directly
 * - LLC: Limited Liability Company
 * - TRUST: Revocable/Irrevocable Trust
 * - RETIREMENT: 401(k), IRA, Self-Directed IRA
 * - OTHER: Joint accounts, partnerships, etc.
 *
 * Each type has required and optional fields defined by its schema.
 * PO Box validation is enforced on mailing addresses.
 */

export const ENTITY_TYPES = [
  "INDIVIDUAL",
  "LLC",
  "TRUST",
  "RETIREMENT",
  "OTHER",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/** Common fields shared by all entity types */
export interface EntityCommonFields {
  /** Display name (individual name or entity legal name) */
  legalName: string;
  /** Tax identification (SSN for individual, EIN for entity) */
  taxId?: string;
  /** Primary mailing address (PO Box disallowed for SEC filing) */
  mailingAddress?: MailingAddress;
  /** Phone number */
  phone?: string;
  /** Primary contact email (may differ from auth email) */
  contactEmail?: string;
}

export interface MailingAddress {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

/** Individual investor fields */
export interface IndividualFields extends EntityCommonFields {
  entityType: "INDIVIDUAL";
  /** Date of birth (for KYC) */
  dateOfBirth?: string;
  /** Citizenship country */
  citizenship?: string;
  /** SSN (last 4 for display, full encrypted at rest) */
  ssn?: string;
}

/** LLC entity fields */
export interface LLCFields extends EntityCommonFields {
  entityType: "LLC";
  /** State of formation */
  stateOfFormation?: string;
  /** EIN */
  ein?: string;
  /** Managing member / authorized signatory name */
  authorizedSignatory?: string;
  /** Title of signatory (e.g., Managing Member, Manager) */
  signatoryTitle?: string;
  /** Date of formation */
  formationDate?: string;
}

/** Trust entity fields */
export interface TrustFields extends EntityCommonFields {
  entityType: "TRUST";
  /** Trust type: REVOCABLE, IRREVOCABLE, LIVING, TESTAMENTARY */
  trustType?: string;
  /** Trustee name(s) */
  trusteeName?: string;
  /** Date trust was established */
  trustDate?: string;
  /** State governing the trust */
  governingState?: string;
  /** EIN (trusts may have their own) */
  ein?: string;
}

/** Retirement account fields (401k, IRA, Self-Directed IRA) */
export interface RetirementFields extends EntityCommonFields {
  entityType: "RETIREMENT";
  /** Account type: 401K, TRADITIONAL_IRA, ROTH_IRA, SEP_IRA, SELF_DIRECTED_IRA */
  accountType?: string;
  /** Custodian name (e.g., Fidelity, Schwab, Equity Trust) */
  custodianName?: string;
  /** Custodian account number */
  custodianAccountNumber?: string;
  /** Account holder name (if different from investor name) */
  accountHolderName?: string;
  /** EIN of custodian */
  custodianEin?: string;
}

/** Other entity fields (Joint, Partnership, Corporation, etc.) */
export interface OtherFields extends EntityCommonFields {
  entityType: "OTHER";
  /** Specific type description */
  otherTypeDescription?: string;
  /** EIN */
  ein?: string;
  /** Authorized signatory */
  authorizedSignatory?: string;
  /** Title */
  signatoryTitle?: string;
  /** State of formation/registration */
  stateOfFormation?: string;
}

export type EntityFields =
  | IndividualFields
  | LLCFields
  | TrustFields
  | RetirementFields
  | OtherFields;

/** Entity type display metadata */
export interface EntityTypeOption {
  value: EntityType;
  label: string;
  description: string;
  taxIdLabel: string;
  taxIdPlaceholder: string;
}

export const ENTITY_TYPE_OPTIONS: EntityTypeOption[] = [
  {
    value: "INDIVIDUAL",
    label: "Individual",
    description: "Investing as a natural person",
    taxIdLabel: "SSN",
    taxIdPlaceholder: "XXX-XX-XXXX",
  },
  {
    value: "LLC",
    label: "LLC",
    description: "Limited Liability Company",
    taxIdLabel: "EIN",
    taxIdPlaceholder: "XX-XXXXXXX",
  },
  {
    value: "TRUST",
    label: "Trust",
    description: "Revocable or Irrevocable Trust",
    taxIdLabel: "EIN",
    taxIdPlaceholder: "XX-XXXXXXX",
  },
  {
    value: "RETIREMENT",
    label: "401(k) / IRA",
    description: "Retirement or self-directed account",
    taxIdLabel: "EIN",
    taxIdPlaceholder: "XX-XXXXXXX",
  },
  {
    value: "OTHER",
    label: "Other",
    description: "Joint account, partnership, corporation, etc.",
    taxIdLabel: "EIN",
    taxIdPlaceholder: "XX-XXXXXXX",
  },
];

/** Retirement account subtypes */
export const RETIREMENT_ACCOUNT_TYPES = [
  { value: "401K", label: "401(k)" },
  { value: "TRADITIONAL_IRA", label: "Traditional IRA" },
  { value: "ROTH_IRA", label: "Roth IRA" },
  { value: "SEP_IRA", label: "SEP IRA" },
  { value: "SELF_DIRECTED_IRA", label: "Self-Directed IRA" },
] as const;

/** Trust subtypes */
export const TRUST_TYPES = [
  { value: "REVOCABLE", label: "Revocable Trust" },
  { value: "IRREVOCABLE", label: "Irrevocable Trust" },
  { value: "LIVING", label: "Living Trust" },
  { value: "TESTAMENTARY", label: "Testamentary Trust" },
] as const;

/** Accreditation methods for 506(c) compliance */
export const ACCREDITATION_METHODS = [
  {
    value: "INCOME",
    label: "Income",
    description:
      "Income over $200K (individual) or $300K (joint) for last 2 years",
  },
  {
    value: "NET_WORTH",
    label: "Net Worth",
    description: "Net worth over $1M excluding primary residence",
  },
  {
    value: "PROFESSIONAL",
    label: "Professional Certification",
    description: "Series 7, 65, or 82 license holder in good standing",
  },
  {
    value: "ENTITY",
    label: "Qualifying Entity",
    description: "Entity with $5M+ in assets or all equity owners accredited",
  },
  {
    value: "OTHER",
    label: "Other",
    description: "Knowledgeable employee of a private fund, or other criteria",
  },
] as const;
