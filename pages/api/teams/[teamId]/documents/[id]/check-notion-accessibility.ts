import { NextApiRequest, NextApiResponse } from "next";

import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth/next";
import { parsePageId } from "notion-utils";

import notion from "@/lib/notion";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";
import { reportError } from "@/lib/error";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
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

    const documentVersion = await prisma.documentVersion.findFirst({
      where: {
        documentId: documentId,
        isPrimary: true,
      },
      select: {
        file: true,
        type: true,
      },
    });

    if (!documentVersion) {
      return res.status(404).json({ error: "Document version not found" });
    }

    if (documentVersion.type !== "notion") {
      return res
        .status(400)
        .json({ error: "Document is not a Notion document" });
    }

    // Check if the Notion page is publicly accessible
    try {
      const notionUrl = documentVersion.file;
      const pageId = parsePageId(notionUrl, { uuid: false });
      if (!pageId) {
        return res.status(200).json({
          isAccessible: false,
          url: notionUrl,
          error: "Notion page URL is not valid",
          lastChecked: new Date().toISOString(),
        });
      }
      try {
        await notion.getPage(pageId);
      } catch (error) {
        reportError(error as Error);
        console.error("Error checking Notion accessibility:", error);
        return res.status(200).json({
          isAccessible: false,
          url: documentVersion.file,
          lastChecked: new Date().toISOString(),
        });
      }
      return res.status(200).json({
        isAccessible: true,
        url: notionUrl,
        statusCode: 200,
        lastChecked: new Date().toISOString(),
      });
    } catch (error) {
      reportError(error as Error);
      console.error("Error checking Notion accessibility:", error);
      return res.status(200).json({
        isAccessible: false,
        url: documentVersion.file,
        error: "Failed to check accessibility",
        lastChecked: new Date().toISOString(),
      });
    }
  } catch (error) {
    reportError(error as Error);
    console.error("Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
