/**
 * Investor Approval Pipeline Tests
 *
 * Unit tests for stage transitions, approval gates, and pipeline logic.
 * Tests validation without requiring a database.
 */

import {
  isValidTransition,
  determineCurrentStage,
  getStageInfo,
  INVESTOR_STAGES,
  STAGE_INFO,
} from "@/lib/investor/approval-pipeline";
import type { InvestorStage } from "@/lib/investor/approval-pipeline";

describe("Investor Approval Pipeline", () => {
  describe("Stage Definitions", () => {
    it("should have 7 stages", () => {
      expect(INVESTOR_STAGES).toHaveLength(7);
    });

    it("should have metadata for all stages", () => {
      for (const stage of INVESTOR_STAGES) {
        expect(STAGE_INFO[stage]).toBeDefined();
        expect(STAGE_INFO[stage].label).toBeTruthy();
        expect(STAGE_INFO[stage].description).toBeTruthy();
        expect(STAGE_INFO[stage].color).toBeTruthy();
      }
    });
  });

  describe("Stage Transitions", () => {
    it("should allow valid forward transitions", () => {
      const validTransitions: [InvestorStage, InvestorStage][] = [
        ["APPLIED", "UNDER_REVIEW"],
        ["UNDER_REVIEW", "APPROVED"],
        ["APPROVED", "COMMITTED"],
        ["COMMITTED", "DOCS_APPROVED"],
        ["COMMITTED", "FUNDED"],
        ["DOCS_APPROVED", "FUNDED"],
      ];

      for (const [from, to] of validTransitions) {
        expect(isValidTransition(from, to)).toBe(true);
      }
    });

    it("should allow rejection from multiple stages", () => {
      const rejectableStages: InvestorStage[] = [
        "APPLIED",
        "UNDER_REVIEW",
        "APPROVED",
        "COMMITTED",
      ];

      for (const stage of rejectableStages) {
        expect(isValidTransition(stage, "REJECTED")).toBe(true);
      }
    });

    it("should allow re-opening a rejected investor", () => {
      expect(isValidTransition("REJECTED", "UNDER_REVIEW")).toBe(true);
    });

    it("should not allow FUNDED to transition anywhere", () => {
      for (const stage of INVESTOR_STAGES) {
        if (stage === "FUNDED") continue;
        expect(isValidTransition("FUNDED", stage)).toBe(false);
      }
    });

    it("should not allow skipping stages", () => {
      // Cannot go directly from APPLIED to APPROVED (must go through UNDER_REVIEW)
      expect(isValidTransition("APPLIED", "APPROVED")).toBe(false);
      // Cannot go directly from APPLIED to FUNDED
      expect(isValidTransition("APPLIED", "FUNDED")).toBe(false);
      // Cannot go from UNDER_REVIEW directly to COMMITTED
      expect(isValidTransition("UNDER_REVIEW", "COMMITTED")).toBe(false);
    });

    it("should not allow backward transitions (except rejection re-open)", () => {
      expect(isValidTransition("APPROVED", "UNDER_REVIEW")).toBe(false);
      expect(isValidTransition("COMMITTED", "APPROVED")).toBe(false);
      expect(isValidTransition("APPROVED", "APPLIED")).toBe(false);
    });
  });

  describe("getStageInfo", () => {
    it("should return stage info with next actions", () => {
      const info = getStageInfo("APPLIED");
      expect(info.stage).toBe("APPLIED");
      expect(info.label).toBe("Applied");
      expect(info.nextActions).toContain("UNDER_REVIEW");
      expect(info.nextActions).toContain("REJECTED");
    });

    it("should return empty next actions for FUNDED", () => {
      const info = getStageInfo("FUNDED");
      expect(info.nextActions).toHaveLength(0);
    });
  });

  describe("determineCurrentStage", () => {
    it("should return explicit stage from fundData", () => {
      const investor = {
        fundData: { approvalStage: "COMMITTED" },
        accreditationStatus: "KYC_VERIFIED",
        onboardingStep: 4,
        onboardingCompletedAt: null,
      };
      expect(determineCurrentStage(investor)).toBe("COMMITTED");
    });

    it("should infer FUNDED from onboarding completion", () => {
      const investor = {
        fundData: null,
        accreditationStatus: "KYC_VERIFIED",
        onboardingStep: 5,
        onboardingCompletedAt: new Date(),
      };
      expect(determineCurrentStage(investor)).toBe("FUNDED");
    });

    it("should infer COMMITTED from KYC + step >= 4", () => {
      const investor = {
        fundData: null,
        accreditationStatus: "KYC_VERIFIED",
        onboardingStep: 4,
        onboardingCompletedAt: null,
      };
      expect(determineCurrentStage(investor)).toBe("COMMITTED");
    });

    it("should infer APPROVED from KYC verified", () => {
      const investor = {
        fundData: null,
        accreditationStatus: "KYC_VERIFIED",
        onboardingStep: 3,
        onboardingCompletedAt: null,
      };
      expect(determineCurrentStage(investor)).toBe("APPROVED");
    });

    it("should infer UNDER_REVIEW from self-certified + step >= 2", () => {
      const investor = {
        fundData: null,
        accreditationStatus: "SELF_CERTIFIED",
        onboardingStep: 2,
        onboardingCompletedAt: null,
      };
      expect(determineCurrentStage(investor)).toBe("UNDER_REVIEW");
    });

    it("should infer APPLIED for new investors", () => {
      const investor = {
        fundData: null,
        accreditationStatus: "PENDING",
        onboardingStep: 0,
        onboardingCompletedAt: null,
      };
      expect(determineCurrentStage(investor)).toBe("APPLIED");
    });

    it("should infer APPLIED for self-certified at step 1", () => {
      const investor = {
        fundData: null,
        accreditationStatus: "SELF_CERTIFIED",
        onboardingStep: 1,
        onboardingCompletedAt: null,
      };
      expect(determineCurrentStage(investor)).toBe("APPLIED");
    });
  });
});
