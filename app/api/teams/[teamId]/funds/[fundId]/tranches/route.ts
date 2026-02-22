import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import prisma from "@/lib/prisma";
import { getFundTranches, getFundTrancheStats } from "@/lib/funds/tranches";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; fundId: string }>;
};

/**
 * GET /api/teams/[teamId]/funds/[fundId]/tranches
 * List all tranches for a fund with optional filters. GP only.
 *
 * Query params:
 *   status — Filter by tranche status (e.g., "SCHEDULED", "OVERDUE")
 *   dueBefore — Filter tranches due before this ISO date
 *   dueAfter — Filter tranches due after this ISO date
 *   stats — If "true", include aggregate statistics
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId, fundId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    // Verify fund belongs to this team
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: { id: true, name: true, stagedCommitmentsEnabled: true },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status") as any;
    const dueBefore = url.searchParams.get("dueBefore");
    const dueAfter = url.searchParams.get("dueAfter");
    const includeStats = url.searchParams.get("stats") === "true";

    const tranches = await getFundTranches(fundId, {
      status: statusFilter || undefined,
      dueBefore: dueBefore ? new Date(dueBefore) : undefined,
      dueAfter: dueAfter ? new Date(dueAfter) : undefined,
    });

    const response: any = {
      fund: {
        id: fund.id,
        name: fund.name,
        stagedCommitmentsEnabled: fund.stagedCommitmentsEnabled,
      },
      tranches: tranches.map((t) => ({
        id: t.id,
        investmentId: t.investmentId,
        trancheNumber: t.trancheNumber,
        label: t.label,
        amount: Number(t.amount),
        fundedAmount: Number(t.fundedAmount),
        scheduledDate: t.scheduledDate.toISOString().split("T")[0],
        calledDate: t.calledDate?.toISOString().split("T")[0] || null,
        fundedDate: t.fundedDate?.toISOString().split("T")[0] || null,
        overdueDate: t.overdueDate?.toISOString().split("T")[0] || null,
        status: t.status,
        capitalCallId: t.capitalCallId,
        notes: t.notes,
        investor: {
          id: t.investment.investor.id,
          name: t.investment.investor.user?.name || t.investment.investor.entityName || "",
          email: t.investment.investor.user?.email || "",
        },
      })),
      totalCount: tranches.length,
    };

    if (includeStats) {
      response.stats = await getFundTrancheStats(fundId);
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    reportError(err, { context: "GET fund tranches" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
