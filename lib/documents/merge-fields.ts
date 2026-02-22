/**
 * Document Template Merge Field Engine
 *
 * Replaces {{tag}} placeholders in document templates with actual investor,
 * fund, and organization data. Used during LP signing flow.
 *
 * Merge fields are defined per document type and resolved from:
 * - Investor profile (entity data, signatory info, address)
 * - Fund record (name, target size, economics)
 * - Organization record (GP entity name, address)
 * - Investment record (commitment amount, units)
 * - Wire instructions (bank, account, routing)
 */

import type { DocumentAutoFill } from "@/lib/entity/autofill";

export interface MergeFieldData {
  /** Investor/entity legal name */
  investorName?: string;
  /** Entity legal name (for non-individuals) */
  investorEntity?: string;
  /** Investment commitment amount (formatted currency) */
  investmentAmount?: string;
  /** Fund legal name */
  fundName?: string;
  /** GP firm/organization name */
  gpEntity?: string;
  /** Current date (formatted) */
  date?: string;
  /** Number of commitment units */
  commitmentUnits?: string;
  /** Signatory name (person signing) */
  signatoryName?: string;
  /** Signatory title (for entity types) */
  signatoryTitle?: string;
  /** Formatted mailing address */
  address?: string;
  /** Entity type description */
  entityType?: string;
  /** Tax ID (masked for display) */
  taxId?: string;
  /** Email address */
  email?: string;
  /** Wire transfer bank name */
  wireBank?: string;
  /** Wire transfer account name */
  wireAccount?: string;
  /** Wire transfer routing number */
  wireRouting?: string;
  /** Management fee percentage (formatted, e.g. "2.0%") */
  managementFee?: string;
  /** Carried interest percentage (formatted, e.g. "20%") */
  carriedInterest?: string;
  /** Fund term in years (e.g. "10 years") */
  fundTerm?: string;
  /** Effective date (for agreements) */
  effectiveDate?: string;
  /** Organization legal name */
  orgName?: string;
  /** Organization mailing address */
  orgAddress?: string;
  /** Investor mailing address (structured) */
  investorAddress?: string;
}

/** All supported merge field tags */
export const MERGE_FIELD_TAGS = [
  "{{investor_name}}",
  "{{investor_entity}}",
  "{{investment_amount}}",
  "{{fund_name}}",
  "{{gp_entity}}",
  "{{date}}",
  "{{commitment_units}}",
  "{{signatory_name}}",
  "{{signatory_title}}",
  "{{address}}",
  "{{entity_type}}",
  "{{tax_id}}",
  "{{email}}",
  "{{wire_bank}}",
  "{{wire_account}}",
  "{{wire_routing}}",
  "{{management_fee}}",
  "{{carried_interest}}",
  "{{fund_term}}",
  "{{effective_date}}",
  "{{org_name}}",
  "{{org_address}}",
  "{{investor_address}}",
] as const;

/** Merge fields required per document type */
export const MERGE_FIELDS_BY_DOC_TYPE: Record<string, string[]> = {
  NDA: ["{{investor_name}}", "{{investor_entity}}", "{{fund_name}}", "{{gp_entity}}", "{{date}}", "{{signatory_title}}"],
  LPA: ["{{investor_name}}", "{{investor_entity}}", "{{investment_amount}}", "{{fund_name}}", "{{gp_entity}}", "{{date}}", "{{commitment_units}}", "{{management_fee}}", "{{carried_interest}}", "{{fund_term}}"],
  SUBSCRIPTION: ["{{investor_name}}", "{{investor_entity}}", "{{investment_amount}}", "{{fund_name}}", "{{gp_entity}}", "{{date}}", "{{commitment_units}}", "{{wire_bank}}", "{{wire_account}}", "{{wire_routing}}", "{{entity_type}}", "{{email}}", "{{address}}", "{{tax_id}}", "{{signatory_title}}"],
  PPM: ["{{fund_name}}", "{{gp_entity}}", "{{date}}", "{{management_fee}}", "{{carried_interest}}", "{{fund_term}}"],
  SIDE_LETTER: ["{{investor_name}}", "{{investor_entity}}", "{{fund_name}}", "{{gp_entity}}", "{{date}}"],
  INVESTOR_QUESTIONNAIRE: ["{{investor_name}}", "{{investor_entity}}", "{{date}}"],
  SAFE: ["{{investor_name}}", "{{investor_entity}}", "{{investment_amount}}", "{{fund_name}}", "{{gp_entity}}", "{{date}}"],
  CONVERTIBLE_NOTE: ["{{investor_name}}", "{{investor_entity}}", "{{investment_amount}}", "{{fund_name}}", "{{gp_entity}}", "{{date}}"],
  SPA: ["{{investor_name}}", "{{investor_entity}}", "{{investment_amount}}", "{{fund_name}}", "{{gp_entity}}", "{{date}}", "{{commitment_units}}"],
  IRA: ["{{investor_name}}", "{{investor_entity}}", "{{fund_name}}", "{{gp_entity}}", "{{date}}"],
  VOTING_AGREEMENT: ["{{investor_name}}", "{{investor_entity}}", "{{fund_name}}", "{{date}}"],
  ROFR: ["{{investor_name}}", "{{investor_entity}}", "{{fund_name}}", "{{date}}"],
  BOARD_CONSENT: ["{{fund_name}}", "{{gp_entity}}", "{{date}}"],
};

