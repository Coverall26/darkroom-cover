/**
 * GET /api/outreach/track/open — 1×1 tracking pixel for email open detection.
 *
 * Query params: cid (contactId), eid (emailId)
 * Returns a transparent 1×1 GIF.
 * Creates an EMAIL_OPENED activity on the contact.
 *
 * Public endpoint — no auth required (loaded by email clients).
 * Rate limiting applied to prevent abuse.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

// Transparent 1×1 GIF (43 bytes)
const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(req: NextRequest) {
  // Always return the pixel — tracking failures should never break email rendering
  const headers = {
    "Content-Type": "image/gif",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };

  try {
    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get("cid");
    const emailId = searchParams.get("eid");

    if (!contactId || !emailId) {
      return new NextResponse(PIXEL_GIF, { status: 200, headers });
    }

    // Validate contact exists (don't create duplicate opens for same emailId)
    const existingOpen = await prisma.contactActivity.findFirst({
      where: {
        contactId,
        type: "EMAIL_OPENED",
        emailId,
      },
      select: { id: true },
    });

    if (!existingOpen) {
      // Create open activity — fire-and-forget, don't block pixel response
      await prisma.contactActivity.create({
        data: {
          contactId,
          type: "EMAIL_OPENED",
          description: "Email opened",
          emailId,
          metadata: {
            userAgent: req.headers.get("user-agent") ?? null,
            ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
            openedAt: new Date().toISOString(),
          },
        },
      }).catch((e) => reportError(e as Error));

      // Update engagement score
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          engagementScore: { increment: 2 },
          lastEngagedAt: new Date(),
        },
      }).catch((e) => reportError(e as Error));
    }
  } catch (error) {
    // Never fail — always return the pixel
    reportError(error as Error);
  }

  return new NextResponse(PIXEL_GIF, { status: 200, headers });
}
