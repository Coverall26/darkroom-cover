import { NextApiRequest, NextApiResponse } from "next";

import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { ratelimit } from "@/lib/redis";

const feedbackLimiter = ratelimit(20, "60 s");

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "POST") {
    // Rate limit by IP
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    try {
      const rlResult = await feedbackLimiter.limit(`feedback:${ip}`);
      if (!rlResult.success) {
        return res.status(429).json({ error: "Too many requests" });
      }
    } catch {
      // Fail open if Redis is down — view validation still protects
    }

    // POST /api/feedback
    const { answer, feedbackId, viewId } = req.body as {
      answer: string;
      feedbackId: string;
      viewId: string;
    };

    if (!answer || !feedbackId || !viewId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const feedback = await prisma.feedback.findUnique({
        where: {
          id: feedbackId,
        },
        select: {
          linkId: true,
          data: true,
        },
      });

      // if feedback does not exist, we should not record any response
      if (!feedback) {
        return res.status(404).json({ error: "Feedback not found" });
      }

      const view = await prisma.view.findUnique({
        where: {
          id: viewId,
          linkId: feedback.linkId,
        },
      });

      // if view does not exist, we should not record any response
      if (!view) {
        return res.status(404).json({ error: "View not found" });
      }

      // Prevent duplicate feedback from the same view
      const existing = await prisma.feedbackResponse.findFirst({
        where: { feedbackId, viewId },
        select: { id: true },
      });

      if (existing) {
        return res.status(409).json({ error: "Feedback already submitted" });
      }

      // create a feedback response
      await prisma.feedbackResponse.create({
        data: {
          feedbackId: feedbackId,
          viewId: viewId,
          data: {
            ...(feedback.data as { question: string; type: string }),
            answer: answer,
          },
        },
      });

      return res.status(200).json({ message: "Feedback response recorded" });
    } catch (error) {
      reportError(error as Error);
      return res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  // We only allow POST requests
  res.setHeader("Allow", ["POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
