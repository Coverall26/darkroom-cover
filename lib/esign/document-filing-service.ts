/**
 * Document Filing Service
 *
 * Handles automatic filing of signed documents:
 * 1. Org Vault — files signed PDFs under /Signed Documents/YYYY-MM/
 * 2. Contact Vault — auto-provisions vault for each signer, files their copy
 * 3. Email — sends signed PDF copy to all parties
 *
 * SEC Compliance: Creates immutable DocumentFiling audit trail records
 * for every document copy filed, with SHA-256 content hashes.
 */
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { getStorageProvider } from "@/lib/storage/providers";
import crypto from "crypto";
import type {
  DocumentFilingSourceType,
  DocumentFilingDestType,
  DocumentStorageType,
} from "@prisma/client";

// ============================================================================
// Types
// ============================================================================

export interface FileDocumentInput {
  teamId: string;
  sourceType: DocumentFilingSourceType;
  sourceDocId?: string;
  envelopeId?: string;
  /** The signed PDF bytes to file */
  fileContent: Buffer | Uint8Array;
  fileName: string;
  mimeType?: string;
  /** User who triggered the filing (null for auto-filing) */
  filedById?: string;
}

export interface FilingResult {
  orgVaultFiling?: { id: string; path: string };
  contactVaultFilings: { id: string; contactId: string; vaultId: string }[];
  emailFilings: { id: string; email: string }[];
  errors: string[];
}

export interface OrgVaultFilingInput extends FileDocumentInput {
  /** Custom sub-path under /Signed Documents/ (defaults to YYYY-MM/) */
  subPath?: string;
}

export interface ContactVaultFilingInput {
  teamId: string;
  contactEmail: string;
  contactName?: string;
  sourceType: DocumentFilingSourceType;
  sourceDocId?: string;
  envelopeId?: string;
  fileContent: Buffer | Uint8Array;
  fileName: string;
  mimeType?: string;
  filedById?: string;
}

// ============================================================================
// Org Vault Filing
// ============================================================================

/**
 * File a document to the organization's vault.
 * Stores under: {teamId}/signed-documents/{YYYY-MM}/{fileName}
 */
