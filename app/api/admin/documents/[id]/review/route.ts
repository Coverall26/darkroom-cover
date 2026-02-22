import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { sendDocumentReviewNotification } from "@/lib/emails/send-document-review-notification";
import { advanceInvestorOnDocApproval } from "@/lib/investors/advance-on-doc-approval";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type ReviewAction = "APPROVE" | "REJECT" | "REQUEST_REVISION";

interface ReviewRequest {
  action: ReviewAction;
  reviewNotes?: string;
}

const STATUS_MAP = {
  APPROVE: "APPROVED" as const,
  REJECT: "REJECTED" as const,
  REQUEST_REVISION: "REVISION_REQUESTED" as const,
};

/**
 * POST /api/admin/documents/[id]/review
 *
 * GP reviews an LP document: APPROVE, REJECT, or REQUEST_REVISION.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: documentId } = await params;

  if (!documentId) {
    return NextResponse.json(
      { error: "Document ID is required" },
      { status: 400 },
    );
  }

  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: ReviewRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const { action, reviewNotes } = body;

    if (
      !action ||
      !["APPROVE", "REJECT", "REQUEST_REVISION"].includes(action)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid action. Must be APPROVE, REJECT, or REQUEST_REVISION",
        },
        { status: 400 },
      );
    }

    const lpDocument = await prisma.lPDocument.findUnique({
      where: { id: documentId },
      include: {
        fund: { select: { id: true, name: true, teamId: true } },
        investor: { select: { id: true, userId: true } },
      },
    });

    if (!lpDocument) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    const userTeam = await prisma.userTeam.findFirst({
      where: {
        userId: session.user.id,
        teamId: lpDocument.fund.teamId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      },
    });

    if (!userTeam) {
      return NextResponse.json(
        { error: "You do not have permission to review this document" },
        { status: 403 },
      );
    }

    const newStatus = STATUS_MAP[action];

    const [updatedDoc, reviewRecord] = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.lPDocument.update({
          where: { id: documentId },
          data: {
            status: newStatus,
            reviewedAt: new Date(),
            reviewedByUserId: session.user.id,
            reviewNotes: reviewNotes || null,
          },
          include: {
            fund: { select: { name: true, teamId: true } },
            investor: { select: { id: true, userId: true } },
          },
        });

        const review = await tx.lPDocumentReview.create({
          data: {
            documentId,
            reviewerUserId: session.user.id,
            status: newStatus,
            notes: reviewNotes || null,
          },
        });

        return [updated, review];
      },
    );

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    await logAuditEvent({
      eventType: "ADMIN_ACTION",
      userId: session.user.id,
      teamId: lpDocument.fund.teamId,
      resourceType: "Document",
      resourceId: documentId,
      metadata: {
        action: `LP document ${action.toLowerCase()}`,
        documentType: lpDocument.documentType,
        title: lpDocument.title,
        previousStatus: lpDocument.status,
        newStatus,
        reviewNotes: reviewNotes || null,
        investorId: lpDocument.investorId,
        fundId: lpDocument.fundId,
        actorEmail: session.user.email,
      },
      ipAddress,
      userAgent,
    });

    // Fire-and-forget: send LP notification email
    sendDocumentReviewNotification({
      documentId,
      reviewStatus: newStatus as "APPROVED" | "REJECTED" | "REVISION_REQUESTED",
      reviewNotes: reviewNotes || null,
      reviewerUserId: session.user.id,
    });

    // Fire-and-forget: check if all docs approved → advance investor stage
    if (action === "APPROVE") {
      advanceInvestorOnDocApproval({
        investorId: lpDocument.investorId,
        fundId: lpDocument.fundId,
        reviewerUserId: session.user.id,
        teamId: lpDocument.fund.teamId,
      });
    }

    return NextResponse.json({
      success: true,
      document: {
        id: updatedDoc.id,
        title: updatedDoc.title,
        documentType: updatedDoc.documentType,
        status:
          updatedDoc.status === "UPLOADED_PENDING_REVIEW"
            ? "PENDING_REVIEW"
            : updatedDoc.status,
        reviewedAt: updatedDoc.reviewedAt,
      },
      review: {
        id: reviewRecord.id,
        status: reviewRecord.status,
        createdAt: reviewRecord.createdAt,
      },
    });
  } catch (error: unknown) {
    console.error("[LP_DOC_REVIEW] Error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
