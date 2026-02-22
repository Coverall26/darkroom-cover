import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getUserWithRole } from "@/lib/auth/with-role";
import { reportError } from "@/lib/error";

/**
 * POST /api/transactions/[id]/process
 * Processes a pending transaction. Plaid ACH is Phase 2.
 * Currently only supports manual processing (mock transfer ID).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { user, error, statusCode } = await getUserWithRole(req, res);

  if (!user || user.role !== "GP") {
    return res
      .status(statusCode || 403)
      .json({ error: error || "GP access required" });
  }

  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Transaction ID required" });
  }

  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        investor: {
          select: {
            entityName: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.status !== "PENDING") {
      return res
        .status(400)
        .json({ error: "Transaction cannot be processed in its current state" });
    }

    const teamFunds = await prisma.fund.findMany({
      where: { teamId: { in: user.teamIds } },
      select: { id: true },
    });

    if (!teamFunds.some((f) => f.id === transaction.fundId)) {
      return res.status(403).json({ error: "Transaction not in your team" });
    }

    // Plaid ACH is Phase 2. For MVP, use manual processing with mock transfer ID.
    const mockTransferId = `manual_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const updatedTransaction = await prisma.transaction.update({
      where: { id },
      data: {
        status: "PROCESSING",
        plaidTransferId: mockTransferId,
        processedAt: new Date(),
        auditTrail: [
          ...(Array.isArray(transaction.auditTrail)
            ? transaction.auditTrail
            : []),
          {
            action: "PROCESSED",
            timestamp: new Date().toISOString(),
            userId: user.id,
            method: "MANUAL",
            plaidTransferId: mockTransferId,
          },
        ],
      },
    });

    return res.status(200).json({
      success: true,
      transaction: {
        id: updatedTransaction.id,
        status: updatedTransaction.status,
        plaidTransferId: updatedTransaction.plaidTransferId,
      },
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Error processing transaction:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
