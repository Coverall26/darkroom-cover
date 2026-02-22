/**
 * Shared types and constants for LP Onboarding step components.
 * Extracted from app/lp/onboard/page-client.tsx during modularization.
 */

import type { EntityType } from "@/lib/entity";

export interface FormData {
  // Step 1: Personal info
  name: string;
  email: string;
  phone: string;
  // Step 2: Entity type
  entityType: EntityType;
  entityName: string;
  // Entity-specific
  stateOfFormation: string;
  authorizedSignatory: string;
  signatoryTitle: string;
  trustType: string;
  trusteeName: string;
  governingState: string;
  accountType: string;
  custodianName: string;
  otherTypeDescription: string;
  // Step 3: Address
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  // Step 4: Accreditation
  accreditationType: string;
  accreditationCategory: string;
  confirmAccredited: boolean;
  confirmRiskAware: boolean;
  // Step 4: 506(c) enhanced certifications
  noThirdPartyFinancing: boolean;
  sourceOfFunds: string;
  occupation: string;
  // Step 4: 506(c) document verification (below threshold)
  accreditationVerificationMethod: string;
  // Step 5: NDA
  ndaAccepted: boolean;
  // Step 6: Commitment + Investor Representations (12 total)
  commitmentAmount: string;
  stateOfResidence: string;
  repAccreditedCert: boolean;
  repPrincipal: boolean;
  repNoThirdPartyFinancing: boolean;
  repOfferingDocs: boolean;
  repRiskAware: boolean;
  repRestrictedSecurities: boolean;
  repAmlOfac: boolean;
  repTaxConsent: boolean;
  repStateOfResidence: boolean;
  repErisa: boolean;
  repFatcaCrs: boolean;
  repIndependentAdvice: boolean;
}

export interface FundContext {
  teamId: string;
  teamName: string;
  fundId: string | null;
  fundName: string | null;
  orgName: string | null;
  minimumInvestment?: number;
  maximumInvestment?: number;
  flatModeEnabled?: boolean;
  stagedCommitmentsEnabled?: boolean;
  fundroomActive?: boolean;
  regulationDExemption?: string | null;
}

export interface TrancheData {
  activeTranche: {
    id: string;
    tranche: number;
    name: string | null;
    pricePerUnit: number;
    unitsAvailable: number;
    unitsTotal: number;
    unitsSold: number;
  } | null;
  fund: {
    economics: {
      managementFeePct: number | null;
      carryPct: number | null;
      hurdleRate: number | null;
      waterfallType: string | null;
      termYears: number | null;
      extensionYears: number | null;
    };
  };
}

export const INVESTOR_REPRESENTATIONS = [
  {
    field: "repAccreditedCert",
    label: "I certify that I am an \"accredited investor\" as defined in Rule 501(a) of Regulation D under the Securities Act of 1933.",
  },
  {
    field: "repPrincipal",
    label: "I am investing as principal for my own account and not as agent, nominee, or on behalf of any undisclosed person or entity.",
  },
  {
    field: "repNoThirdPartyFinancing",
    label: "I certify that my minimum investment amount is not financed in whole or in part by any third party for the specific purpose of making this investment.",
  },
  {
    field: "repOfferingDocs",
    label: "I have received, read, and understand the offering documents, including the Private Placement Memorandum (if applicable), and have had the opportunity to ask questions.",
  },
  {
    field: "repRiskAware",
    label: "I understand that this investment involves substantial risk, including the possible loss of my entire investment, and that returns are not guaranteed.",
  },
  {
    field: "repRestrictedSecurities",
    label: "I understand that the securities being offered have not been registered under the Securities Act and are \"restricted securities\" that cannot be resold without registration or an applicable exemption.",
  },
  {
    field: "repAmlOfac",
    label: "I represent that the funds used for this investment are not derived from illegal activity, and I am not a person or entity identified on the OFAC Specially Designated Nationals list.",
  },
  {
    field: "repTaxConsent",
    label: "I consent to the collection and use of my tax identification information (SSN/EIN) as required for IRS reporting, including Schedule K-1 preparation.",
  },
  {
    field: "repStateOfResidence",
    label: "I represent that I am a bona fide resident of the state indicated above, which determines applicable blue sky law requirements for this offering.",
  },
  {
    field: "repErisa",
    label: "I represent whether or not I am a \"benefit plan investor\" as defined under ERISA Section 3(42), and if so, that my investment does not violate the plan's governing documents.",
  },
  {
    field: "repFatcaCrs",
    label: "I certify my tax residency status as indicated and agree to provide any additional documentation required under FATCA (for US persons) or CRS (for non-US persons) regulations.",
  },
  {
    field: "repIndependentAdvice",
    label: "I acknowledge that neither the fund, its managers, nor FundRoom provides tax, legal, or investment advice, and I have been advised to consult my own professional advisors.",
  },
] as const;

/** Accreditation categories for Individual investors under Rule 501(a) */
export const INDIVIDUAL_ACCREDITATION_CATEGORIES = [
  { value: "INCOME", label: "Income", description: "Individual income >$200K (or >$300K joint) in each of the last 2 years, with expectation of the same" },
  { value: "NET_WORTH", label: "Net Worth", description: "Individual net worth >$1M, alone or with spouse, excluding primary residence" },
  { value: "PROFESSIONAL_CERT", label: "Professional Certification", description: "Holder of FINRA Series 7, 65, or 82 license in good standing" },
  { value: "INSIDER", label: "Insider", description: "Director, executive officer, or general partner of the issuer" },
  { value: "KNOWLEDGEABLE_EMPLOYEE", label: "Knowledgeable Employee", description: "Employee of the private fund who participates in investment activities" },
] as const;

/** Accreditation categories for Entity investors under Rule 501(a) */
export const ENTITY_ACCREDITATION_CATEGORIES = [
  { value: "REGULATED_ENTITY", label: "Regulated Entity", description: "Bank, broker-dealer, insurance company, or registered investment adviser" },
  { value: "ENTITY_ASSETS_5M", label: "Entity with >$5M Assets", description: "Entity with total assets exceeding $5 million, not formed for the purpose of acquiring the securities" },
  { value: "TRUST_5M", label: "Trust with >$5M Assets", description: "Trust with total assets exceeding $5 million, directed by a sophisticated person" },
  { value: "ALL_ACCREDITED_OWNERS", label: "All Accredited Owners", description: "Entity in which all equity owners are accredited investors" },
  { value: "FAMILY_OFFICE", label: "Family Office", description: "Family office with assets under management >$5 million" },
  { value: "ENTITY_INVESTMENTS_5M", label: "Entity Investments >$5M", description: "Entity owning investments in excess of $5 million" },
] as const;

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
] as const;

export type UpdateFieldFn = <K extends keyof FormData>(field: K, value: FormData[K]) => void;
