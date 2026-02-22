import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

/**
 * GET /api/investor-profile/[profileId]/change-requests
 *
 * Returns all change requests for an investor profile.
 * LP can see their own change requests (with GP notes and flagged fields).
 * GP admin can see change requests for investors in their team's funds.
 *
 * Query params:
 *   - status (optional): PENDING, ACCEPTED, REJECTED, EXPIRED
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
    if (!session?.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { profileId, status } = req.query as {
      profileId: string;
      status?: string;
    };

    if (!profileId || typeof profileId !== "string") {
      return res.status(400).json({ error: "Invalid profile ID" });
    }

    // Load investor with user info to verify access
    const investor = await prisma.investor.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        userId: true,
        user: { select: { id: true, email: true } },
        investments: {
          select: {
            fundId: true,
            fund: { select: { teamId: true } },
          },
        },
      },
    });

    if (!investor) {
      return res.status(404).json({ error: "Investor profile not found" });
    }

    // Access check: LP owns the profile OR GP is admin on the investor's team
    const isOwner = investor.user.id === session.user.id;

    if (!isOwner) {
      // Check if the requesting user is an admin on any team that has a fund the investor is in
      const teamIds = [
        ...new Set(
          investor.investments
            .map((inv) => inv.fund?.teamId)
            .filter(Boolean) as string[],
        ),
      ];

      if (teamIds.length === 0) {
        return res.status(403).json({ error: "Access denied" });
      }

      const adminMembership = await prisma.userTeam.findFirst({
        where: {
          userId: session.user.id,
          teamId: { in: teamIds },
          role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
          status: "ACTIVE",
        },
      });

      if (!adminMembership) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    // Build query filter
    const where: Record<string, unknown> = { investorId: profileId };
    if (status && ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"].includes(status)) {
      where.status = status;
    }

    // Fetch change requests
    const changeRequests = await prisma.profileChangeRequest.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      include: {
        fund: { select: { id: true, name: true } },
      },
    });

    // Fetch GP user names for requestedBy IDs
    const gpUserIds = [
      ...new Set(changeRequests.map((cr) => cr.requestedBy)),
    ];
    const gpUsers = gpUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: gpUserIds } },
          select: { id: true, name: true },
        })
      : [];
    const gpNameMap = Object.fromEntries(
      gpUsers.map((u) => [u.id, u.name || "Fund Manager"]),
    );

    const items = changeRequests.map((cr) => ({
      id: cr.id,
      investorId: cr.investorId,
      fundId: cr.fundId,
      fundName: cr.fund?.name || null,
      status: cr.status,
      changeType: cr.changeType,
      fieldName: cr.fieldName,
      reason: cr.reason,
      currentValue: cr.currentValue,
      requestedValue: cr.requestedValue,
      newValue: cr.newValue,
      lpNote: cr.lpNote,
      gpNote: cr.gpNote,
      requestedBy: cr.requestedBy,
      requestedByName: gpNameMap[cr.requestedBy] || "Fund Manager",
      reviewedBy: cr.reviewedBy,
      requestedAt: cr.requestedAt.toISOString(),
      respondedAt: cr.respondedAt?.toISOString() || null,
      expiresAt: cr.expiresAt?.toISOString() || null,
    }));

    const counts = {
      total: items.length,
      pending: items.filter((i) => i.status === "PENDING").length,
      accepted: items.filter((i) => i.status === "ACCEPTED").length,
      rejected: items.filter((i) => i.status === "REJECTED").length,
      expired: items.filter((i) => i.status === "EXPIRED").length,
    };

    return res.status(200).json({ items, counts });
  } catch (error) {
    reportError(error as Error);
    console.error("[CHANGE_REQUESTS] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
