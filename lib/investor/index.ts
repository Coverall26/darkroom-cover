/**
 * Investor module — approval pipeline and lifecycle management.
 *
 * Manages the investor approval workflow:
 *   APPLIED → UNDER_REVIEW → APPROVED → COMMITTED → FUNDED
 *
 * Includes wire confirmation, batch operations, and pipeline analytics.
 */

export {
  INVESTOR_STAGES,
  STAGE_INFO,
  getStageInfo,
  isValidTransition,
  transitionInvestorStage,
  determineCurrentStage,
  getFundPipelineSummary,
  bulkApproveInvestors,
  confirmWireReceived,
} from "./approval-pipeline";

export type { InvestorStage, StageInfo, ApprovalGate } from "./approval-pipeline";
