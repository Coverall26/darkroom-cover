/**
 * Entity validation for FundRoom AI
 *
 * Validates entity-type-specific fields, PO Box addresses,
 * SSN/EIN formats, and required fields per entity type.
 */

import type { EntityType, EntityFields, MailingAddress } from "./types";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * PO Box detection regex.
 * SEC Form D filings require a physical street address.
 * Matches common PO Box patterns: "PO Box", "P.O. Box", "Post Office Box", "Box 123"
 */
const PO_BOX_PATTERN =
  /\b(p\.?\s*o\.?\s*box|post\s+office\s+box|box\s+\d+)\b/i;

/**
 * Validate that an address is not a PO Box.
 * SEC 506(c) requires physical addresses on Form D.
 */
export function validateNotPOBox(address: MailingAddress): ValidationError[] {
  const errors: ValidationError[] = [];
  if (address.street1 && PO_BOX_PATTERN.test(address.street1)) {
    errors.push({
      field: "mailingAddress.street1",
      message:
        "PO Box addresses are not accepted. A physical street address is required for SEC filings.",
    });
  }
  if (address.street2 && PO_BOX_PATTERN.test(address.street2)) {
    errors.push({
      field: "mailingAddress.street2",
      message:
        "PO Box addresses are not accepted. A physical street address is required for SEC filings.",
    });
  }
  return errors;
}

/** Validate SSN format (XXX-XX-XXXX or XXXXXXXXX) */
export function validateSSN(ssn: string): boolean {
  const cleaned = ssn.replace(/[-\s]/g, "");
  return /^\d{9}$/.test(cleaned);
}

/** Validate EIN format (XX-XXXXXXX or XXXXXXXXX) */
export function validateEIN(ein: string): boolean {
  const cleaned = ein.replace(/[-\s]/g, "");
  return /^\d{9}$/.test(cleaned);
}

/** Validate US phone number */
export function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-\(\)\+\.]/g, "");
  return /^1?\d{10}$/.test(cleaned);
}

/** Validate US zip code */
export function validateZip(zip: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zip);
}

/** Required fields per entity type (for onboarding minimum) */
const REQUIRED_FIELDS: Record<EntityType, string[]> = {
  INDIVIDUAL: ["legalName"],
  LLC: ["legalName"],
  TRUST: ["legalName"],
  RETIREMENT: ["legalName"],
  OTHER: ["legalName"],
};

/** Extended required fields for full compliance (accreditation + signing) */
const COMPLIANCE_REQUIRED_FIELDS: Record<EntityType, string[]> = {
  INDIVIDUAL: ["legalName", "taxId", "mailingAddress"],
  LLC: [
    "legalName",
    "ein",
    "mailingAddress",
    "authorizedSignatory",
    "stateOfFormation",
  ],
  TRUST: [
    "legalName",
    "trusteeName",
    "mailingAddress",
    "trustType",
    "governingState",
  ],
  RETIREMENT: [
    "legalName",
    "accountType",
    "custodianName",
    "mailingAddress",
  ],
  OTHER: ["legalName", "mailingAddress"],
};

/**
 * Validate entity fields for onboarding (minimum requirements).
 * Used during LP onboarding wizard — lenient, only checks essentials.
 */
export function validateEntityOnboarding(
  data: Partial<EntityFields>,
): ValidationResult {
  const errors: ValidationError[] = [];
  const entityType = data.entityType || "INDIVIDUAL";
  const required = REQUIRED_FIELDS[entityType] || REQUIRED_FIELDS.INDIVIDUAL;

  for (const field of required) {
    const value = (data as Record<string, unknown>)[field];
    if (!value || (typeof value === "string" && !value.trim())) {
      errors.push({
        field,
        message: `${field} is required`,
      });
    }
  }

  // Validate address if provided
  if (data.mailingAddress) {
    errors.push(...validateNotPOBox(data.mailingAddress));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate entity fields for full compliance (signing documents, accreditation).
 * Stricter validation — all compliance fields must be present.
 */
export function validateEntityCompliance(
  data: Partial<EntityFields>,
): ValidationResult {
  const errors: ValidationError[] = [];
  const entityType = data.entityType || "INDIVIDUAL";
  const required =
    COMPLIANCE_REQUIRED_FIELDS[entityType] || COMPLIANCE_REQUIRED_FIELDS.INDIVIDUAL;

  for (const field of required) {
    if (field === "mailingAddress") {
      if (!data.mailingAddress) {
        errors.push({ field, message: "Mailing address is required" });
      } else {
        const addr = data.mailingAddress;
        if (!addr.street1?.trim())
          errors.push({
            field: "mailingAddress.street1",
            message: "Street address is required",
          });
        if (!addr.city?.trim())
          errors.push({
            field: "mailingAddress.city",
            message: "City is required",
          });
        if (!addr.state?.trim())
          errors.push({
            field: "mailingAddress.state",
            message: "State is required",
          });
        if (!addr.zip?.trim())
          errors.push({
            field: "mailingAddress.zip",
            message: "ZIP code is required",
          });
        else if (!validateZip(addr.zip))
          errors.push({
            field: "mailingAddress.zip",
            message: "Invalid ZIP code format",
          });
        if (!addr.country?.trim())
          errors.push({
            field: "mailingAddress.country",
            message: "Country is required",
          });
        errors.push(...validateNotPOBox(addr));
      }
      continue;
    }

    const value = (data as Record<string, unknown>)[field];
    if (!value || (typeof value === "string" && !value.trim())) {
      errors.push({ field, message: `${field} is required for compliance` });
    }
  }

  // Validate tax ID format
  if (entityType === "INDIVIDUAL" && data.taxId) {
    if (!validateSSN(data.taxId)) {
      errors.push({
        field: "taxId",
        message: "Invalid SSN format (expected XXX-XX-XXXX)",
      });
    }
  }

  const entityWithEin = data as Record<string, unknown>;
  if (
    entityType !== "INDIVIDUAL" &&
    entityWithEin.ein &&
    typeof entityWithEin.ein === "string"
  ) {
    if (!validateEIN(entityWithEin.ein)) {
      errors.push({
        field: "ein",
        message: "Invalid EIN format (expected XX-XXXXXXX)",
      });
    }
  }

  if (data.phone && !validatePhone(data.phone)) {
    errors.push({
      field: "phone",
      message: "Invalid phone number format",
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get the tax ID label for an entity type.
 */
export function getTaxIdLabel(entityType: EntityType): string {
  return entityType === "INDIVIDUAL" ? "SSN" : "EIN";
}

/**
 * Mask a tax ID for display (show last 4 digits).
 * "123-45-6789" → "***-**-6789"
 * "12-3456789" → "**-***6789"
 */
export function maskTaxId(taxId: string, entityType: EntityType): string {
  const cleaned = taxId.replace(/[-\s]/g, "");
  if (cleaned.length < 4) return "****";
  const last4 = cleaned.slice(-4);
  if (entityType === "INDIVIDUAL") {
    return `***-**-${last4}`;
  }
  return `**-***${last4}`;
}
