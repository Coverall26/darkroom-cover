import type { InterestStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { ExpressInterestInput, AllocateInput } from "./types";

// ============================================================================
// Interest Management
// ============================================================================

/**
 * Express interest in a deal (LP-facing).
 */
export async function expressInterest(
  input: ExpressInterestInput,
  userId: string,
  investorId?: string,
) {
  const deal = await prisma.deal.findUnique({
    where: { id: input.dealId },
    select: {
      id: true,
      title: true,
      visibility: true,
      stage: true,
      minimumTicket: true,
      maximumTicket: true,
    },
  });

  if (!deal) {
    throw new Error(`Deal not found: ${input.dealId}`);
  }

  // Validate deal is accepting interest
  const acceptingStages = [
    "SCREENING",
    "DUE_DILIGENCE",
    "TERM_SHEET",
    "COMMITMENT",
  ];
  if (!acceptingStages.includes(deal.stage)) {
    throw new Error(
      `Deal is not currently accepting interest (stage: ${deal.stage})`,
    );
  }

  // Validate ticket size if provided
  if (input.indicativeAmount) {
    if (deal.minimumTicket && input.indicativeAmount < Number(deal.minimumTicket)) {
      throw new Error(
        `Indicative amount ($${input.indicativeAmount.toLocaleString()}) is below minimum ticket ($${Number(deal.minimumTicket).toLocaleString()})`,
      );
    }
    if (deal.maximumTicket && input.indicativeAmount > Number(deal.maximumTicket)) {
      throw new Error(
        `Indicative amount ($${input.indicativeAmount.toLocaleString()}) exceeds maximum ticket ($${Number(deal.maximumTicket).toLocaleString()})`,
      );
    }
  }

  const interest = await prisma.dealInterest.create({
    data: {
      dealId: input.dealId,
      investorId: investorId ?? undefined,
      userId,
      status: "EXPRESSED",
      indicativeAmount: input.indicativeAmount,
      notes: input.notes,
      conditionsOrTerms: input.conditionsOrTerms,
    },
  });

  // Update deal counters
  await prisma.deal.update({
    where: { id: input.dealId },
    data: { investorCount: { increment: 1 } },
  });

  // Update listing interest count if exists
  await prisma.marketplaceListing.updateMany({
    where: { dealId: input.dealId },
    data: { interestCount: { increment: 1 } },
  });

  // Log activity
  await prisma.dealActivity.create({
    data: {
      dealId: input.dealId,
      activityType: "INTEREST_EXPRESSED",
      title: "New interest expressed",
      metadata: {
        indicativeAmount: input.indicativeAmount,
        investorId,
      },
      userId,
    },
  });

  return interest;
}

/**
 * Update interest status (GP-facing).
 */
export async function updateInterestStatus(
  interestId: string,
  status: InterestStatus,
  gpUserId: string,
  gpNotes?: string,
) {
  const interest = await prisma.dealInterest.update({
    where: { id: interestId },
    data: {
      status,
      gpNotes: gpNotes ?? undefined,
      respondedByUserId: gpUserId,
      respondedAt: new Date(),
    },
  });

  return interest;
}

/**
 * List interests for a deal (GP-facing).
 */
export async function listDealInterests(
  dealId: string,
  statusFilter?: InterestStatus[],
) {
  return prisma.dealInterest.findMany({
    where: {
      dealId,
      ...(statusFilter ? { status: { in: statusFilter } } : {}),
    },
    include: {
      investor: {
        select: {
          id: true,
          entityName: true,
          entityType: true,
          accreditationStatus: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ============================================================================
// Allocation Management
// ============================================================================

/**
 * Create an allocation for an investor in a deal (GP-facing).
 */
export async function allocateDeal(input: AllocateInput, gpUserId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: input.dealId },
    select: {
      id: true,
      title: true,
      targetRaise: true,
      totalAllocated: true,
      stage: true,
    },
  });

  if (!deal) {
    throw new Error(`Deal not found: ${input.dealId}`);
  }

  // Warn if over-allocating (but don't block — GPs may intentionally oversubscribe)
  const newTotal = Number(deal.totalAllocated) + input.allocatedAmount;
  const targetRaise = Number(deal.targetRaise ?? 0);

  // Find existing interest to get requested amount
  const existingInterest = await prisma.dealInterest.findUnique({
    where: {
      dealId_investorId: {
        dealId: input.dealId,
        investorId: input.investorId,
      },
    },
  });

  const requestedAmount = existingInterest
    ? Number(existingInterest.indicativeAmount ?? input.allocatedAmount)
    : input.allocatedAmount;

  const [allocation] = await prisma.$transaction([
    prisma.dealAllocation.create({
      data: {
        dealId: input.dealId,
        investorId: input.investorId,
        requestedAmount: requestedAmount,
        allocatedAmount: input.allocatedAmount,
        allocationNotes: input.allocationNotes,
        allocatedByUserId: gpUserId,
        status: "OFFERED",
        offeredAt: new Date(),
      },
    }),

    // Update deal aggregate
    prisma.deal.update({
      where: { id: input.dealId },
      data: {
        totalAllocated: { increment: input.allocatedAmount },
      },
    }),

    // Update interest status if it exists
    ...(existingInterest
      ? [
          prisma.dealInterest.update({
            where: { id: existingInterest.id },
            data: { status: "ALLOCATED" },
          }),
        ]
      : []),

    // Log activity
    prisma.dealActivity.create({
      data: {
        dealId: input.dealId,
        activityType: "ALLOCATION_MADE",
        title: `Allocation of $${input.allocatedAmount.toLocaleString()} offered`,
        metadata: {
          investorId: input.investorId,
          allocatedAmount: input.allocatedAmount,
          requestedAmount,
          overSubscribed: targetRaise > 0 && newTotal > targetRaise,
        },
        userId: gpUserId,
      },
    }),
  ]);

  return allocation;
}

/**
 * LP confirms or rejects an allocation.
 */
export async function respondToAllocation(
  allocationId: string,
  accept: boolean,
  confirmedAmount?: number,
) {
  const allocation = await prisma.dealAllocation.findUnique({
    where: { id: allocationId },
    select: { id: true, dealId: true, allocatedAmount: true, status: true },
  });

  if (!allocation) {
    throw new Error(`Allocation not found: ${allocationId}`);
  }

  if (allocation.status !== "OFFERED") {
    throw new Error(`Allocation is not in OFFERED status: ${allocation.status}`);
  }

  const updatedAllocation = await prisma.dealAllocation.update({
    where: { id: allocationId },
    data: {
      status: accept ? "ACCEPTED" : "REJECTED",
      confirmedAmount: accept
        ? (confirmedAmount ?? Number(allocation.allocatedAmount))
        : 0,
      respondedAt: new Date(),
    },
  });

  // If accepted, update deal committed total
  if (accept) {
    const amount = confirmedAmount ?? Number(allocation.allocatedAmount);
    await prisma.deal.update({
      where: { id: allocation.dealId },
      data: {
        totalCommitted: { increment: amount },
      },
    });
  }

  return updatedAllocation;
}

/**
 * List allocations for a deal.
 */
export async function listDealAllocations(dealId: string) {
  return prisma.dealAllocation.findMany({
    where: { dealId },
    include: {
      investor: {
        select: {
          id: true,
          entityName: true,
          entityType: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      allocatedByUser: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
