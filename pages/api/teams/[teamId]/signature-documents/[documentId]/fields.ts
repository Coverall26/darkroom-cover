import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { teamId, documentId } = req.query as {
    teamId: string;
    documentId: string;
  };

  const userTeam = await prisma.userTeam.findFirst({
    where: {
      teamId,
      userId: (session.user as any).id,
    },
  });

  if (!userTeam) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method === "PUT") {
    return handlePut(req, res, teamId, documentId);
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
}

async function handlePut(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string,
  documentId: string
) {
  try {
    const { fields } = req.body;

    const document = await prisma.signatureDocument.findFirst({
      where: { id: documentId, teamId },
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (document.status !== "DRAFT") {
      return res.status(400).json({
        error: "Fields can only be modified on draft documents",
      });
    }

    await prisma.signatureField.deleteMany({
      where: { documentId },
    });

    if (fields && fields.length > 0) {
      await prisma.signatureField.createMany({
        data: fields.map((field: any) => ({
          documentId,
          recipientId: field.recipientId || null,
          type: field.type,
          pageNumber: field.pageNumber,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          required: field.required !== false,
        })),
      });
    }

    const updatedDocument = await prisma.signatureDocument.findFirst({
      where: { id: documentId },
      include: {
        recipients: { orderBy: { signingOrder: "asc" } },
        fields: { orderBy: [{ pageNumber: "asc" }, { y: "asc" }] },
      },
    });

    return res.status(200).json(updatedDocument);
  } catch (error) {
    reportError(error as Error);
    console.error("Error updating signature fields:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
