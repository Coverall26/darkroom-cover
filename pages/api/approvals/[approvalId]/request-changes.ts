import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { ChangeRequestType } from "@prisma/client";

/**
 * POST /api/approvals/[approvalId]/request-changes
 *
 * Request changes from LP on flagged fields.
 * Creates ProfileChangeRequest records.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { approvalId } = req.query as { approvalId: string };
  const { fundId, teamId, requestedChanges, notes } = req.body as {
    fundId: string;
    teamId: string;
    requestedChanges: Array<{
      changeType: string;
      fieldName: string;
      reason: string;
      currentValue?: string;
      requestedValue?: string;
    }>;
    notes?: string;
  };

  if (!fundId || !teamId) {
    return res.status(400).json({ error: "fundId and teamId are required" });
  }

  if (!requestedChanges || requestedChanges.length === 0) {
    return res.status(400).json({ error: "No change requests provided" });
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

    // Create ProfileChangeRequest records
    const changeRequests = await Promise.all(
      requestedChanges.map((change) =>
        prisma.profileChangeRequest.create({
          data: {
            investorId: entityId,
            fundId,
            requestedBy: session.user.id,
            status: "PENDING",
            changeType: change.changeType as ChangeRequestType,
            fieldName: change.fieldName,
            reason: change.reason,
            currentValue: change.currentValue,
            requestedValue: change.requestedValue,
            gpNote: notes,
          },
        }),
      ),
    );

    // Update investor stage
    await prisma.investor.update({
      where: { id: entityId },
      data: {
        fundData: {
          ...((investor.fundData as Record<string, unknown>) || {}),
          stage: "UNDER_REVIEW",
          changesRequested: true,
          changesRequestedBy: session.user.id,
          changesRequestedAt: new Date().toISOString(),
        },
      },
    });

    await logAuditEvent({
      eventType: "INVESTOR_CHANGES_REQUESTED",
      userId: session.user.id,
      teamId,
      resourceType: "Investor",
      resourceId: entityId,
      metadata: {
        action: "request-changes",
        fundId,
        notes,
        changeRequestIds: changeRequests.map((cr) => cr.id),
        fieldsRequested: requestedChanges.map((c) => c.fieldName),
      },
      ipAddress: req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    });

    return res.status(200).json({
      message: "Changes requested from investor",
      stage: "UNDER_REVIEW",
      changeRequestCount: changeRequests.length,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[APPROVAL_REQUEST_CHANGES] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
