import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";

/**
 * PATCH /api/approvals/[approvalId]/approve-with-changes
 *
 * Approve a submission with GP-made edits.
 * Original values preserved in audit log.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { approvalId } = req.query as { approvalId: string };
  const { fundId, teamId, changes, notes } = req.body as {
    fundId: string;
    teamId: string;
    changes: Array<{ field: string; originalValue: string; newValue: string }>;
    notes?: string;
  };

  if (!fundId || !teamId) {
    return res.status(400).json({ error: "fundId and teamId are required" });
  }

  if (!changes || changes.length === 0) {
    return res.status(400).json({ error: "No changes provided" });
  }

  try {
    // Verify GP admin access
    const userTeam = await prisma.userTeam.findFirst({
      where: {
        userId: session.user.id,
        teamId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
    });

    if (!userTeam) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Extract investor ID
    const parts = approvalId.split("-");
    const entityId = parts.slice(1).join("-");

    const investor = await prisma.investor.findUnique({
      where: { id: entityId },
    });

    if (!investor) {
      return res.status(404).json({ error: "Investor not found" });
    }

    // Apply changes to investor record
    const updateData: Record<string, unknown> = {};
    for (const change of changes) {
      updateData[change.field] = change.newValue;
    }

    await prisma.investor.update({
      where: { id: entityId },
      data: {
        ...updateData,
        fundData: {
          ...((investor.fundData as Record<string, unknown>) || {}),
          stage: "APPROVED",
          approvedBy: session.user.id,
          approvedAt: new Date().toISOString(),
          approvedWithChanges: true,
        },
      },
    });

    await logAuditEvent({
      eventType: "INVESTOR_APPROVED_WITH_CHANGES",
      userId: session.user.id,
      teamId,
      resourceType: "Investor",
      resourceId: entityId,
      metadata: {
        action: "approve-with-changes",
        fundId,
        notes,
        originalValues: changes.map((c) => ({
          field: c.field,
          original: c.originalValue,
          new: c.newValue,
        })),
      },
      ipAddress: req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    });

    return res.status(200).json({
      message: "Investor approved with changes",
      stage: "APPROVED",
      changesApplied: changes.length,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[APPROVAL_APPROVE_WITH_CHANGES] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
