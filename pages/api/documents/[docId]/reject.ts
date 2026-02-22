import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { reportError } from "@/lib/error";
import { emitSSE, SSE_EVENTS } from "@/lib/sse/event-emitter";

/**
 * PATCH /api/documents/[docId]/reject
 *
 * GP rejects an LP-uploaded document.
 * Sets status to REJECTED. Sends email to LP with reason.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);

    if (!session?.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const docId = req.query.docId as string;
    if (!docId) {
      return res.status(400).json({ error: "Document ID is required" });
    }

    const { reviewNotes } = req.body || {};

    const lpDocument = await prisma.lPDocument.findUnique({
      where: { id: docId, deletedAt: null },
      include: {
        fund: { select: { teamId: true, name: true } },
        investor: { select: { id: true } },
      },
    });

    if (!lpDocument) {
      return res.status(404).json({ error: "Document not found" });
    }

    // Verify GP has admin access to the fund's team
    const userTeam = await prisma.userTeam.findFirst({
      where: {
        userId: session.user.id,
        teamId: lpDocument.fund.teamId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      },
    });

    if (!userTeam) {
      return res.status(403).json({
        error: "You do not have permission to review documents for this fund",
      });
    }

    if (lpDocument.status !== "UPLOADED_PENDING_REVIEW") {
      return res.status(400).json({
        error: "Only pending documents can be rejected",
      });
    }

    // Atomic update: document + review record
    const [updated] = await prisma.$transaction([
      prisma.lPDocument.update({
        where: { id: docId },
        data: {
          status: "REJECTED",
          reviewedByUserId: session.user.id,
          reviewedAt: new Date(),
          reviewNotes: reviewNotes || null,
        },
      }),
      prisma.lPDocumentReview.create({
        data: {
          documentId: docId,
          reviewerUserId: session.user.id,
          status: "REJECTED",
          notes: reviewNotes || null,
        },
      }),
    ]);

    await logAuditEvent({
      eventType: "ADMIN_ACTION",
      userId: session.user.id,
      teamId: lpDocument.fund.teamId,
      resourceType: "Document",
      resourceId: docId,
      metadata: {
        action: "GP rejected document",
        documentType: lpDocument.documentType,
        previousStatus: lpDocument.status,
        newStatus: "REJECTED",
        reviewNotes: reviewNotes || null,
        investorId: lpDocument.investorId,
        fundId: lpDocument.fundId,
        actorEmail: session.user.email,
      },
      ipAddress: req.socket?.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
    });

    // Fire-and-forget: SSE real-time event for connected GP dashboards
    emitSSE({
      type: SSE_EVENTS.DOCUMENT_REJECTED,
      orgId: lpDocument.fund.teamId,
      fundId: lpDocument.fundId,
      data: {
        documentId: docId,
        documentType: lpDocument.documentType,
        investorId: lpDocument.investorId,
      },
    });

    // Fire-and-forget: notify LP about rejection
    sendReviewNotification(
      docId,
      "REJECTED",
      reviewNotes || null,
      session.user.id
    ).catch((err) => {
      reportError(err as Error);
      console.error("[DOC_REJECT] Failed to send review notification:", err);
    });

    return res.status(200).json({
      success: true,
      document: {
        id: updated.id,
        title: updated.title,
        documentType: updated.documentType,
        status: updated.status,
        reviewedAt: updated.reviewedAt,
      },
    });
  } catch (error: unknown) {
    console.error("[DOC_REJECT] Error:", error);
    reportError(error as Error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function sendReviewNotification(
  documentId: string,
  reviewStatus: "APPROVED" | "REJECTED" | "REVISION_REQUESTED",
  reviewNotes: string | null,
  reviewerUserId: string
) {
  try {
    const { sendDocumentReviewNotification } = await import(
      "@/lib/emails/send-document-review-notification"
    );
    await sendDocumentReviewNotification({
      documentId,
      reviewStatus,
      reviewNotes,
      reviewerUserId,
    });
  } catch (error) {
    console.error("[DOC_REJECT] Failed to send notification:", error);
  }
}
