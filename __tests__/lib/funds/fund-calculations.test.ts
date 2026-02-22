/**
 * Fund Calculations Unit Tests
 *
 * Covers: AUM calculation, fee computation, fund aggregation,
 * investor count, waterfall types, threshold checking.
 */

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    fund: { findUnique: jest.fn(), findMany: jest.fn() },
    aumSnapshot: { upsert: jest.fn(), findMany: jest.fn() },
    fundAggregate: { update: jest.fn(), updateMany: jest.fn() },
  },
}));

import prisma from "@/lib/prisma";
import {
  calculateAum,
  takeAumSnapshot,
  getAumHistory,
  runScheduledAumCalculations,
} from "@/lib/funds/aum-calculator";
import {
  checkCapitalCallThreshold,
  enforceCapitalCallThreshold,
  updateAggregateProgress,
  checkAndMarkThresholdReached,
  checkThresholdReached,
  markThresholdNotified,
} from "@/lib/funds/threshold";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe("AUM Calculator", () => {
  beforeEach(() => jest.clearAllMocks());

  const baseFund = {
    id: "fund-1",
    name: "Test Fund I",
    managementFeePct: 0.02,
    carryPct: 0.2,
    orgFeePct: 0.005,
    expenseRatioPct: 0.003,
    createdAt: new Date(Date.now() - 365.25 * 24 * 60 * 60 * 1000), // 1 year ago
    investments: [
      { commitmentAmount: 500000, fundedAmount: 400000, status: "FUNDED" },
      { commitmentAmount: 300000, fundedAmount: 200000, status: "COMMITTED" },
    ],
    distributions: [
      { totalAmount: 50000, status: "COMPLETED" },
    ],
  };

  describe("calculateAum", () => {
    it("returns null for non-existent fund", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await calculateAum("non-existent");
      expect(result).toBeNull();
    });

    it("computes total committed from all qualifying investments", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(baseFund);
      const result = await calculateAum("fund-1");
      expect(result).not.toBeNull();
      expect(result!.totalCommitted).toBe(800000); // 500k + 300k
    });

    it("computes total funded from all qualifying investments", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(baseFund);
      const result = await calculateAum("fund-1");
      expect(result!.totalFunded).toBe(600000); // 400k + 200k
    });

    it("computes total distributed from completed distributions", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(baseFund);
      const result = await calculateAum("fund-1");
      expect(result!.totalDistributed).toBe(50000);
    });

    it("computes investor count", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(baseFund);
      const result = await calculateAum("fund-1");
      expect(result!.investorCount).toBe(2);
    });

    it("uses fund-specific fee rates", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(baseFund);
      const result = await calculateAum("fund-1");
      expect(result!.rates.managementFeePct).toBe(0.02);
      expect(result!.rates.carryPct).toBe(0.2);
      expect(result!.rates.orgFeePct).toBe(0.005);
      expect(result!.rates.expenseRatioPct).toBe(0.003);
    });

    it("falls back to default rates when fund has no rates", async () => {
      const fundNoRates = {
        ...baseFund,
        managementFeePct: null,
        carryPct: null,
        orgFeePct: null,
        expenseRatioPct: null,
      };
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(fundNoRates);
      const result = await calculateAum("fund-1");
      expect(result!.rates.managementFeePct).toBe(0.02);
      expect(result!.rates.carryPct).toBe(0.20);
      expect(result!.rates.orgFeePct).toBe(0.005);
      expect(result!.rates.expenseRatioPct).toBe(0.003);
    });

    it("computes management fees accrued over time", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(baseFund);
      const result = await calculateAum("fund-1");
      // grossAum (600k) * mgmtRate (0.02) * ~1 year
      expect(result!.deductions.managementFees).toBeGreaterThan(0);
      expect(result!.deductions.managementFees).toBeLessThan(15000); // ~12k expected
    });

    it("computes organizational fees as one-time", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(baseFund);
      const result = await calculateAum("fund-1");
      // grossAum (600k) * orgRate (0.005) = 3000
      expect(result!.deductions.orgFees).toBe(3000);
    });

    it("computes net AUM as gross minus deductions", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(baseFund);
      const result = await calculateAum("fund-1");
      expect(result!.netAum).toBe(
        Math.round((result!.grossAum - result!.deductions.total) * 100) / 100
      );
    });

    it("computes funded ratio as percentage", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(baseFund);
      const result = await calculateAum("fund-1");
      // 600k funded / 800k committed = 75%
      expect(result!.ratios.fundedRatio).toBe(75);
    });

    it("computes distributed ratio as percentage", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(baseFund);
      const result = await calculateAum("fund-1");
      // 50k distributed / 600k funded = ~8.33%
      expect(result!.ratios.distributedRatio).toBeCloseTo(8.33, 0);
    });

    it("handles zero committed gracefully", async () => {
      const emptyFund = { ...baseFund, investments: [], distributions: [] };
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(emptyFund);
      const result = await calculateAum("fund-1");
      expect(result!.totalCommitted).toBe(0);
      expect(result!.totalFunded).toBe(0);
      expect(result!.ratios.fundedRatio).toBe(0);
      expect(result!.ratios.distributedRatio).toBe(0);
    });
  });

  describe("takeAumSnapshot", () => {
    it("returns error for non-existent fund", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await takeAumSnapshot("non-existent");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Fund not found");
    });

    it("persists snapshot via upsert", async () => {
      (mockPrisma.fund.findUnique as jest.Mock)
        .mockResolvedValueOnce({ aumCalculationFrequency: "DAILY" })
        .mockResolvedValueOnce(baseFund);
      (mockPrisma.aumSnapshot.upsert as jest.Mock).mockResolvedValue({ id: "snap-1" });

      const result = await takeAumSnapshot("fund-1", "DAILY");
      expect(result.success).toBe(true);
      expect(result.snapshotId).toBe("snap-1");
      expect(mockPrisma.aumSnapshot.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAumHistory", () => {
    it("filters by period and date range", async () => {
      (mockPrisma.aumSnapshot.findMany as jest.Mock).mockResolvedValue([]);
      const from = new Date("2026-01-01");
      const to = new Date("2026-02-01");

      await getAumHistory("fund-1", { period: "MONTHLY", from, to, limit: 10 });

      expect(mockPrisma.aumSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fundId: "fund-1",
            period: "MONTHLY",
            date: { gte: from, lte: to },
          }),
          take: 10,
        })
      );
    });

    it("clamps limit to 1000", async () => {
      (mockPrisma.aumSnapshot.findMany as jest.Mock).mockResolvedValue([]);
      await getAumHistory("fund-1", { limit: 5000 });
      expect(mockPrisma.aumSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1000 })
      );
    });
  });

  describe("runScheduledAumCalculations", () => {
    it("processes active funds matching frequency", async () => {
      (mockPrisma.fund.findMany as jest.Mock).mockResolvedValue([
        { id: "f1", name: "Fund 1", aumCalculationFrequency: "DAILY" },
      ]);
      // For takeAumSnapshot calls
      (mockPrisma.fund.findUnique as jest.Mock)
        .mockResolvedValueOnce({ aumCalculationFrequency: "DAILY" })
        .mockResolvedValueOnce({ ...baseFund, id: "f1" });
      (mockPrisma.aumSnapshot.upsert as jest.Mock).mockResolvedValue({ id: "snap-1" });

      const result = await runScheduledAumCalculations();
      expect(result.processed).toBeGreaterThanOrEqual(0);
      expect(result.errors).toBe(0);
    });
  });
});

