/**
 * AUM Calculator
 *
 * Computes Assets Under Management using fund-specific fee rates.
 * Supports daily (default), weekly, monthly, and annual calculation periods.
 * Stores historical snapshots in the AumSnapshot model.
 */

import prisma from "@/lib/prisma";

export type AumPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "ANNUAL";

export interface AumCalculation {
  fundId: string;
  fundName: string;
  asOf: Date;
  // Core metrics
  grossAum: number;
  netAum: number;
  nav: number;
  totalCommitted: number;
  totalFunded: number;
  totalDistributed: number;
  // Fee deductions (using fund-specific rates)
  deductions: {
    managementFees: number;
    performanceFees: number;
    orgFees: number;
    expenses: number;
    total: number;
  };
  // Rates used (snapshotted)
  rates: {
    managementFeePct: number;
    carryPct: number;
    orgFeePct: number;
    expenseRatioPct: number;
  };
  // Context
  investorCount: number;
  fundAgeYears: number;
  ratios: {
    fundedRatio: number;
    distributedRatio: number;
    expenseRatio: number;
  };
}

/**
 * Calculate AUM for a single fund using its configured fee rates.
 */
export async function calculateAum(fundId: string): Promise<AumCalculation | null> {
  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
    include: {
      investments: {
        where: { status: { in: ["COMMITTED", "DOCS_APPROVED", "PARTIALLY_FUNDED", "FUNDED"] } },
      },
      distributions: {
        where: { status: "COMPLETED" },
      },
    },
  });

  if (!fund) return null;

  const totalCommitted = fund.investments.reduce(
    (sum, inv) => sum + parseFloat(inv.commitmentAmount.toString()),
    0,
  );

  const totalFunded = fund.investments.reduce(
    (sum, inv) => sum + parseFloat(inv.fundedAmount.toString()),
    0,
  );

  const totalDistributed = fund.distributions.reduce(
    (sum, dist) => sum + parseFloat(dist.totalAmount.toString()),
    0,
  );

  const grossAum = totalFunded;

  // Use fund-specific rates (fall back to sensible defaults)
  const mgmtRate = fund.managementFeePct
    ? parseFloat(fund.managementFeePct.toString())
    : 0.02;
  const carryRate = fund.carryPct
    ? parseFloat(fund.carryPct.toString())
    : 0.20;
  const orgRate = fund.orgFeePct
    ? parseFloat(fund.orgFeePct.toString())
    : 0.005;
  const expenseRate = fund.expenseRatioPct
    ? parseFloat(fund.expenseRatioPct.toString())
    : 0.003;

  const fundAgeYears =
    (Date.now() - new Date(fund.createdAt).getTime()) /
    (1000 * 60 * 60 * 24 * 365.25);

  // Management fees accrue over time
  const managementFees = round2(grossAum * mgmtRate * fundAgeYears);

  // Performance fees: placeholder — requires realized gains tracking
  const performanceFees = 0;

  // One-time organizational fees
  const orgFees = round2(grossAum * orgRate);

  // Ongoing operating expenses
  const expenses = round2(grossAum * expenseRate * fundAgeYears);

  const totalDeductions = round2(managementFees + performanceFees + orgFees + expenses);
  const netAum = round2(grossAum - totalDeductions);

  // NAV includes unrealized gains (placeholder for future)
  const unrealizedGains = 0;
  const nav = round2(netAum + unrealizedGains);

  return {
    fundId: fund.id,
    fundName: fund.name,
    asOf: new Date(),
    grossAum,
    netAum,
    nav,
    totalCommitted,
    totalFunded,
    totalDistributed,
    deductions: {
      managementFees,
      performanceFees,
      orgFees,
      expenses,
      total: totalDeductions,
    },
    rates: {
      managementFeePct: mgmtRate,
      carryPct: carryRate,
      orgFeePct: orgRate,
      expenseRatioPct: expenseRate,
    },
    investorCount: fund.investments.length,
    fundAgeYears,
    ratios: {
      fundedRatio: totalCommitted > 0 ? round2((totalFunded / totalCommitted) * 100) : 0,
      distributedRatio: totalFunded > 0 ? round2((totalDistributed / totalFunded) * 100) : 0,
      expenseRatio: grossAum > 0 ? round2((totalDeductions / grossAum) * 100) : 0,
    },
  };
}

/**
 * Take an AUM snapshot and persist it to the database.
 * Uses upsert to prevent duplicates for the same fund/date/period.
 */
