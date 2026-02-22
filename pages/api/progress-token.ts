import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";
import { reportError } from "@/lib/error";
import { apiRateLimiter } from "@/lib/security/rate-limiter";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const allowed = await apiRateLimiter(req, res);
  if (!allowed) return;

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { documentVersionId } = req.query;

  if (!documentVersionId || typeof documentVersionId !== "string") {
    return res.status(400).json({ error: "Document version ID is required" });
  }

  // Resource-level authorization: verify the user belongs to the team that owns this document
  const userId = (session.user as CustomUser).id;
  const docVersion = await prisma.documentVersion.findFirst({
    where: {
      id: documentVersionId,
      document: {
        team: {
          users: {
            some: {
              userId,
            },
          },
        },
      },
    },
    select: { id: true },
  });

  if (!docVersion) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const { generateTriggerPublicAccessToken } = await import(
      "@/lib/utils/generate-trigger-auth-token"
    );

    const publicAccessToken = await generateTriggerPublicAccessToken(
      `version:${documentVersionId}`,
    );
    return res.status(200).json({ publicAccessToken });
  } catch (error: unknown) {
    reportError(error as Error);
    console.warn("Progress token generation failed:", error instanceof Error ? error.message : String(error));
    return res.status(200).json({
      publicAccessToken: null,
      status: "not_configured",
      message: "Document processing status not available",
    });
  }
}
