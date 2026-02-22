import { NextResponse } from "next/server";
import { TransactionStatus } from "@prisma/client";

import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { enforceRBACAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/transactions
 *
 * Returns all transactions across the GP's team funds.
 * Query params: teamId (optional), status (optional filter), limit, offset
 */
export async function GET(req: Request) {
  try {
    const rbacResult = await enforceRBACAppRouter({
      roles: ["OWNER", "SUPER_ADMIN", "ADMIN"],
    });
    if (rbacResult instanceof NextResponse) return rbacResult;

    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const status = searchParams.get("status");
    const limit = searchParams.get("limit") || "50";
    const offset = searchParams.get("offset") || "0";

    // Get the user's team if not provided
    let resolvedTeamId = teamId || undefined;
    if (!resolvedTeamId) {
      const membership = await prisma.userTeam.findFirst({
        where: {
          userId: rbacResult.userId,
          role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        },
        select: { teamId: true },
      });
      if (!membership) {
        return NextResponse.json({ error: "No admin team found" }, { status: 403 });
      }
      resolvedTeamId = membership.teamId;
    }

    // Get fund IDs for this team
    const funds = await prisma.fund.findMany({
      where: { teamId: resolvedTeamId },
      select: { id: true, name: true },
    });
    const fundIds = funds.map((f: { id: string }) => f.id);
    const fundNameMap = Object.fromEntries(
      funds.map((f: { id: string; name: string }) => [f.id, f.name]),
    );

    if (fundIds.length === 0) {
      return NextResponse.json({ transactions: [], total: 0 });
    }

    // Build where clause
    const whereClause = {
      fundId: { in: fundIds },
      ...(status ? { status: status as TransactionStatus } : {}),
    };

    // Fetch transactions with investor details
    const txInclude = {
      investor: {
        select: {
          id: true,
          user: { select: { name: true, email: true } },
        },
      },
    } as const;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: whereClause,
        include: txInclude,
        orderBy: { createdAt: "desc" },
        take: Math.min(parseInt(limit, 10) || 50, 200),
        skip: parseInt(offset, 10) || 0,
      }),
      prisma.transaction.count({
        where: whereClause,
      }),
    ]);

    const mapped = transactions.map(
      (tx: {
        id: string;
        type: string | null;
        status: string;
        amount: unknown;
        investor: { user: { name: string | null; email: string | null } } | null;
        fundId: string | null;
        bankReference: string | null;
        createdAt: Date;
        confirmedAt: Date | null;
      }) => {
        const investorUser = tx.investor?.user;
        return {
          id: tx.id,
          type: tx.type || "WIRE",
          status: tx.status,
          amount: Number(tx.amount) || 0,
          investorName: investorUser?.name || "Unknown",
          investorEmail: investorUser?.email || "",
          fundName: fundNameMap[tx.fundId || ""] || "Unknown Fund",
          fundId: tx.fundId || "",
          bankReference: tx.bankReference || undefined,
          createdAt: tx.createdAt.toISOString(),
          confirmedAt: tx.confirmedAt?.toISOString() || undefined,
        };
      },
    );

    return NextResponse.json({
      transactions: mapped,
      total,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
