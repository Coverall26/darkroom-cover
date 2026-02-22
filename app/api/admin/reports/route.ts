import { NextRequest, NextResponse } from "next/server";

import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports?fundId=xxx
 *
 * Returns: raise summary, pipeline stages, conversion funnel, recent activity
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const fundId = searchParams.get("fundId");
  if (!fundId) {
    return NextResponse.json(
      { error: "fundId is required" },
      { status: 400 },
    );
  }

  try {
    // Verify access — user must belong to the team that owns this fund
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: {
        id: true,
        name: true,
        targetRaise: true,
        teamId: true,
      },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const userTeam = await prisma.userTeam.findFirst({
      where: {
        userId: auth.userId,
        teamId: fund.teamId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get all investors for this fund
    const investors = await prisma.investor.findMany({
      where: { fundId },
      include: {
        investments: {
          where: { fundId },
          select: {
            commitmentAmount: true,
            fundedAmount: true,
            status: true,
          },
        },
      },
    });

    // Calculate stage distribution from fundData
    const stages = {
      applied: 0,
      underReview: 0,
      approved: 0,
      committed: 0,
      funded: 0,
      rejected: 0,
    };

    let totalCommitted = 0;
    let totalFunded = 0;

    for (const investor of investors) {
      const fundData = investor.fundData as Record<string, unknown> | null;
      const stage = (fundData?.stage as string) || "APPLIED";

      switch (stage) {
        case "APPLIED":
          stages.applied++;
          break;
        case "UNDER_REVIEW":
          stages.underReview++;
          break;
        case "APPROVED":
          stages.approved++;
          break;
        case "COMMITTED":
          stages.committed++;
          break;
        case "FUNDED":
          stages.funded++;
          break;
        case "REJECTED":
          stages.rejected++;
          break;
        default:
          stages.applied++;
      }

      for (const inv of investor.investments) {
        totalCommitted += Number(inv.commitmentAmount) || 0;
        totalFunded += Number(inv.fundedAmount) || 0;
      }
    }

    // Get dataroom viewer count for conversion funnel
    const datarooms = await prisma.dataroom.findMany({
      where: { teamId: fund.teamId },
      select: {
        id: true,
        _count: { select: { viewers: true } },
      },
    });

    const dataroomViews = datarooms.reduce(
      (sum, dr) => sum + dr._count.viewers,
      0,
    );

    // Build conversion funnel
    const emailsCaptured = dataroomViews;
    const onboardingStarted = investors.filter(
      (i) => i.onboardingStep > 0,
    ).length;
    const ndaSigned = investors.filter((i) => i.ndaSigned).length;

    const conversionFunnel = {
      dataroomViews,
      emailsCaptured,
      onboardingStarted,
      ndaSigned,
      committed: stages.committed + stages.funded,
      funded: stages.funded,
    };

    const report = {
      id: fund.id,
      name: fund.name,
      targetRaise: Number(fund.targetRaise) || 0,
      totalCommitted,
      totalFunded,
      investorCount: investors.length,
      stages,
      conversionFunnel,
      recentActivity: [],
    };

    return NextResponse.json({ report });
  } catch (error) {
    reportError(error as Error);
    console.error("[REPORTS] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
