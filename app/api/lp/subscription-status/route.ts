import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { SubscriptionStatus } from "@prisma/client";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: {
        investorProfile: {
          include: {
            fund: {
              include: {
                pricingTiers: {
                  where: { isActive: true },
                  orderBy: { tranche: "asc" },
                },
              },
            },
          },
        },
      },
    });

    if (!user?.investorProfile) {
      return NextResponse.json({
        hasSubscription: false,
        canSubscribe: false,
        fund: null,
        pendingSubscription: null,
      });
    }

    const investor = user.investorProfile;
    const fund = investor.fund;

    const pendingSubscription = await prisma.subscription.findFirst({
      where: {
        investorId: investor.id,
        status: "PENDING",
      },
      include: {
        fund: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const signedSubscription = await prisma.subscription.findFirst({
      where: {
        investorId: investor.id,
        status: SubscriptionStatus.SIGNED,
      },
      include: {
        fund: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const processingSubscription = await prisma.subscription.findFirst({
      where: {
        investorId: investor.id,
        status: { in: [SubscriptionStatus.PAYMENT_PROCESSING, SubscriptionStatus.COMPLETED] },
      },
      include: {
        fund: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const hasBankAccount = await prisma.bankLink.findFirst({
      where: {
        investorId: investor.id,
        status: "ACTIVE",
      },
    });

    let pendingSigningToken = null;
    if (pendingSubscription) {
      const doc = await prisma.signatureDocument.findUnique({
        where: { id: pendingSubscription.signatureDocumentId },
        include: {
          recipients: {
            where: { status: "PENDING" },
            take: 1,
          },
        },
      });
      if (doc?.recipients?.[0]) {
        pendingSigningToken = doc.recipients[0].signingToken;
      }
    }

    const canSubscribe =
      investor.ndaSigned &&
      (investor.accreditationStatus === "SELF_CERTIFIED" ||
        investor.accreditationStatus === "KYC_VERIFIED") &&
      fund &&
      fund.entityMode === "FUND" &&
      !pendingSubscription &&
      !signedSubscription &&
      !processingSubscription;

    return NextResponse.json({
      hasSubscription:
        !!pendingSubscription ||
        !!signedSubscription ||
        !!processingSubscription,
      canSubscribe,
      fund: fund
        ? {
            id: fund.id,
            name: fund.name,
            flatModeEnabled: fund.flatModeEnabled,
            minimumInvestment: fund.minimumInvestment.toString(),
            entityMode: fund.entityMode,
            pricingTiers: fund.pricingTiers.map((t) => ({
              id: t.id,
              tranche: t.tranche,
              pricePerUnit: t.pricePerUnit.toString(),
              unitsAvailable: t.unitsAvailable,
              unitsTotal: t.unitsTotal,
              isActive: t.isActive,
            })),
          }
        : null,
      pendingSubscription: pendingSubscription
        ? {
            id: pendingSubscription.id,
            fundName: pendingSubscription.fund?.name || "Fund",
            amount: pendingSubscription.amount.toString(),
            units: pendingSubscription.units,
            status: pendingSubscription.status,
            signingToken: pendingSigningToken,
            createdAt: pendingSubscription.createdAt.toISOString(),
          }
        : null,
      signedSubscription: signedSubscription
        ? {
            id: signedSubscription.id,
            fundName: signedSubscription.fund?.name || "Fund",
            amount: signedSubscription.amount.toString(),
            units: signedSubscription.units,
            status: signedSubscription.status,
            createdAt: signedSubscription.createdAt.toISOString(),
          }
        : null,
      processingSubscription: processingSubscription
        ? {
            id: processingSubscription.id,
            fundName: processingSubscription.fund?.name || "Fund",
            amount: processingSubscription.amount.toString(),
            units: processingSubscription.units,
            status: processingSubscription.status,
            createdAt: processingSubscription.createdAt.toISOString(),
          }
        : null,
      hasBankAccount: !!hasBankAccount,
      entityName: investor.entityName,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