export async function fileToOrgVault(
  input: OrgVaultFilingInput
): Promise<{ id: string; path: string }> {
  const provider = getStorageProvider();
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const subPath = input.subPath || yearMonth;
  const sanitizedName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${input.teamId}/signed-documents/${subPath}/${sanitizedName}`;

  const contentBuffer = input.fileContent instanceof Uint8Array
    ? Buffer.from(input.fileContent)
    : input.fileContent;

  const contentHash = crypto
    .createHash("sha256")
    .update(contentBuffer)
    .digest("hex");

  // Upload to storage
  await provider.put(storagePath, contentBuffer, {
    contentType: input.mimeType || "application/pdf",
    encrypt: true,
    metadata: {
      sourceType: input.sourceType,
      sourceDocId: input.sourceDocId || "",
      contentHash,
    },
  });

  // Create DocumentFiling record
  const filing = await prisma.documentFiling.create({
    data: {
      sourceType: input.sourceType,
      sourceDocId: input.sourceDocId,
      envelopeId: input.envelopeId,
      destinationType: "ORG_VAULT" as DocumentFilingDestType,
      orgVaultPath: `/Signed Documents/${subPath}/${sanitizedName}`,
      filedFileUrl: storagePath,
      filedStorageType: "S3" as DocumentStorageType,
      filedFileName: input.fileName,
      filedFileSize: BigInt(contentBuffer.length),
      teamId: input.teamId,
      filedById: input.filedById,
      auditHash: contentHash,
    },
  });

  // Audit log
  logAuditEvent({
    eventType: "DOCUMENT_COMPLETED",
    userId: input.filedById,
    teamId: input.teamId,
    resourceType: "Document",
    resourceId: filing.id,
    metadata: {
      action: "filed_to_org_vault",
      path: filing.orgVaultPath,
      sourceType: input.sourceType,
      sourceDocId: input.sourceDocId,
      contentHash,
    },
  }).catch((e) => reportError(e as Error));

  return { id: filing.id, path: storagePath };
}

// ============================================================================
// Contact Vault Filing
// ============================================================================

/**
 * Auto-provision a ContactVault for a signer (if needed) and file the document.
 */
export async function fileToContactVault(
  input: ContactVaultFilingInput
): Promise<{ id: string; vaultId: string; contactId: string }> {
  // Find or create the contact
  const contact = await prisma.contact.findFirst({
    where: {
      teamId: input.teamId,
      email: input.contactEmail.toLowerCase().trim(),
    },
    select: { id: true },
  });

  if (!contact) {
    // Create a minimal contact for the signer
    const newContact = await prisma.contact.create({
      data: {
        teamId: input.teamId,
        email: input.contactEmail.toLowerCase().trim(),
        firstName: input.contactName?.split(" ")[0] || "",
        lastName: input.contactName?.split(" ").slice(1).join(" ") || "",
        source: "SIGNATURE_EVENT",
        status: "PROSPECT",
      },
    });
    return fileToExistingContactVault({
      ...input,
      contactId: newContact.id,
    });
  }

  return fileToExistingContactVault({
    ...input,
    contactId: contact.id,
  });
}

/**
 * File to an existing contact's vault, auto-provisioning the vault if needed.
 */
async function fileToExistingContactVault(
  input: ContactVaultFilingInput & { contactId: string }
): Promise<{ id: string; vaultId: string; contactId: string }> {
  const provider = getStorageProvider();

  // Find or create the ContactVault
  let vault = await prisma.contactVault.findUnique({
    where: { contactId: input.contactId },
  });

  if (!vault) {
    // Auto-provision vault with a magic link access token
    const accessToken = crypto.randomBytes(32).toString("hex");
    vault = await prisma.contactVault.create({
      data: {
        contactId: input.contactId,
        teamId: input.teamId,
        accessToken,
        accessExpiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
    });
  }

  // Upload file to contact vault storage path
  const sanitizedName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${input.teamId}/contact-vaults/${input.contactId}/${sanitizedName}`;

  const contentBuffer = input.fileContent instanceof Uint8Array
    ? Buffer.from(input.fileContent)
    : input.fileContent;

  const contentHash = crypto
    .createHash("sha256")
    .update(contentBuffer)
    .digest("hex");

  await provider.put(storagePath, contentBuffer, {
    contentType: input.mimeType || "application/pdf",
    encrypt: true,
    metadata: {
      sourceType: input.sourceType,
      contactId: input.contactId,
      contentHash,
    },
  });

  // Create DocumentFiling record
  const filing = await prisma.documentFiling.create({
    data: {
      sourceType: input.sourceType,
      sourceDocId: input.sourceDocId,
      envelopeId: input.envelopeId,
      destinationType: "CONTACT_VAULT" as DocumentFilingDestType,
      contactVaultId: vault.id,
      filedFileUrl: storagePath,
      filedStorageType: "S3" as DocumentStorageType,
      filedFileName: input.fileName,
      filedFileSize: BigInt(contentBuffer.length),
      teamId: input.teamId,
      filedById: input.filedById,
      auditHash: contentHash,
    },
  });

  // Update vault counters
  await prisma.contactVault.update({
    where: { id: vault.id },
    data: {
      totalDocuments: { increment: 1 },
      totalSizeBytes: { increment: BigInt(contentBuffer.length) },
    },
  });

  // Audit log
  logAuditEvent({
    eventType: "DOCUMENT_COMPLETED",
    userId: input.filedById,
    teamId: input.teamId,
    resourceType: "Document",
    resourceId: filing.id,
    metadata: {
      action: "filed_to_contact_vault",
      contactId: input.contactId,
      vaultId: vault.id,
      sourceType: input.sourceType,
      contentHash,
    },
  }).catch((e) => reportError(e as Error));

  return { id: filing.id, vaultId: vault.id, contactId: input.contactId };
}

