import { sendOrgEmail } from "@/lib/resend";
import prisma from "@/lib/prisma";
import DocumentReviewNotification from "@/components/emails/document-review-notification";

/**
 * Send a document review notification email to the LP investor.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 *
 * Called when a GP approves, rejects, or requests revision of an uploaded document.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function sendDocumentReviewNotification({
  documentId,
  reviewStatus,
  reviewNotes,
  reviewerUserId,
}: {
  documentId: string;
  reviewStatus: "APPROVED" | "REJECTED" | "REVISION_REQUESTED";
  reviewNotes?: string | null;
  reviewerUserId: string;
}): Promise<void> {
  try {
    const lpDocument = await prisma.lPDocument.findUnique({
      where: { id: documentId },
      select: {
        title: true,
        documentType: true,
        investor: {
          select: {
            entityName: true,
            user: { select: { name: true, email: true } },
          },
        },
        fund: {
          select: { name: true, teamId: true },
        },
      },
    });

    if (!lpDocument?.investor?.user?.email) {
      console.warn(
        "[DOC_REVIEW_EMAIL] No email found for document review notification:",
        documentId,
      );
      return;
    }

    const reviewer = await prisma.user.findUnique({
      where: { id: reviewerUserId },
      select: { name: true },
    });

    const investorName =
      lpDocument.investor.entityName ||
      lpDocument.investor.user.name ||
      "Investor";
    const fundName = lpDocument.fund?.name ?? "the fund";
    const teamId = lpDocument.fund?.teamId;
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const portalUrl = `${baseUrl}/lp/docs`;

    const subjectMap: Record<string, string> = {
      APPROVED: `Document approved: ${lpDocument.title}`,
      REJECTED: `Document not accepted: ${lpDocument.title}`,
      REVISION_REQUESTED: `Revision requested: ${lpDocument.title}`,
    };

    await sendOrgEmail({
      teamId: teamId || "",
      to: lpDocument.investor.user.email,
      subject: subjectMap[reviewStatus] || `Document update: ${lpDocument.title}`,
      react: DocumentReviewNotification({
        investorName,
        documentTitle: lpDocument.title,
        documentType: lpDocument.documentType,
        fundName,
        reviewStatus,
        reviewNotes: reviewNotes || undefined,
        reviewerName: reviewer?.name || undefined,
        portalUrl,
      }),
      test: process.env.NODE_ENV === "development",
    });

  } catch (error) {
    console.error(
      "[DOC_REVIEW_EMAIL] Failed to send review notification:",
      error,
    );
  }
}
