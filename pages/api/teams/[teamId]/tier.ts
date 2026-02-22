import { NextApiRequest, NextApiResponse } from "next";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { errorhandler } from "@/lib/errorHandler";
import prisma from "@/lib/prisma";
import { resolveTier } from "@/lib/tier";
import { CustomUser } from "@/lib/types";

/**
 * GET /api/teams/:teamId/tier
 *
 * Returns the full resolved tier for a team — plan, limits, usage, capabilities.
 * This is the single frontend endpoint for "what can this team do?"
 */
export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { teamId } = req.query as { teamId: string };
  const userId = (session.user as CustomUser).id;

  try {
    // Verify the user belongs to this team
    const membership = await prisma.userTeam.findFirst({
      where: {
        teamId,
        userId,
        status: "ACTIVE",
      },
      select: { role: true },
    });

    if (!membership) {
      return res.status(403).json({ error: "Not a member of this team" });
    }

    const tier = await resolveTier(teamId);

    return res.status(200).json(tier);
  } catch (error) {
    errorhandler(error, res);
  }
}
