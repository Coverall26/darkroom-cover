import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { reportError } from "@/lib/error";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/documents
 *
 * Lists LP documents for GP admin review.
 * Filters: fundId, status, teamId
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAppRouter();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const fundId = searchParams.get("fundId");
    const status = searchParams.get("status");
    const teamId = searchParams.get("teamId");

    // Get all admin teams for multi-team document listing
    const adminTeams = await prisma.userTeam.findMany({
      where: {
        userId: auth.userId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
      select: { teamId: true },
    });

    const teamIds = adminTeams.map((t) => t.teamId);

    if (teamId && !teamIds.includes(teamId)) {
      return NextResponse.json(
        { error: "No access to this team" },
        { status: 403 },
      );
    }

    const whereClause: Prisma.LPDocumentWhereInput = {
      fund: {
        teamId: teamId ? teamId : { in: teamIds },
      },
      deletedAt: null,
    };

    if (fundId) {
      whereClause.fundId = fundId;
    }

    if (status) {
      whereClause.status = (status === "PENDING_REVIEW"
        ? "UPLOADED_PENDING_REVIEW"
        : status) as Prisma.LPDocumentWhereInput["status"];
    }

    const documents = await prisma.lPDocument.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        fund: { select: { id: true, name: true } },
        investor: {
          select: {
            id: true,
            user: { select: { name: true, email: true } },
          },
        },
        uploadedBy: { select: { name: true, email: true } },
        reviewedBy: { select: { name: true, email: true } },
      },
    });

    const formattedDocs = documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      documentType: doc.documentType,
      status:
        doc.status === "UPLOADED_PENDING_REVIEW"
          ? "PENDING_REVIEW"
          : doc.status,
      uploadSource: doc.uploadSource,
      originalFilename: doc.originalFilename,
      fileSize: doc.fileSize?.toString(),
      mimeType: doc.mimeType,
      lpNotes: doc.lpNotes,
      gpNotes: doc.reviewNotes,
      isOfflineSigned: doc.isOfflineSigned,
      createdAt: doc.createdAt,
      reviewedAt: doc.reviewedAt,
      fund: doc.fund,
      investor: {
        id: doc.investor.id,
        name: doc.investor.user?.name,
        email: doc.investor.user?.email,
      },
      uploadedBy: doc.uploadedBy,
      reviewedBy: doc.reviewedBy,
    }));

    const statusCounts = documents.reduce(
      (acc: Record<string, number>, doc) => {
        const normalizedStatus =
          doc.status === "UPLOADED_PENDING_REVIEW"
            ? "PENDING_REVIEW"
            : doc.status;
        acc[normalizedStatus] = (acc[normalizedStatus] || 0) + 1;
        return acc;
      },
      {},
    );

    return NextResponse.json({
      documents: formattedDocs,
      total: documents.length,
      statusCounts,
    });
  } catch (error: unknown) {
    console.error("[ADMIN_DOC_LIST] Error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
