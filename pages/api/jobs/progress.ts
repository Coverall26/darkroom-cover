import type { NextApiRequest, NextApiResponse } from "next";

import { verifyToken } from "@/lib/jobs/auth";
import { getProgressByTag } from "@/lib/jobs/progress";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { tag } = req.query;

  if (!tag || typeof tag !== "string") {
    return res.status(400).json({ error: "Missing tag parameter" });
  }

  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const verified = verifyToken(token);
    if (!verified) {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (verified.expired) {
      return res.status(401).json({ error: "Token expired" });
    }
    const hasAccess = verified.tags.some(
      (t) => t === tag || tag.startsWith(t) || t.startsWith(tag),
    );
    if (!hasAccess) {
      return res.status(403).json({ error: "Tag not authorized" });
    }
  }

  const result = getProgressByTag(tag);

  if (!result) {
    return res.status(404).json({ error: "No progress found for tag" });
  }

  return res.status(200).json({
    jobId: result.jobId,
    status: result.status,
  });
}
