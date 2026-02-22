import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { uploadProofOfPayment } from "@/lib/wire-transfer";
import { reportError } from "@/lib/error";
import {
  requireFundroomActiveByFund,
  PAYWALL_ERROR,
} from "@/lib/auth/paywall";
import { appRouterUploadRateLimit } from "@/lib/security/rate-limiter";
import { sendGpWireProofNotification } from "@/lib/emails/send-gp-wire-proof-notification";
import { publishServerEvent } from "@/lib/tracking/server-events";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";
import { emitSSE, SSE_EVENTS } from "@/lib/sse/event-emitter";

export const dynamic = "force-dynamic";

/**
 * POST /api/lp/wire-proof
 * LP submits proof of wire payment metadata after uploading the file via presigned URL.
 *
 * Supports two flows:
 * 1. ManualInvestment (GP-initiated): Updates proof fields directly on ManualInvestment.
 * 2. Regular Investment (LP self-service): Creates a Transaction record with proof
 *    metadata so it appears in the GP's "Confirm Receipt" tab.
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterUploadRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {

    const body = await req.json();
    const {
      investmentId,
      storageKey,
      storageType,
      fileType,
      fileName,
      fileSize,
      notes,
      amountSent,
      wireDateInitiated,
      bankReference,
    } = body;

    if (!investmentId || !storageKey || !storageType || !fileType || !fileName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Validate optional field bounds
    if (notes && typeof notes === "string" && notes.length > 500) {
      return NextResponse.json(
        { error: "Notes exceeds 500 characters" },
        { status: 400 },
      );
    }
    if (
      bankReference &&
      typeof bankReference === "string" &&
      bankReference.length > 100
    ) {
      return NextResponse.json(
        { error: "Bank reference exceeds 100 characters" },
        { status: 400 },
      );
    }
    if (
      amountSent != null &&
      (typeof amountSent !== "number" ||
        !Number.isFinite(amountSent) ||
        amountSent < 0 ||
        amountSent > 100_000_000_000)
    ) {
      return NextResponse.json(
        { error: "Invalid amountSent" },
        { status: 400 },
      );
    }
    if (wireDateInitiated) {
      const wireDate = new Date(wireDateInitiated);
      if (
        isNaN(wireDate.getTime()) ||
        wireDate.getTime() > Date.now() + 86400000
      ) {
        return NextResponse.json(
          { error: "Invalid or future wireDateInitiated" },
          { status: 400 },
        );
      }
    }

    // Try ManualInvestment first (GP-initiated flow)
    const manualInvestment = await prisma.manualInvestment.findUnique({
      where: { id: investmentId },
      select: { id: true, fundId: true },
    });

    if (manualInvestment) {
      // Paywall check
      if (manualInvestment.fundId) {
        const paywallAllowed = await requireFundroomActiveByFund(
          manualInvestment.fundId,
        );
        if (!paywallAllowed) {
          return NextResponse.json(PAYWALL_ERROR, { status: 402 });
        }
      }

      const result = await uploadProofOfPayment(
        investmentId,
        {
          storageKey,
          storageType,
          fileType,
          fileName,
          fileSize: fileSize ?? 0,
          notes: notes || undefined,
        },
        auth.userId,
      );

      return NextResponse.json({
        success: true,
        proofStatus: result.proofStatus,
        proofFileName: result.proofFileName,
      });
    }

    // Fall back to regular Investment (LP self-service flow)
    const investment = await prisma.investment.findUnique({
      where: { id: investmentId },
      select: {
        id: true,
        investorId: true,
        fundId: true,
        commitmentAmount: true,
        investor: { select: { userId: true } },
        fund: { select: { teamId: true } },
      },
    });

    if (!investment) {
      return NextResponse.json(
        { error: "Investment not found" },
        { status: 404 },
      );
    }

    // Verify the LP owns this investment
    if (investment.investor.userId !== auth.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Paywall check
    if (investment.fundId) {
      const paywallAllowed = await requireFundroomActiveByFund(
        investment.fundId,
      );
      if (!paywallAllowed) {
        return NextResponse.json(PAYWALL_ERROR, { status: 402 });
      }
    }

    // Check for existing completed transaction (prevent duplicate)
    const existingCompleted = await prisma.transaction.findFirst({
      where: {
        investorId: investment.investorId,
        fundId: investment.fundId,
        type: "WIRE_TRANSFER",
        status: "COMPLETED",
      },
    });

    if (existingCompleted) {
      return NextResponse.json(
        { error: "Wire transfer has already been confirmed" },
        { status: 409 },
      );
    }

    // Create a Transaction record with proof metadata.
    // Status: PROOF_UPLOADED indicates LP has uploaded proof, awaiting GP confirmation.
    const transaction = await prisma.transaction.create({
      data: {
        investorId: investment.investorId,
        fundId: investment.fundId,
        type: "WIRE_TRANSFER",
        amount: investment.commitmentAmount,
        status: "PROOF_UPLOADED",
        description: `Wire proof uploaded: ${fileName}`,
        initiatedBy: auth.userId,
        initiatedAt: wireDateInitiated
          ? new Date(wireDateInitiated)
          : undefined,
        expectedAmount: investment.commitmentAmount,
        bankReference: bankReference || undefined,
        metadata: {
          proofDocumentKey: storageKey,
          proofStorageType: storageType,
          proofFileType: fileType,
          proofFileName: fileName,
          proofFileSize: fileSize ?? 0,
          proofNotes: notes || null,
          proofUploadedBy: auth.userId,
          proofUploadedAt: new Date().toISOString(),
          amountSent: amountSent ? Number(amountSent) : null,
          wireDateInitiated: wireDateInitiated || null,
          bankReference: bankReference || null,
        },
      },
    });

    // Fire-and-forget: Track wire proof upload
    publishServerEvent("funnel_wire_proof_uploaded", {
      userId: auth.userId,
      investorId: investment.investorId,
    }).catch((e) => reportError(e as Error));

    // Fire-and-forget: notify GP team admins of wire proof upload
    sendGpWireProofNotification({
      investmentId: investment.id,
      fundId: investment.fundId,
      investorId: investment.investorId,
      fileName,
      amountSent: amountSent ? Number(amountSent) : null,
      bankReference: bankReference || null,
    }).catch((e) => reportError(e as Error));

    // Fire-and-forget: SSE for real-time GP dashboard update
    const fundTeamId = investment.fund?.teamId;
    if (fundTeamId) {
      emitSSE(SSE_EVENTS.WIRE_PROOF_UPLOADED, {
        orgId: fundTeamId,
        data: {
          investorId: investment.investorId,
          fundId: investment.fundId,
          fileName,
        },
      });
    }

    return NextResponse.json({
      success: true,
      proofStatus: "RECEIVED",
      proofFileName: fileName,
      transactionId: transaction.id,
    });
  } catch (error: unknown) {
    reportError(error as Error);
    const errMsg = error instanceof Error ? error.message : "";
    const status = errMsg.includes("not found")
      ? 404
      : errMsg.includes("Unauthorized")
        ? 403
        : errMsg.includes("already been verified")
          ? 409
          : 500;
    const clientMessage =
      status === 404
        ? "Resource not found"
        : status === 403
          ? "Forbidden"
          : status === 409
            ? "Proof has already been verified"
            : "Internal server error";
    return NextResponse.json({ error: clientMessage }, { status });
  }
}