/**
 * Replace all {{tag}} placeholders in a text string with actual data.
 * Unreplaced tags are left as-is (no data available).
 */
export function replaceMergeFields(text: string, data: MergeFieldData): string {
  if (!text) return text;

  const replacements: Record<string, string | undefined> = {
    "{{investor_name}}": data.investorName,
    "{{investor_entity}}": data.investorEntity,
    "{{investment_amount}}": data.investmentAmount,
    "{{fund_name}}": data.fundName,
    "{{gp_entity}}": data.gpEntity,
    "{{date}}": data.date,
    "{{commitment_units}}": data.commitmentUnits,
    "{{signatory_name}}": data.signatoryName,
    "{{signatory_title}}": data.signatoryTitle,
    "{{address}}": data.address,
    "{{entity_type}}": data.entityType,
    "{{tax_id}}": data.taxId,
    "{{email}}": data.email,
    "{{wire_bank}}": data.wireBank,
    "{{wire_account}}": data.wireAccount,
    "{{wire_routing}}": data.wireRouting,
    "{{management_fee}}": data.managementFee,
    "{{carried_interest}}": data.carriedInterest,
    "{{fund_term}}": data.fundTerm,
    "{{effective_date}}": data.effectiveDate,
    "{{org_name}}": data.orgName,
    "{{org_address}}": data.orgAddress,
    "{{investor_address}}": data.investorAddress,
  };

  let result = text;
  for (const [tag, value] of Object.entries(replacements)) {
    if (value !== undefined && value !== "") {
      result = result.replaceAll(tag, value);
    }
  }
  return result;
}

/**
 * Build MergeFieldData from entity auto-fill, fund, org, and investment data.
 */
export function buildMergeFieldData(params: {
  autoFill?: DocumentAutoFill;
  fundName?: string;
  gpEntity?: string;
  investmentAmount?: number;
  unitPrice?: number;
  email?: string;
  wireBank?: string;
  wireAccount?: string;
  wireRouting?: string;
  managementFeePct?: number;
  carriedInterestPct?: number;
  fundTermYears?: number;
  effectiveDate?: string;
  orgName?: string;
  orgAddress?: string;
}): MergeFieldData {
  const {
    autoFill, fundName, gpEntity, investmentAmount, unitPrice, email,
    wireBank, wireAccount, wireRouting,
    managementFeePct, carriedInterestPct, fundTermYears,
    effectiveDate, orgName, orgAddress,
  } = params;

  const formattedAmount = investmentAmount
    ? `$${investmentAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : undefined;

  const commitmentUnits =
    investmentAmount && unitPrice && unitPrice > 0
      ? Math.floor(investmentAmount / unitPrice).toLocaleString("en-US")
      : undefined;

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    investorName: autoFill?.signatoryName || autoFill?.legalName,
    investorEntity: autoFill?.legalName,
    investmentAmount: formattedAmount,
    fundName,
    gpEntity,
    date: today,
    commitmentUnits,
    signatoryName: autoFill?.signatoryName,
    signatoryTitle: autoFill?.signatoryTitle,
    address: autoFill?.formattedAddress,
    entityType: autoFill?.entityTypeDescription,
    taxId: autoFill?.taxId ? maskTaxId(autoFill.taxId, autoFill.taxIdType) : undefined,
    email,
    wireBank,
    wireAccount,
    wireRouting,
    managementFee: managementFeePct !== undefined ? `${managementFeePct}%` : undefined,
    carriedInterest: carriedInterestPct !== undefined ? `${carriedInterestPct}%` : undefined,
    fundTerm: fundTermYears !== undefined ? `${fundTermYears} years` : undefined,
    effectiveDate: effectiveDate || today,
    orgName,
    orgAddress,
    investorAddress: autoFill?.formattedAddress,
  };
}

/**
 * Mask a tax ID for display in documents.
 * SSN: ***-**-1234
 * EIN: **-***1234
 */
function maskTaxId(taxId: string, type: "SSN" | "EIN"): string {
  const digits = taxId.replace(/\D/g, "");
  if (digits.length < 4) return taxId;
  const last4 = digits.slice(-4);
  if (type === "SSN") {
    return `***-**-${last4}`;
  }
  return `**-***${last4}`;
}
