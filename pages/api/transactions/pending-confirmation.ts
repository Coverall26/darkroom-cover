import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

/**
 * GET /api/transactions/pending-confirmation
 *
 * Returns transactions awaiting GP confirmation, scoped to the requesting
 * GP's team(s). Supports optional fundId filter.
 *
 * Query params:
 *   - fundId (optional): filter to a specific fund
 *   - page (optional, default 1)
 *   - pageSize (optional, default 50, max 100)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Find user and their admin team memberships
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        teams: {
          where: {
            role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
            status: "ACTIVE",
          },
          select: { teamId: true },
        },
      },
    });

    if (!user || user.teams.length === 0) {
      return res.status(403).json({ error: "Access denied" });
    }

    const teamIds = user.teams.map((m: { teamId: string }) => m.teamId);

    // Parse query params
    const fundId = req.query.fundId as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.pageSize as string) || 50),
    );

    // Get fund IDs that belong to GP's teams
    const gpFunds = await prisma.fund.findMany({
      where: { teamId: { in: teamIds } },
      select: { id: true, name: true, teamId: true },
    });
    const gpFundIds = gpFunds.map((f: { id: string }) => f.id);
    const fundMap = new Map(gpFunds.map((f: { id: string; name: string | null; teamId: string }) => [f.id, f]));

    // Build where clause: pending transactions for GP's funds
    // PROOF_UPLOADED: LP has uploaded wire proof, awaiting GP confirmation
    // PENDING/PROCESSING: legacy statuses also shown for backwards compatibility
    const where: Record<string, unknown> = {
      status: { in: ["PENDING", "PROCESSING", "PROOF_UPLOADED"] },
      fundId: { in: gpFundIds },
    };
    if (fundId) {
      where.fundId = fundId;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          investor: {
            select: {
              id: true,
              user: {
                select: { name: true, email: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.transaction.count({ where }),
    ]);

    const items = transactions.map((tx) => {
      const fund = tx.fundId ? fundMap.get(tx.fundId) : null;
      return {
        id: tx.id,
        investorId: tx.investorId,
        investorName: tx.investor?.user?.name || "Unknown",
        investorEmail: tx.investor?.user?.email || "",
        fundId: tx.fundId,
        fundName: fund?.name || "",
        teamId: fund?.teamId || "",
        amount: tx.amount ? Number(tx.amount) : 0,
        currency: tx.currency || "USD",
        type: tx.type,
        status: tx.status,
        description: tx.description,
        initiatedAt: tx.initiatedAt?.toISOString() || tx.createdAt.toISOString(),
        metadata: tx.metadata,
      };
    });

    return res.status(200).json({
      transactions: items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching pending confirmations:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
