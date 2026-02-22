import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logSubscriptionEvent } from "@/lib/audit/audit-logger";
import { reportError } from "@/lib/error";
import { requireFundroomActiveByFund, PAYWALL_ERROR } from "@/lib/auth/paywall";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

interface CommitmentTranche {
  amount: number;
  scheduledDate: string;
  label: string;
}

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
            fund: true,
            investments: true,
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

    const investor = user.investorProfile;

    // Check if fund supports staged commitments
    const fundSupportsStaged = investor.fund
      ? await prisma.$queryRaw<Array<{ stagedCommitmentsEnabled: boolean }>>`
          SELECT "stagedCommitmentsEnabled"
          FROM "Fund"
          WHERE id = ${investor.fund.id}
          LIMIT 1
        `
      : [];

    const stagedEnabled =
      fundSupportsStaged.length > 0 &&
      fundSupportsStaged[0].stagedCommitmentsEnabled;

    // Get existing investments with staged data and persisted tranches
    const investmentsWithTranches = await prisma.investment.findMany({
      where: { investorId: investor.id },
      include: {
        tranches: {
          orderBy: { trancheNumber: "asc" },
        },
      },
    });

    const investments = investmentsWithTranches.map((inv: any) => ({
      id: inv.id,
      commitmentAmount: parseFloat(inv.commitmentAmount.toString()),
      fundedAmount: parseFloat(inv.fundedAmount.toString()),
      status: inv.status,
      subscriptionDate: inv.subscriptionDate,
      isStaged: inv.isStaged,
      schedule: inv.schedule,
      trancheCount: inv.trancheCount,
      tranches: inv.tranches.map((tr: any) => ({
        id: tr.id,
        trancheNumber: tr.trancheNumber,
        label: tr.label,
        amount: parseFloat(tr.amount.toString()),
        fundedAmount: parseFloat(tr.fundedAmount.toString()),
        scheduledDate: tr.scheduledDate.toISOString().split("T")[0],
        status: tr.status,
        calledDate: tr.calledDate,
        fundedDate: tr.fundedDate,
      })),
    }));

    return NextResponse.json({
      stagedCommitmentsEnabled: stagedEnabled,
      fundId: investor.fund?.id || null,
      fundName: investor.fund?.name || null,
      minimumInvestment: investor.fund?.minimumInvestment
        ? parseFloat(investor.fund.minimumInvestment.toString())
        : 0,
      investments,
      totalCommitted: investments.reduce(
        (sum: number, inv: any) => sum + inv.commitmentAmount,
        0,
      ),
      totalFunded: investments.reduce(
        (sum: number, inv: any) => sum + inv.fundedAmount,
        0,
      ),
    });
  } catch (error) {
    reportError(error instanceof Error ? error : new Error(String(error)), {
      context: "Staged commitment GET handler",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const authPost = await requireLPAuthAppRouter();
  if (authPost instanceof NextResponse) return authPost;

  try {

    const body = await req.json();
    const { totalCommitment, tranches, schedule, confirmTerms } = body;

    if (!totalCommitment || !tranches || !Array.isArray(tranches)) {
      return NextResponse.json(
        { error: "Total commitment and tranches are required" },
        { status: 400 },
      );
    }

    if (
      typeof totalCommitment !== "number" ||
      totalCommitment <= 0 ||
      totalCommitment > 100_000_000_000
    ) {
      return NextResponse.json(
        { error: "Total commitment must be a positive number up to $100B" },
        { status: 400 },
      );
    }

    if (!confirmTerms) {
      return NextResponse.json(
        { error: "You must confirm the commitment terms" },
        { status: 400 },
      );
    }

    if (tranches.length < 2 || tranches.length > 12) {
      return NextResponse.json(
        { error: "Must have between 2 and 12 tranches" },
        { status: 400 },
      );
    }

    // Validate tranche amounts sum to total
    const trancheSum = tranches.reduce(
      (sum: number, t: CommitmentTranche) => sum + t.amount,
      0,
    );
    if (Math.abs(trancheSum - totalCommitment) > 0.01) {
      return NextResponse.json(
        { error: "Tranche amounts must equal total commitment" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: authPost.userId },
      include: {
        investorProfile: {
          include: { fund: true },
        },
      },
    });

    if (!user?.investorProfile) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 404 },
      );
    }

    const investor = user.investorProfile;

    if (!investor.ndaSigned) {
      return NextResponse.json(
        { error: "NDA must be signed first" },
        { status: 403 },
      );
    }

    if (
      investor.accreditationStatus !== "SELF_CERTIFIED" &&
      investor.accreditationStatus !== "KYC_VERIFIED"
    ) {
      return NextResponse.json(
        { error: "Accreditation must be completed before committing" },
        { status: 403 },
      );
    }

    if (!investor.fund) {
      return NextResponse.json(
        { error: "No fund associated" },
        { status: 400 },
      );
    }

    // Paywall check: staged commitments require active FundRoom subscription
    const paywallAllowed = await requireFundroomActiveByFund(investor.fund.id);
    if (!paywallAllowed) {
      return NextResponse.json(PAYWALL_ERROR, { status: 402 });
    }

    // Verify fund has staged commitments enabled
    const fundCheck = await prisma.$queryRaw<
      Array<{ stagedCommitmentsEnabled: boolean }>
    >`
      SELECT "stagedCommitmentsEnabled"
      FROM "Fund"
      WHERE id = ${investor.fund.id}
      LIMIT 1
    `;

    if (!fundCheck[0]?.stagedCommitmentsEnabled) {
      return NextResponse.json(
        { error: "Staged commitments are not enabled for this fund" },
        { status: 400 },
      );
    }

    const minimumInvestment = parseFloat(
      investor.fund.minimumInvestment.toString(),
    );
    if (totalCommitment < minimumInvestment) {
      return NextResponse.json(
        {
          error: `Minimum commitment is $${minimumInvestment.toLocaleString()}`,
        },
        { status: 400 },
      );
    }

    // Validate tranche dates are in the future, ordered, and within 10 years
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 10);
    for (let i = 0; i < tranches.length; i++) {
      const trancheDate = new Date(tranches[i].scheduledDate + "T00:00:00");
      if (isNaN(trancheDate.getTime())) {
        return NextResponse.json(
          { error: `Invalid date for tranche ${i + 1}` },
          { status: 400 },
        );
      }
      if (trancheDate > maxDate) {
        return NextResponse.json(
          { error: "Tranche dates must be within 10 years from today" },
          { status: 400 },
        );
      }
      if (
        i > 0 &&
        trancheDate <=
          new Date(tranches[i - 1].scheduledDate + "T00:00:00")
      ) {
        return NextResponse.json(
          { error: "Tranche dates must be in chronological order" },
          { status: 400 },
        );
      }
    }

    // Create or update investment with staged commitment data
    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    const result = await prisma.$transaction(async (tx) => {
      const existingInvestment = await tx.investment.findUnique({
        where: {
          fundId_investorId: {
            fundId: investor.fund!.id,
            investorId: investor.id,
          },
        },
        include: { tranches: true },
      });

      let investment;

      if (existingInvestment) {
        // Delete old tranches if restructuring a staged commitment
        if (existingInvestment.tranches.length > 0) {
          await tx.investmentTranche.deleteMany({
            where: { investmentId: existingInvestment.id },
          });
        }

        // Update existing investment with new staged commitment
        investment = await tx.investment.update({
          where: { id: existingInvestment.id },
          data: {
            commitmentAmount: totalCommitment,
            status: "COMMITTED",
            subscriptionDate: new Date(),
            isStaged: true,
            schedule,
            trancheCount: tranches.length,
          },
        });
      } else {
        // Create new staged investment
        investment = await tx.investment.create({
          data: {
            fundId: investor.fund!.id,
            investorId: investor.id,
            commitmentAmount: totalCommitment,
            fundedAmount: 0,
            status: "COMMITTED",
            subscriptionDate: new Date(),
            isStaged: true,
            schedule,
            trancheCount: tranches.length,
          },
        });
      }

      // Persist each tranche as an InvestmentTranche row
      const trancheRecords = await Promise.all(
        tranches.map((t: CommitmentTranche, i: number) =>
          tx.investmentTranche.create({
            data: {
              investmentId: investment.id,
              trancheNumber: i + 1,
              label: t.label,
              amount: t.amount,
              fundedAmount: 0,
              scheduledDate: new Date(t.scheduledDate + "T00:00:00"),
              status: i === 0 ? "CALLED" : "SCHEDULED",
              ipAddress,
            },
          }),
        ),
      );

      // Update investor onboardingStep to advance past commitment
      await tx.investor.update({
        where: { id: investor.id },
        data: { onboardingStep: 7 },
      });

      // Sync FundAggregate.totalCommitted from Investment records
      const commitAgg = await tx.investment.aggregate({
        where: {
          fundId: investor.fund!.id,
          status: { notIn: ["CANCELLED", "DECLINED", "WITHDRAWN"] },
        },
        _sum: { commitmentAmount: true },
      });
      const totalCommittedNow = Number(commitAgg._sum.commitmentAmount ?? 0);

      await tx.fundAggregate.upsert({
        where: { fundId: investor.fund!.id },
        create: {
          fundId: investor.fund!.id,
          totalCommitted: totalCommittedNow,
        },
        update: {
          totalCommitted: totalCommittedNow,
        },
      });

      return { investment, trancheRecords };
    });

    await logSubscriptionEvent(req, {
      eventType: "STAGED_COMMITMENT_CREATED",
      userId: user.id,
      teamId: investor.fund.teamId,
      investorId: investor.id,
      fundId: investor.fund.id,
      amount: totalCommitment,
      metadata: {
        schedule,
        trancheCount: tranches.length,
        investmentId: result.investment.id,
        tranches: result.trancheRecords.map((tr) => ({
          id: tr.id,
          trancheNumber: tr.trancheNumber,
          amount: Number(tr.amount),
          scheduledDate: tr.scheduledDate.toISOString().split("T")[0],
          label: tr.label,
          status: tr.status,
        })),
        ipAddress,
      },
    });

    return NextResponse.json(
      {
        success: true,
        investment: {
          id: result.investment.id,
          commitmentAmount: totalCommitment,
          status: "COMMITTED",
          isStaged: true,
          schedule,
          trancheCount: tranches.length,
          tranches: result.trancheRecords.map((tr) => ({
            id: tr.id,
            trancheNumber: tr.trancheNumber,
            amount: Number(tr.amount),
            scheduledDate: tr.scheduledDate.toISOString().split("T")[0],
            label: tr.label,
            status: tr.status,
          })),
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    reportError(error instanceof Error ? error : new Error(String(error)), {
      context: "Staged commitment POST handler",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
