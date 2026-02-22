/**
 * Zod validation schemas for LP Onboarding Step 4 — Investor Entity Architecture.
 *
 * Each entity type has its own schema. The discriminated union validates
 * based on the selected entityType.
 */

import { z } from "zod";

// --- Address Schema ---

const PO_BOX_PATTERN =
  /\b(p\.?\s*o\.?\s*box|post\s+office\s+box|pmb\s+\d+|hc\s+\d+|general\s+delivery|box\s+\d+)\b/i;

function notPOBox(val: string | undefined) {
  if (!val) return true;
  return !PO_BOX_PATTERN.test(val);
}

export const addressSchema = z.object({
  street1: z
    .string()
    .min(1, "Street address is required")
    .refine(notPOBox, "A physical street address is required for regulatory compliance."),
  street2: z
    .string()
    .optional()
    .refine(notPOBox, "A physical street address is required for regulatory compliance."),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: z
    .string()
    .min(1, "ZIP code is required")
    .regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code format"),
  country: z.string().min(1, "Country is required").default("US"),
});

export type AddressData = z.infer<typeof addressSchema>;

// --- SSN / EIN format validators ---

const ssnPattern = /^\d{3}-?\d{2}-?\d{4}$/;
const einPattern = /^\d{2}-?\d{7}$/;

// --- Individual Schema ---