// ============================================================================
// Email Filing (record that a copy was emailed)
// ============================================================================

/**
 * Record that a signed document copy was emailed to a recipient.
 * (Actual email sending is handled by the caller — this just creates the filing record.)
 */
export async function recordEmailFiling(input: {
  teamId: string;
  recipientEmail: string;
  sourceType: DocumentFilingSourceType;
  sourceDocId?: string;
  envelopeId?: string;
  fileName: string;
  fileSize: number;
  filedById?: string;
  contentHash?: string;
}): Promise<{ id: string }> {
  const filing = await prisma.documentFiling.create({
    data: {
      sourceType: input.sourceType,
      sourceDocId: input.sourceDocId,
      envelopeId: input.envelopeId,
      destinationType: "EMAIL" as DocumentFilingDestType,
      recipientEmail: input.recipientEmail.toLowerCase().trim(),
      filedFileName: input.fileName,
      filedFileSize: BigInt(input.fileSize),
      teamId: input.teamId,
      filedById: input.filedById,
      auditHash: input.contentHash,
    },
  });

  return { id: filing.id };
}

// ============================================================================
// Auto-File on Envelope Completion
// ============================================================================

/**
 * Auto-file a completed envelope's signed document to all destinations:
 * 1. Org vault (always)
 * 2. Contact vault for each signer (always)
 * 3. Email record for each recipient (CC and signers)
 *
 * Called after an envelope reaches COMPLETED status.
 */
export async function autoFileEnvelopeDocument(
  envelopeId: string
): Promise<FilingResult> {
  const result: FilingResult = {
    contactVaultFilings: [],
    emailFilings: [],
    errors: [],
  };

  try {
    const envelope = await prisma.envelope.findUnique({
      where: { id: envelopeId },
      include: {
        recipients: true,
      },
    });

    if (!envelope) {
      result.errors.push("Envelope not found");
      return result;
    }

    if (envelope.status !== "COMPLETED") {
      result.errors.push(`Envelope is ${envelope.status}, not COMPLETED`);
      return result;
    }

    // Get the signed file content
    if (!envelope.signedFileUrl) {
      result.errors.push("No signed file URL on envelope");
      return result;
    }

    const provider = getStorageProvider();
    let fileContent: Buffer;
    try {
      const downloaded = await provider.get(envelope.signedFileUrl);
      if (!downloaded) {
        result.errors.push("Signed file not found in storage");
        return result;
      }
      fileContent = Buffer.isBuffer(downloaded)
        ? downloaded
        : Buffer.from(downloaded as unknown as ArrayBuffer);
    } catch (err) {
      result.errors.push("Failed to download signed file from storage");
      reportError(err as Error);
      return result;
    }

    const baseName = envelope.sourceFileName
      ? envelope.sourceFileName.replace(/\.[^.]+$/, "")
      : envelope.title;
    const fileName = `${baseName}_signed.pdf`;

    // 1. File to org vault
    try {
      const orgFiling = await fileToOrgVault({
        teamId: envelope.teamId,
        sourceType: "SIGNED_DOCUMENT",
        sourceDocId: envelope.id,
        envelopeId: envelope.id,
        fileContent,
        fileName,
        filedById: envelope.createdById,
      });
      result.orgVaultFiling = orgFiling;
    } catch (err) {
      result.errors.push("Failed to file to org vault");
      reportError(err as Error);
    }

    // 2. File to each signer's contact vault
    for (const recipient of envelope.recipients) {
      if (recipient.role === "CC" || recipient.role === "CERTIFIED_DELIVERY") {
        continue; // Only file to signer vaults, not CC
      }

      try {
        const contactFiling = await fileToContactVault({
          teamId: envelope.teamId,
          contactEmail: recipient.email,
          contactName: recipient.name,
          sourceType: "SIGNED_DOCUMENT",
          sourceDocId: envelope.id,
          envelopeId: envelope.id,
          fileContent,
          fileName,
          filedById: envelope.createdById,
        });
        result.contactVaultFilings.push(contactFiling);
      } catch (err) {
        result.errors.push(
          `Failed to file to contact vault for ${recipient.email}`
        );
        reportError(err as Error);
      }
    }

    // 3. Record email filings for all recipients (signers + CC)
    const contentHash = crypto
      .createHash("sha256")
      .update(fileContent)
      .digest("hex");

    for (const recipient of envelope.recipients) {
      try {
        const emailFiling = await recordEmailFiling({
          teamId: envelope.teamId,
          recipientEmail: recipient.email,
          sourceType: "SIGNED_DOCUMENT",
          sourceDocId: envelope.id,
          envelopeId: envelope.id,
          fileName,
          fileSize: fileContent.length,
          filedById: envelope.createdById,
          contentHash,
        });
        result.emailFilings.push({
          id: emailFiling.id,
          email: recipient.email,
        });
      } catch (err) {
        result.errors.push(
          `Failed to record email filing for ${recipient.email}`
        );
        reportError(err as Error);
      }
    }

    // Audit log
    logAuditEvent({
      eventType: "DOCUMENT_COMPLETED",
      userId: envelope.createdById,
      teamId: envelope.teamId,
      resourceType: "SignatureDocument",
      resourceId: envelopeId,
      metadata: {
        action: "auto_filed_envelope",
        orgVaultFiled: !!result.orgVaultFiling,
        contactVaultsFiled: result.contactVaultFilings.length,
        emailsFiled: result.emailFilings.length,
        errors: result.errors,
      },
    }).catch((e) => reportError(e as Error));

    return result;
  } catch (err) {
    reportError(err as Error);
    result.errors.push("Unexpected error during auto-filing");
    return result;
  }
}

