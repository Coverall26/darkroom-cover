import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; fundId: string }>;
};

/**
 * GET /api/teams/[teamId]/funds/[fundId]/transactions
 *
 * List transactions for a fund, optionally filtered by status.
 * Used by the GP wire confirmation page to display pending transactions.
 *
 * Query params:
 *   status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED"
 *   page: number (default 1)
 *   pageSize: number (default 50)
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId, fundId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    // Verify fund belongs to team
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: { id: true, name: true },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const statuses = url.searchParams.getAll("status");
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50")),
    );

    const where: Record<string, unknown> = { fundId };
    if (statuses.length === 1) {
      where.status = statuses[0];
    } else if (statuses.length > 1) {
      where.status = { in: statuses };
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          investor: {
            select: {
              id: true,
              entityName: true,
              user: { select: { email: true, name: true } },
            },
          },
        },
        orderBy: { initiatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.transaction.count({ where }),
    ]);

    const mapped = transactions.map((tx) => ({
      id: tx.id,
      investorName:
        tx.investor.user.name ?? tx.investor.entityName ?? "Unknown Investor",
      investorEmail: tx.investor.user.email ?? "",
      amount: Number(tx.amount),
      currency: tx.currency,
      type: tx.type,
      status: tx.status,
      fundName: fund.name,
      initiatedAt: tx.initiatedAt.toISOString(),
      description: tx.description,
      confirmedAt: tx.confirmedAt?.toISOString() ?? null,
      confirmedBy: tx.confirmedBy,
      bankReference: tx.bankReference,
      fundsReceivedDate: tx.fundsReceivedDate?.toISOString() ?? null,
    }));

    return NextResponse.json({
      transactions: mapped,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    reportError(error, {
      path: "/api/teams/[teamId]/funds/[fundId]/transactions",
      method: "GET",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