export const individualSchema = z.object({
  entityType: z.literal("INDIVIDUAL"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  ssn: z
    .string()
    .optional()
    .refine(
      (val) => !val || ssnPattern.test(val.replace(/\s/g, "")),
      "Invalid SSN format (XXX-XX-XXXX)"
    ),
  dateOfBirth: z.string().optional(),
  address: addressSchema,
  useMailingAddress: z.boolean().default(false),
  mailingAddress: addressSchema.optional(),
  phone: z.string().optional(),
});

// --- LLC Schema ---

export const llcSchema = z.object({
  entityType: z.literal("LLC"),
  legalName: z.string().min(1, "LLC legal name is required"),
  ein: z
    .string()
    .optional()
    .refine(
      (val) => !val || einPattern.test(val.replace(/\s/g, "")),
      "Invalid EIN format (XX-XXXXXXX)"
    ),
  stateOfFormation: z.string().optional(),
  dateOfFormation: z.string().optional(),
  countryOfFormation: z.string().default("US"),
  taxClassification: z
    .enum([
      "DISREGARDED_ENTITY",
      "PARTNERSHIP",
      "S_CORPORATION",
      "C_CORPORATION",
    ])
    .optional(),
  address: addressSchema,
  signatoryName: z.string().min(1, "Authorized signer name is required"),
  signatoryTitle: z.string().min(1, "Signer title is required"),
  signatoryEmail: z.string().email("Valid email required"),
  signatoryPhone: z.string().optional(),
  signatoryIsAccountHolder: z.boolean().default(false),
});

// --- Trust Schema ---

export const trustSchema = z.object({
  entityType: z.literal("TRUST"),
  legalName: z.string().min(1, "Trust legal name is required"),
  trustType: z
    .enum([
      "REVOCABLE_LIVING",
      "IRREVOCABLE",
      "FAMILY",
      "CHARITABLE",
      "OTHER",
    ])
    .optional(),
  // Revocable → SSN (grantor SSN), Irrevocable → EIN
  taxId: z.string().optional(),
  dateEstablished: z.string().optional(),
  governingState: z.string().optional(),
  address: addressSchema,
  trusteeName: z.string().min(1, "Trustee name is required"),
  trusteeTitle: z.string().default("Trustee"),
  trusteeEmail: z.string().email("Valid email required"),
  trusteePhone: z.string().optional(),
});

// --- 401k / IRA Schema ---

export const retirementSchema = z.object({
  entityType: z.literal("RETIREMENT"),
  accountType: z.enum([
    "TRADITIONAL_IRA",
    "ROTH_IRA",
    "SOLO_401K",
    "SEP_IRA",
    "SIMPLE_IRA",
  ]),
  accountTitle: z.string().min(1, "Account title is required"),
  // Custodian info
  custodianName: z.string().min(1, "Custodian name is required"),
  custodianAccountNumber: z.string().min(1, "Account number is required"),
  custodianEin: z
    .string()
    .optional()
    .refine(
      (val) => !val || einPattern.test(val.replace(/\s/g, "")),
      "Invalid EIN format (XX-XXXXXXX)"
    ),
  custodianAddress: addressSchema.optional(),
  custodianContactName: z.string().optional(),
  custodianContactPhone: z.string().optional(),
  custodianContactEmail: z.string().email().optional().or(z.literal("")),
  // Account holder info
  accountHolderName: z.string().min(1, "Account holder name is required"),
  accountHolderSsn: z
    .string()
    .optional()
    .refine(
      (val) => !val || ssnPattern.test(val.replace(/\s/g, "")),
      "Invalid SSN format (XXX-XX-XXXX)"
    ),
  accountHolderDob: z.string().optional(),
  accountHolderPhone: z.string().optional(),
  accountHolderEmail: z.string().email().optional().or(z.literal("")),
  custodianCoSignRequired: z.boolean().default(true),
});

// --- Other Entity Schema ---

export const otherEntitySchema = z.object({
  entityType: z.literal("OTHER"),
  legalName: z.string().min(1, "Entity legal name is required"),
  otherEntityType: z
    .enum([
      "CORPORATION",
      "LIMITED_PARTNERSHIP",
      "GENERAL_PARTNERSHIP",
      "S_CORPORATION",
      "NON_PROFIT",
      "FOREIGN_ENTITY",
      "OTHER",
    ])
    .optional(),
  ein: z
    .string()
    .optional()
    .refine(
      (val) => !val || einPattern.test(val.replace(/\s/g, "")),
      "Invalid EIN format (XX-XXXXXXX)"
    ),
  stateOfFormation: z.string().optional(),
  countryOfFormation: z.string().default("US"),
  dateOfFormation: z.string().optional(),
  taxClassification: z
    .enum([
      "DISREGARDED_ENTITY",
      "PARTNERSHIP",
      "S_CORPORATION",
      "C_CORPORATION",
    ])
    .optional(),
  address: addressSchema,
  signatoryName: z.string().min(1, "Authorized signer name is required"),
  signatoryTitle: z.string().min(1, "Signer title is required"),
  signatoryEmail: z.string().email("Valid email required"),
  signatoryPhone: z.string().optional(),
});

// --- Discriminated Union ---

export const investorEntitySchema = z.discriminatedUnion("entityType", [
  individualSchema,
  llcSchema,
  trustSchema,
  retirementSchema,
  otherEntitySchema,
]);

export type InvestorEntityData = z.infer<typeof investorEntitySchema>;
export type IndividualData = z.infer<typeof individualSchema>;
export type LLCData = z.infer<typeof llcSchema>;
export type TrustData = z.infer<typeof trustSchema>;
export type RetirementData = z.infer<typeof retirementSchema>;
export type OtherEntityData = z.infer<typeof otherEntitySchema>;

// --- Tax Classification Display Labels ---

export const TAX_CLASSIFICATIONS = [
  { value: "DISREGARDED_ENTITY", label: "Disregarded Entity" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "S_CORPORATION", label: "S-Corporation" },
  { value: "C_CORPORATION", label: "C-Corporation" },
] as const;

export const OTHER_ENTITY_TYPES = [
  { value: "CORPORATION", label: "Corporation" },
  { value: "LIMITED_PARTNERSHIP", label: "Limited Partnership" },
  { value: "GENERAL_PARTNERSHIP", label: "General Partnership" },
  { value: "S_CORPORATION", label: "S-Corporation" },
  { value: "NON_PROFIT", label: "Non-Profit" },
  { value: "FOREIGN_ENTITY", label: "Foreign Entity" },
  { value: "OTHER", label: "Other" },
] as const;

export const RETIREMENT_ACCOUNT_TYPES = [
  { value: "TRADITIONAL_IRA", label: "Traditional IRA" },
  { value: "ROTH_IRA", label: "Roth IRA" },
  { value: "SOLO_401K", label: "Solo 401(k)" },
  { value: "SEP_IRA", label: "SEP IRA" },
  { value: "SIMPLE_IRA", label: "SIMPLE IRA" },
] as const;

export const TRUST_TYPES = [
  { value: "REVOCABLE_LIVING", label: "Revocable Living Trust" },
  { value: "IRREVOCABLE", label: "Irrevocable Trust" },
  { value: "FAMILY", label: "Family Trust" },
  { value: "CHARITABLE", label: "Charitable Trust" },
  { value: "OTHER", label: "Other" },
] as const;
