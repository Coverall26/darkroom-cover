/**
 * Unified Investor Query — Joins Contact + InvestorProfile data.
 *
 * Provides a single query interface that combines CRM Contact data with
 * InvestorProfile data (if linked). Used by the GP dashboard, investor
 * pipeline views, and outreach targeting.
 *
 * Contact → InvestorProfile linking is via Contact.investorId (unique FK).
 */

import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnifiedInvestorFilters {
  teamId: string;
  query?: string; // Search across email, firstName, lastName, company
  status?: string | string[]; // ContactStatus filter
  source?: string | string[]; // ContactSource filter
  hasInvestorProfile?: boolean; // Only contacts linked to InvestorProfile
  investmentStatus?: string | string[]; // Filter by Investment.status
  minEngagementScore?: number;
  assignedToId?: string;
  tags?: string[];
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "updatedAt" | "engagementScore" | "lastEngagedAt" | "email" | "lastName";
  sortOrder?: "asc" | "desc";
}

export interface UnifiedInvestor {
  // Contact fields
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  status: string;
  source: string;
  engagementScore: number;
  lastEngagedAt: Date | null;
  lastContactedAt: Date | null;
  lastEmailedAt: Date | null;
  nextFollowUpAt: Date | null;
  unsubscribedAt: Date | null;
  emailBounced: boolean;
  tags: unknown;
  notes: string | null;
  createdAt: Date;
  assignedTo: { id: string; name: string | null; email: string | null } | null;
  // InvestorProfile (if linked)
  investor: {
    id: string;
    entityName: string | null;
    entityType: string;
    accreditationStatus: string | null;
    accreditationMethod: string | null;
    fundId: string | null;
    onboardingStep: number;
    investments: Array<{
      id: string;
      status: string;
      commitmentAmount: unknown;
      fundedAmount: unknown;
      fundId: string;
      fundName: string | null;
    }>;
  } | null;
  // Aggregates
  _count: {
    contactNotes: number;
    contactActivities: number;
  };
}

export interface UnifiedInvestorResult {
  investors: UnifiedInvestor[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Query contacts with joined InvestorProfile and Investment data.
 *
 * Returns a unified view combining CRM Contact fields with fund-specific
 * investor data. Supports search, filtering, pagination, and sorting.
 */
export async function getUnifiedInvestors(
  filters: UnifiedInvestorFilters,
): Promise<UnifiedInvestorResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const skip = (page - 1) * pageSize;

  const where: Prisma.ContactWhereInput = { teamId: filters.teamId };

  // Text search
  if (filters.query) {
    const q = filters.query.trim();
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
    ];
  }

  // Contact status filter
  if (filters.status) {
    where.status = Array.isArray(filters.status)
      ? { in: filters.status as Prisma.EnumContactStatusFilter["in"] }
      : filters.status as Prisma.EnumContactStatusFilter;
  }

  // Contact source filter
  if (filters.source) {
    where.source = Array.isArray(filters.source)
      ? { in: filters.source as Prisma.EnumContactSourceFilter["in"] }
      : filters.source as Prisma.EnumContactSourceFilter;
  }

  // Linked investor profile filter
  if (filters.hasInvestorProfile !== undefined) {
    where.investorId = filters.hasInvestorProfile ? { not: null } : null;
  }

  // Investment status filter (requires investor with matching investment)
  if (filters.investmentStatus) {
    const statuses = Array.isArray(filters.investmentStatus)
      ? filters.investmentStatus
      : [filters.investmentStatus];
    where.investor = {
      investments: {
        some: {
          status: { in: statuses as Prisma.EnumInvestmentStatusFilter["in"] },
        },
      },
    };
  }

  // Engagement score filter
  if (filters.minEngagementScore !== undefined) {
    where.engagementScore = { gte: filters.minEngagementScore };
  }

  // Assigned to filter
  if (filters.assignedToId) {
    where.assignedToId = filters.assignedToId;
  }

  // Tag filter
  if (filters.tags && filters.tags.length > 0) {
    where.tags = { array_contains: filters.tags };
  }