// ============================================================================
// Filing Dashboard Queries
// ============================================================================

/**
 * Get filing history for a team, with optional filtering.
 */
export async function getFilingHistory(options: {
  teamId: string;
  sourceType?: DocumentFilingSourceType;
  destinationType?: DocumentFilingDestType;
  envelopeId?: string;
  contactVaultId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  filings: any[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));

  const where: any = { teamId: options.teamId };
  if (options.sourceType) where.sourceType = options.sourceType;
  if (options.destinationType) where.destinationType = options.destinationType;
  if (options.envelopeId) where.envelopeId = options.envelopeId;
  if (options.contactVaultId) where.contactVaultId = options.contactVaultId;

  const [filings, total] = await Promise.all([
    prisma.documentFiling.findMany({
      where,
      orderBy: { filedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        envelope: { select: { title: true, status: true } },
        contactVault: {
          select: {
            contactId: true,
            totalDocuments: true,
          },
        },
      },
    }),
    prisma.documentFiling.count({ where }),
  ]);

  return { filings, total, page, pageSize };
}

/**
 * Get filing stats summary for a team.
 */
export async function getFilingStats(teamId: string): Promise<{
  totalFilings: number;
  byDestination: Record<string, number>;
  bySource: Record<string, number>;
  totalSizeBytes: bigint;
}> {
  const [totalFilings, filings] = await Promise.all([
    prisma.documentFiling.count({ where: { teamId } }),
    prisma.documentFiling.findMany({
      where: { teamId },
      select: {
        destinationType: true,
        sourceType: true,
        filedFileSize: true,
      },
    }),
  ]);

  const byDestination: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let totalSizeBytes = BigInt(0);

  for (const f of filings) {
    byDestination[f.destinationType] =
      (byDestination[f.destinationType] || 0) + 1;
    bySource[f.sourceType] = (bySource[f.sourceType] || 0) + 1;
    if (f.filedFileSize) {
      totalSizeBytes += f.filedFileSize;
    }
  }

  return { totalFilings, byDestination, bySource, totalSizeBytes };
}
