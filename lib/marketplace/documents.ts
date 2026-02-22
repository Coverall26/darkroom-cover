import type { DealStage } from "@prisma/client";
import prisma from "@/lib/prisma";

// ============================================================================
// Types
// ============================================================================

export interface CreateDocumentInput {
  name: string;
  description?: string;
  category?: string;
  storageKey?: string;
  storageType?: string;
  fileType?: string;
  fileSize?: number;
  requiredStage?: DealStage;
  restricted?: boolean;
}

export interface UpdateDocumentInput {
  name?: string;
  description?: string;
  category?: string;
  requiredStage?: DealStage | null;
  restricted?: boolean;
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new document record for a deal.
 */
export async function createDealDocument(
  dealId: string,
  input: CreateDocumentInput,
  userId: string,
) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, title: true },
  });

  if (!deal) {
    throw new Error(`Deal not found: ${dealId}`);
  }

  const document = await prisma.dealDocument.create({
    data: {
      dealId,
      name: input.name,
      description: input.description,
      category: input.category ?? "GENERAL",
      storageKey: input.storageKey,
      storageType: input.storageType,
      fileType: input.fileType,
      fileSize: input.fileSize,
      requiredStage: input.requiredStage,
      restricted: input.restricted ?? false,
      uploadedByUserId: userId,
    },
  });

  // Log activity
  await prisma.dealActivity.create({
    data: {
      dealId,
      activityType: "DOCUMENT_UPLOADED",
      title: `Document "${input.name}" uploaded`,
      metadata: {
        documentId: document.id,
        category: document.category,
        fileType: input.fileType,
        fileSize: input.fileSize,
      },
      userId,
    },
  });

  return document;
}

/**
 * List documents for a deal, optionally filtered by category.
 */
export async function listDealDocuments(
  dealId: string,
  category?: string,
) {
  return prisma.dealDocument.findMany({
    where: {
      dealId,
      ...(category ? { category } : {}),
    },
    include: {
      uploadedByUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get a single document by ID.
 */
export async function getDealDocument(documentId: string) {
  return prisma.dealDocument.findUnique({
    where: { id: documentId },
    include: {
      uploadedByUser: { select: { id: true, name: true, email: true } },
      deal: { select: { id: true, title: true, teamId: true, stage: true } },
    },
  });
}

/**
 * Update document metadata.
 */
export async function updateDealDocument(
  documentId: string,
  input: UpdateDocumentInput,
  userId: string,
) {
  const existing = await prisma.dealDocument.findUnique({
    where: { id: documentId },
    select: { id: true, dealId: true, name: true },
  });

  if (!existing) {
    throw new Error(`Document not found: ${documentId}`);
  }

  const document = await prisma.dealDocument.update({
    where: { id: documentId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.requiredStage !== undefined
        ? { requiredStage: input.requiredStage }
        : {}),
      ...(input.restricted !== undefined
        ? { restricted: input.restricted }
        : {}),
    },
  });

  // Log activity
  await prisma.dealActivity.create({
    data: {
      dealId: existing.dealId,
      activityType: "DOCUMENT_UPLOADED",
      title: `Document "${document.name}" updated`,
      metadata: {
        documentId: document.id,
        updatedFields: Object.keys(input),
      },
      userId,
    },
  });

  return document;
}

/**
 * Delete a document.
 */
export async function deleteDealDocument(
  documentId: string,
  userId: string,
) {
  const existing = await prisma.dealDocument.findUnique({
    where: { id: documentId },
    select: { id: true, dealId: true, name: true },
  });

  if (!existing) {
    throw new Error(`Document not found: ${documentId}`);
  }

  await prisma.dealDocument.delete({
    where: { id: documentId },
  });

  // Log activity
  await prisma.dealActivity.create({
    data: {
      dealId: existing.dealId,
      activityType: "DOCUMENT_DELETED",
      title: `Document "${existing.name}" deleted`,
      metadata: {
        documentId: existing.id,
      },
      userId,
    },
  });

  return existing;
}
