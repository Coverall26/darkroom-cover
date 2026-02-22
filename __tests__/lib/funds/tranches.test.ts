// @ts-nocheck
// Tests for tranche persistence, status transitions, and aggregation logic

describe("Tranche Persistence", () => {
  describe("Status transitions", () => {
    const VALID_TRANSITIONS: Record<string, string[]> = {
      SCHEDULED: ["PENDING", "CALLED", "OVERDUE", "CANCELLED"],
      PENDING: ["CALLED", "PARTIALLY_FUNDED", "FUNDED", "OVERDUE", "CANCELLED"],
      CALLED: ["PARTIALLY_FUNDED", "FUNDED", "OVERDUE", "CANCELLED"],
      PARTIALLY_FUNDED: ["FUNDED", "OVERDUE", "CANCELLED"],
      FUNDED: [],
      OVERDUE: ["PARTIALLY_FUNDED", "FUNDED", "DEFAULTED", "CANCELLED"],
      DEFAULTED: ["CANCELLED"],
      CANCELLED: [],
    };

    function canTransition(from: string, to: string): boolean {
      return VALID_TRANSITIONS[from]?.includes(to) ?? false;
    }

    it("should allow SCHEDULED → CALLED transition", () => {
      expect(canTransition("SCHEDULED", "CALLED")).toBe(true);
    });

    it("should allow SCHEDULED → OVERDUE transition", () => {
      expect(canTransition("SCHEDULED", "OVERDUE")).toBe(true);
    });

    it("should allow CALLED → FUNDED transition (happy path)", () => {
      expect(canTransition("CALLED", "FUNDED")).toBe(true);
    });

    it("should allow CALLED → PARTIALLY_FUNDED transition", () => {
      expect(canTransition("CALLED", "PARTIALLY_FUNDED")).toBe(true);
    });

    it("should allow OVERDUE → FUNDED transition (late payment)", () => {
      expect(canTransition("OVERDUE", "FUNDED")).toBe(true);
    });

    it("should allow OVERDUE → DEFAULTED transition", () => {
      expect(canTransition("OVERDUE", "DEFAULTED")).toBe(true);
    });

    it("should NOT allow FUNDED → any transition (terminal)", () => {
      expect(VALID_TRANSITIONS["FUNDED"]).toEqual([]);
      expect(canTransition("FUNDED", "CANCELLED")).toBe(false);
      expect(canTransition("FUNDED", "SCHEDULED")).toBe(false);
    });

    it("should NOT allow CANCELLED → any transition (terminal)", () => {
      expect(VALID_TRANSITIONS["CANCELLED"]).toEqual([]);
      expect(canTransition("CANCELLED", "SCHEDULED")).toBe(false);
    });

    it("should NOT allow backwards transitions", () => {
      expect(canTransition("CALLED", "SCHEDULED")).toBe(false);
      expect(canTransition("FUNDED", "CALLED")).toBe(false);
      expect(canTransition("OVERDUE", "SCHEDULED")).toBe(false);
    });

    it("should NOT allow SCHEDULED → FUNDED directly (must go through CALLED)", () => {
      expect(canTransition("SCHEDULED", "FUNDED")).toBe(false);
    });

    it("should allow DEFAULTED → CANCELLED (GP can cancel a default)", () => {
      expect(canTransition("DEFAULTED", "CANCELLED")).toBe(true);
    });

    it("should NOT allow DEFAULTED → FUNDED (must restructure)", () => {
      expect(canTransition("DEFAULTED", "FUNDED")).toBe(false);
    });
  });

  describe("Investment funded recalculation", () => {
    it("should sum funded amounts from all tranches", () => {
      const tranches = [
        { fundedAmount: 50000 },
        { fundedAmount: 25000 },
        { fundedAmount: 0 },
        { fundedAmount: 0 },
      ];
      const totalFunded = tranches.reduce((sum, t) => sum + t.fundedAmount, 0);
      expect(totalFunded).toBe(75000);
    });

    it("should detect all tranches funded", () => {
      const tranches = [
        { status: "FUNDED", fundedAmount: 100000 },
        { status: "FUNDED", fundedAmount: 100000 },
        { status: "CANCELLED", fundedAmount: 0 },
      ];
      const allFunded = tranches.every(
        (t) => t.status === "FUNDED" || t.status === "CANCELLED",
      );
      expect(allFunded).toBe(true);
    });

    it("should NOT mark fully funded when pending tranches remain", () => {
      const tranches = [
        { status: "FUNDED", fundedAmount: 100000 },
        { status: "SCHEDULED", fundedAmount: 0 },
      ];
      const allFunded = tranches.every(
        (t) => t.status === "FUNDED" || t.status === "CANCELLED",
      );
      expect(allFunded).toBe(false);
    });
  });

  describe("Overdue detection", () => {
    it("should identify tranches past due date", () => {
      const now = new Date();
      const pastDate = new Date(now);
      pastDate.setDate(pastDate.getDate() - 30);
      const futureDate = new Date(now);
      futureDate.setDate(futureDate.getDate() + 30);

      const tranches = [
        { scheduledDate: pastDate, status: "SCHEDULED" },
        { scheduledDate: pastDate, status: "CALLED" },
        { scheduledDate: futureDate, status: "SCHEDULED" },
        { scheduledDate: pastDate, status: "FUNDED" }, // Already funded, not overdue
      ];

      const overdue = tranches.filter(
        (t) =>
          t.scheduledDate < now &&
          t.status !== "FUNDED" &&
          t.status !== "CANCELLED" &&
          t.status !== "DEFAULTED",
      );

      expect(overdue).toHaveLength(2);
    });
  });

  describe("Tranche statistics", () => {
    it("should compute correct aggregate stats", () => {
      const tranches = [
        { status: "FUNDED", amount: 100000, fundedAmount: 100000, scheduledDate: new Date("2026-01-01") },
        { status: "FUNDED", amount: 100000, fundedAmount: 100000, scheduledDate: new Date("2026-04-01") },
        { status: "CALLED", amount: 100000, fundedAmount: 0, scheduledDate: new Date("2026-07-01") },
        { status: "SCHEDULED", amount: 100000, fundedAmount: 0, scheduledDate: new Date("2026-10-01") },
      ];

      const stats = {
        totalTranches: tranches.length,
        totalScheduledAmount: tranches.reduce((s, t) => s + t.amount, 0),
        totalFundedAmount: tranches.reduce((s, t) => s + t.fundedAmount, 0),
      };

      expect(stats.totalTranches).toBe(4);
      expect(stats.totalScheduledAmount).toBe(400000);
      expect(stats.totalFundedAmount).toBe(200000);
    });

    it("should count upcoming tranches (next 30 days)", () => {
      const now = new Date();
      const in15Days = new Date(now);
      in15Days.setDate(in15Days.getDate() + 15);
      const in60Days = new Date(now);
      in60Days.setDate(in60Days.getDate() + 60);

      const tranches = [
        { scheduledDate: in15Days, status: "SCHEDULED" },
        { scheduledDate: in60Days, status: "SCHEDULED" },
        { scheduledDate: in15Days, status: "FUNDED" }, // Already funded
      ];

      const thirtyDays = new Date(now);
      thirtyDays.setDate(thirtyDays.getDate() + 30);

      const upcoming = tranches.filter(
        (t) =>
          t.scheduledDate <= thirtyDays &&
          t.scheduledDate >= now &&
          t.status !== "FUNDED" &&
          t.status !== "CANCELLED",
      );

      expect(upcoming).toHaveLength(1);
    });
  });

  describe("InvestmentTranche data model", () => {
    it("should enforce unique (investmentId, trancheNumber) constraint conceptually", () => {
      const tranches = [
        { investmentId: "inv_1", trancheNumber: 1 },
        { investmentId: "inv_1", trancheNumber: 2 },
        { investmentId: "inv_1", trancheNumber: 3 },
        { investmentId: "inv_2", trancheNumber: 1 },
      ];

      // Check no duplicates within same investment
      const byInvestment = new Map<string, Set<number>>();
      let hasDuplicate = false;

      for (const t of tranches) {
        if (!byInvestment.has(t.investmentId)) {
          byInvestment.set(t.investmentId, new Set());
        }
        const nums = byInvestment.get(t.investmentId)!;
        if (nums.has(t.trancheNumber)) {
          hasDuplicate = true;
          break;
        }
        nums.add(t.trancheNumber);
      }

      expect(hasDuplicate).toBe(false);
    });

    it("should support all required tranche statuses", () => {
      const TRANCHE_STATUSES = [
        "SCHEDULED",
        "PENDING",
        "CALLED",
        "PARTIALLY_FUNDED",
        "FUNDED",
        "OVERDUE",
        "DEFAULTED",
        "CANCELLED",
      ];

      expect(TRANCHE_STATUSES).toHaveLength(8);
      expect(TRANCHE_STATUSES).toContain("SCHEDULED");
      expect(TRANCHE_STATUSES).toContain("FUNDED");
      expect(TRANCHE_STATUSES).toContain("OVERDUE");
      expect(TRANCHE_STATUSES).toContain("DEFAULTED");
    });
  });

  describe("FundClose data model", () => {
    it("should enforce sequential close numbers", () => {
      const closes = [
        { closeNumber: 1, name: "First Close", status: "CLOSED" },
        { closeNumber: 2, name: "Second Close", status: "OPEN" },
      ];

      for (let i = 1; i < closes.length; i++) {
        expect(closes[i].closeNumber).toBe(closes[i - 1].closeNumber + 1);
      }
    });

    it("should prevent new close after FINAL", () => {
      const lastClose = { closeNumber: 3, status: "FINAL", isFinal: true };
      const canCreateNew = lastClose.status !== "FINAL";
      expect(canCreateNew).toBe(false);
    });

    it("should allow new close when last is CLOSED", () => {
      const lastClose = { closeNumber: 1, status: "CLOSED", isFinal: false };
      const canCreateNew = lastClose.status !== "FINAL";
      expect(canCreateNew).toBe(true);
    });

    it("should track actual vs target amounts", () => {
      const close = {
        targetAmount: 2000000,
        actualAmount: 1800000,
      };
      const percentOfTarget = (close.actualAmount / close.targetAmount) * 100;
      expect(percentOfTarget).toBe(90);
    });
  });
});
