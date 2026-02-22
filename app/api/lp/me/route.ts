import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

/**
 * GET /api/lp/me
 * Returns the current LP investor profile with investments, capital calls,
 * documents, and accreditation status.
 */
export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const auth = await requireLPAuthAppRouter();
    if (auth instanceof NextResponse) return auth;

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: {
        investorProfile: {
          include: {
            investments: {
              include: {
                fund: true,
              },
            },
            capitalCalls: {
              include: {
                capitalCall: {
                  include: {
                    fund: true,
                  },
                },
              },
            },
            documents: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
            accreditationAcks: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!user?.investorProfile) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 404 },
      );
    }

    const capitalCalls = user.investorProfile.capitalCalls.map((ccr) => ({
      id: ccr.id,
      callNumber: ccr.capitalCall.callNumber,
      amount: ccr.amountDue.toString(),
      dueDate: ccr.capitalCall.dueDate.toISOString(),
      status: ccr.status,
      fundName: ccr.capitalCall.fund.name,
    }));

    const investments = user.investorProfile.investments || [];
    const ndaGateEnabled =
      investments.length > 0
        ? investments.some(
            (inv: any) => inv.fund?.ndaGateEnabled !== false,
          )
        : true;

    // Get fund aggregate data for progress bar
    const fundIds = [...new Set(investments.map((inv: any) => inv.fundId))];
    let fundAggregates: Array<{
      id: string;
      name: string;
      targetRaise: string;
      currentRaise: string;
      status: string;
      investorCount: number;
    }> = [];

    if (fundIds.length > 0) {
      const funds = await prisma.fund.findMany({
        where: { id: { in: fundIds } },
        include: {
          _count: { select: { investments: true } },
        },
      });
      fundAggregates = funds.map((f) => ({
        id: f.id,
        name: f.name,
        targetRaise: f.targetRaise.toString(),
        currentRaise: f.currentRaise.toString(),
        status: f.status,
        investorCount: f._count.investments,
      }));
    }

    // Calculate total commitment from investments
    const totalCommitment = investments.reduce((sum: number, inv: any) => {
      return sum + parseFloat(inv.commitmentAmount?.toString() || "0");
    }, 0);

    const totalFunded = investments.reduce((sum: number, inv: any) => {
      return sum + parseFloat(inv.fundedAmount?.toString() || "0");
    }, 0);

    // Get Persona KYC status using raw query (new fields may not be in Prisma types)
    const personaData = await prisma.$queryRaw<
      Array<{
        personaStatus: string;
        personaVerifiedAt: Date | null;
      }>
    >`
      SELECT "personaStatus", "personaVerifiedAt"
      FROM "Investor"
      WHERE id = ${user.investorProfile.id}
      LIMIT 1
    `;
    const kycInfo = personaData[0] || {
      personaStatus: "NOT_STARTED",
      personaVerifiedAt: null,
    };

    // Check accreditation acknowledgment completion
    const latestAck = user.investorProfile.accreditationAcks[0];
    const accreditationComplete =
      latestAck?.acknowledged === true && latestAck?.completedAt !== null;

    // Calculate gate completion progress
    const gateProgress = {
      ndaCompleted: user.investorProfile.ndaSigned,
      accreditationCompleted: accreditationComplete,
      completionPercentage:
        (user.investorProfile.ndaSigned ? 50 : 0) +
        (accreditationComplete ? 50 : 0),
    };

    return NextResponse.json({
      investor: {
        id: user.investorProfile.id,
        entityName: user.investorProfile.entityName,
        ndaSigned: user.investorProfile.ndaSigned,
        ndaSignedAt:
          user.investorProfile.ndaSignedAt?.toISOString() || null,
        accreditationStatus: user.investorProfile.accreditationStatus,
        accreditationType: user.investorProfile.accreditationType,
        fundData: user.investorProfile.fundData,
        signedDocs: user.investorProfile.signedDocs || [],
        documents: user.investorProfile.documents || [],
        kycStatus: kycInfo.personaStatus,
        kycVerifiedAt: kycInfo.personaVerifiedAt?.toISOString() || null,
        accreditationAck: latestAck
          ? {
              completedAt: latestAck.completedAt?.toISOString() || null,
              accreditationType: latestAck.accreditationType,
              method: latestAck.method,
            }
          : null,
        totalCommitment,
        totalFunded,
      },
      capitalCalls,
      ndaGateEnabled,
      gateProgress,
      fundAggregates,
    });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("LP me error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
