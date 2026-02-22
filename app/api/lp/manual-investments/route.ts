import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const auth = await requireLPAuthAppRouter();
    if (auth instanceof NextResponse) return auth;

    const investor = await prisma.investor.findFirst({
      where: { userId: auth.userId },
    });

    if (!investor) {
      return NextResponse.json({ investments: [] });
    }

    const manualInvestments = await prisma.manualInvestment.findMany({
      where: {
        investorId: investor.id,
        status: "ACTIVE",
      },
      include: {
        fund: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { signedDate: "desc" },
    });

    const investments = manualInvestments.map((mi: any) => ({
      id: mi.id,
      fundId: mi.fundId,
      fundName: mi.fund?.name || "Unknown Fund",
      documentType: mi.documentType,
      documentTitle: mi.documentTitle,
      documentNumber: mi.documentNumber,
      commitmentAmount: mi.commitmentAmount.toString(),
      fundedAmount: mi.fundedAmount.toString(),
      unfundedAmount: mi.unfundedAmount.toString(),
      units: mi.units?.toString() || null,
      shares: mi.shares?.toString() || null,
      pricePerUnit: mi.pricePerUnit?.toString() || null,
      ownershipPercent: mi.ownershipPercent?.toString() || null,
      signedDate: mi.signedDate ? mi.signedDate.toISOString() : null,
      effectiveDate: mi.effectiveDate
        ? mi.effectiveDate.toISOString()
        : null,
      fundedDate: mi.fundedDate ? mi.fundedDate.toISOString() : null,
      transferStatus: mi.transferStatus,
      isVerified: mi.isVerified,
      notes: mi.notes,
    }));

    const totalCommitment = manualInvestments.reduce(
      (sum: number, mi: any) => sum + Number(mi.commitmentAmount),
      0,
    );
    const totalFunded = manualInvestments.reduce(
      (sum: number, mi: any) => sum + Number(mi.fundedAmount),
      0,
    );

    return NextResponse.json({
      investments,
      summary: {
        count: investments.length,
        totalCommitment: totalCommitment.toFixed(2),
        totalFunded: totalFunded.toFixed(2),
        totalUnfunded: (totalCommitment - totalFunded).toFixed(2),
      },
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[LP_MANUAL_INVESTMENTS] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
