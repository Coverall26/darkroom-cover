import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getWireInstructionsPublic } from "@/lib/wire-transfer";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/lp/wire-instructions
 * Returns wire instructions for the LP's active fund investment.
 * Auto-detects the fund from the investor's manual investments.
 */
export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    // Find investor profile
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        name: true,
        investorProfile: {
          select: { id: true },
        },
      },
    });

    if (!user?.investorProfile) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 404 },
      );
    }

    // Get latest manual investment (has wire transfer fields)
    const manualInvestment = await prisma.manualInvestment.findFirst({
      where: { investorId: user.investorProfile.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fundId: true,
        teamId: true,
        commitmentAmount: true,
        fundedAmount: true,
        proofStatus: true,
        proofFileName: true,
        proofUploadedAt: true,
        transferMethod: true,
        transferStatus: true,
        fund: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!manualInvestment) {
      // Fall back to regular Investment
      const regularInvestment = await prisma.investment.findFirst({
        where: { investorId: user.investorProfile.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fundId: true,
          commitmentAmount: true,
          fund: {
            select: {
              id: true,
              name: true,
              teamId: true,
            },
          },
        },
      });

      if (!regularInvestment) {
        return NextResponse.json(
          {
            error:
              "No active fund investment found. Please complete your subscription first.",
          },
          { status: 404 },
        );
      }

      const wireInstructions = await getWireInstructionsPublic(
        regularInvestment.fundId,
      );

      // Check for wire transfer Transaction to determine proof status
      const wireTransaction = await prisma.transaction.findFirst({
        where: {
          investorId: user.investorProfile.id,
          fundId: regularInvestment.fundId,
          type: "WIRE_TRANSFER",
        },
        orderBy: { initiatedAt: "desc" },
        select: {
          status: true,
          metadata: true,
          initiatedAt: true,
        },
      });

      // Derive proof status from Transaction status
      let proofStatus = "PENDING";
      let proofFileName: string | undefined;
      let proofUploadedAt: string | undefined;

      if (wireTransaction) {
        const meta = (wireTransaction.metadata as Record<string, unknown>) || null;
        proofFileName = (meta?.proofFileName as string) || undefined;
        proofUploadedAt =
          (meta?.proofUploadedAt as string) ||
          wireTransaction.initiatedAt.toISOString();

        if (wireTransaction.status === "COMPLETED") {
          proofStatus = "VERIFIED";
        } else if (
          wireTransaction.status === "FAILED" ||
          wireTransaction.status === "CANCELLED"
        ) {
          proofStatus = "REJECTED";
        } else {
          // PENDING or PROCESSING — proof has been uploaded, awaiting GP confirmation
          proofStatus = "RECEIVED";
        }
      }

      return NextResponse.json({
        fundId: regularInvestment.fund.id,
        fundName: regularInvestment.fund.name,
        investmentId: regularInvestment.id,
        teamId: regularInvestment.fund.teamId,
        commitmentAmount: Number(regularInvestment.commitmentAmount),
        investorName: user.name || "",
        wireInstructions: wireInstructions
          ? {
              bankName: wireInstructions.bankName,
              accountName: wireInstructions.beneficiaryName,
              routingNumber: wireInstructions.routingNumber,
              accountNumber: `****${wireInstructions.accountNumberLast4}`,
              reference: wireInstructions.reference || "",
              notes: wireInstructions.notes || "",
              swiftCode: wireInstructions.swiftCode || "",
            }
          : null,
        proofStatus,
        proofFileName,
        proofUploadedAt,
      });
    }

    const wireInstructions = await getWireInstructionsPublic(
      manualInvestment.fundId,
    );

    return NextResponse.json({
      fundId: manualInvestment.fund.id,
      fundName: manualInvestment.fund.name,
      investmentId: manualInvestment.id,
      teamId: manualInvestment.teamId,
      commitmentAmount: Number(manualInvestment.commitmentAmount),
      investorName: user.name || "",
      wireInstructions: wireInstructions
        ? {
            bankName: wireInstructions.bankName,
            accountName: wireInstructions.beneficiaryName,
            routingNumber: wireInstructions.routingNumber,
            accountNumber: `****${wireInstructions.accountNumberLast4}`,
            reference: wireInstructions.reference || "",
            notes: wireInstructions.notes || "",
            swiftCode: wireInstructions.swiftCode || "",
          }
        : null,
      proofStatus: manualInvestment.proofStatus || "PENDING",
      proofFileName: manualInvestment.proofFileName || undefined,
      proofUploadedAt:
        manualInvestment.proofUploadedAt?.toISOString() || undefined,
    });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
