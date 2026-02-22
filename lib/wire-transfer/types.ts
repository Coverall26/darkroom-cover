// ============================================================================
// Manual Wire Transfer + Proof of Payment — Type Definitions
// ============================================================================

/** Wire instructions stored as JSON on the Fund model */
export interface WireInstructions {
  bankName: string;
  accountNumber: string; // Masked in LP-facing responses
  routingNumber: string; // ABA routing number
  swiftCode?: string; // For international wires
  beneficiaryName: string;
  beneficiaryAddress?: string;
  reference?: string; // Default reference line (e.g., "Investor Name - Fund Name")
  notes?: string; // Special instructions
  intermediaryBank?: {
    bankName: string;
    swiftCode: string;
    routingNumber?: string;
  };
}

/** Input for GP configuring wire instructions */
export interface SetWireInstructionsInput {
  bankName: string;
  accountNumber: string;
  routingNumber: string;
  swiftCode?: string;
  beneficiaryName: string;
  beneficiaryAddress?: string;
  reference?: string;
  notes?: string;
  intermediaryBank?: {
    bankName: string;
    swiftCode: string;
    routingNumber?: string;
  };
}

/** LP-safe wire instructions (masked account number) */
export interface WireInstructionsPublic {
  bankName: string;
  accountNumberLast4: string;
  routingNumber: string;
  swiftCode?: string;
  beneficiaryName: string;
  beneficiaryAddress?: string;
  reference?: string;
  notes?: string;
  intermediaryBank?: {
    bankName: string;
    swiftCode: string;
    routingNumber?: string;
  };
}

/** Proof of payment status values */
export type ProofStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "RECEIVED"
  | "VERIFIED"
  | "REJECTED";

/** Input for LP uploading proof of payment */
export interface UploadProofInput {
  storageKey: string;
  storageType: string;
  fileType: string;
  fileName: string;
  fileSize: number;
  notes?: string;
}

/** Input for GP verifying/rejecting proof */
export interface ReviewProofInput {
  action: "verify" | "reject";
  rejectionReason?: string;
}

/** Wire transfer status for dashboard display */
export interface WireTransferSummary {
  investmentId: string;
  investorName: string;
  fundName: string;
  commitmentAmount: number;
  fundedAmount: number;
  transferMethod: string;
  transferStatus: string;
  proofStatus: ProofStatus;
  proofUploadedAt: Date | null;
  proofVerifiedAt: Date | null;
  createdAt: Date;
}
