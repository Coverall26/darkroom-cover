import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

/**
 * GET /api/documents/pending-review
 *
 * Lists documents needing GP review. Returns pending documents
 * across all funds the GP has admin access to, or filtered by fundId.
 *
 * Query params:
 *   - fundId (optional): filter to a specific fund
 *   - status (optional): PENDING_REVIEW | APPROVED | REJECTED | REVISION_REQUESTED
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);

    if (!session?.user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { fundId, status } = req.query as {
      fundId?: string;
      status?: string;
    };

    // Find all teams where user is admin
    const userTeams = await prisma.userTeam.findMany({
      where: {
        userId: session.user.id,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
      select: { teamId: true },
    });

    if (userTeams.length === 0) {
      return res.status(403).json({
        error: "You do not have admin access to any teams",
      });
    }

    const teamIds = userTeams.map((t) => t.teamId);

    // Build the where clause
    const where: Record<string, unknown> = {
      deletedAt: null,
      fund: {
        teamId: { in: teamIds },
      },
    };

    if (fundId) {
      where.fundId = fundId;
    }

    if (status) {
      const statusMap: Record<string, string> = {
        PENDING_REVIEW: "UPLOADED_PENDING_REVIEW",
        APPROVED: "APPROVED",
        REJECTED: "REJECTED",
        REVISION_REQUESTED: "REVISION_REQUESTED",
      };
      where.status = statusMap[status] || status;
    } else {
      // Default: show pending documents
      where.status = "UPLOADED_PENDING_REVIEW";
    }

    const documents = await prisma.lPDocument.findMany({
      where,
      include: {
        fund: { select: { id: true, name: true } },
        investor: {
          select: {
            id: true,
            entityName: true,
            user: { select: { name: true, email: true } },
          },
        },
        uploadedBy: { select: { name: true, email: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Also get status counts for dashboard display
    const [pendingCount, approvedCount, rejectedCount, revisionCount] =
      await Promise.all([
        prisma.lPDocument.count({
          where: {
            deletedAt: null,
            fund: { teamId: { in: teamIds } },
            ...(fundId ? { fundId } : {}),
            status: "UPLOADED_PENDING_REVIEW",
          },
        }),
        prisma.lPDocument.count({
          where: {
            deletedAt: null,
            fund: { teamId: { in: teamIds } },
            ...(fundId ? { fundId } : {}),
            status: "APPROVED",
          },
        }),
        prisma.lPDocument.count({
          where: {
            deletedAt: null,
            fund: { teamId: { in: teamIds } },
            ...(fundId ? { fundId } : {}),
            status: "REJECTED",
          },
        }),
        prisma.lPDocument.count({
          where: {
            deletedAt: null,
            fund: { teamId: { in: teamIds } },
            ...(fundId ? { fundId } : {}),
            status: "REVISION_REQUESTED",
          },
        }),
      ]);

    const formatted = documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      documentType: doc.documentType,
      status:
        doc.status === "UPLOADED_PENDING_REVIEW"
          ? "PENDING_REVIEW"
          : doc.status,
      uploadSource: doc.uploadSource,
      originalFilename: doc.originalFilename,
      fileSize: doc.fileSize?.toString() || null,
      lpNotes: doc.lpNotes,
      isOfflineSigned: doc.isOfflineSigned,
      externalSigningDate: doc.externalSigningDate?.toISOString() || null,
      createdAt: doc.createdAt.toISOString(),
      reviewedAt: doc.reviewedAt?.toISOString() || null,
      reviewNotes: doc.reviewNotes,
      fund: { id: doc.fund.id, name: doc.fund.name },
      investor: {
        id: doc.investor.id,
        name: doc.investor.entityName || doc.investor.user?.name || null,
        email: doc.investor.user?.email || null,
      },
      uploadedBy: doc.uploadedBy
        ? { name: doc.uploadedBy.name, email: doc.uploadedBy.email }
        : null,
      reviewedBy: doc.reviewedBy ? { name: doc.reviewedBy.name } : null,
    }));

    return res.status(200).json({
      documents: formatted,
      statusCounts: {
        PENDING_REVIEW: pendingCount,
        APPROVED: approvedCount,
        REJECTED: rejectedCount,
        REVISION_REQUESTED: revisionCount,
      },
      total: formatted.length,
    });
  } catch (error: unknown) {
    console.error("[DOCS_PENDING_REVIEW] Error:", error);
    reportError(error as Error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
