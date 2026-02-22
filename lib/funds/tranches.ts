/**
 * Tranche persistence and lifecycle management.
 *
 * Handles CRUD, status transitions, and aggregation for InvestmentTranche rows.
 * Used by both the LP staged-commitment API and the GP tranche management dashboard.
 */
import prisma from "@/lib/prisma";

// ─── Status Constants ────────────────────────────────────────────────────────

export const TRANCHE_STATUSES = [
  "SCHEDULED",
  "CALLED",
  "PARTIALLY_FUNDED",
  "FUNDED",
  "OVERDUE",
  "DEFAULTED",
  "CANCELLED",
] as const;

export type TrancheStatus = (typeof TRANCHE_STATUSES)[number];

/** Valid status transitions for the tranche lifecycle. */
const VALID_TRANSITIONS: Record<TrancheStatus, TrancheStatus[]> = {
  SCHEDULED: ["CALLED", "PARTIALLY_FUNDED", "FUNDED", "OVERDUE", "CANCELLED"],
  CALLED: ["PARTIALLY_FUNDED", "FUNDED", "OVERDUE", "CANCELLED"],
  PARTIALLY_FUNDED: ["FUNDED", "OVERDUE", "CANCELLED"],
  FUNDED: [], // Terminal state
  OVERDUE: ["PARTIALLY_FUNDED", "FUNDED", "DEFAULTED", "CANCELLED"],
  DEFAULTED: ["CANCELLED"], // Only GP can cancel a default
  CANCELLED: [], // Terminal state
};

// ─── Tranche Queries ─────────────────────────────────────────────────────────

/** Get all tranches for an investment, ordered by tranche number. */
export async function getInvestmentTranches(investmentId: string) {
  return prisma.investmentTranche.findMany({
    where: { investmentId },
    orderBy: { trancheNumber: "asc" },
  });
}

