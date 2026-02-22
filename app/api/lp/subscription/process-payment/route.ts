import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logPaymentEvent } from "@/lib/audit/audit-logger";
import { reportError } from "@/lib/error";
import { appRouterStrictRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = await appRouterStrictRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { subscriptionId } = body;

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Subscription ID is required" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: {
        investorProfile: {
          include: {
            bankLinks: {
              where: { status: "ACTIVE" },
              take: 1,
            },
          },
        },
      },
    });

    if (!user?.investorProfile) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 403 },
      );
    }

    const investor = user.investorProfile;
    const bankLink = investor.bankLinks[0];

    if (!bankLink) {
      return NextResponse.json(
        {
          error:
            "No bank account connected. Please connect a bank account first.",
          code: "NO_BANK_ACCOUNT",
        },
        { status: 400 },
      );
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        id: subscriptionId,
        investorId: investor.id,
      },
      include: {
        fund: true,
      },
    });

    if (!subscription) {
      return NextResponse.json(
        { error: "Subscription not found" },
        { status: 404 },
      );
    }

    const signatureDoc = await prisma.signatureDocument.findUnique({
      where: { id: subscription.signatureDocumentId },
      include: { recipients: true },
    });

    if (
      subscription.status !== "SIGNED" &&
      subscription.status !== "PENDING"
    ) {
      return NextResponse.json(
        {
          error: `Subscription cannot be processed. Current status: ${subscription.status}`,
        },
        { status: 400 },
      );
    }

    const allSigned =
      signatureDoc?.recipients?.every(
        (r: { status: string }) => r.status === "SIGNED",
      ) ?? false;

    if (!allSigned && subscription.status === "PENDING") {
      return NextResponse.json(
        {
          error:
            "Subscription document must be signed before processing payment",
          code: "NOT_SIGNED",
        },
        { status: 400 },
      );
    }

    const existingTransactions = await prisma.transaction.findMany({
      where: {
        investorId: investor.id,
        type: "SUBSCRIPTION_PAYMENT",
        status: { in: ["PENDING", "PROCESSING", "COMPLETED"] },
      },
    });

    const subscriptionAmount = parseFloat(subscription.amount.toString());
    const duplicatePayment = existingTransactions.find((tx) => {
      const txMetadata = tx.metadata as Record<string, any> | null;
      if (txMetadata?.subscriptionId === subscriptionId) {
        return true;
      }
      const txAmount = parseFloat(tx.amount.toString());
      const amountMatch = Math.abs(txAmount - subscriptionAmount) < 0.01;
      const fundMatch = tx.fundId === subscription.fundId;
      const timeWindow = tx.createdAt >= subscription.createdAt;
      if (amountMatch && fundMatch && timeWindow) {
        return true;
      }
      return false;
    });

    if (duplicatePayment) {
      return NextResponse.json(
        {
          error:
            "A payment is already pending or completed for this subscription",
          transactionId: duplicatePayment.id,
          status: duplicatePayment.status,
        },
        { status: 400 },
      );
    }

    // Plaid ACH is Phase 2. For MVP, record the payment for manual processing.
    const transaction = await prisma.transaction.create({
      data: {
        investorId: investor.id,
        bankLinkId: bankLink.id,
        type: "SUBSCRIPTION_PAYMENT",
        amount: subscription.amount,
        currency: "USD",
        description: `Subscription payment for ${subscription.fund?.name || "fund"}`,
        fundId: subscription.fundId,
        status: "PENDING",
        statusMessage: "Manual processing required",
        metadata: { subscriptionId: subscription.id },
      },
    });

    await logPaymentEvent(req, {
      eventType: "SUBSCRIPTION_PAYMENT_RECORDED",
      userId: user.id,
      teamId: subscription.fund?.teamId,
      transactionId: transaction.id,
      subscriptionId: subscription.id,
      investorId: investor.id,
      fundId: subscription.fundId,
      amount: subscription.amount.toString(),
    });

    return NextResponse.json({
      success: true,
      transaction: {
        id: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
      },
      message: "Payment recorded. Manual processing required.",
    });
  } catch (error: unknown) {
    reportError(error as Error, {
      path: "/api/lp/subscription/process-payment",
      action: "process-payment",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
