import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import type { CreateListingInput, MarketplaceFilters } from "./types";

// ============================================================================
// Marketplace Listing Management
// ============================================================================

/**
 * Create or update a marketplace listing for a deal.
 */
export async function upsertListing(
  input: CreateListingInput,
  teamId: string,
) {
  const deal = await prisma.deal.findUnique({
    where: { id: input.dealId },
    select: { id: true, teamId: true, visibility: true, stage: true },
  });

  if (!deal) {
    throw new Error(`Deal not found: ${input.dealId}`);
  }

  if (deal.teamId !== teamId) {
    throw new Error("Deal does not belong to this team");
  }

  // Deal must be at least in SCREENING to list
  const listableStages = [
    "SCREENING",
    "DUE_DILIGENCE",
    "TERM_SHEET",
    "COMMITMENT",
    "CLOSING",
  ];
  if (!listableStages.includes(deal.stage)) {
    throw new Error(
      `Deal must be in ${listableStages.join("/")} stage to list on marketplace`,
    );
  }

  return prisma.marketplaceListing.upsert({
    where: { dealId: input.dealId },
    create: {
      dealId: input.dealId,
      teamId,
      headline: input.headline,
      summary: input.summary,
      highlights: input.highlights ?? [],
      category: input.category,
      coverImageUrl: input.coverImageUrl,
      searchTags: input.searchTags ?? [],
      isActive: false, // Draft by default
    },
    update: {
      headline: input.headline,
      summary: input.summary,
      highlights: input.highlights ?? [],
      category: input.category,
      coverImageUrl: input.coverImageUrl,
      searchTags: input.searchTags ?? [],
    },
  });
}

/**
 * Publish a listing (make it visible on marketplace).
 */
export async function publishListing(listingId: string) {
  return prisma.marketplaceListing.update({
    where: { id: listingId },
    data: {
      isActive: true,
      publishedAt: new Date(),
    },
  });
}

/**
 * Unpublish a listing.
 */
export async function unpublishListing(listingId: string) {
  return prisma.marketplaceListing.update({
    where: { id: listingId },
    data: { isActive: false },
  });
}

/**
 * Record a view on a listing.
 */
export async function recordListingView(listingId: string) {
  return prisma.marketplaceListing.update({
    where: { id: listingId },
    data: { viewCount: { increment: 1 } },
  });
}

/**
 * Record a save/bookmark on a listing.
 */
export async function recordListingSave(listingId: string) {
  return prisma.marketplaceListing.update({
    where: { id: listingId },
    data: { saveCount: { increment: 1 } },
  });
}

// ============================================================================
// Marketplace Browsing (LP-facing)
// ============================================================================

/**
 * Browse active marketplace listings with filtering.
 */
export async function browseListings(
  filters: MarketplaceFilters = {},
  page = 1,
  pageSize = 20,
) {
  const where: Prisma.MarketplaceListingWhereInput = {
    isActive: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };

  if (filters.category) {
    where.category = filters.category;
  }

  if (filters.featured !== undefined) {
    where.featured = filters.featured;
  }

  // Filter via related deal fields
  const dealFilter: Prisma.DealWhereInput = {
    deletedAt: null,
    visibility: { in: ["QUALIFIED", "PUBLIC"] },
  };

  if (filters.sector) {
    dealFilter.targetSector = {
      contains: filters.sector,
      mode: "insensitive",
    };
  }
  if (filters.geography) {
    dealFilter.targetGeography = {
      contains: filters.geography,
      mode: "insensitive",
    };
  }
  if (filters.dealType) {
    dealFilter.dealType = Array.isArray(filters.dealType)
      ? { in: filters.dealType }
      : filters.dealType;
  }
  if (filters.minTicket || filters.maxTicket) {
    dealFilter.minimumTicket = {};
    if (filters.minTicket) {
      (dealFilter.minimumTicket as Prisma.DecimalFilter).lte = filters.minTicket;
    }
  }
  if (filters.search) {
    where.OR = [
      { headline: { contains: filters.search, mode: "insensitive" } },
      { summary: { contains: filters.search, mode: "insensitive" } },
      {
        deal: {
          OR: [
            { title: { contains: filters.search, mode: "insensitive" } },
            { targetName: { contains: filters.search, mode: "insensitive" } },
          ],
        },
      },
    ];
  }
  if (filters.tags && filters.tags.length > 0) {
    where.searchTags = { hasSome: filters.tags };
  }

  where.deal = dealFilter;

  const [listings, total] = await Promise.all([
    prisma.marketplaceListing.findMany({
      where,
      include: {
        deal: {
          select: {
            id: true,
            title: true,
            slug: true,
            dealType: true,
            targetSector: true,
            targetGeography: true,
            targetRaise: true,
            minimumTicket: true,
            expectedReturn: true,
            holdPeriod: true,
            managementFee: true,
            carriedInterest: true,
            stage: true,
            investorCount: true,
            totalCommitted: true,
            deadlineAt: true,
            tags: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            brand: {
              select: { logo: true, brandColor: true },
            },
          },
        },
      },
      orderBy: [
        { featured: "desc" },
        { sortOrder: "asc" },
        { publishedAt: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.marketplaceListing.count({ where }),
  ]);

  return {
    listings,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get a single listing with full deal details (LP view).
 */
export async function getListingDetail(listingId: string) {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    include: {
      deal: {
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          thesis: true,
          dealType: true,
          stage: true,
          targetName: true,
          targetSector: true,
          targetSubSector: true,
          targetGeography: true,
          targetRaise: true,
          minimumTicket: true,
          maximumTicket: true,
          expectedReturn: true,
          holdPeriod: true,
          managementFee: true,
          carriedInterest: true,
          preferredReturn: true,
          investorCount: true,
          totalCommitted: true,
          closingDate: true,
          deadlineAt: true,
          leadSponsor: true,
          isLeadDeal: true,
          tags: true,
          // Public documents only
          documents: {
            where: { restricted: false },
            select: {
              id: true,
              name: true,
              category: true,
              fileType: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      team: {
        select: {
          id: true,
          name: true,
          brand: {
            select: { logo: true, brandColor: true, welcomeMessage: true },
          },
        },
      },
    },
  });

  if (listing) {
    // Increment view count (fire-and-forget)
    recordListingView(listing.id).catch((e) => reportError(e as Error));
  }

  return listing;
}

/**
 * Get available categories for marketplace browsing.
 */
export async function getMarketplaceCategories() {
  const categories = await prisma.marketplaceListing.groupBy({
    by: ["category"],
    where: { isActive: true, category: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  return categories.map((c) => ({
    name: c.category,
    count: c._count.id,
  }));
}
