import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { CustomUser } from "@/lib/types";
import { reportError } from "@/lib/error";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);

    if (!session?.user?.email) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const user = session.user as CustomUser;

    const userTeams = await prisma.userTeam.findMany({
      where: { userId: user.id },
      select: {
        role: true,
        hasFundroomAccess: true,
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const hasDataroomAccess = userTeams.length > 0;
    const hasFundroomAccess = userTeams.some((ut) => ut.hasFundroomAccess);
    // Match admin-guard.ts: OWNER, ADMIN, and SUPER_ADMIN all have full access
    const isSuperAdmin = userTeams.some((ut) =>
      ["OWNER", "ADMIN", "SUPER_ADMIN"].includes(ut.role)
    );

    return res.status(200).json({
      hasDataroomAccess,
      hasFundroomAccess: hasFundroomAccess || isSuperAdmin,
      isSuperAdmin,
      teams: userTeams.map((ut) => ({
        id: ut.team.id,
        name: ut.team.name,
        role: ut.role,
        hasFundroomAccess: ut.hasFundroomAccess || isSuperAdmin,
      })),
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching user permissions:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