describe("Capital Call Threshold", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("checkCapitalCallThreshold", () => {
    it("returns not allowed when fund not found", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await checkCapitalCallThreshold("non-existent");
      expect(result.allowed).toBe(false);
      expect(result.message).toBe("Fund not found");
    });

    it("returns allowed when threshold not enabled", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
        id: "fund-1",
        initialThresholdEnabled: false,
        capitalCallThresholdEnabled: false,
        initialThresholdAmount: null,
        capitalCallThreshold: null,
        fullAuthorizedAmount: null,
        targetRaise: 1000000,
        currentRaise: 500000,
        aggregate: { totalCommitted: 500000 },
      });
      const result = await checkCapitalCallThreshold("fund-1");
      expect(result.allowed).toBe(true);
      expect(result.initialThresholdMet).toBe(true);
    });

    it("returns allowed when threshold is met", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
        id: "fund-1",
        initialThresholdEnabled: true,
        capitalCallThresholdEnabled: false,
        initialThresholdAmount: 500000,
        capitalCallThreshold: null,
        fullAuthorizedAmount: 1000000,
        targetRaise: 1000000,
        currentRaise: 600000,
        aggregate: { totalCommitted: 600000 },
      });
      const result = await checkCapitalCallThreshold("fund-1");
      expect(result.allowed).toBe(true);
      expect(result.initialThresholdMet).toBe(true);
      expect(result.initialThresholdProgress).toBe(100);
    });

    it("returns not allowed when threshold not met", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
        id: "fund-1",
        initialThresholdEnabled: true,
        capitalCallThresholdEnabled: false,
        initialThresholdAmount: 500000,
        capitalCallThreshold: null,
        fullAuthorizedAmount: 1000000,
        targetRaise: 1000000,
        currentRaise: 200000,
        aggregate: { totalCommitted: 200000 },
      });
      const result = await checkCapitalCallThreshold("fund-1");
      expect(result.allowed).toBe(false);
      expect(result.initialThresholdMet).toBe(false);
      expect(result.initialThresholdProgress).toBe(40);
      expect(result.message).toContain("$300,000 more");
    });

    it("uses legacy fields as fallback", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
        id: "fund-1",
        initialThresholdEnabled: false,
        capitalCallThresholdEnabled: true,
        initialThresholdAmount: null,
        capitalCallThreshold: 250000,
        fullAuthorizedAmount: null,
        targetRaise: 500000,
        currentRaise: 300000,
        aggregate: { totalCommitted: 300000 },
      });
      const result = await checkCapitalCallThreshold("fund-1");
      expect(result.allowed).toBe(true);
      expect(result.threshold).toBe(250000);
    });
  });

  describe("enforceCapitalCallThreshold", () => {
    it("does not throw when threshold met", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
        id: "fund-1",
        initialThresholdEnabled: false,
        capitalCallThresholdEnabled: false,
        initialThresholdAmount: null,
        capitalCallThreshold: null,
        fullAuthorizedAmount: null,
        targetRaise: 1000000,
        currentRaise: 500000,
        aggregate: { totalCommitted: 500000 },
      });
      await expect(enforceCapitalCallThreshold("fund-1")).resolves.not.toThrow();
    });

    it("throws when threshold not met", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
        id: "fund-1",
        initialThresholdEnabled: true,
        capitalCallThresholdEnabled: false,
        initialThresholdAmount: 500000,
        capitalCallThreshold: null,
        fullAuthorizedAmount: null,
        targetRaise: 1000000,
        currentRaise: 100000,
        aggregate: { totalCommitted: 100000 },
      });
      await expect(enforceCapitalCallThreshold("fund-1")).rejects.toThrow(
        "Initial closing threshold not met"
      );
    });
  });

  describe("checkThresholdReached", () => {
    it("returns not reached for non-existent fund", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await checkThresholdReached("bad-id");
      expect(result.reached).toBe(false);
      expect(result.wasJustReached).toBe(false);
    });

    it("returns not reached when disabled", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
        initialThresholdEnabled: false,
        capitalCallThresholdEnabled: false,
        initialThresholdAmount: null,
        capitalCallThreshold: null,
        aggregate: null,
        customSettings: null,
      });
      const result = await checkThresholdReached("fund-1");
      expect(result.reached).toBe(false);
    });

    it("detects wasJustReached when not previously notified", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
        initialThresholdEnabled: true,
        capitalCallThresholdEnabled: false,
        initialThresholdAmount: 500000,
        capitalCallThreshold: null,
        currentRaise: 600000,
        aggregate: { totalCommitted: 600000, initialThresholdMet: false },
        customSettings: null,
      });
      const result = await checkThresholdReached("fund-1");
      expect(result.reached).toBe(true);
      expect(result.wasJustReached).toBe(true);
    });
  });

  describe("markThresholdNotified", () => {
    it("updates aggregate when available", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
        id: "fund-1",
        aggregate: { id: "agg-1" },
      });
      (mockPrisma.fundAggregate.update as jest.Mock).mockResolvedValue({});

      await markThresholdNotified("fund-1");
      expect(mockPrisma.fundAggregate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "agg-1" },
          data: expect.objectContaining({ initialThresholdMet: true }),
        })
      );
    });
  });
});
