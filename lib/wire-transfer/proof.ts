import prisma from "@/lib/prisma";
import { ManualInvestmentProofStatus, DocumentStorageType, TransferMethod } from "@prisma/client";
import { reportError } from "@/lib/error";
import type {
  UploadProofInput,
  ReviewProofInput,
  ProofStatus,
  WireTransferSummary,
} from "./types";

// ============================================================================
// LP Proof of Payment Upload
// ============================================================================

/**
 * LP uploads proof of payment for a manual investment.
 */
export async function uploadProofOfPayment(
  investmentId: string,
  input: UploadProofInput,
  userId: string,
) {
  const investment = await prisma.manualInvestment.findUnique({
    where: { id: investmentId },
    select: {
      id: true,
      proofStatus: true,
      transferMethod: true,
      investorId: true,
      investor: { select: { userId: true } },
    },
  });

  if (!investment) {
    throw new Error(`Manual investment not found: ${investmentId}`);
  }

  // Verify the user is the investor or has access
  if (investment.investor.userId !== userId) {
    throw new Error("Unauthorized: you can only upload proof for your own investments");
  }

  // Cannot re-upload if already verified
  if (investment.proofStatus === "VERIFIED") {
    throw new Error("Proof has already been verified — no re-upload needed");
  }

  const updated = await prisma.manualInvestment.update({
    where: { id: investmentId },
    data: {
      proofStatus: "RECEIVED",
      proofDocumentKey: input.storageKey,
      proofStorageType: input.storageType as DocumentStorageType,
      proofFileType: input.fileType,
      proofFileName: input.fileName,
      proofFileSize: input.fileSize,
      proofUploadedBy: userId,
      proofUploadedAt: new Date(),
      proofNotes: input.notes,
      // Clear any previous rejection
      proofRejectedBy: null,
      proofRejectedAt: null,
      proofRejectionReason: null,
    },
    select: {
      id: true,
      proofStatus: true,
      proofFileName: true,
      proofUploadedAt: true,
      transferMethod: true,
      transferStatus: true,
      commitmentAmount: true,
    },
  });

  // Fire-and-forget: notify GP admins that proof was received
  import("@/lib/emails/send-proof-notifications")
    .then(({ sendProofReceivedNotification }) =>
      sendProofReceivedNotification(investmentId),
    )
    .catch((err) => reportError(err as Error));

  return updated;
}

// ============================================================================
// GP Proof Review
// ============================================================================

/**
 * GP verifies or rejects proof of payment.
 */
export async function reviewProofOfPayment(
  investmentId: string,
  input: ReviewProofInput,
  gpUserId: string,
) {
  const investment = await prisma.manualInvestment.findUnique({
    where: { id: investmentId },
    select: {
      id: true,
      proofStatus: true,
      proofDocumentKey: true,
      commitmentAmount: true,
      fundedAmount: true,
    },
  });

  if (!investment) {
    throw new Error(`Manual investment not found: ${investmentId}`);
  }

  if (!investment.proofDocumentKey) {
    throw new Error("No proof document uploaded yet");
  }

  if (investment.proofStatus === "VERIFIED") {
    throw new Error("Proof has already been verified");
  }

  if (input.action === "verify") {
    const updated = await prisma.manualInvestment.update({
      where: { id: investmentId },
      data: {
        proofStatus: "VERIFIED",
        proofVerifiedBy: gpUserId,
        proofVerifiedAt: new Date(),
        isVerified: true,
        verifiedBy: gpUserId,
        verifiedAt: new Date(),
        // Mark transfer as completed when proof is verified
        transferStatus: "COMPLETED",
        fundedAmount: investment.commitmentAmount,
        fundedDate: new Date(),
      },
    });

    // Fire-and-forget: notify LP that proof was verified
    import("@/lib/emails/send-proof-notifications")
      .then(({ sendProofVerifiedNotification }) =>
        sendProofVerifiedNotification(investmentId),
      )
      .catch((err) => reportError(err as Error));

    return updated;
  }

  if (input.action === "reject") {
    if (!input.rejectionReason) {
      throw new Error("Rejection reason is required");
    }

    const updated = await prisma.manualInvestment.update({
      where: { id: investmentId },
      data: {
        proofStatus: "REJECTED",
        proofRejectedBy: gpUserId,
        proofRejectedAt: new Date(),
        proofRejectionReason: input.rejectionReason,
      },
    });

    // Fire-and-forget: notify LP that proof was rejected
    import("@/lib/emails/send-proof-notifications")
      .then(({ sendProofRejectedNotification }) =>
        sendProofRejectedNotification(investmentId),
      )
      .catch((err) => reportError(err as Error));

    return updated;
  }

  throw new Error(`Invalid action: ${input.action}`);
}

// ============================================================================
// GP Dashboard Queries
// ============================================================================

/**
 * List manual investments with pending proofs (GP review dashboard).
 */
export async function listPendingProofs(
  teamId: string,
  options: { fundId?: string; page?: number; pageSize?: number } = {},
) {
  const { fundId, page = 1, pageSize = 25 } = options;

  const where = {
    teamId,
    proofStatus: { in: [ManualInvestmentProofStatus.RECEIVED, ManualInvestmentProofStatus.PENDING] },
    ...(fundId ? { fundId } : {}),
  };

  const [investments, total] = await Promise.all([
    prisma.manualInvestment.findMany({
      where,
      include: {
        investor: {
          select: { id: true, entityName: true, entityType: true },
        },
        fund: { select: { id: true, name: true } },
      },
      orderBy: { proofUploadedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.manualInvestment.count({ where }),
  ]);

  return {
    investments,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get wire transfer summary for dashboard display.
 */
export async function getWireTransferSummary(
  teamId: string,
  fundId?: string,
): Promise<WireTransferSummary[]> {
  const investments = await prisma.manualInvestment.findMany({
    where: {
      teamId,
      transferMethod: TransferMethod.WIRE,
      ...(fundId ? { fundId } : {}),
    },
    include: {
      investor: { select: { entityName: true } },
      fund: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return investments.map((inv) => ({
    investmentId: inv.id,
    investorName: inv.investor?.entityName ?? "Unknown Investor",
    fundName: inv.fund?.name ?? "Unknown Fund",
    commitmentAmount: Number(inv.commitmentAmount),
    fundedAmount: Number(inv.fundedAmount),
    transferMethod: inv.transferMethod ?? "WIRE",
    transferStatus: inv.transferStatus,
    proofStatus: inv.proofStatus as ProofStatus,
    proofUploadedAt: inv.proofUploadedAt,
    proofVerifiedAt: inv.proofVerifiedAt,
    createdAt: inv.createdAt,
  }));
}

/**
 * Mark a manual investment as requiring proof of payment.
 * Called by GP when creating/updating a wire-based investment.
 */
export async function requireProof(investmentId: string) {
  return prisma.manualInvestment.update({
    where: { id: investmentId },
    data: { proofStatus: "PENDING" },
  });
}
