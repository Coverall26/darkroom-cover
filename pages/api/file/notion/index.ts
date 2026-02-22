import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import notion from "@/lib/notion";
import { addSignedUrls } from "@/lib/notion/utils";
import { log } from "@/lib/utils";
import { CustomUser } from "@/lib/types";
import { reportError } from "@/lib/error";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    await log({
      message: `Method Not Allowed: ${req.method}`,
      type: "error",
    });

    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Resource-level authorization: verify the user belongs to at least one team
  // (full page-level auth would require a pageId-to-document mapping)
  const userId = (session.user as CustomUser).id;
  const teamMembership = await prisma.userTeam.findFirst({
    where: { userId },
    select: { userId: true },
  });

  if (!teamMembership) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const { pageId } = req.body as { pageId: string };

  try {
    const recordMap = await notion.getPage(pageId, { signFileUrls: false });
    // Workaround: sign file URLs separately due to react-notion-x#580
    await addSignedUrls({ recordMap });

    if (!recordMap) {
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    res.status(200).json(recordMap);
    return;
  } catch (error) {
    reportError(error as Error);
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }
}
