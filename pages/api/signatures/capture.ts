import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";

/**
 * POST /api/signatures/capture
 *
 * Store a signature image (base64 PNG) for reuse.
 * Associates with the current user's investor profile.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { signatureImage, signatureType, initialsImage } = req.body as {
    signatureImage?: string;
    signatureType?: "draw" | "type" | "upload";
    initialsImage?: string;
  };

  if (!signatureImage) {
    return res.status(400).json({ error: "signatureImage is required" });
  }

  // Validate base64 data URL
  if (!signatureImage.startsWith("data:image/")) {
    return res.status(400).json({ error: "Invalid image format" });
  }

  // Size check (< 500KB base64)
  if (signatureImage.length > 500 * 1024) {
    return res.status(400).json({ error: "Signature image too large (max 500KB)" });
  }

  try {
    // Find or create investor profile
    const investor = await prisma.investor.findFirst({
      where: { userId: session.user.id },
    });

    // Store signature data in metadata (no external storage needed for base64)
    const signatureData = {
      signatureImage,
      signatureType: signatureType || "draw",
      initialsImage: initialsImage || null,
      capturedAt: new Date().toISOString(),
      capturedBy: session.user.id,
    };

    // If investor exists, store in their fundData for reuse
    if (investor) {
      const existingFundData = (investor.fundData as Record<string, unknown>) || {};
      await prisma.investor.update({
        where: { id: investor.id },
        data: {
          fundData: {
            ...existingFundData,
            savedSignature: signatureData,
          },
        },
      });
    }

    await logAuditEvent({
      eventType: "DOCUMENT_SIGNED",
      userId: session.user.id,
      resourceType: "SignatureDocument",
      metadata: {
        action: "signature-captured",
        signatureType: signatureType || "draw",
        hasInitials: !!initialsImage,
      },
      ipAddress: req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    });

    return res.status(200).json({
      message: "Signature captured",
      signatureType: signatureType || "draw",
      investorId: investor?.id,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[SIGNATURE_CAPTURE] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
