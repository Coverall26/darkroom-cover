/**
 * Shared types for LP Onboarding step components.
 * These types match the FormData and FundContext interfaces
 * in page-client.tsx exactly — any changes here must be
 * reflected in the parent component.
 */

import type { EntityType } from "@/lib/entity";

export interface FormData {
  // Step 1: Personal info
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
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
  confirmAccredited: boolean;
  confirmRiskAware: boolean;
  // Step 4: 506(c) enhanced certifications
  noThirdPartyFinancing: boolean;
  sourceOfFunds: string;
  occupation: string;
  // Step 5: NDA
  ndaAccepted: boolean;
  ndaSignatureMethod: "TYPED" | "DRAWN" | "";
  ndaTypedName: string;
  // Step 6: Commitment + Investor Representations
  commitmentAmount: string;
  investmentId?: string;
  repAccreditedCert: boolean;
  repPrincipal: boolean;
  repOfferingDocs: boolean;
  repRiskAware: boolean;
  repRestrictedSecurities: boolean;
  repAmlOfac: boolean;
  repTaxConsent: boolean;
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
  targetRaise?: number;
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

export type UpdateFieldFn = <K extends keyof FormData>(field: K, value: FormData[K]) => void;

/** Common props shared by all step components */
export interface BaseStepProps {
  formData: FormData;
  updateField: UpdateFieldFn;
  onNext: () => void;
  onBack: () => void;
  isLoading?: boolean;
  error?: string;
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
    field: "repIndependentAdvice",
    label: "I acknowledge that neither the fund, its managers, nor FundRoom provides tax, legal, or investment advice, and I have been advised to consult my own professional advisors.",
  },
] as const;

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
] as const;
