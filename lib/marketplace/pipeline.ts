import type { DealStage } from "@prisma/client";
import prisma from "@/lib/prisma";
import { STAGE_TRANSITIONS, DEAL_STAGE_CONFIG } from "./types";
import type { TransitionStageInput, PipelineStats, DealKPIs } from "./types";

// ============================================================================
// Stage Transition Engine
// ============================================================================

/**
 * Validates and executes a deal stage transition.
 * Records history, logs activity, and updates timestamps.
 */
export async function transitionDealStage(
  dealId: string,
  input: TransitionStageInput,
  userId: string,
) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, stage: true, teamId: true, title: true },
  });

  if (!deal) {
    throw new Error(`Deal not found: ${dealId}`);
  }

  const currentStage = deal.stage;
  const { toStage, reason, metadata } = input;

  // Validate transition is allowed
  const allowedTransitions = STAGE_TRANSITIONS[currentStage];
  if (!allowedTransitions.includes(toStage)) {
    throw new Error(
      `Invalid stage transition: ${currentStage} → ${toStage}. ` +
        `Allowed transitions: ${allowedTransitions.join(", ")}`,
    );
  }

  // Build timestamp updates based on target stage
  const timestampUpdates = getStageTimestampUpdates(toStage);

  // Execute transition in a transaction
  const [updatedDeal] = await prisma.$transaction([
    // Update the deal stage
    prisma.deal.update({
      where: { id: dealId },
      data: {
        stage: toStage,
        ...timestampUpdates,
      },
    }),

    // Record stage history
    prisma.dealStageHistory.create({
      data: {
        dealId,
        fromStage: currentStage,
        toStage,
        reason,
        metadata: metadata ?? undefined,
        changedByUserId: userId,
      },
    }),

    // Log activity
    prisma.dealActivity.create({
      data: {
        dealId,
        activityType: "STAGE_CHANGE",
        title: `Stage changed: ${DEAL_STAGE_CONFIG[currentStage].label} → ${DEAL_STAGE_CONFIG[toStage].label}`,
        description: reason ?? undefined,
        metadata: {
          fromStage: currentStage,
          toStage,
          ...(metadata ?? {}),
        },
        userId,
      },
    }),
  ]);

  return updatedDeal;
}

/**
 * Returns timestamp field updates for a given target stage.
 */
function getStageTimestampUpdates(
  toStage: DealStage,
): Record<string, Date | null> {
  const now = new Date();
  switch (toStage) {
    case "DUE_DILIGENCE":
      return { ddStartedAt: now };
    case "TERM_SHEET":
      return { termSheetAt: now };
    case "FUNDED":
      return { fundedAt: now };
    case "EXIT":
      return { exitAt: now };
    default:
      return {};
  }
}

// ============================================================================
// Pipeline Analytics
// ============================================================================

/**
 * Computes pipeline statistics for a team.
 */
export async function getPipelineStats(teamId: string): Promise<PipelineStats> {
  const deals = await prisma.deal.findMany({
    where: { teamId, deletedAt: null },
    select: {
      id: true,
      stage: true,
      targetRaise: true,
      totalCommitted: true,
      totalAllocated: true,
      sourcedAt: true,
      fundedAt: true,
      createdAt: true,
      stageHistory: {
        select: { fromStage: true, toStage: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Count by stage
  const byStage = {} as Record<DealStage, number>;
  for (const stage of Object.keys(DEAL_STAGE_CONFIG) as DealStage[]) {
    byStage[stage] = 0;
  }
  for (const deal of deals) {
    byStage[deal.stage]++;
  }

  // Financial totals
  let totalTargetRaise = 0;
  let totalCommitted = 0;
  let totalAllocated = 0;
  for (const deal of deals) {
    totalTargetRaise += Number(deal.targetRaise ?? 0);
    totalCommitted += Number(deal.totalCommitted);
    totalAllocated += Number(deal.totalAllocated);
  }

  // Average time in each stage (from stage history)
  const stageDurations: Record<DealStage, number[]> = {} as Record<
    DealStage,
    number[]
  >;
  for (const stage of Object.keys(DEAL_STAGE_CONFIG) as DealStage[]) {
    stageDurations[stage] = [];
  }

  for (const deal of deals) {
    for (let i = 0; i < deal.stageHistory.length; i++) {
      const entry = deal.stageHistory[i];
      if (entry.fromStage) {
        const nextEntry = deal.stageHistory[i + 1];
        const endTime = nextEntry
          ? nextEntry.createdAt.getTime()
          : Date.now();
        const durationDays =
          (endTime - entry.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        stageDurations[entry.fromStage].push(durationDays);
      }
    }
  }

  const avgTimeInStage = {} as Record<DealStage, number>;
  for (const [stage, durations] of Object.entries(stageDurations)) {
    avgTimeInStage[stage as DealStage] =
      durations.length > 0
        ? Math.round(
            durations.reduce((a, b) => a + b, 0) / durations.length,
          )
        : 0;
  }

  // Conversion & pass rates
  const sourcedCount = deals.length;
  const fundedCount = deals.filter(
    (d) =>
      d.stage === "FUNDED" ||
      d.stage === "MONITORING" ||
      d.stage === "EXIT",
  ).length;
  const passedCount = deals.filter((d) => d.stage === "PASSED").length;

  return {
    totalDeals: deals.length,
    byStage,
    totalTargetRaise,
    totalCommitted,
    totalAllocated,
    avgTimeInStage,
    conversionRate: sourcedCount > 0 ? (fundedCount / sourcedCount) * 100 : 0,
    passRate: sourcedCount > 0 ? (passedCount / sourcedCount) * 100 : 0,
  };
}

/**
 * Computes KPIs for a single deal.
 */
export async function getDealKPIs(dealId: string): Promise<DealKPIs> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      stage: true,
      targetRaise: true,
      totalCommitted: true,
      totalAllocated: true,
      investorCount: true,
      sourcedAt: true,
      createdAt: true,
      interests: { select: { id: true } },
      allocations: {
        select: { allocatedAmount: true },
      },
      stageHistory: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  if (!deal) {
    throw new Error(`Deal not found: ${dealId}`);
  }

  const targetRaise = Number(deal.targetRaise ?? 0);
  const totalCommitted = Number(deal.totalCommitted);
  const allocationAmounts = deal.allocations.map((a) =>
    Number(a.allocatedAmount),
  );

  const lastStageChange = deal.stageHistory[0]?.createdAt ?? deal.createdAt;
  const daysInCurrentStage = Math.floor(
    (Date.now() - lastStageChange.getTime()) / (1000 * 60 * 60 * 24),
  );
  const daysTotal = Math.floor(
    (Date.now() - deal.sourcedAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    dealId: deal.id,
    commitmentProgress:
      targetRaise > 0 ? (totalCommitted / targetRaise) * 100 : 0,
    investorCount: deal.investorCount,
    interestCount: deal.interests.length,
    allocationCount: deal.allocations.length,
    avgTicketSize:
      allocationAmounts.length > 0
        ? allocationAmounts.reduce((a, b) => a + b, 0) /
          allocationAmounts.length
        : 0,
    daysInCurrentStage,
    daysTotal,
  };
}
