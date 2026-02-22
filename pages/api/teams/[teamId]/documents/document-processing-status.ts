import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { teamId, documentVersionId } = req.query as {
    teamId: string;
    documentVersionId: string;
  };

  // Verify user belongs to this team
  const membership = await prisma.userTeam.findFirst({
    where: { userId: session.user.id, teamId },
  });
  if (!membership) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    // Verify document version belongs to this team
    const documentVersion = await prisma.documentVersion.findFirst({
      where: {
        id: documentVersionId,
        document: { teamId },
      },
      select: {
        numPages: true,
        hasPages: true,
        _count: { select: { pages: true } },
      },
    });

    if (!documentVersion) {
      return res.status(404).end();
    }

    const status = {
      currentPageCount: documentVersion._count.pages,
      totalPages: documentVersion.numPages,
      hasPages: documentVersion.hasPages,
    };

    res.status(200).json(status);
  } catch (error) {
    reportError(error as Error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
