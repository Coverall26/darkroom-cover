import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { teamId } = req.query as { teamId: string };

  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: session.user.id,
      teamId,
    },
  });

  if (!userTeam) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (req.method === "GET") {
    return handleGet(req, res, teamId);
  } else if (req.method === "POST") {
    return handlePost(req, res, teamId, session.user.id);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string
) {
  try {
    const templates = await prisma.signatureTemplate.findMany({
      where: { teamId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        numPages: true,
        usageCount: true,
        defaultRecipients: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(200).json(templates);
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching templates:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string,
  userId: string
) {
  try {
    const {
      name,
      description,
      file,
      storageType,
      numPages,
      defaultRecipients,
      fields,
      defaultEmailSubject,
      defaultEmailMessage,
      defaultExpirationDays,
    } = req.body;

    if (!name || !file) {
      return res.status(400).json({ error: "Name and file are required" });
    }

    const template = await prisma.signatureTemplate.create({
      data: {
        name,
        description,
        file,
        storageType: storageType || "S3_PATH",
        numPages,
        defaultRecipients,
        fields,
        defaultEmailSubject,
        defaultEmailMessage,
        defaultExpirationDays,
        teamId,
        createdById: userId,
      },
    });

    return res.status(201).json(template);
  } catch (error) {
    reportError(error as Error);
    console.error("Error creating template:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
