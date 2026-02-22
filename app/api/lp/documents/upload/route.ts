import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { LPDocumentType, LPDocumentUploadSource } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { uploadInvestorDocument } from "@/lib/storage/investor-storage";
import { appRouterUploadRateLimit } from "@/lib/security/rate-limiter";
import { CustomUser } from "@/lib/types";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * LP Document Upload API (App Router)
 *
 * POST /api/lp/documents/upload
 *
 * Handles LP document uploads with base64 file data.
 * Creates LPDocument record and notifies GP admins.
 */

/**
 * Fire-and-forget: notify GP admins that an LP uploaded a new document.
 */
async function notifyGPOfLPUpload(
  teamId: string,
  lpEmail: string,
  docTitle: string,
  docType: string,
) {
  try {
    const admins = await prisma.userTeam.findMany({
      where: {
        teamId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      },
      include: {
        user: { select: { email: true } },
      },
    });

    if (admins.length === 0) return;

    const { sendOrgEmail } = await import("@/lib/resend");
    const { DocumentUploadNotification } = await import(
      "@/components/emails/document-upload-notification"
    );

    const recipients = admins.slice(0, 5);
    for (const admin of recipients) {
      if (!admin.user.email) continue;
      await sendOrgEmail({
        teamId,
        to: admin.user.email,
        subject: `New document uploaded by ${lpEmail} — ${docType.replace(/_/g, " ")}`,
        react: DocumentUploadNotification({
          lpEmail,
          documentTitle: docTitle,
          documentType: docType.replace(/_/g, " "),
          portalUrl: `${process.env.NEXT_PUBLIC_BASE_URL || "https://app.fundroom.ai"}/admin/documents`,
        }),
      });
    }
  } catch (error) {
    console.error("[LP_DOC_UPLOAD] Failed to notify GP:", error);
  }
}

const LPDocumentTypeValues = [
  "NDA",
  "SUBSCRIPTION_AGREEMENT",
  "LPA",
  "SIDE_LETTER",
  "K1_TAX_FORM",
  "PROOF_OF_FUNDS",
  "WIRE_CONFIRMATION",
  "ACH_RECEIPT",
  "ACCREDITATION_PROOF",
  "IDENTITY_DOCUMENT",
  "OTHER",
] as const;

type LPDocumentPermission =
  | "documents:upload_own"
  | "documents:view_own"
  | "documents:review"
  | "documents:approve"
  | "documents:reject"
  | "documents:view_pending";

interface UploadRequest {
  title: string;
  documentType: string;
  fundId: string;
  lpNotes?: string;
  isOfflineSigned?: boolean;
  externalSigningDate?: string;
  investmentId?: string;
  fileData: string;
  fileName: string;
  mimeType: string;
}

async function getLPDocumentAuthContextAppRouter(): Promise<{
  user: CustomUser;
  investorId: string | null;
  permissions: LPDocumentPermission[];
} | null> {
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
          role: true,
        },
      },
    },
  });

  if (!dbUser) {
    return null;
  }

  const isAdmin = dbUser.teams.some((t) =>
    ["OWNER", "ADMIN", "SUPER_ADMIN"].includes(t.role),
  );
  const isLP = !!dbUser.investorProfile;

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
    permissions,
  };
}

export async function POST(req: NextRequest) {
  const blocked = await appRouterUploadRateLimit(req);
  if (blocked) return blocked;

  try {
    const context = await getLPDocumentAuthContextAppRouter();

    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!context.permissions.includes("documents:upload_own")) {
      return NextResponse.json(
        { error: "Forbidden - insufficient permissions" },
        { status: 403 },
      );
    }

    if (!context.investorId) {
      return NextResponse.json(
        {
          error:
            "No investor profile found. Please complete your investor setup first.",
        },
        { status: 400 },
      );
    }

    const body = (await req.json()) as UploadRequest;
    const {
      title,
      documentType,
      fundId,
      lpNotes,
      isOfflineSigned,
      externalSigningDate,
      investmentId,
      fileData,
      fileName,
      mimeType,
    } = body;

    if (!title || !documentType || !fundId || !fileData || !fileName) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: title, documentType, fundId, fileData, fileName",
        },
        { status: 400 },
      );
    }

    if (!LPDocumentTypeValues.includes(documentType as any)) {
      return NextResponse.json(
        {
          error: `Invalid document type. Must be one of: ${LPDocumentTypeValues.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const investor = await prisma.investor.findUnique({
      where: { id: context.investorId },
      select: { fundId: true },
    });

    if (!investor || investor.fundId !== fundId) {
      return NextResponse.json(
        { error: "You can only upload documents to your associated fund." },
        { status: 403 },
      );
    }

    if (investmentId) {
      const investment = await prisma.investment.findFirst({
        where: {
          id: investmentId,
          investorId: context.investorId,
          fundId,
        },
      });
      if (!investment) {
        return NextResponse.json(
          {
            error: "Invalid investment ID - not associated with your account.",
          },
          { status: 400 },
        );
      }
    }

    const fileBuffer = Buffer.from(fileData, "base64");
    const fileSize = BigInt(fileBuffer.length);

    const { path: storageKey, hash } = await uploadInvestorDocument(
      context.investorId,
      documentType,
      fileBuffer,
      fileName,
    );

    const uploadSource: LPDocumentUploadSource = isOfflineSigned
      ? "LP_UPLOADED_EXTERNAL"
      : "LP_UPLOADED";

    const lpDocument = await prisma.lPDocument.create({
      data: {
        title,
        documentType: documentType as LPDocumentType,
        fundId,
        investorId: context.investorId,
        uploadedByUserId: context.user.id,
        uploadSource,
        storageKey,
        storageType: "REPLIT",
        originalFilename: fileName,
        fileSize,
        mimeType: mimeType || "application/octet-stream",
        lpNotes: lpNotes || null,
        isOfflineSigned: isOfflineSigned || false,
        externalSigningDate: externalSigningDate
          ? new Date(externalSigningDate)
          : null,
        investmentId: investmentId || null,
        status: "UPLOADED_PENDING_REVIEW",
      },
      include: {
        fund: { select: { name: true, teamId: true } },
      },
    });

    const fundData = lpDocument.fund as {
      name: string;
      teamId: string;
    } | null;

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const userAgent = req.headers.get("user-agent") || null;

    await logAuditEvent({
      eventType: "ADMIN_ACTION",
      userId: context.user.id,
      teamId: fundData?.teamId || fundId,
      resourceType: "Document",
      resourceId: lpDocument.id,
      metadata: {
        action: "LP document uploaded",
        documentType,
        title,
        fileName,
        fileSize: fileSize.toString(),
        investorId: context.investorId,
        fundId,
        hash,
        uploadSource,
        actorEmail: context.user.email,
      },
      ipAddress,
      userAgent,
    });

    // Fire-and-forget: notify GP admins about new LP document upload
    notifyGPOfLPUpload(
      fundData?.teamId || fundId,
      context.user.email || "LP",
      lpDocument.title,
      lpDocument.documentType,
    ).catch((err) => {
      reportError(err as Error);
      console.error("[LP_DOC_UPLOAD] Failed to notify GP:", err);
    });

    return NextResponse.json(
      {
        success: true,
        document: {
          id: lpDocument.id,
          title: lpDocument.title,
          documentType: lpDocument.documentType,
          status: lpDocument.status,
          createdAt: lpDocument.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("[LP_DOC_UPLOAD] Error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
