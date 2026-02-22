import { NextRequest, NextResponse } from "next/server";
import { ManualInvestmentStatus, Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { enforceRBACAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

type ManualInvestmentWhereInput = {
  teamId?: string;
  fundId?: string;
  investorId?: string;
  status?: ManualInvestmentStatus;
};

/**
 * GET /api/admin/manual-investment
 *
 * List manual investments for the admin's team.
 * Query: fundId, investorId, status (optional filters)
 */
export async function GET(req: NextRequest) {
  const rbacResult = await enforceRBACAppRouter({
    roles: ["OWNER", "SUPER_ADMIN", "ADMIN"],
  });
  if (rbacResult instanceof NextResponse) return rbacResult;

  // Find the user's admin team
  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: rbacResult.userId,
      role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      status: "ACTIVE",
    },
  });

  if (!userTeam) {
    return NextResponse.json({ error: "Access denied. Admin role required." }, { status: 403 });
  }

  const teamId = userTeam.teamId;

  try {
    const { searchParams } = new URL(req.url);
    const fundId = searchParams.get("fundId");
    const investorId = searchParams.get("investorId");
    const status = searchParams.get("status");

    const where: ManualInvestmentWhereInput = { teamId };
    if (fundId) where.fundId = fundId;
    if (investorId) where.investorId = investorId;
    if (status) where.status = status as ManualInvestmentStatus;

    const investments = await prisma.manualInvestment.findMany({
      where,
      include: {
        investor: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
        fund: { select: { id: true, name: true } },
      },
      orderBy: { signedDate: "desc" },
    });

    return NextResponse.json({ investments });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/manual-investment
 *
 * Create a new manual investment record.
 */
export async function POST(req: NextRequest) {
  const rbacResult = await enforceRBACAppRouter({
    roles: ["OWNER", "SUPER_ADMIN", "ADMIN"],
  });
  if (rbacResult instanceof NextResponse) return rbacResult;

  // Find the user's admin team
  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: rbacResult.userId,
      role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      status: "ACTIVE",
    },
  });

  if (!userTeam) {
    return NextResponse.json({ error: "Access denied. Admin role required." }, { status: 403 });
  }

  const teamId = userTeam.teamId;
  const userId = rbacResult.userId;

  try {
    const body = await req.json();
    const {
      investorId,
      fundId,
      documentType,
      documentTitle,
      documentNumber,
      commitmentAmount,
      fundedAmount,
      units,
      shares,
      pricePerUnit,
      ownershipPercent,
      signedDate,
      effectiveDate,
      fundedDate,
      maturityDate,
      transferMethod,
      transferStatus,
      transferDate,
      transferRef,
      bankName,
      accountLast4,
      notes,
    } = body;

    if (!investorId || !fundId || !documentType || !documentTitle || !commitmentAmount || !signedDate) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: investorId, fundId, documentType, documentTitle, commitmentAmount, signedDate",
        },
        { status: 400 },
      );
    }

    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
    });

    if (!investor) {
      return NextResponse.json({ error: "Investor not found" }, { status: 404 });
    }

    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found or access denied" }, { status: 404 });
    }

    const forwarded = req.headers.get("x-forwarded-for");

    const investment = await prisma.manualInvestment.create({
      data: {
        investorId,
        fundId,
        teamId,
        documentType,
        documentTitle,
        documentNumber: documentNumber || null,
        commitmentAmount: new Prisma.Decimal(commitmentAmount),
        fundedAmount: fundedAmount ? new Prisma.Decimal(fundedAmount) : new Prisma.Decimal(0),
        unfundedAmount: fundedAmount
          ? new Prisma.Decimal(commitmentAmount).minus(new Prisma.Decimal(fundedAmount))
          : new Prisma.Decimal(commitmentAmount),
        units: units ? new Prisma.Decimal(units) : null,
        shares: shares ? new Prisma.Decimal(shares) : null,
        pricePerUnit: pricePerUnit ? new Prisma.Decimal(pricePerUnit) : null,
        ownershipPercent: ownershipPercent ? new Prisma.Decimal(ownershipPercent) : null,
        signedDate: new Date(signedDate),
        effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
        fundedDate: fundedDate ? new Date(fundedDate) : null,
        maturityDate: maturityDate ? new Date(maturityDate) : null,
        transferMethod: transferMethod || null,
        transferStatus: transferStatus || "PENDING",
        transferDate: transferDate ? new Date(transferDate) : null,
        transferRef: transferRef || null,
        bankName: bankName || null,
        accountLast4: accountLast4 || null,
        notes: notes || null,
        addedBy: userId,
        auditTrail: {
          created: {
            by: userId,
            at: new Date().toISOString(),
            ip: forwarded || null,
          },
        },
      },
      include: {
        investor: {
          include: {
            user: { select: { name: true, email: true } },
          },
        },
        fund: { select: { id: true, name: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        teamId,
        eventType: "MANUAL_INVESTMENT_CREATED",
        resourceType: "MANUAL_INVESTMENT",
        resourceId: investment.id,
        userId,
        metadata: {
          investorId,
          fundId,
          documentType,
          commitmentAmount,
          fundedAmount: fundedAmount || 0,
        },
        ipAddress: forwarded?.split(",")[0].trim() || null,
        userAgent: req.headers.get("user-agent") || null,
      },
    });

    return NextResponse.json({ investment }, { status: 201 });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
