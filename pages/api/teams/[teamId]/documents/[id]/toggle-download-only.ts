import { NextApiRequest, NextApiResponse } from "next";

import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth/next";

import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";
import { reportError } from "@/lib/error";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userId = (session.user as CustomUser).id;
  const { teamId, id: documentId } = req.query as {
    teamId: string;
    id: string;
  };
  const { downloadOnly } = req.body as { downloadOnly: boolean };

  try {
    // Check if user has access to the team
    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
        users: {
          some: {
            userId: userId,
          },
        },
      },
    });

    if (!team) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Update document
    await prisma.document.update({
      where: {
        id: documentId,
        teamId: teamId,
      },
      data: {
        downloadOnly: downloadOnly,
      },
    });

    await fetch(
      `${process.env.NEXTAUTH_URL}/api/revalidate?secret=${process.env.REVALIDATE_TOKEN}&documentId=${documentId}`,
    );

    return res.status(200).json({
      message: `Document is now ${downloadOnly ? "download only" : "viewable"}`,
    });
  } catch (error) {
    reportError(error as Error);
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
