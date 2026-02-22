import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  CreateDealInput,
  UpdateDealInput,
  DealFilters,
} from "./types";

// ============================================================================
// Slug Generation
// ============================================================================

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function uniqueSlug(teamId: string, baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let attempt = 0;
  while (true) {
    const existing = await prisma.deal.findUnique({
      where: { teamId_slug: { teamId, slug } },
      select: { id: true },
    });
    if (!existing) return slug;
    attempt++;
    slug = `${baseSlug}-${attempt}`;
  }
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new deal in the pipeline.
 */
export async function createDeal(
  teamId: string,
  input: CreateDealInput,
  userId: string,
) {
  const slug = await uniqueSlug(teamId, generateSlug(input.title));

  const deal = await prisma.deal.create({
    data: {
      teamId,
      title: input.title,
      slug,
      description: input.description,
      thesis: input.thesis,
      dealType: input.dealType ?? "EQUITY",
      visibility: input.visibility ?? "PRIVATE",
      targetName: input.targetName,
      targetSector: input.targetSector,
      targetSubSector: input.targetSubSector,
      targetGeography: input.targetGeography,
      targetWebsite: input.targetWebsite,
      targetRaise: input.targetRaise,
      minimumTicket: input.minimumTicket,
      maximumTicket: input.maximumTicket,
      preMoneyValuation: input.preMoneyValuation,
      expectedReturn: input.expectedReturn,
      holdPeriod: input.holdPeriod,
      managementFee: input.managementFee,
      carriedInterest: input.carriedInterest,
      preferredReturn: input.preferredReturn,
      closingDate: input.closingDate ? new Date(input.closingDate) : undefined,
      deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : undefined,
      fundId: input.fundId,
      leadSponsor: input.leadSponsor,
      isLeadDeal: input.isLeadDeal ?? true,
      tags: input.tags ?? [],
      confidential: input.confidential ?? true,
      createdByUserId: userId,
    },
  });

  // Record initial stage history
  await prisma.dealStageHistory.create({
    data: {
      dealId: deal.id,
      fromStage: null,
      toStage: "SOURCED",
      reason: "Deal created",
      changedByUserId: userId,
    },
  });

  // Log activity
  await prisma.dealActivity.create({
    data: {
      dealId: deal.id,
      activityType: "DEAL_CREATED",
      title: `Deal "${deal.title}" created`,
      userId,
    },
  });

  return deal;
}

/**
 * Update an existing deal.
 */
export async function updateDeal(
  dealId: string,
  input: UpdateDealInput,
  userId: string,
) {
  const { stage, ...updateData } = input;

  // Stage transitions are handled separately via pipeline.ts
  if (stage) {
    throw new Error(
      "Use transitionDealStage() to change deal stages, not updateDeal()",
    );
  }

  const data: Prisma.DealUpdateInput = {};

  if (updateData.title !== undefined) data.title = updateData.title;
  if (updateData.description !== undefined)
    data.description = updateData.description;
  if (updateData.thesis !== undefined) data.thesis = updateData.thesis;
  if (updateData.dealType !== undefined) data.dealType = updateData.dealType;
  if (updateData.visibility !== undefined)
    data.visibility = updateData.visibility;
  if (updateData.targetName !== undefined)
    data.targetName = updateData.targetName;
  if (updateData.targetSector !== undefined)
    data.targetSector = updateData.targetSector;
  if (updateData.targetSubSector !== undefined)
    data.targetSubSector = updateData.targetSubSector;
  if (updateData.targetGeography !== undefined)
    data.targetGeography = updateData.targetGeography;
  if (updateData.targetWebsite !== undefined)
    data.targetWebsite = updateData.targetWebsite;
  if (updateData.targetRaise !== undefined)
    data.targetRaise = updateData.targetRaise;
  if (updateData.minimumTicket !== undefined)
    data.minimumTicket = updateData.minimumTicket;
  if (updateData.maximumTicket !== undefined)
    data.maximumTicket = updateData.maximumTicket;
  if (updateData.preMoneyValuation !== undefined)
    data.preMoneyValuation = updateData.preMoneyValuation;
  if (updateData.expectedReturn !== undefined)
    data.expectedReturn = updateData.expectedReturn;
  if (updateData.holdPeriod !== undefined)
    data.holdPeriod = updateData.holdPeriod;
  if (updateData.managementFee !== undefined)
    data.managementFee = updateData.managementFee;
  if (updateData.carriedInterest !== undefined)
    data.carriedInterest = updateData.carriedInterest;
  if (updateData.preferredReturn !== undefined)
    data.preferredReturn = updateData.preferredReturn;
  if (updateData.closingDate !== undefined)
    data.closingDate = updateData.closingDate
      ? new Date(updateData.closingDate)
      : null;
  if (updateData.deadlineAt !== undefined)
    data.deadlineAt = updateData.deadlineAt
      ? new Date(updateData.deadlineAt)
      : null;
  if (updateData.fundId !== undefined) data.fund = updateData.fundId
    ? { connect: { id: updateData.fundId } }
    : { disconnect: true };
  if (updateData.leadSponsor !== undefined)
    data.leadSponsor = updateData.leadSponsor;
  if (updateData.isLeadDeal !== undefined)
    data.isLeadDeal = updateData.isLeadDeal;
  if (updateData.tags !== undefined) data.tags = updateData.tags;
  if (updateData.confidential !== undefined)
    data.confidential = updateData.confidential;
  if (updateData.riskScore !== undefined)
    data.riskScore = updateData.riskScore;
  if (updateData.customFields !== undefined)
    data.customFields = updateData.customFields as Prisma.InputJsonValue;

  const deal = await prisma.deal.update({
    where: { id: dealId },
    data,
  });

  // Log activity
  await prisma.dealActivity.create({
    data: {
      dealId,
      activityType: "DEAL_UPDATED",
      title: `Deal updated`,
      metadata: { updatedFields: Object.keys(updateData) },
      userId,
    },
  });

  return deal;
}

/**
 * Soft-delete a deal.
 */
export async function deleteDeal(dealId: string, userId: string) {
  const deal = await prisma.deal.update({
    where: { id: dealId },
    data: { deletedAt: new Date() },
  });

  await prisma.dealActivity.create({
    data: {
      dealId,
      activityType: "DEAL_DELETED",
      title: `Deal "${deal.title}" deleted`,
      userId,
    },
  });

  return deal;
}

/**
 * Get a single deal with related data.
 */
export async function getDeal(dealId: string) {
  return prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      fund: { select: { id: true, name: true, status: true } },
      createdByUser: { select: { id: true, name: true, email: true } },
      stageHistory: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          changedByUser: { select: { id: true, name: true } },
        },
      },
      interests: {
        include: {
          investor: {
            select: { id: true, entityName: true, entityType: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      allocations: {
        include: {
          investor: {
            select: { id: true, entityName: true, entityType: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      documents: { orderBy: { createdAt: "desc" } },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true } } },
      },
      listings: { take: 1 },
      _count: {
        select: {
          interests: true,
          allocations: true,
          documents: true,
          activities: true,
        },
      },
    },
  });
}

