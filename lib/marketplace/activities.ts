import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

// ============================================================================
// Types
// ============================================================================

export interface ActivityListOptions {
  activityType?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateActivityInput {
  activityType: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Manual Activity Types
// ============================================================================

/** Activity types that can be created manually by GP users */
const MANUAL_ACTIVITY_TYPES = ["MEETING", "CALL", "EMAIL"] as const;

// ============================================================================
// Activity Listing
// ============================================================================

/**
 * List activities for a deal with pagination and optional type filter.
 */
export async function listDealActivities(
  dealId: string,
  options: ActivityListOptions = {},
) {
  const { activityType, page = 1, pageSize = 25 } = options;

  const where: Prisma.DealActivityWhereInput = {
    dealId,
  };

  if (activityType) {
    where.activityType = activityType;
  }

  const [activities, total] = await Promise.all([
    prisma.dealActivity.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.dealActivity.count({ where }),
  ]);

  return {
    activities,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ============================================================================
// Manual Activity Creation
// ============================================================================

/**
 * Create a manual activity entry (for MEETING, CALL, EMAIL types).
 */
export async function createManualActivity(
  dealId: string,
  input: CreateActivityInput,
  userId: string,
) {
  // Validate the activity type is a manual type
  if (
    !MANUAL_ACTIVITY_TYPES.includes(
      input.activityType as (typeof MANUAL_ACTIVITY_TYPES)[number],
    )
  ) {
    throw new Error(
      `Invalid manual activity type: ${input.activityType}. ` +
        `Allowed types: ${MANUAL_ACTIVITY_TYPES.join(", ")}`,
    );
  }

  // Verify the deal exists
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true },
  });

  if (!deal) {
    throw new Error(`Deal not found: ${dealId}`);
  }

  return prisma.dealActivity.create({
    data: {
      dealId,
      activityType: input.activityType,
      title: input.title,
      description: input.description,
      metadata: input.metadata ?? undefined,
      userId,
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });
}
