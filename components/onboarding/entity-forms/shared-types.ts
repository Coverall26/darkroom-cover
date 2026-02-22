/**
 * Shared types, constants, and CSS class names used across all entity form sub-components.
 * Extracted from InvestorTypeStep.tsx during the decomposition refactor.
 */

// --- Address state ---

export interface AddressState {
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export const EMPTY_ADDRESS: AddressState = {
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
};

// --- Entity type union ---

export type EntityType = "INDIVIDUAL" | "LLC" | "TRUST" | "RETIREMENT" | "OTHER";

// --- Full form state ---

export interface EntityFormState {
  entityType: EntityType;
  // Individual
  firstName: string;
  lastName: string;
  ssn: string;
  dateOfBirth: string;
  // LLC
  llcName: string;
  llcEin: string;
  llcStateOfFormation: string;
  llcDateOfFormation: string;
  llcCountryOfFormation: string;
  llcTaxClassification: string;
  // Trust
  trustName: string;
  trustType: string;
  trustTaxId: string;
  trustDateEstablished: string;
  trustGoverningState: string;
  trusteeName: string;
  trusteeTitle: string;
  trusteeEmail: string;
  trusteePhone: string;
  // Retirement
  retAccountType: string;
  retAccountTitle: string;
  retCustodianName: string;
  retCustodianAccountNumber: string;
  retCustodianEin: string;
  retCustodianContactName: string;
  retCustodianContactPhone: string;
  retCustodianContactEmail: string;
  retAccountHolderName: string;
  retAccountHolderSsn: string;
  retAccountHolderDob: string;
  retAccountHolderPhone: string;
  retAccountHolderEmail: string;
  retCustodianCoSign: boolean;
  // Other Entity
  otherEntityName: string;
  otherEntityType: string;
  otherEin: string;
  otherStateOfFormation: string;
  otherCountryOfFormation: string;
  otherDateOfFormation: string;
  otherTaxClassification: string;
  // Shared address
  physicalAddress: AddressState;
  useMailingAddress: boolean;
  mailingAddress: AddressState;
  // Shared custodian address (retirement)
  custodianAddress: AddressState;
  // Shared signer fields (LLC, Other)
  signatoryName: string;
  signatoryTitle: string;
  signatoryEmail: string;
  signatoryPhone: string;
  signatoryIsAccountHolder: boolean;
  // Phone
  phone: string;
}

// --- Constants ---

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

// --- Shared CSS class names ---

export const inputCls =
  "bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 text-base sm:text-sm";
export const labelCls = "text-gray-300";
export const errorCls = "text-red-400 text-xs mt-1";
export const sectionCls = "space-y-4";
export const sectionTitleCls = "text-gray-200 font-medium text-sm border-b border-gray-700 pb-2";

// --- Shared callback types ---

export type UpdateFieldFn = <K extends keyof EntityFormState>(
  field: K,
  value: EntityFormState[K],
) => void;

export type UpdateAddressFn = (
  which: "physicalAddress" | "mailingAddress" | "custodianAddress",
  field: keyof AddressState,
  value: string,
) => void;

export type HandleBlurFn = (fieldName: string) => void;

export type HandleAddressBlurFn = (
  which: "physicalAddress" | "mailingAddress" | "custodianAddress",
  field: "street1" | "street2",
) => void;

// --- SSN/EIN formatting helpers ---

export const formatSsn = (val: string): string => {
  const digits = val.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
};

export const maskSsn = (val: string): string => {
  if (!val) return "";
  const digits = val.replace(/\D/g, "");
  if (digits.length <= 4) return "\u2022".repeat(digits.length);
  const last4 = digits.slice(-4);
  const masked = "\u2022".repeat(Math.max(0, digits.length - 4));
  if (digits.length <= 3) return masked;
  if (digits.length <= 5) return `${masked.slice(0, 3)}-${masked.slice(3)}`;
  return `${masked.slice(0, 3)}-${masked.slice(3, 5)}-${last4}`;
};

export const formatEin = (val: string): string => {
  const digits = val.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
};

export const maskEin = (val: string): string => {
  if (!val) return "";
  const digits = val.replace(/\D/g, "");
  if (digits.length <= 4) return "\u2022".repeat(digits.length);
  const last4 = digits.slice(-4);
  const masked = "\u2022".repeat(Math.max(0, digits.length - 4));
  if (digits.length <= 2) return masked;
  return `${masked.slice(0, 2)}-${masked.slice(2)}${last4}`;
};
