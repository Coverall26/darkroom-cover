import { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { apiRateLimiter } from "@/lib/security/rate-limiter";

const reactionSchema = z.object({
  viewId: z.string().min(1),
  pageNumber: z.number().int().nonnegative(),
  type: z.string().min(1).max(50),
});

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Rate limit — public endpoint, prevent abuse
  const allowed = await apiRateLimiter(req, res);
  if (!allowed) return;

  const parsed = reactionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { viewId, pageNumber, type } = parsed.data;

  try {
    const reaction = await prisma.reaction.create({
      data: {
        viewId,
        pageNumber,
        type,
      },
      include: {
        view: {
          select: {
            documentId: true,
            dataroomId: true,
            linkId: true,
            viewerEmail: true,
            viewerId: true,
            teamId: true,
          },
        },
      },
    });

    if (!reaction) {
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    res.status(200).json({ success: true });
    return;
  } catch (error) {
    reportError(error as Error);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
}
