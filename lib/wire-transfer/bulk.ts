import prisma from "@/lib/prisma";
import type { ProofStatus } from "./types";

// ============================================================================
// Bulk Operation Types
// ============================================================================

export interface BulkOperationResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    investmentId: string;
    success: boolean;
    error?: string;
  }>;
}

export interface BulkRequireProofInput {
  investmentIds: string[];
}

export interface BulkVerifyInput {
  investmentIds: string[];
}

export interface BulkRejectInput {
  investmentIds: string[];
  rejectionReason: string;
}

// ============================================================================
// Bulk Require Proof
// ============================================================================

/**
 * Mark multiple investments as requiring proof of payment.
 * Useful when GP sends wire instructions to a batch of investors.
 */
export async function bulkRequireProof(
  teamId: string,
  input: BulkRequireProofInput,
  gpUserId: string,
): Promise<BulkOperationResult> {
  const results: BulkOperationResult["results"] = [];

  for (const investmentId of input.investmentIds) {
    try {
      const investment = await prisma.manualInvestment.findFirst({
        where: { id: investmentId, teamId },
        select: { id: true, proofStatus: true },
      });

      if (!investment) {
        results.push({ investmentId, success: false, error: "Not found or not in team" });
        continue;
      }

      if (investment.proofStatus === "VERIFIED") {
        results.push({ investmentId, success: false, error: "Already verified" });
        continue;
      }

      await prisma.manualInvestment.update({
        where: { id: investmentId },
        data: { proofStatus: "PENDING" },
      });

      results.push({ investmentId, success: true });
    } catch (error) {
      results.push({
        investmentId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    total: input.investmentIds.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

// ============================================================================
// Bulk Verify Proofs
// ============================================================================

/**
 * Verify multiple proof-of-payment submissions at once.
 * Only processes investments with RECEIVED proof status.
 */
export async function bulkVerifyProofs(
  teamId: string,
  input: BulkVerifyInput,
  gpUserId: string,
): Promise<BulkOperationResult> {
  const results: BulkOperationResult["results"] = [];

  for (const investmentId of input.investmentIds) {
    try {
      const investment = await prisma.manualInvestment.findFirst({
        where: { id: investmentId, teamId },
        select: {
          id: true,
          proofStatus: true,
          proofDocumentKey: true,
          commitmentAmount: true,
        },
      });

      if (!investment) {
        results.push({ investmentId, success: false, error: "Not found or not in team" });
        continue;
      }

      if (investment.proofStatus === "VERIFIED") {
        results.push({ investmentId, success: false, error: "Already verified" });
        continue;
      }

      if (!investment.proofDocumentKey) {
        results.push({ investmentId, success: false, error: "No proof document uploaded" });
        continue;
      }

      await prisma.manualInvestment.update({
        where: { id: investmentId },
        data: {
          proofStatus: "VERIFIED",
          proofVerifiedBy: gpUserId,
          proofVerifiedAt: new Date(),
          isVerified: true,
          verifiedBy: gpUserId,
          verifiedAt: new Date(),
          transferStatus: "COMPLETED",
          fundedAmount: investment.commitmentAmount,
          fundedDate: new Date(),
        },
      });

      // Fire-and-forget email notification
      import("@/lib/emails/send-proof-notifications")
        .then(({ sendProofVerifiedNotification }) =>
          sendProofVerifiedNotification(investmentId),
        )
        .catch((err) =>
          console.warn("[BULK_VERIFY] Email notification failed:", err),
        );

      results.push({ investmentId, success: true });
    } catch (error) {
      results.push({
        investmentId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    total: input.investmentIds.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

// ============================================================================
// Bulk Reject Proofs
// ============================================================================

/**
 * Reject multiple proof-of-payment submissions with the same reason.
 */
export async function bulkRejectProofs(
  teamId: string,
  input: BulkRejectInput,
  gpUserId: string,
): Promise<BulkOperationResult> {
  const results: BulkOperationResult["results"] = [];

  for (const investmentId of input.investmentIds) {
    try {
      const investment = await prisma.manualInvestment.findFirst({
        where: { id: investmentId, teamId },
        select: { id: true, proofStatus: true, proofDocumentKey: true },
      });

      if (!investment) {
        results.push({ investmentId, success: false, error: "Not found or not in team" });
        continue;
      }

      if (investment.proofStatus === "VERIFIED") {
        results.push({ investmentId, success: false, error: "Already verified — cannot reject" });
        continue;
      }

      if (!investment.proofDocumentKey) {
        results.push({ investmentId, success: false, error: "No proof document to reject" });
        continue;
      }

      await prisma.manualInvestment.update({
        where: { id: investmentId },
        data: {
          proofStatus: "REJECTED",
          proofRejectedBy: gpUserId,
          proofRejectedAt: new Date(),
          proofRejectionReason: input.rejectionReason,
        },
      });

      // Fire-and-forget email notification
      import("@/lib/emails/send-proof-notifications")
        .then(({ sendProofRejectedNotification }) =>
          sendProofRejectedNotification(investmentId),
        )
        .catch((err) =>
          console.warn("[BULK_REJECT] Email notification failed:", err),
        );

      results.push({ investmentId, success: true });
    } catch (error) {
      results.push({
        investmentId,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    total: input.investmentIds.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

// ============================================================================
// Bulk Status Query
// ============================================================================

/**
 * Get proof status counts for a team (for dashboard summary cards).
 */
export async function getProofStatusCounts(
  teamId: string,
  fundId?: string,
): Promise<Record<ProofStatus, number>> {
  const where = {
    teamId,
    ...(fundId ? { fundId } : {}),
  };

  const [notRequired, pending, received, verified, rejected] = await Promise.all([
    prisma.manualInvestment.count({ where: { ...where, proofStatus: "NOT_REQUIRED" } }),
    prisma.manualInvestment.count({ where: { ...where, proofStatus: "PENDING" } }),
    prisma.manualInvestment.count({ where: { ...where, proofStatus: "RECEIVED" } }),
    prisma.manualInvestment.count({ where: { ...where, proofStatus: "VERIFIED" } }),
    prisma.manualInvestment.count({ where: { ...where, proofStatus: "REJECTED" } }),
  ]);

  return {
    NOT_REQUIRED: notRequired,
    PENDING: pending,
    RECEIVED: received,
    VERIFIED: verified,
    REJECTED: rejected,
  };
}
