/**
 * Marketplace Types & Configuration Tests
 *
 * Tests for pipeline stage configuration, stage transitions,
 * and type configuration consistency.
 */

import {
  DEAL_STAGE_CONFIG,
  STAGE_TRANSITIONS,
  DEAL_TYPE_CONFIG,
  DEAL_VISIBILITY_CONFIG,
  INTEREST_STATUS_CONFIG,
} from "@/lib/marketplace/types";

describe("Marketplace Types", () => {
  describe("DEAL_STAGE_CONFIG", () => {
    it("should have config for all expected stages", () => {
      const expectedStages = [
        "SOURCED",
        "SCREENING",
        "DUE_DILIGENCE",
        "TERM_SHEET",
        "COMMITMENT",
        "CLOSING",
        "FUNDED",
        "MONITORING",
        "EXIT",
        "PASSED",
        "WITHDRAWN",
      ];

      for (const stage of expectedStages) {
        expect(DEAL_STAGE_CONFIG[stage as keyof typeof DEAL_STAGE_CONFIG]).toBeDefined();
      }
    });

    it("should have unique order values for non-terminal stages", () => {
      const orders = Object.values(DEAL_STAGE_CONFIG).map((c) => c.order);
      const uniqueOrders = new Set(orders);
      expect(uniqueOrders.size).toBe(orders.length);
    });

    it("should have label and color for each stage", () => {
      for (const [stage, config] of Object.entries(DEAL_STAGE_CONFIG)) {
        expect(config.label).toBeTruthy();
        expect(config.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(typeof config.terminal).toBe("boolean");
        expect(typeof config.description).toBe("string");
      }
    });

    it("should mark EXIT, PASSED, WITHDRAWN as terminal", () => {
      expect(DEAL_STAGE_CONFIG.EXIT.terminal).toBe(true);
      expect(DEAL_STAGE_CONFIG.PASSED.terminal).toBe(true);
      expect(DEAL_STAGE_CONFIG.WITHDRAWN.terminal).toBe(true);
    });

    it("should not mark active stages as terminal", () => {
      const activeStages = [
        "SOURCED",
        "SCREENING",
        "DUE_DILIGENCE",
        "TERM_SHEET",
        "COMMITMENT",
        "CLOSING",
        "FUNDED",
        "MONITORING",
      ] as const;
      for (const stage of activeStages) {
        expect(DEAL_STAGE_CONFIG[stage].terminal).toBe(false);
      }
    });
  });

  describe("STAGE_TRANSITIONS", () => {
    it("should define transitions for every stage", () => {
      for (const stage of Object.keys(DEAL_STAGE_CONFIG)) {
        expect(
          STAGE_TRANSITIONS[stage as keyof typeof STAGE_TRANSITIONS],
        ).toBeDefined();
      }
    });

    it("should follow forward progression for happy path", () => {
      // Verify standard happy path: SOURCED → SCREENING → DD → TERM_SHEET → COMMITMENT → CLOSING → FUNDED
      expect(STAGE_TRANSITIONS.SOURCED).toContain("SCREENING");
      expect(STAGE_TRANSITIONS.SCREENING).toContain("DUE_DILIGENCE");
      expect(STAGE_TRANSITIONS.DUE_DILIGENCE).toContain("TERM_SHEET");
      expect(STAGE_TRANSITIONS.TERM_SHEET).toContain("COMMITMENT");
      expect(STAGE_TRANSITIONS.COMMITMENT).toContain("CLOSING");
      expect(STAGE_TRANSITIONS.CLOSING).toContain("FUNDED");
      expect(STAGE_TRANSITIONS.FUNDED).toContain("MONITORING");
      expect(STAGE_TRANSITIONS.MONITORING).toContain("EXIT");
    });

    it("should allow PASSED from early stages", () => {
      expect(STAGE_TRANSITIONS.SOURCED).toContain("PASSED");
      expect(STAGE_TRANSITIONS.SCREENING).toContain("PASSED");
      expect(STAGE_TRANSITIONS.DUE_DILIGENCE).toContain("PASSED");
      expect(STAGE_TRANSITIONS.TERM_SHEET).toContain("PASSED");
      expect(STAGE_TRANSITIONS.COMMITMENT).toContain("PASSED");
    });

    it("should have empty transitions from EXIT", () => {
      expect(STAGE_TRANSITIONS.EXIT).toEqual([]);
    });

    it("should allow reopening a PASSED deal", () => {
      expect(STAGE_TRANSITIONS.PASSED).toContain("SOURCED");
    });

    it("should not allow skipping stages in forward direction", () => {
      // SOURCED should not be able to go directly to FUNDED
      expect(STAGE_TRANSITIONS.SOURCED).not.toContain("FUNDED");
      expect(STAGE_TRANSITIONS.SOURCED).not.toContain("CLOSING");
      expect(STAGE_TRANSITIONS.SOURCED).not.toContain("COMMITMENT");
    });

    it("should allow limited backward transitions for rework", () => {
      // TERM_SHEET can go back to DD (rework)
      expect(STAGE_TRANSITIONS.TERM_SHEET).toContain("DUE_DILIGENCE");
      // COMMITMENT can go back to TERM_SHEET (renegotiation)
      expect(STAGE_TRANSITIONS.COMMITMENT).toContain("TERM_SHEET");
    });

    it("should only reference valid stages in transition targets", () => {
      const validStages = new Set(Object.keys(DEAL_STAGE_CONFIG));
      for (const [, targets] of Object.entries(STAGE_TRANSITIONS)) {
        for (const target of targets) {
          expect(validStages.has(target)).toBe(true);
        }
      }
    });
  });

  describe("DEAL_TYPE_CONFIG", () => {
    it("should have config for all deal types", () => {
      const expectedTypes = [
        "EQUITY",
        "DEBT",
        "CONVERTIBLE",
        "FUND_OF_FUNDS",
        "SECONDARY",
        "CO_INVESTMENT",
        "SPV",
      ];

      for (const type of expectedTypes) {
        const config = DEAL_TYPE_CONFIG[type as keyof typeof DEAL_TYPE_CONFIG];
        expect(config).toBeDefined();
        expect(config.label).toBeTruthy();
        expect(config.description).toBeTruthy();
      }
    });
  });

  describe("DEAL_VISIBILITY_CONFIG", () => {
    it("should have config for all visibility levels", () => {
      const expected = ["PRIVATE", "INVITE_ONLY", "QUALIFIED", "PUBLIC"];
      for (const vis of expected) {
        const config =
          DEAL_VISIBILITY_CONFIG[vis as keyof typeof DEAL_VISIBILITY_CONFIG];
        expect(config).toBeDefined();
        expect(config.label).toBeTruthy();
        expect(config.icon).toBeTruthy();
      }
    });
  });

  describe("INTEREST_STATUS_CONFIG", () => {
    it("should have config for all interest statuses", () => {
      const expected = [
        "EXPRESSED",
        "REVIEWING",
        "COMMITTED",
        "ALLOCATED",
        "CONFIRMED",
        "DECLINED",
        "WAITLISTED",
      ];
      for (const status of expected) {
        const config =
          INTEREST_STATUS_CONFIG[
            status as keyof typeof INTEREST_STATUS_CONFIG
          ];
        expect(config).toBeDefined();
        expect(config.label).toBeTruthy();
        expect(config.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });
});