/**
 * List deals for a team with filtering.
 */
export async function listDeals(
  teamId: string,
  filters: DealFilters = {},
  page = 1,
  pageSize = 25,
) {
  const where: Prisma.DealWhereInput = {
    teamId,
    deletedAt: filters.includeDeleted ? undefined : null,
  };

  if (filters.stage) {
    where.stage = Array.isArray(filters.stage)
      ? { in: filters.stage }
      : filters.stage;
  }
  if (filters.dealType) {
    where.dealType = Array.isArray(filters.dealType)
      ? { in: filters.dealType }
      : filters.dealType;
  }
  if (filters.visibility) {
    where.visibility = filters.visibility;
  }
  if (filters.sector) {
    where.targetSector = { contains: filters.sector, mode: "insensitive" };
  }
  if (filters.geography) {
    where.targetGeography = {
      contains: filters.geography,
      mode: "insensitive",
    };
  }
  if (filters.minRaise || filters.maxRaise) {
    where.targetRaise = {};
    if (filters.minRaise)
      (where.targetRaise as Prisma.DecimalFilter).gte = filters.minRaise;
    if (filters.maxRaise)
      (where.targetRaise as Prisma.DecimalFilter).lte = filters.maxRaise;
  }
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { targetName: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.tags && filters.tags.length > 0) {
    where.tags = { hasSome: filters.tags };
  }
  if (filters.fundId) {
    where.fundId = filters.fundId;
  }

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: {
        fund: { select: { id: true, name: true } },
        createdByUser: { select: { id: true, name: true } },
        listings: { select: { id: true, isActive: true }, take: 1 },
        _count: { select: { interests: true, allocations: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.deal.count({ where }),
  ]);

  return {
    deals,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
