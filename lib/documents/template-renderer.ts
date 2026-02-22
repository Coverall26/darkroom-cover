/**
 * Document Template Renderer
 *
 * Reads HTML templates from the /templates directory and applies merge fields
 * to produce rendered HTML for display in the signing UI or PDF generation.
 *
 * Supports two template sources:
 * 1. Default templates: HTML files in /templates/ directory (shipped with platform)
 * 2. Custom templates: Stored in SignatureTemplate records (uploaded by GP)
 *
 * Usage:
 *   const html = await renderTemplate("NDA", mergeData);
 *   const html = await renderDefaultTemplate("nda-default.html", mergeData);
 */

import { readFile } from "fs/promises";
import path from "path";
import { replaceMergeFields, type MergeFieldData } from "./merge-fields";

/** Map document types to their default template filenames */
const DEFAULT_TEMPLATE_FILES: Record<string, string> = {
  NDA: "nda-default.html",
  SUBSCRIPTION: "subscription-agreement-default.html",
};

/** Document type labels for display */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  NDA: "NDA / Confidentiality Agreement",
  SUBSCRIPTION: "Subscription Agreement",
  LPA: "Limited Partnership Agreement",
  PPM: "Private Placement Memorandum",
  SIDE_LETTER: "Side Letter",
  INVESTOR_QUESTIONNAIRE: "Investor Questionnaire",
  SAFE: "SAFE Agreement",
  CONVERTIBLE_NOTE: "Convertible Note Agreement",
  SPA: "Stock Purchase Agreement",
  IRA: "Investors' Rights Agreement",
  VOTING_AGREEMENT: "Voting Agreement",
  ROFR: "Right of First Refusal Agreement",
  BOARD_CONSENT: "Board Consent",
};

/**
 * Render a default HTML template by document type with merge fields applied.
 *
 * @param documentType - The document type (e.g., "NDA", "SUBSCRIPTION")
 * @param mergeData - Merge field data to replace {{tags}} with
 * @returns Rendered HTML string, or null if no default template exists for this type
 */
export async function renderTemplate(
  documentType: string,
  mergeData: MergeFieldData,
): Promise<string | null> {
  const templateFile = DEFAULT_TEMPLATE_FILES[documentType];
  if (!templateFile) {
    return null;
  }

  return renderDefaultTemplate(templateFile, mergeData);
}

/**
 * Render a specific default template file with merge fields applied.
 *
 * @param filename - Template filename in the /templates directory
 * @param mergeData - Merge field data to replace {{tags}} with
 * @returns Rendered HTML string
 * @throws Error if template file cannot be read
 */
export async function renderDefaultTemplate(
  filename: string,
  mergeData: MergeFieldData,
): Promise<string> {
  const templatesDir = path.join(process.cwd(), "templates");
  const templatePath = path.join(templatesDir, filename);

  const rawHtml = await readFile(templatePath, "utf-8");
  return replaceMergeFields(rawHtml, mergeData);
}

/**
 * Render an HTML string (from custom template or database) with merge fields applied.
 *
 * @param htmlContent - Raw HTML string containing {{tags}}
 * @param mergeData - Merge field data to replace {{tags}} with
 * @returns Rendered HTML string
 */
export function renderTemplateFromString(
  htmlContent: string,
  mergeData: MergeFieldData,
): string {
  return replaceMergeFields(htmlContent, mergeData);
}

/**
 * Get the list of document types that have default HTML templates available.
 */
export function getAvailableDefaultTemplates(): Array<{
  documentType: string;
  label: string;
  filename: string;
}> {
  return Object.entries(DEFAULT_TEMPLATE_FILES).map(([docType, filename]) => ({
    documentType: docType,
    label: DOCUMENT_TYPE_LABELS[docType] || docType,
    filename,
  }));
}

/**
 * Check if a default HTML template exists for a document type.
 */
export function hasDefaultTemplate(documentType: string): boolean {
  return documentType in DEFAULT_TEMPLATE_FILES;
}
