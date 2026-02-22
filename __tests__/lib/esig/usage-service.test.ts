import {
  getCurrentBillingPeriod,
  getBillingPeriodForDate,
  recordDocumentCreated,
  recordDocumentSent,
  recordDocumentCompleted,
  canCreateDocument,
  canSendDocument,
  enforceEsigLimit,
  getUsageSummary,
  getUsageHistory,
  EsigNotAvailableError,
  EsigLimitExceededError,
} from "@/lib/esig/usage-service";
import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Mock tier resolver
// ---------------------------------------------------------------------------
const mockResolveTier = jest.fn();
const mockClearTierCache = jest.fn();

jest.mock("@/lib/tier/resolver", () => ({
  resolveTier: (...args: unknown[]) => mockResolveTier(...args),
  clearTierCache: (...args: unknown[]) => mockClearTierCache(...args),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEAM_ID = "team-001";

function makeTier(overrides: Partial<{
  canSign: boolean;
  esigLimit: number | null;
}> = {}) {
  return {
    capabilities: { canSign: overrides.canSign ?? true },
    limits: { esignatures: overrides.esigLimit ?? null },
  };
}

const mockRecord = {
  id: "rec-001",
  teamId: TEAM_ID,
  periodStart: new Date("2026-02-01T00:00:00.000Z"),
  periodEnd: new Date("2026-02-28T23:59:59.999Z"),
  documentsCreated: 5,
  documentsSent: 3,
  documentsComplete: 2,
  signatureDocumentId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Tests: Period Helpers
// ---------------------------------------------------------------------------
describe("EsigUsage — Billing Period Helpers", () => {
  it("getCurrentBillingPeriod returns first and last of current month", () => {
    const { start, end } = getCurrentBillingPeriod();
    const now = new Date();

    expect(start.getUTCDate()).toBe(1);
    expect(start.getUTCMonth()).toBe(now.getUTCMonth());
    expect(start.getUTCFullYear()).toBe(now.getUTCFullYear());

    // End should be last day of month
    expect(end.getUTCMonth()).toBe(now.getUTCMonth());
    expect(end.getUTCHours()).toBe(23);
    expect(end.getUTCMinutes()).toBe(59);
  });

  it("getBillingPeriodForDate returns correct period for a given date", () => {
    const date = new Date("2026-06-15T12:00:00Z");
    const { start, end } = getBillingPeriodForDate(date);

    expect(start.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(end.getUTCDate()).toBe(30); // June has 30 days
    expect(end.getUTCMonth()).toBe(5); // June = 5
  });

  it("handles December → end of year correctly", () => {
    const date = new Date("2026-12-25T00:00:00Z");
    const { start, end } = getBillingPeriodForDate(date);

    expect(start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(end.getUTCDate()).toBe(31); // December has 31 days
    expect(end.getUTCMonth()).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// Tests: Usage Recording
// ---------------------------------------------------------------------------
describe("EsigUsage — Recording", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("recordDocumentCreated upserts and increments documentsCreated", async () => {
    (prisma.esigUsageRecord.upsert as jest.Mock).mockResolvedValue(mockRecord);

    await recordDocumentCreated(TEAM_ID, "doc-123");

    expect(prisma.esigUsageRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teamId_periodStart: expect.objectContaining({
            teamId: TEAM_ID,
          }),
        }),
        create: expect.objectContaining({
          teamId: TEAM_ID,
          documentsCreated: 1,
          signatureDocumentId: "doc-123",
        }),
        update: expect.objectContaining({
          documentsCreated: { increment: 1 },
        }),
      }),
    );

    // Should clear tier cache
    expect(mockClearTierCache).toHaveBeenCalledWith(TEAM_ID);
  });

  it("recordDocumentSent upserts and increments documentsSent", async () => {
    (prisma.esigUsageRecord.upsert as jest.Mock).mockResolvedValue(mockRecord);

    await recordDocumentSent(TEAM_ID);

    const call = (prisma.esigUsageRecord.upsert as jest.Mock).mock.calls[0][0];
    expect(call.create.documentsSent).toBe(1);
    expect(call.update.documentsSent).toEqual({ increment: 1 });
  });

  it("recordDocumentCompleted upserts and increments documentsComplete", async () => {
    (prisma.esigUsageRecord.upsert as jest.Mock).mockResolvedValue(mockRecord);

    await recordDocumentCompleted(TEAM_ID);

    const call = (prisma.esigUsageRecord.upsert as jest.Mock).mock.calls[0][0];
    expect(call.create.documentsComplete).toBe(1);
    expect(call.update.documentsComplete).toEqual({ increment: 1 });
  });

  it("recordDocumentCreated does not throw on error (fire-and-forget)", async () => {
    (prisma.esigUsageRecord.upsert as jest.Mock).mockRejectedValue(
      new Error("DB error"),
    );

    // Should not throw
    await expect(
      recordDocumentCreated(TEAM_ID),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: Enforcement
// ---------------------------------------------------------------------------
describe("EsigUsage — Enforcement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("canCreateDocument", () => {
    it("returns true when plan includes esig and usage is unlimited", async () => {
      mockResolveTier.mockResolvedValue(makeTier({ canSign: true, esigLimit: null }));

      const result = await canCreateDocument(TEAM_ID);
      expect(result).toBe(true);
    });

    it("returns false when plan doesn't include esig", async () => {
      mockResolveTier.mockResolvedValue(makeTier({ canSign: false, esigLimit: 0 }));

      const result = await canCreateDocument(TEAM_ID);
      expect(result).toBe(false);
    });

    it("returns true when under limit", async () => {
      mockResolveTier.mockResolvedValue(makeTier({ canSign: true, esigLimit: 10 }));
      (prisma.esigUsageRecord.upsert as jest.Mock).mockResolvedValue({
        ...mockRecord,
        documentsCreated: 5,
      });

      const result = await canCreateDocument(TEAM_ID);
      expect(result).toBe(true); // 5 < 10
    });

    it("returns false when at or over limit", async () => {
      mockResolveTier.mockResolvedValue(makeTier({ canSign: true, esigLimit: 5 }));
      (prisma.esigUsageRecord.upsert as jest.Mock).mockResolvedValue({
        ...mockRecord,
        documentsCreated: 5,
      });

      const result = await canCreateDocument(TEAM_ID);
      expect(result).toBe(false); // 5 >= 5
    });
  });

  describe("canSendDocument", () => {
    it("returns true when unlimited", async () => {
      mockResolveTier.mockResolvedValue(makeTier({ canSign: true, esigLimit: null }));

      const result = await canSendDocument(TEAM_ID);
      expect(result).toBe(true);
    });

    it("returns false when plan doesn't include esig", async () => {
      mockResolveTier.mockResolvedValue(makeTier({ canSign: false }));

      const result = await canSendDocument(TEAM_ID);
      expect(result).toBe(false);
    });

    it("returns true when sent count is under limit", async () => {
      mockResolveTier.mockResolvedValue(makeTier({ canSign: true, esigLimit: 10 }));
      (prisma.esigUsageRecord.upsert as jest.Mock).mockResolvedValue({
        ...mockRecord,
        documentsSent: 3,
      });

      const result = await canSendDocument(TEAM_ID);
      expect(result).toBe(true);
    });
  });

  describe("enforceEsigLimit", () => {
    it("does not throw when under limit", async () => {
      mockResolveTier.mockResolvedValue(makeTier({ canSign: true, esigLimit: null }));

      await expect(enforceEsigLimit(TEAM_ID)).resolves.toBeUndefined();
    });

    it("throws EsigNotAvailableError when plan doesn't include esig", async () => {
      mockResolveTier.mockResolvedValue(makeTier({ canSign: false, esigLimit: 0 }));

      await expect(enforceEsigLimit(TEAM_ID)).rejects.toThrow(
        EsigNotAvailableError,
      );
    });

    it("throws EsigLimitExceededError when over limit", async () => {
      mockResolveTier.mockResolvedValue(makeTier({ canSign: true, esigLimit: 5 }));
      (prisma.esigUsageRecord.upsert as jest.Mock).mockResolvedValue({
        ...mockRecord,
        documentsCreated: 5,
      });

      await expect(enforceEsigLimit(TEAM_ID)).rejects.toThrow(
        EsigLimitExceededError,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Usage Summary & History
// ---------------------------------------------------------------------------
describe("EsigUsage — Summary & History", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getUsageSummary", () => {
    it("returns summary with unlimited plan", async () => {
      mockResolveTier.mockResolvedValue(makeTier({ canSign: true, esigLimit: null }));
      (prisma.esigUsageRecord.upsert as jest.Mock).mockResolvedValue(mockRecord);

      const summary = await getUsageSummary(TEAM_ID);

      expect(summary.teamId).toBe(TEAM_ID);
      expect(summary.documentsCreated).toBe(5);
      expect(summary.documentsSent).toBe(3);
      expect(summary.documentsComplete).toBe(2);
      expect(summary.limit).toBeNull();
      expect(summary.remaining).toBeNull();
      expect(summary.isOverLimit).toBe(false);
    });

    it("returns summary with limited plan (under limit)", async () => {
      mockResolveTier.mockResolvedValue(makeTier({ canSign: true, esigLimit: 10 }));
      (prisma.esigUsageRecord.upsert as jest.Mock).mockResolvedValue(mockRecord);

      const summary = await getUsageSummary(TEAM_ID);

      expect(summary.limit).toBe(10);
      expect(summary.remaining).toBe(5); // 10 - 5
      expect(summary.isOverLimit).toBe(false);
    });

    it("returns summary with limited plan (at limit)", async () => {
      mockResolveTier.mockResolvedValue(makeTier({ canSign: true, esigLimit: 5 }));
      (prisma.esigUsageRecord.upsert as jest.Mock).mockResolvedValue(mockRecord);

      const summary = await getUsageSummary(TEAM_ID);

      expect(summary.limit).toBe(5);
      expect(summary.remaining).toBe(0);
      expect(summary.isOverLimit).toBe(true);
    });
  });

  describe("getUsageHistory", () => {
    it("returns history with all-time totals", async () => {
      (prisma.esigUsageRecord.findMany as jest.Mock).mockResolvedValue([
        { ...mockRecord, documentsCreated: 5, documentsSent: 3, documentsComplete: 2 },
        { ...mockRecord, documentsCreated: 10, documentsSent: 8, documentsComplete: 7, periodStart: new Date("2026-01-01") },
      ]);

      const history = await getUsageHistory(TEAM_ID, 6);

      expect(history.periods).toHaveLength(2);
      expect(history.totalAllTime.documentsCreated).toBe(15);
      expect(history.totalAllTime.documentsSent).toBe(11);
      expect(history.totalAllTime.documentsComplete).toBe(9);
    });

    it("defaults to 12 periods", async () => {
      (prisma.esigUsageRecord.findMany as jest.Mock).mockResolvedValue([]);

      await getUsageHistory(TEAM_ID);

      const call = (prisma.esigUsageRecord.findMany as jest.Mock).mock.calls[0][0];
      expect(call.take).toBe(12);
    });

    it("returns empty history for new team", async () => {
      (prisma.esigUsageRecord.findMany as jest.Mock).mockResolvedValue([]);

      const history = await getUsageHistory(TEAM_ID);

      expect(history.periods).toHaveLength(0);
      expect(history.totalAllTime).toEqual({
        documentsCreated: 0,
        documentsSent: 0,
        documentsComplete: 0,
      });
    });
  });
});
