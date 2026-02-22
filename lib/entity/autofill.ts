/**
 * Entity auto-fill for documents and subscription agreements.
 *
 * Extracts the correct signatory name, tax ID, and address
 * from entity data to pre-fill PDF forms and signature fields.
 */

import type { EntityFields, MailingAddress } from "./types";

export interface DocumentAutoFill {
  /** Legal name for the document (entity name or individual name) */
  legalName: string;
  /** Tax ID (SSN or EIN) */
  taxId: string;
  /** Tax ID type label */
  taxIdType: "SSN" | "EIN";
  /** Signatory name (person signing the document) */
  signatoryName: string;
  /** Signatory title (if entity) */
  signatoryTitle: string;
  /** Formatted mailing address */
  formattedAddress: string;
  /** Entity type for document language */
  entityType: string;
  /** Entity type description for document headers */
  entityTypeDescription: string;
}

export interface SignatoryInfo {
  name: string;
  title: string;
  entityName: string;
}

/**
 * Build auto-fill data for documents from entity fields.
 * Used to pre-populate subscription agreements, side letters, K-1s.
 *
 * Accepts both typed EntityFields and plain Record objects (from DB JSON).
 * Supports 7+ entity types: INDIVIDUAL, LLC, TRUST, RETIREMENT,
 * JOINT, PARTNERSHIP, CHARITY/FOUNDATION, OTHER.
 */
export function buildDocumentAutoFill(
  entity: Partial<EntityFields> | Record<string, unknown>,
  investorName?: string,
): DocumentAutoFill {
  const type = ((entity as Record<string, unknown>).entityType as string) || "INDIVIDUAL";
  const legalName = (entity as Record<string, unknown>).legalName as string || investorName || "";

  let taxId = "";
  let taxIdType: "SSN" | "EIN" = "SSN";
  let signatoryName = investorName || legalName;
  let signatoryTitle = "";
  let entityTypeDescription = "Individual";

  switch (type) {
    case "INDIVIDUAL":
      taxId = (entity as Record<string, string>).ssn || (entity as Record<string, string>).taxId || "";
      taxIdType = "SSN";
      entityTypeDescription = "Individual";
      break;

    case "LLC":
      taxId = (entity as Record<string, string>).ein || (entity as Record<string, string>).taxId || "";
      taxIdType = "EIN";
      signatoryName =
        (entity as Record<string, string>).authorizedSignatory ||
        investorName ||
        "";
      signatoryTitle =
        (entity as Record<string, string>).signatoryTitle ||
        "Managing Member";
      entityTypeDescription = "Limited Liability Company";
      break;

    case "TRUST":
      taxId = (entity as Record<string, string>).ein || (entity as Record<string, string>).taxId || "";
      taxIdType = "EIN";
      signatoryName =
        (entity as Record<string, string>).trusteeName ||
        investorName ||
        "";
      signatoryTitle = "Trustee";
      entityTypeDescription = `${(entity as Record<string, string>).trustType || ""} Trust`.trim();
      break;

    case "RETIREMENT":
      taxId =
        (entity as Record<string, string>).custodianEin ||
        (entity as Record<string, string>).taxId ||
        "";
      taxIdType = "EIN";
      signatoryName =
        (entity as Record<string, string>).accountHolderName ||
        investorName ||
        "";
      signatoryTitle = "Account Holder";
      entityTypeDescription =
        (entity as Record<string, string>).accountType ||
        "Retirement Account";
      break;

    case "JOINT":
      taxId = (entity as Record<string, string>).ssn || (entity as Record<string, string>).taxId || "";
      taxIdType = "SSN";
      signatoryName =
        (entity as Record<string, string>).primaryName ||
        investorName ||
        "";
      signatoryTitle = "";
      entityTypeDescription = "Joint Account";
      break;

    case "PARTNERSHIP":
      taxId = (entity as Record<string, string>).ein || (entity as Record<string, string>).taxId || "";
      taxIdType = "EIN";
      signatoryName =
        (entity as Record<string, string>).authorizedSignatory ||
        investorName ||
        "";
      signatoryTitle =
        (entity as Record<string, string>).signatoryTitle ||
        "General Partner";
      entityTypeDescription = "Partnership";
      break;

    case "CHARITY":
    case "FOUNDATION":
      taxId = (entity as Record<string, string>).ein || (entity as Record<string, string>).taxId || "";
      taxIdType = "EIN";
      signatoryName =
        (entity as Record<string, string>).authorizedSignatory ||
        investorName ||
        "";
      signatoryTitle =
        (entity as Record<string, string>).signatoryTitle ||
        "Authorized Officer";
      entityTypeDescription =
        type === "CHARITY" ? "Charitable Organization" : "Foundation";
      break;

    case "OTHER":
    default:
      taxId = (entity as Record<string, string>).ein || (entity as Record<string, string>).taxId || "";
      taxIdType = "EIN";
      signatoryName =
        (entity as Record<string, string>).authorizedSignatory ||
        investorName ||
        "";
      signatoryTitle =
        (entity as Record<string, string>).signatoryTitle ||
        "Authorized Representative";
      entityTypeDescription =
        (entity as Record<string, string>).otherTypeDescription ||
        "Entity";
      break;
  }

  return {
    legalName,
    taxId,
    taxIdType,
    signatoryName,
    signatoryTitle,
    formattedAddress: formatAddress((entity as Record<string, unknown>).mailingAddress as MailingAddress | undefined),
    entityType: type,
    entityTypeDescription,
  };
}

/**
 * Get signatory info from entity data.
 * Used for e-signature recipient fields.
 */
export function getSignatoryInfo(
  entity: Partial<EntityFields> | Record<string, unknown>,
  investorName?: string,
): SignatoryInfo {
  const fill = buildDocumentAutoFill(entity, investorName);
  return {
    name: fill.signatoryName,
    title: fill.signatoryTitle,
    entityName: fill.legalName,
  };
}

function formatAddress(address?: MailingAddress): string {
  if (!address) return "";
  const parts = [
    address.street1,
    address.street2,
    [address.city, address.state, address.zip].filter(Boolean).join(", "),
    address.country && address.country !== "US" ? address.country : undefined,
  ].filter(Boolean);
  return parts.join("\n");
}
