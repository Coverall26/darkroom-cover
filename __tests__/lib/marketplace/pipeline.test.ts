/**
 * Pipeline Engine Tests
 *
 * Unit tests for deal stage transition validation logic.
 * These tests validate the transition rules without requiring a database.
 */

import {
  STAGE_TRANSITIONS,
  DEAL_STAGE_CONFIG,
} from "@/lib/marketplace/types";
import type { DealStage } from "@prisma/client";

// Extracted validation logic from pipeline.ts for unit testing
function validateStageTransition(
  currentStage: DealStage,
  toStage: DealStage,
): { valid: boolean; error?: string } {
  const allowedTransitions = STAGE_TRANSITIONS[currentStage];

  if (!allowedTransitions) {
    return { valid: false, error: `Unknown stage: ${currentStage}` };
  }

  if (!allowedTransitions.includes(toStage)) {
    return {
      valid: false,
      error: `Invalid stage transition: ${currentStage} → ${toStage}. Allowed: ${allowedTransitions.join(", ")}`,
    };
  }

  return { valid: true };
}

describe("Pipeline Engine", () => {
  describe("Stage Transition Validation", () => {
    it("should allow valid forward transitions", () => {
      const validTransitions: [DealStage, DealStage][] = [
        ["SOURCED", "SCREENING"],
        ["SCREENING", "DUE_DILIGENCE"],
        ["DUE_DILIGENCE", "TERM_SHEET"],
        ["TERM_SHEET", "COMMITMENT"],
        ["COMMITMENT", "CLOSING"],
        ["CLOSING", "FUNDED"],
        ["FUNDED", "MONITORING"],
        ["MONITORING", "EXIT"],
      ];

      for (const [from, to] of validTransitions) {
        const result = validateStageTransition(from, to);
        expect(result.valid).toBe(true);
      }
    });

    it("should reject invalid transitions", () => {
      const invalidTransitions: [DealStage, DealStage][] = [
        ["SOURCED", "FUNDED"], // Skip multiple stages
        ["SOURCED", "EXIT"], // Skip to end
        ["SCREENING", "CLOSING"], // Skip stages
        ["EXIT", "SOURCED"], // Cannot go back from EXIT
        ["WITHDRAWN", "SOURCED"], // Cannot go back from WITHDRAWN
        ["FUNDED", "SOURCED"], // Cannot go backward to start
      ];

      for (const [from, to] of invalidTransitions) {
        const result = validateStageTransition(from, to);
        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
      }
    });

    it("should allow passing from any pre-funded stage", () => {
      const passableStages: DealStage[] = [
        "SOURCED",
        "SCREENING",
        "DUE_DILIGENCE",
        "TERM_SHEET",
        "COMMITMENT",
      ];

      for (const stage of passableStages) {
        const result = validateStageTransition(stage, "PASSED");
        expect(result.valid).toBe(true);
      }
    });

    it("should not allow passing from FUNDED or later", () => {
      const nonPassableStages: DealStage[] = [
        "FUNDED",
        "MONITORING",
        "EXIT",
      ];

      for (const stage of nonPassableStages) {
        const result = validateStageTransition(stage, "PASSED");
        expect(result.valid).toBe(false);
      }
    });

    it("should allow withdrawal from pre-closing stages", () => {
      const withdrawableStages: DealStage[] = [
        "SOURCED",
        "SCREENING",
        "DUE_DILIGENCE",
        "TERM_SHEET",
        "COMMITMENT",
        "CLOSING",
      ];

      for (const stage of withdrawableStages) {
        const result = validateStageTransition(stage, "WITHDRAWN");
        expect(result.valid).toBe(true);
      }
    });

    it("should allow reopening a passed deal", () => {
      const result = validateStageTransition("PASSED", "SOURCED");
      expect(result.valid).toBe(true);
    });

    it("should not allow reopening a withdrawn deal", () => {
      const result = validateStageTransition("WITHDRAWN", "SOURCED");
      expect(result.valid).toBe(false);
    });
  });

  describe("Stage Configuration Consistency", () => {
    it("should have monotonically increasing order for non-terminal pipeline stages", () => {
      const pipelineStages: DealStage[] = [
        "SOURCED",
        "SCREENING",
        "DUE_DILIGENCE",
        "TERM_SHEET",
        "COMMITMENT",
        "CLOSING",
        "FUNDED",
        "MONITORING",
        "EXIT",
      ];

      for (let i = 1; i < pipelineStages.length; i++) {
        const prevOrder = DEAL_STAGE_CONFIG[pipelineStages[i - 1]].order;
        const currOrder = DEAL_STAGE_CONFIG[pipelineStages[i]].order;
        expect(currOrder).toBeGreaterThan(prevOrder);
      }
    });

    it("should have distinct colors for adjacent pipeline stages", () => {
      const pipelineStages: DealStage[] = [
        "SOURCED",
        "SCREENING",
        "DUE_DILIGENCE",
        "TERM_SHEET",
        "COMMITMENT",
        "CLOSING",
        "FUNDED",
      ];

      for (let i = 1; i < pipelineStages.length; i++) {
        const prevColor = DEAL_STAGE_CONFIG[pipelineStages[i - 1]].color;
        const currColor = DEAL_STAGE_CONFIG[pipelineStages[i]].color;
        expect(currColor).not.toBe(prevColor);
      }
    });
  });
});