/** Get a single tranche by ID. */
export async function getTranche(trancheId: string) {
  return prisma.investmentTranche.findUnique({
    where: { id: trancheId },
    include: {
      investment: {
        include: {
          fund: { select: { id: true, name: true, teamId: true } },
          investor: {
            select: {
              id: true,
              entityName: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
  });
}

/** Get all tranches for a fund, across all investments. */
export async function getFundTranches(fundId: string, filters?: {
  status?: TrancheStatus;
  dueBefore?: Date;
  dueAfter?: Date;
}) {
  const where: any = {
    investment: { fundId },
  };

  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.dueBefore) {
    where.scheduledDate = { ...(where.scheduledDate || {}), lte: filters.dueBefore };
  }
  if (filters?.dueAfter) {
    where.scheduledDate = { ...(where.scheduledDate || {}), gte: filters.dueAfter };
  }

  return prisma.investmentTranche.findMany({
    where,
    include: {
      investment: {
        include: {
          investor: {
            select: {
              id: true,
              entityName: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });
}

// ─── Tranche Status Transitions ──────────────────────────────────────────────

export interface TrancheTransitionResult {
  success: boolean;
  tranche?: any;
  error?: string;
}

/**
 * Transition a tranche to a new status with validation.
 * Updates relevant date fields based on the target status.
 */
export async function transitionTrancheStatus(
  trancheId: string,
  newStatus: TrancheStatus,
  options?: {
    fundedAmount?: number;
    capitalCallId?: string;
    wireProofDocumentId?: string;
    notes?: string;
  },
): Promise<TrancheTransitionResult> {
  const tranche = await prisma.investmentTranche.findUnique({
    where: { id: trancheId },
    include: { investment: true },
  });

  if (!tranche) {
    return { success: false, error: "Tranche not found" };
  }

  const currentStatus = tranche.status as TrancheStatus;
  const allowed = VALID_TRANSITIONS[currentStatus];

  if (!allowed || !allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot transition from ${currentStatus} to ${newStatus}`,
    };
  }

  // Build update data based on target status
  const updateData: any = {
    status: newStatus,
  };

  if (options?.notes) {
    updateData.notes = options.notes;
  }

  if (options?.capitalCallId) {
    updateData.capitalCallId = options.capitalCallId;
  }

  if (options?.wireProofDocumentId) {
    updateData.wireProofDocumentId = options.wireProofDocumentId;
  }

  // Set date fields based on status
  switch (newStatus) {
    case "CALLED":
      updateData.calledDate = new Date();
      break;
    case "PARTIALLY_FUNDED":
      if (options?.fundedAmount !== undefined) {
        updateData.fundedAmount = options.fundedAmount;
      }
      break;
    case "FUNDED":
      updateData.fundedAmount = Number(tranche.amount);
      updateData.fundedDate = new Date();
      if (options?.fundedAmount !== undefined) {
        updateData.fundedAmount = options.fundedAmount;
      }
      break;
    case "OVERDUE":
      updateData.overdueDate = new Date();
      break;
  }

  const updated = await prisma.investmentTranche.update({
    where: { id: trancheId },
    data: updateData,
  });

  // If tranche is now FUNDED, update the parent investment's fundedAmount
  if (newStatus === "FUNDED" || newStatus === "PARTIALLY_FUNDED") {
    await recalculateInvestmentFunded(tranche.investmentId);
  }

  return { success: true, tranche: updated };
}

// ─── Investment Funded Recalculation ─────────────────────────────────────────

/**
 * Recalculate an investment's total fundedAmount from its tranches.
 * Called whenever a tranche funding status changes.
 */
export async function recalculateInvestmentFunded(investmentId: string) {
  const tranches = await prisma.investmentTranche.findMany({
    where: { investmentId },
    select: { fundedAmount: true },
  });

  const totalFunded = tranches.reduce(
    (sum, t) => sum + Number(t.fundedAmount),
    0,
  );

  const investment = await prisma.investment.update({
    where: { id: investmentId },
    data: { fundedAmount: totalFunded },
  });

  // If all tranches are funded, update investment status
  const allTranches = await prisma.investmentTranche.findMany({
    where: { investmentId },
  });

  const allFunded = allTranches.length > 0 && allTranches.every(
    (t) => t.status === "FUNDED" || t.status === "CANCELLED",
  );

  if (allFunded) {
    await prisma.investment.update({
      where: { id: investmentId },
      data: { status: "FUNDED" },
    });
  }

  return investment;
}

// ─── Tranche Aggregation ─────────────────────────────────────────────────────

/** Get aggregate tranche statistics for a fund. */
export async function getFundTrancheStats(fundId: string) {
  const tranches = await prisma.investmentTranche.findMany({
    where: { investment: { fundId } },
    select: {
      status: true,
      amount: true,
      fundedAmount: true,
      scheduledDate: true,
    },
  });

  const now = new Date();

  const stats = {
    totalTranches: tranches.length,
    totalScheduledAmount: 0,
    totalFundedAmount: 0,
    byStatus: {} as Record<string, { count: number; amount: number; funded: number }>,
    upcoming: 0, // Tranches due in next 30 days
    overdue: 0, // Tranches past due but not FUNDED
  };

  for (const t of tranches) {
    const amount = Number(t.amount);
    const funded = Number(t.fundedAmount);

    stats.totalScheduledAmount += amount;
    stats.totalFundedAmount += funded;

    if (!stats.byStatus[t.status]) {
      stats.byStatus[t.status] = { count: 0, amount: 0, funded: 0 };
    }
    stats.byStatus[t.status].count++;
    stats.byStatus[t.status].amount += amount;
    stats.byStatus[t.status].funded += funded;

    // Check upcoming (next 30 days)
    const thirtyDays = new Date(now);
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    if (
      t.scheduledDate <= thirtyDays &&
      t.scheduledDate >= now &&
      t.status !== "FUNDED" &&
      t.status !== "CANCELLED"
    ) {
      stats.upcoming++;
    }

    // Check overdue
    if (
      t.scheduledDate < now &&
      t.status !== "FUNDED" &&
      t.status !== "CANCELLED" &&
      t.status !== "DEFAULTED"
    ) {
      stats.overdue++;
    }
  }

  return stats;
}

// ─── Overdue Detection ───────────────────────────────────────────────────────

/**
 * Find and optionally mark overdue tranches for a fund.
 * Returns tranches that are past their scheduled date but not yet funded.
 */
export async function detectOverdueTranches(fundId: string, autoMark = false) {
  const overdue = await prisma.investmentTranche.findMany({
    where: {
      investment: { fundId },
      scheduledDate: { lt: new Date() },
      status: { in: ["SCHEDULED", "CALLED"] },
    },
    include: {
      investment: {
        include: {
          investor: {
            select: {
              id: true,
              entityName: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });

  if (autoMark && overdue.length > 0) {
    await prisma.investmentTranche.updateMany({
      where: {
        id: { in: overdue.map((t) => t.id) },
      },
      data: {
        status: "OVERDUE",
        overdueDate: new Date(),
      },
    });
  }

  return overdue;
}
