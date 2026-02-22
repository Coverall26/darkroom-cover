import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

type UserRole = "LP" | "GP";

interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  investorId?: string;
  teamIds?: string[];
}

async function getUserWithRoleAppRouter(): Promise<{
  user: AuthenticatedUser | null;
  error?: string;
  statusCode?: number;
}> {
  const auth = await requireLPAuthAppRouter();

  if (auth instanceof NextResponse) {
    return { user: null, error: "Not authenticated", statusCode: 401 };
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      email: true,
      role: true,
      investorProfile: {
        select: { id: true },
      },
      teams: {
        select: { teamId: true },
      },
    },
  });

  if (!user) {
    return { user: null, error: "User not found", statusCode: 404 };
  }

  return {
    user: {
      id: user.id,
      email: user.email!,
      role: user.role as UserRole,
      investorId: user.investorProfile?.id,
      teamIds: user.teams.map((t) => t.teamId),
    },
  };
}

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const { user, error, statusCode } = await getUserWithRoleAppRouter();

    if (!user) {
      return NextResponse.json(
        { error: error },
        { status: statusCode || 401 },
      );
    }

    if (user.role === "LP" && !user.investorId) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = searchParams.get("limit") || "10";
    const offset = searchParams.get("offset") || "0";
    const type = searchParams.get("type");
    const fundId = searchParams.get("fundId");
    const investorId = searchParams.get("investorId");

    let where: any = {};

    if (user.role === "LP") {
      where.investorId = user.investorId;
    } else if (user.role === "GP") {
      if (!user.teamIds || user.teamIds.length === 0) {
        return NextResponse.json(
          { error: "No team access" },
          { status: 403 },
        );
      }

      const teamFunds = await prisma.fund.findMany({
        where: { teamId: { in: user.teamIds } },
        select: { id: true },
      });
      const allowedFundIds = teamFunds.map((f) => f.id);

      if (allowedFundIds.length === 0) {
        return NextResponse.json({
          transactions: [],
          total: 0,
          hasMore: false,
        });
      }

      if (fundId) {
        if (!allowedFundIds.includes(fundId)) {
          return NextResponse.json(
            { error: "Fund not in your team" },
            { status: 403 },
          );
        }
        where.fundId = fundId;
      } else {
        where.fundId = { in: allowedFundIds };
      }

      if (investorId) {
        const investorInTeamFund = await prisma.investment.findFirst({
          where: {
            investorId: investorId,
            fundId: { in: allowedFundIds },
          },
        });

        if (!investorInTeamFund) {
          return NextResponse.json(
            { error: "Investor not in your team funds" },
            { status: 403 },
          );
        }
        where.investorId = investorId;
      }
    }

    if (type) {
      where.type = type;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: parseInt(limit),
        skip: parseInt(offset),
        include: {
          bankLink: {
            select: {
              institutionName: true,
              accountMask: true,
            },
          },
          investor:
            user.role === "GP"
              ? {
                  select: {
                    id: true,
                    entityName: true,
                    user: {
                      select: { name: true, email: true },
                    },
                  },
                }
              : false,
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    return NextResponse.json({
      transactions: transactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        amount: t.amount.toString(),
        currency: t.currency,
        description: t.description,
        status: t.status,
        statusMessage: t.statusMessage,
        fundId: t.fundId,
        bankAccount: t.bankLink
          ? `${t.bankLink.institutionName} ••••${t.bankLink.accountMask}`
          : null,
        ...(user.role === "GP" &&
          t.investor && {
            investor: {
              id: t.investor.id,
              name: t.investor.entityName || t.investor.user?.name,
              email: t.investor.user?.email,
            },
          }),
        initiatedAt: t.initiatedAt,
        completedAt: t.completedAt,
        createdAt: t.createdAt,
      })),
      total,
      hasMore: total > parseInt(offset) + parseInt(limit),
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching transactions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
