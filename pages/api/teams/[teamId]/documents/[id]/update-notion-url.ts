import { NextApiRequest, NextApiResponse } from "next";

import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth/next";

import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";
import { notionUrlUpdateSchema } from "@/lib/zod/url-validation";
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
  const { notionUrl: url } = req.body as { notionUrl: string };

  const validationResult = await notionUrlUpdateSchema.safeParseAsync(url);
  if (!validationResult.success) {
    return res.status(400).json({ error: "Invalid Notion URL" });
  }

  const notionUrl = validationResult.data;

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
        id: true,
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

    // Preserve any existing query parameters from the old URL (like dark mode)
    const oldUrl = new URL(documentVersion.file);
    const newUrl = new URL(notionUrl);

    // Copy over the mode parameter if it exists
    const mode = oldUrl.searchParams.get("mode");
    if (mode) {
      newUrl.searchParams.set("mode", mode);
    }

    // Update document version
    await prisma.documentVersion.updateMany({
      where: {
        documentId: documentId,
        isPrimary: true,
      },
      data: {
        file: newUrl.toString(),
      },
    });

    return res.status(200).json({
      message: "Notion URL updated successfully",
      newUrl: newUrl.toString(),
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Error updating Notion URL:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