  const sortBy = filters.sortBy ?? "createdAt";
  const sortOrder = filters.sortOrder ?? "desc";

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        investor: {
          select: {
            id: true,
            entityName: true,
            entityType: true,
            accreditationStatus: true,
            accreditationMethod: true,
            fundId: true,
            onboardingStep: true,
            investments: {
              select: {
                id: true,
                status: true,
                commitmentAmount: true,
                fundedAmount: true,
                fundId: true,
                fund: { select: { name: true } },
              },
              orderBy: { createdAt: "desc" },
              take: 5, // Limit to most recent investments
            },
          },
        },
        _count: { select: { contactNotes: true, contactActivities: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  // Map to unified shape
  const investors: UnifiedInvestor[] = contacts.map((c) => ({
    id: c.id,
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    company: c.company,
    title: c.title,
    status: c.status,
    source: c.source,
    engagementScore: c.engagementScore,
    lastEngagedAt: c.lastEngagedAt,
    lastContactedAt: c.lastContactedAt,
    lastEmailedAt: c.lastEmailedAt,
    nextFollowUpAt: c.nextFollowUpAt,
    unsubscribedAt: c.unsubscribedAt,
    emailBounced: c.emailBounced,
    tags: c.tags,
    notes: c.notes,
    createdAt: c.createdAt,
    assignedTo: c.assignedTo,
    investor: c.investor
      ? {
          id: c.investor.id,
          entityName: c.investor.entityName,
          entityType: c.investor.entityType,
          accreditationStatus: c.investor.accreditationStatus,
          accreditationMethod: c.investor.accreditationMethod,
          fundId: c.investor.fundId,
          onboardingStep: c.investor.onboardingStep,
          investments: c.investor.investments.map((inv) => ({
            id: inv.id,
            status: inv.status,
            commitmentAmount: inv.commitmentAmount,
            fundedAmount: inv.fundedAmount,
            fundId: inv.fundId,
            fundName: inv.fund?.name ?? null,
          })),
        }
      : null,
    _count: c._count,
  }));

  return {
    investors,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// Single unified investor by contact ID
// ---------------------------------------------------------------------------

/**
 * Get a single unified investor view by contact ID.
 */
export async function getUnifiedInvestorById(
  contactId: string,
  teamId: string,
): Promise<UnifiedInvestor | null> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, teamId },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      investor: {
        select: {
          id: true,
          entityName: true,
          entityType: true,
          accreditationStatus: true,
          accreditationMethod: true,
          fundId: true,
          onboardingStep: true,
          investments: {
            select: {
              id: true,
              status: true,
              commitmentAmount: true,
              fundedAmount: true,
              fundId: true,
              fund: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      _count: { select: { contactNotes: true, contactActivities: true } },
    },
  });

  if (!contact) return null;

  return {
    id: contact.id,
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
    company: contact.company,
    title: contact.title,
    status: contact.status,
    source: contact.source,
    engagementScore: contact.engagementScore,
    lastEngagedAt: contact.lastEngagedAt,
    lastContactedAt: contact.lastContactedAt,
    lastEmailedAt: contact.lastEmailedAt,
    nextFollowUpAt: contact.nextFollowUpAt,
    unsubscribedAt: contact.unsubscribedAt,
    emailBounced: contact.emailBounced,
    tags: contact.tags,
    notes: contact.notes,
    createdAt: contact.createdAt,
    assignedTo: contact.assignedTo,
    investor: contact.investor
      ? {
          id: contact.investor.id,
          entityName: contact.investor.entityName,
          entityType: contact.investor.entityType,
          accreditationStatus: contact.investor.accreditationStatus,
          accreditationMethod: contact.investor.accreditationMethod,
          fundId: contact.investor.fundId,
          onboardingStep: contact.investor.onboardingStep,
          investments: contact.investor.investments.map((inv) => ({
            id: inv.id,
            status: inv.status,
            commitmentAmount: inv.commitmentAmount,
            fundedAmount: inv.fundedAmount,
            fundId: inv.fundId,
            fundName: inv.fund?.name ?? null,
          })),
        }
      : null,
    _count: contact._count,
  };
}
