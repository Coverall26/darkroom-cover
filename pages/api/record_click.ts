import { NextApiRequest, NextApiResponse } from "next";

import { z } from "zod";

import { reportError } from "@/lib/error";
import { newId } from "@/lib/id-helper";
import prisma from "@/lib/prisma";
import { recordClickEvent } from "@/lib/tinybird";
import { log } from "@/lib/utils";
import { apiRateLimiter } from "@/lib/security/rate-limiter";

const bodyValidation = z.object({
  timestamp: z.string(),
  event_id: z.string(),
  session_id: z.string(),
  link_id: z.string(),
  document_id: z.string(),
  view_id: z.string(),
  page_number: z.string(),
  href: z.string(),
  version_number: z.number(),
  dataroom_id: z.string().nullable(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const allowed = await apiRateLimiter(req, res);
  if (!allowed) return;

  const {
    timestamp,
    sessionId,
    linkId,
    documentId,
    viewId,
    pageNumber,
    href,
    versionNumber,
    dataroomId,
  } = req.body as {
    timestamp: string;
    sessionId: string;
    linkId: string;
    documentId: string;
    viewId: string;
    pageNumber: string;
    href: string;
    versionNumber: number;
    dataroomId: string | null;
  };

  // Validate that the view exists and belongs to the specified link
  if (!viewId || !linkId) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  try {
    const view = await prisma.view.findUnique({
      where: { id: viewId, linkId },
      select: { id: true },
    });

    if (!view) {
      return res.status(400).json({ error: "Invalid view" });
    }
  } catch {
    return res.status(400).json({ error: "Invalid view" });
  }

  const clickEventId = newId("clickEvent");

  const clickEventObject = {
    timestamp: timestamp,
    event_id: clickEventId,
    session_id: sessionId,
    link_id: linkId,
    document_id: documentId,
    view_id: viewId,
    page_number: pageNumber,
    href: href,
    version_number: versionNumber || 1,
    dataroom_id: dataroomId || null,
  };

  const result = bodyValidation.safeParse(clickEventObject);
  if (!result.success) {
    return res
      .status(400)
      .json({ error: "Invalid request body" });
  }

  try {
    await recordClickEvent(result.data);
    res.status(200).json({ message: "Click event recorded" });
  } catch (error) {
    log({
      message: `Failed to record click event (tinybird) for ${linkId}. \n\n ${error}`,
      type: "error",
      mention: true,
    });
    reportError(error as Error);
    res.status(500).json({ error: "Internal server error" });
  }
}
