import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";

/**
 * GET /api/approvals/pending
 *
 * Returns all pending and recent approvals for the GP's team.
 * Aggregates: investor profile reviews, commitments, documents, change requests.
 *
 * Query params:
 *   - teamId (required)
 *   - fundId (optional — filter by fund)
 *   - status (optional — PENDING, APPROVED, REJECTED, CHANGES_REQUESTED)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { teamId, fundId, status } = req.query as {
    teamId?: string;
    fundId?: string;
    status?: string;
  };

  if (!teamId) {
    return res.status(400).json({ error: "teamId is required" });
  }

  try {
    // Verify user is admin on team
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

    // Get funds for this team
    const fundWhere: Record<string, unknown> = { teamId };
    if (fundId) fundWhere.id = fundId;
    const funds = await prisma.fund.findMany({
      where: fundWhere,
      select: { id: true, name: true },
    });
    const fundIds = funds.map((f) => f.id);
    const fundNameMap = Object.fromEntries(funds.map((f) => [f.id, f.name]));

    // Fetch investors with investments in these funds
    const investors = await prisma.investor.findMany({
      where: {
        investments: { some: { fundId: { in: fundIds } } },
      },
      include: {
        user: { select: { name: true, email: true } },
        investments: {
          where: { fundId: { in: fundIds } },
          select: {
            id: true,
            fundId: true,
            status: true,
            commitmentAmount: true,
            fundedAmount: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch open change requests
    const changeRequests = await prisma.profileChangeRequest.findMany({
      where: {
        fundId: { in: fundIds },
        status: "PENDING",
      },
      include: {
        investor: {
          include: { user: { select: { name: true, email: true } } },
        },
      },
    });

    // Build approval items
    const items: Array<Record<string, unknown>> = [];

    // Investor profile approvals
    for (const investor of investors) {
      const fd = (investor.fundData as Record<string, unknown>) || {};
      const stage = (fd.stage as string) || "APPLIED";
      const investment = investor.investments[0];
      if (!investment) continue;

      let approvalStatus = "PENDING";
      if (stage === "APPROVED" || stage === "COMMITTED" || stage === "DOCS_APPROVED" || stage === "FUNDED") {
        approvalStatus = "APPROVED";
      } else if (stage === "REJECTED") {
        approvalStatus = "REJECTED";
      } else if (fd.changesRequested) {
        approvalStatus = "CHANGES_REQUESTED";
      }

      // Apply status filter
      if (status && approvalStatus !== status) continue;

      items.push({
        id: `profile-${investor.id}`,
        investorId: investor.id,
        investorName: investor.user?.name || investor.entityName || "Unknown",
        investorEmail: investor.user?.email || "",
        submissionType: "PROFILE",
        submittedAt: investor.createdAt.toISOString(),
        status: approvalStatus,
        fundId: investment.fundId,
        fundName: fundNameMap[investment.fundId] || "Unknown Fund",
        teamId,
        entityType: investor.entityType,
        commitmentAmount: investment.commitmentAmount ? Number(investment.commitmentAmount) : undefined,
        accreditationStatus: investor.accreditationStatus,
        fields: [
          { name: "entityName", label: "Legal Name", value: investor.entityName || "", editable: true },
          { name: "entityType", label: "Entity Type", value: investor.entityType || "INDIVIDUAL", editable: true },
          { name: "accreditationStatus", label: "Accreditation", value: investor.accreditationStatus || "", editable: true },
          { name: "taxId", label: "Tax ID", value: investor.taxId ? "***encrypted***" : "", editable: false },
        ],
      });
    }

    // Change request items
    for (const cr of changeRequests) {
      if (status && status !== "PENDING") continue;

      items.push({
        id: `cr-${cr.id}`,
        investorId: cr.investorId,
        investorName: cr.investor?.user?.name || "",
        investorEmail: cr.investor?.user?.email || "",
        submissionType: "CHANGE_REQUEST",
        submittedAt: cr.requestedAt.toISOString(),
        status: "PENDING",
        fundId: cr.fundId || "",
        fundName: fundNameMap[cr.fundId || ""] || "Unknown Fund",
        teamId,
        changeRequest: {
          id: cr.id,
          fieldName: cr.fieldName || "",
          currentValue: cr.currentValue || "",
          requestedValue: cr.requestedValue || "",
          reason: cr.reason || "",
        },
      });
    }

    // Sort by date (newest first)
    items.sort(
      (a, b) =>
        new Date(b.submittedAt as string).getTime() -
        new Date(a.submittedAt as string).getTime(),
    );

    return res.status(200).json({
      items,
      counts: {
        total: items.length,
        pending: items.filter((i) => i.status === "PENDING").length,
        approved: items.filter((i) => i.status === "APPROVED").length,
        rejected: items.filter((i) => i.status === "REJECTED").length,
        changesRequested: items.filter((i) => i.status === "CHANGES_REQUESTED").length,
      },
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[APPROVALS_PENDING] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
