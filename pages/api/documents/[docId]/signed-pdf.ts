import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";

/**
 * GET /api/documents/[docId]/signed-pdf
 *
 * Returns the signed PDF URL for a completed document.
 * Auth: document owner, team member, or signer.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { docId } = req.query as { docId: string };

  try {
    const document = await prisma.signatureDocument.findUnique({
      where: { id: docId },
      select: {
        id: true,
        title: true,
        status: true,
        signedFileUrl: true,
        signedFileType: true,
        signedAt: true,
        teamId: true,
        createdById: true,
        recipients: {
          select: { email: true },
        },
      },
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Auth check: must be owner, team member, or recipient
    const isOwner = document.createdById === session.user.id;
    const isRecipient = document.recipients.some(
      (r) => r.email === session.user.email,
    );

    let isTeamMember = false;
    if (document.teamId) {
      const membership = await prisma.userTeam.findFirst({
        where: {
          userId: session.user.id,
          teamId: document.teamId,
          status: "ACTIVE",
        },
      });
      isTeamMember = !!membership;
    }

    if (!isOwner && !isRecipient && !isTeamMember) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (document.status !== "COMPLETED" || !document.signedFileUrl) {
      return res.status(404).json({
        error: "Signed PDF not available. Document may not be completed yet.",
      });
    }

    return res.status(200).json({
      documentId: document.id,
      title: document.title,
      signedFileUrl: document.signedFileUrl,
      signedFileType: document.signedFileType,
      signedAt: document.signedAt?.toISOString(),
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[SIGNED_PDF] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
