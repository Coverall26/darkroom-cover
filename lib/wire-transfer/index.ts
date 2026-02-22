// Manual Wire Transfer + Proof of Payment — Public API
// ============================================================================

// Types
export type {
  WireInstructions,
  WireInstructionsPublic,
  SetWireInstructionsInput,
  ProofStatus,
  UploadProofInput,
  ReviewProofInput,
  WireTransferSummary,
} from "./types";

// Wire Instructions (GP config + LP view)
export {
  setWireInstructions,
  getWireInstructions,
  getWireInstructionsPublic,
  deleteWireInstructions,
} from "./instructions";

// Proof of Payment (LP upload + GP review)
export {
  uploadProofOfPayment,
  reviewProofOfPayment,
  listPendingProofs,
  getWireTransferSummary,
  requireProof,
} from "./proof";

// Bulk Operations (GP batch actions)
export {
  bulkRequireProof,
  bulkVerifyProofs,
  bulkRejectProofs,
  getProofStatusCounts,
} from "./bulk";
export type {
  BulkOperationResult,
  BulkRequireProofInput,
  BulkVerifyInput,
  BulkRejectInput,
} from "./bulk";
