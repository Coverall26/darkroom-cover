import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { CustomUser } from "@/lib/types";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * GET /api/funds/[fundId]/aggregates
 *
 * Returns fund aggregate data including commitments, funded amounts,
 * capital calls, distributions, and investor breakdown.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fundId: string }> },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const { fundId } = await params;

  if (!fundId) {
    return NextResponse.json({ error: "Fund ID required" }, { status: 400 });
  }

  try {
    // Inline GP role check (equivalent to getUserWithRole + requireRole(["GP"]))
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as CustomUser;

    const userTeams = await prisma.userTeam.findMany({
      where: {
        userId: user.id,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
      select: { teamId: true },
    });

    if (userTeams.length === 0) {
      return NextResponse.json({ error: "GP access required" }, { status: 403 });
    }

    const teamIds = userTeams.map((t: { teamId: string }) => t.teamId);

    const fund = await prisma.fund.findFirst({
      where: {
        id: fundId,
        teamId: { in: teamIds },
      },
      include: {
        investments: {
          include: {
            investor: {
              select: {
                id: true,
                entityName: true,
                user: { select: { name: true, email: true } },
              },
            },
          },
        },
        capitalCalls: {
          include: {
            responses: true,
          },
        },
        distributions: true,
      },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const manualInvestments = await (prisma as any).manualInvestment.findMany({
      where: {
        fundId,
        status: "ACTIVE",
      },
    });

    const transactions = await prisma.transaction.findMany({
      where: { fundId },
    });

    const platformCommitments = fund.investments.reduce(
      (sum: number, inv: { commitmentAmount: unknown }) => sum + Number(inv.commitmentAmount),
      0,
    );
    const manualCommitments = manualInvestments.reduce(
      (sum: number, mi: any) => sum + Number(mi.commitmentAmount),
      0,
    );
    const totalCommitments = platformCommitments + manualCommitments;

    const platformFunded = fund.investments.reduce(
      (sum: number, inv: { fundedAmount: unknown }) => sum + Number(inv.fundedAmount),
      0,
    );
    const manualFunded = manualInvestments.reduce(
      (sum: number, mi: any) => sum + Number(mi.fundedAmount),
      0,
    );
    const totalFunded = platformFunded + manualFunded;

    const totalCapitalCalled = fund.capitalCalls.reduce(
      (sum: number, cc: { amount: unknown }) => sum + Number(cc.amount),
      0,
    );

    const totalDistributed = fund.distributions.reduce(
      (sum: number, d: { totalAmount: unknown }) => sum + Number(d.totalAmount),
      0,
    );

    const completedTransactions = transactions.filter(
      (t: { status: string }) => t.status === "COMPLETED",
    );

    const totalInbound = completedTransactions
      .filter((t: { type: string }) => t.type === "CAPITAL_CALL")
      .reduce((sum: number, t: { amount: unknown }) => sum + Number(t.amount), 0);

    const totalOutbound = completedTransactions
      .filter((t: { type: string }) => t.type === "DISTRIBUTION")
      .reduce((sum: number, t: { amount: unknown }) => sum + Number(t.amount), 0);

    const pendingTransactions = transactions.filter(
      (t: { status: string }) => t.status === "PENDING" || t.status === "PROCESSING",
    );

    const investorIdsSet = new Set<string>();
    fund.investments.forEach((inv: { investorId: string }) => investorIdsSet.add(inv.investorId));
    manualInvestments.forEach((mi: any) => investorIdsSet.add(mi.investorId));
    const totalInvestorCount = investorIdsSet.size;

    return NextResponse.json({
      fund: {
        id: fund.id,
        name: fund.name,
        status: fund.status,
        targetRaise: fund.targetRaise.toString(),
        currentRaise: fund.currentRaise.toString(),
        closingDate: fund.closingDate,
      },
      aggregates: {
        totalCommitments: totalCommitments.toFixed(2),
        totalFunded: totalFunded.toFixed(2),
        totalCapitalCalled: totalCapitalCalled.toFixed(2),
        totalDistributed: totalDistributed.toFixed(2),
        totalInbound: totalInbound.toFixed(2),
        totalOutbound: totalOutbound.toFixed(2),
        netCashFlow: (totalInbound - totalOutbound).toFixed(2),
        platformCommitments: platformCommitments.toFixed(2),
        manualCommitments: manualCommitments.toFixed(2),
      },
      investorCount: totalInvestorCount,
      manualInvestmentCount: manualInvestments.length,
      pendingTransactionCount: pendingTransactions.length,
      investors: fund.investments.map((inv: {
        investor: {
          id: string;
          entityName: string | null;
          user: { name: string | null; email: string | null } | null;
        };
        commitmentAmount: { toString(): string };
        fundedAmount: { toString(): string };
        status: string;
      }) => ({
        id: inv.investor.id,
        name: inv.investor.entityName || inv.investor.user?.name,
        email: inv.investor.user?.email,
        commitment: inv.commitmentAmount.toString(),
        funded: inv.fundedAmount.toString(),
        status: inv.status,
      })),
      manualInvestments: manualInvestments.map((mi: any) => ({
        id: mi.id,
        investorId: mi.investorId,
        documentType: mi.documentType,
        documentTitle: mi.documentTitle,
        commitment: mi.commitmentAmount.toString(),
        funded: mi.fundedAmount.toString(),
        signedDate: mi.signedDate,
        status: mi.status,
      })),
    });
  } catch (error) {
    reportError(error as Error, { action: "fund_aggregates", fundId });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
