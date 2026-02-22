import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import { getUsageSummary, getUsageHistory } from "@/lib/esig/usage-service";
import prisma from "@/lib/prisma";
import { apiRateLimiter } from "@/lib/security/rate-limiter";
import { CustomUser } from "@/lib/types";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const allowed = await apiRateLimiter(req, res);
  if (!allowed) return;

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userId = (session.user as CustomUser).id;
  const { teamId } = req.query as { teamId: string };

  // Verify team membership
  const membership = await prisma.userTeam.findFirst({
    where: {
      teamId,
      userId,
      role: { in: ["OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER"] },
      status: "ACTIVE",
    },
    select: { role: true },
  });

  if (!membership) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const includeHistory = req.query.includeHistory === "true";
    const periods = Math.min(
      24,
      Math.max(1, parseInt(req.query.periods as string, 10) || 12),
    );

    const summary = await getUsageSummary(teamId);

    if (includeHistory) {
      const history = await getUsageHistory(teamId, periods);
      return res.status(200).json({ ...summary, history });
    }

    return res.status(200).json(summary);
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching esig usage:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
