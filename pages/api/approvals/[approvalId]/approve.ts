import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";

/**
 * PATCH /api/approvals/[approvalId]/approve
 *
 * Approve a submission. Delegates to the review API.
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
  const { fundId, teamId } = req.body;

  if (!fundId || !teamId) {
    return res.status(400).json({ error: "fundId and teamId are required" });
  }

  try {
    // Verify GP has admin access
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

    // Extract investor ID from approval ID (format: "profile-{investorId}" or "cr-{changeRequestId}")
    const parts = approvalId.split("-");
    const type = parts[0];
    const entityId = parts.slice(1).join("-");

    if (type === "profile") {
      // Approve investor profile
      const investor = await prisma.investor.findUnique({
        where: { id: entityId },
      });

      if (!investor) {
        return res.status(404).json({ error: "Investor not found" });
      }

      await prisma.investor.update({
        where: { id: entityId },
        data: {
          fundData: {
            ...((investor.fundData as Record<string, unknown>) || {}),
            stage: "APPROVED",
            approvedBy: session.user.id,
            approvedAt: new Date().toISOString(),
          },
        },
      });

      await logAuditEvent({
        eventType: "INVESTOR_APPROVED",
        userId: session.user.id,
        teamId,
        resourceType: "Investor",
        resourceId: entityId,
        metadata: { action: "approve", fundId },
        ipAddress: req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
      });

      return res.status(200).json({ message: "Investor approved", stage: "APPROVED" });
    }

    if (type === "cr") {
      // Approve change request
      const changeRequest = await prisma.profileChangeRequest.findUnique({
        where: { id: entityId },
      });

      if (!changeRequest) {
        return res.status(404).json({ error: "Change request not found" });
      }

      // Apply the change
      if (changeRequest.fieldName && changeRequest.requestedValue) {
        await prisma.investor.update({
          where: { id: changeRequest.investorId },
          data: {
            [changeRequest.fieldName]: changeRequest.requestedValue,
          },
        });
      }

      await prisma.profileChangeRequest.update({
        where: { id: entityId },
        data: {
          status: "ACCEPTED",
          reviewedBy: session.user.id,
          respondedAt: new Date(),
          newValue: changeRequest.requestedValue,
        },
      });

      await logAuditEvent({
        eventType: "INVESTOR_APPROVED",
        userId: session.user.id,
        teamId,
        resourceType: "Investor",
        resourceId: changeRequest.investorId,
        metadata: {
          action: "approve-change-request",
          changeRequestId: entityId,
          fieldName: changeRequest.fieldName,
          oldValue: changeRequest.currentValue,
          newValue: changeRequest.requestedValue,
        },
        ipAddress: req.socket.remoteAddress,
        userAgent: req.headers["user-agent"],
      });

      return res.status(200).json({ message: "Change request approved" });
    }

    return res.status(400).json({ error: "Invalid approval ID format" });
  } catch (error) {
    reportError(error as Error);
    console.error("[APPROVAL_APPROVE] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