export async function takeAumSnapshot(
  fundId: string,
  period?: AumPeriod,
): Promise<{ success: boolean; snapshotId?: string; error?: string }> {
  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
    select: { aumCalculationFrequency: true },
  });

  if (!fund) return { success: false, error: "Fund not found" };

  const snapshotPeriod = period || (fund.aumCalculationFrequency as AumPeriod) || "DAILY";
  const calc = await calculateAum(fundId);
  if (!calc) return { success: false, error: "AUM calculation failed" };

  const snapshotDate = getSnapshotDate(snapshotPeriod);

  const snapshot = await prisma.aumSnapshot.upsert({
    where: {
      fundId_date_period: {
        fundId,
        date: snapshotDate,
        period: snapshotPeriod,
      },
    },
    update: {
      grossAum: calc.grossAum,
      netAum: calc.netAum,
      nav: calc.nav,
      totalCommitted: calc.totalCommitted,
      totalFunded: calc.totalFunded,
      totalDistributed: calc.totalDistributed,
      managementFees: calc.deductions.managementFees,
      performanceFees: calc.deductions.performanceFees,
      orgFees: calc.deductions.orgFees,
      expenses: calc.deductions.expenses,
      totalDeductions: calc.deductions.total,
      investorCount: calc.investorCount,
      managementFeeRate: calc.rates.managementFeePct,
      carryRate: calc.rates.carryPct,
      orgFeeRate: calc.rates.orgFeePct,
      expenseRate: calc.rates.expenseRatioPct,
    },
    create: {
      fundId,
      date: snapshotDate,
      period: snapshotPeriod,
      grossAum: calc.grossAum,
      netAum: calc.netAum,
      nav: calc.nav,
      totalCommitted: calc.totalCommitted,
      totalFunded: calc.totalFunded,
      totalDistributed: calc.totalDistributed,
      managementFees: calc.deductions.managementFees,
      performanceFees: calc.deductions.performanceFees,
      orgFees: calc.deductions.orgFees,
      expenses: calc.deductions.expenses,
      totalDeductions: calc.deductions.total,
      investorCount: calc.investorCount,
      managementFeeRate: calc.rates.managementFeePct,
      carryRate: calc.rates.carryPct,
      orgFeeRate: calc.rates.orgFeePct,
      expenseRate: calc.rates.expenseRatioPct,
    },
  });

  return { success: true, snapshotId: snapshot.id };
}

/**
 * Retrieve AUM history for a fund with period and date range filtering.
 */
export async function getAumHistory(
  fundId: string,
  options: {
    period?: AumPeriod;
    from?: Date;
    to?: Date;
    limit?: number;
  } = {},
) {
  const { period, from, to, limit = 365 } = options;

  const where: any = { fundId };
  if (period) where.period = period;
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = from;
    if (to) where.date.lte = to;
  }

  return prisma.aumSnapshot.findMany({
    where,
    orderBy: { date: "desc" },
    take: Math.min(limit, 1000),
  });
}

/**
 * Run scheduled AUM calculations for all funds based on their configured frequency.
 * Called by the cron job.
 */
export async function runScheduledAumCalculations(): Promise<{
  processed: number;
  errors: number;
  results: { fundId: string; fundName: string; success: boolean; error?: string }[];
}> {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon
  const dayOfMonth = now.getUTCDate();
  const month = now.getUTCMonth(); // 0=Jan
  const dayOfYear = getDayOfYear(now);

  // Determine which frequencies to process today
  const periodsToRun: AumPeriod[] = ["DAILY"]; // Always run daily

  if (dayOfWeek === 1) periodsToRun.push("WEEKLY"); // Mondays
  if (dayOfMonth === 1) periodsToRun.push("MONTHLY"); // 1st of month
  if (month === 0 && dayOfMonth === 1) periodsToRun.push("ANNUAL"); // Jan 1

  // Get all funds with their configured frequency
  const funds = await prisma.fund.findMany({
    where: {
      status: { in: ["RAISING", "ACTIVE", "DEPLOYED"] },
    },
    select: {
      id: true,
      name: true,
      aumCalculationFrequency: true,
    },
  });

  const results: { fundId: string; fundName: string; success: boolean; error?: string }[] = [];
  let processed = 0;
  let errors = 0;

  for (const fund of funds) {
    const freq = (fund.aumCalculationFrequency || "DAILY") as AumPeriod;

    // Only process if the fund's configured frequency matches today's schedule
    if (!periodsToRun.includes(freq)) continue;

    try {
      const result = await takeAumSnapshot(fund.id, freq);
      results.push({
        fundId: fund.id,
        fundName: fund.name,
        success: result.success,
        error: result.error,
      });
      if (result.success) processed++;
      else errors++;
    } catch (err) {
      errors++;
      results.push({
        fundId: fund.id,
        fundName: fund.name,
        success: false,
        error: (err as Error).message,
      });
    }
  }

  return { processed, errors, results };
}

// --- Helpers ---

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Normalize a date to the snapshot boundary for the given period.
 */
function getSnapshotDate(period: AumPeriod): Date {
  const now = new Date();
  // All snapshots stored at midnight UTC of the relevant date
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  switch (period) {
    case "WEEKLY":
      // Snap to Monday of the current week
      const day = d.getUTCDay();
      const diff = day === 0 ? 6 : day - 1; // Monday = 0 offset
      d.setUTCDate(d.getUTCDate() - diff);
      return d;
    case "MONTHLY":
      // Snap to 1st of the month
      d.setUTCDate(1);
      return d;
    case "ANNUAL":
      // Snap to Jan 1
      d.setUTCMonth(0, 1);
      return d;
    case "DAILY":
    default:
      return d;
  }
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
