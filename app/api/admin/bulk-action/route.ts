import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bulk-action
 *
 * Create a capital call or distribution for a fund, allocated across investors.
 *
 * Body: { fundId, actionType, totalAmount, allocationType?, selectedInvestors? }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAppRouter();
    if (auth instanceof NextResponse) return auth;

    // Get all admin teams for fund scoping
    const userTeams = await prisma.userTeam.findMany({
      where: {
        userId: auth.userId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
      select: { teamId: true },
    });

    const teamIds = userTeams.map((t: { teamId: string }) => t.teamId);

    const body = await req.json();
    const {
      fundId,
      actionType,
      totalAmount,
      allocationType = "pro_rata",
      selectedInvestors,
    } = body;

    if (!fundId || !actionType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const amount = parseFloat(totalAmount);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be a positive number" },
        { status: 400 },
      );
    }

    if (!["capital_call", "distribution"].includes(actionType)) {
      return NextResponse.json({ error: "Invalid action type" }, { status: 400 });
    }

    if (!["equal", "pro_rata"].includes(allocationType)) {
      return NextResponse.json({ error: "Invalid allocation type" }, { status: 400 });
    }

    const fund = await prisma.fund.findFirst({
      where: {
        id: fundId,
        teamId: { in: teamIds },
      },
      include: {
        investments: {
          include: {
            investor: true,
          },
        },
        aggregate: true,
      },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    // Enforce initial closing threshold for capital calls only
    if (actionType === "capital_call") {
      const aggregate = fund.aggregate;
      const initialThresholdEnabled =
        fund.initialThresholdEnabled ||
        aggregate?.initialThresholdEnabled ||
        fund.capitalCallThresholdEnabled ||
        aggregate?.thresholdEnabled ||
        false;
      const initialThresholdAmount = fund.initialThresholdAmount
        ? Number(fund.initialThresholdAmount)
        : aggregate?.initialThresholdAmount
          ? Number(aggregate.initialThresholdAmount)
          : fund.capitalCallThreshold
            ? Number(fund.capitalCallThreshold)
            : aggregate?.thresholdAmount
              ? Number(aggregate.thresholdAmount)
              : null;
      const totalCommitted = aggregate?.totalCommitted
        ? Number(aggregate.totalCommitted)
        : Number(fund.currentRaise);

      if (
        initialThresholdEnabled &&
        initialThresholdAmount &&
        totalCommitted < initialThresholdAmount
      ) {
        const remaining = initialThresholdAmount - totalCommitted;
        return NextResponse.json(
          {
            error: "Initial closing threshold not met",
            code: "INITIAL_THRESHOLD_NOT_MET",
            details: {
              initialThresholdAmount,
              totalCommitted,
              remaining,
              percentComplete: Math.round((totalCommitted / initialThresholdAmount) * 100),
            },
          },
          { status: 403 },
        );
      }
    }

    let investors = fund.investments;
    if (selectedInvestors && selectedInvestors.length > 0) {
      investors = investors.filter(
        (inv: { investorId: string }) => selectedInvestors.includes(inv.investorId),
      );
    }

    if (investors.length === 0) {
      return NextResponse.json({ error: "No investors selected" }, { status: 400 });
    }

    const totalCommitments = investors.reduce(
      (sum: number, inv: { commitmentAmount: unknown }) =>
        sum + Number(inv.commitmentAmount),
      0,
    );

    if (allocationType === "pro_rata" && totalCommitments === 0) {
      return NextResponse.json(
        { error: "Cannot use pro-rata allocation: no commitments found" },
        { status: 400 },
      );
    }

    const allocations = investors.map(
      (inv: {
        investorId: string;
        commitmentAmount: unknown;
        investor: { entityName: string | null };
      }) => {
        let allocationAmount: number;

        if (allocationType === "equal") {
          allocationAmount = amount / investors.length;
        } else {
          const share = Number(inv.commitmentAmount) / totalCommitments;
          allocationAmount = amount * share;
        }

        return {
          investorId: inv.investorId,
          investorName: inv.investor.entityName || "Unknown",
          commitment: Number(inv.commitmentAmount),
          allocation: Math.round(allocationAmount * 100) / 100,
          percentage:
            totalCommitments > 0
              ? Math.round((Number(inv.commitmentAmount) / totalCommitments) * 10000) / 100
              : Math.round((100 / investors.length) * 100) / 100,
        };
      },
    );

    if (actionType === "capital_call") {
      const callNumber = await prisma.capitalCall.count({
        where: { fundId },
      });

      const capitalCall = await prisma.capitalCall.create({
        data: {
          fundId,
          callNumber: callNumber + 1,
          amount: amount,
          purpose: `Capital Call #${callNumber + 1}`,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: "PENDING",
          createdBy: auth.userId,
          responses: {
            create: allocations.map(
              (a: { investorId: string; allocation: number }) => ({
                investorId: a.investorId,
                amountDue: a.allocation,
                status: "PENDING",
              }),
            ),
          },
        },
      });

      return NextResponse.json({
        success: true,
        actionType: "capital_call",
        capitalCallId: capitalCall.id,
        allocations,
        message: `Capital call created for ${allocations.length} investors`,
      });
    } else if (actionType === "distribution") {
      const distNumber = await prisma.distribution.count({
        where: { fundId },
      });

      const distribution = await prisma.distribution.create({
        data: {
          fundId,
          distributionNumber: distNumber + 1,
          totalAmount: amount,
          distributionType: "DIVIDEND",
          distributionDate: new Date(),
          status: "PENDING",
        },
      });

      return NextResponse.json({
        success: true,
        actionType: "distribution",
        distributionId: distribution.id,
        allocations,
        message: `Distribution created for ${allocations.length} investors`,
      });
    }

    return NextResponse.json({ error: "Invalid action type" }, { status: 400 });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
