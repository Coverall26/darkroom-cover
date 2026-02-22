import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { CustomUser } from "@/lib/types";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * LP Documents List API (App Router)
 *
 * GET /api/lp/documents
 *
 * Returns documents for the authenticated LP investor.
 * Supports filtering by status and documentType.
 */

type LPDocumentPermission =
  | "documents:upload_own"
  | "documents:view_own"
  | "documents:review"
  | "documents:approve"
  | "documents:reject"
  | "documents:view_pending";

interface LPDocumentAuthContext {
  user: CustomUser;
  investorId: string | null;
  fundIds: string[];
  teamIds: string[];
  permissions: LPDocumentPermission[];
  isGP: boolean;
  isLP: boolean;
}

async function getLPDocumentAuthContextAppRouter(): Promise<LPDocumentAuthContext | null> {
  const auth = await requireLPAuthAppRouter();

  if (auth instanceof NextResponse) {
    return null;
  }

  const user = auth.session.user as CustomUser;

  const dbUser = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      email: true,
      role: true,
      investorProfile: {
        select: {
          id: true,
          fundId: true,
        },
      },
      teams: {
        where: { status: "ACTIVE" },
        select: {
          teamId: true,
          role: true,
          team: {
            select: {
              funds: {
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  if (!dbUser) {
    return null;
  }

  const isGP = dbUser.teams.some((t) =>
    ["OWNER", "ADMIN", "SUPER_ADMIN", "MEMBER"].includes(t.role),
  );
  const isAdmin = dbUser.teams.some((t) =>
    ["OWNER", "ADMIN", "SUPER_ADMIN"].includes(t.role),
  );
  const isLP = !!dbUser.investorProfile;

  const teamIds = dbUser.teams.map((t) => t.teamId);
  const fundIds = dbUser.teams.flatMap((t) => t.team.funds.map((f) => f.id));

  if (dbUser.investorProfile?.fundId) {
    fundIds.push(dbUser.investorProfile.fundId);
  }

  const permissions: LPDocumentPermission[] = [];

  if (isLP) {
    permissions.push("documents:upload_own", "documents:view_own");
  }

  if (isAdmin) {
    permissions.push(
      "documents:review",
      "documents:approve",
      "documents:reject",
      "documents:view_pending",
    );
  }

  return {
    user,
    investorId: dbUser.investorProfile?.id || null,
    fundIds: [...new Set(fundIds)],
    teamIds,
    permissions,
    isGP,
    isLP,
  };
}

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const context = await getLPDocumentAuthContextAppRouter();

    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.permissions.includes("documents:view_own")) {
      return NextResponse.json(
        { error: "Forbidden - insufficient permissions" },
        { status: 403 },
      );
    }

    if (!context.investorId) {
      return NextResponse.json(
        { error: "No investor profile found" },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const documentType = searchParams.get("documentType");

    const whereClause: Prisma.LPDocumentWhereInput = {
      investorId: context.investorId,
      deletedAt: null,
    };

    if (status) {
      whereClause.status = (
        status === "PENDING_REVIEW" ? "UPLOADED_PENDING_REVIEW" : status
      ) as Prisma.LPDocumentWhereInput["status"];
    }

    if (documentType) {
      whereClause.documentType =
        documentType as Prisma.LPDocumentWhereInput["documentType"];
    }

    const documents = await prisma.lPDocument.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        documentType: true,
        status: true,
        uploadSource: true,
        originalFilename: true,
        fileSize: true,
        mimeType: true,
        lpNotes: true,
        reviewNotes: true,
        isOfflineSigned: true,
        externalSigningDate: true,
        createdAt: true,
        reviewedAt: true,
        fund: { select: { id: true, name: true } },
        reviewedBy: { select: { name: true } },
      },
    });

    const formattedDocs = documents.map((doc) => ({
      ...doc,
      status:
        doc.status === "UPLOADED_PENDING_REVIEW" ? "PENDING_REVIEW" : doc.status,
      fileSize: doc.fileSize?.toString(),
      gpNotes: doc.reviewNotes,
      reviewedBy: doc.reviewedBy?.name,
    }));

    return NextResponse.json({
      documents: formattedDocs,
      total: documents.length,
    });
  } catch (error: unknown) {
    console.error("[LP_DOC_LIST] Error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
