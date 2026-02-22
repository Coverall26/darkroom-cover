import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { LPDocumentType, LPDocumentUploadSource } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { uploadInvestorDocument } from "@/lib/storage/investor-storage";
import { reportError } from "@/lib/error";
import { uploadRateLimiter } from "@/lib/security/rate-limiter";

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
  "FORMATION_DOCS",
  "POWER_OF_ATTORNEY",
  "TRUST_DOCUMENTS",
  "CUSTODIAN_DOCUMENTS",
  "OTHER",
] as const;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb",
    },
  },
};

interface UploadRequest {
  title: string;
  documentType: string;
  fundId: string;
  uploadSource?: string;
  investorId?: string;
  lpNotes?: string;
  notes?: string;
  isOfflineSigned?: boolean;
  externalSigningDate?: string;
  investmentId?: string;
  fileData: string;
  fileName: string;
  mimeType?: string;
}

/**
 * POST /api/documents/upload
 *
 * Unified document upload endpoint — handles both LP and GP uploads.
 *
 * LP upload (uploadSource: LP_UPLOADED or LP_UPLOADED_EXTERNAL):
 *   - Authenticated LP uploads their own document
 *   - Status: UPLOADED_PENDING_REVIEW
 *   - GP admins notified via email
 *
 * GP upload (uploadSource: GP_UPLOADED_FOR_LP):
 *   - Requires investorId in body
 *   - GP must have admin role on fund's team
 *   - Status: APPROVED (auto-approved)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Rate limit: 20 uploads per minute
  const allowed = await uploadRateLimiter(req, res);
  if (!allowed) return;

  try {
    const session = await getServerSession(req, res, authOptions);

    if (!session?.user?.id || !session?.user?.email) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      title,
      documentType,
      fundId,
      uploadSource: requestedSource,
      investorId: bodyInvestorId,
      lpNotes,
      notes,
      isOfflineSigned,
      externalSigningDate,
      investmentId,
      fileData,
      fileName,
      mimeType,
    } = req.body as UploadRequest;

    if (!title || !documentType || !fundId || !fileData || !fileName) {
      return res.status(400).json({
        error:
          "Missing required fields: title, documentType, fundId, fileData, fileName",
      });
    }

    if (!LPDocumentTypeValues.includes(documentType as (typeof LPDocumentTypeValues)[number])) {
      return res.status(400).json({
        error: `Invalid document type. Must be one of: ${LPDocumentTypeValues.join(", ")}`,
      });
    }

    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: { teamId: true, name: true },
    });

    if (!fund) {
      return res.status(404).json({ error: "Fund not found" });
    }

    const isGPUpload = requestedSource === "GP_UPLOADED_FOR_LP";

    if (isGPUpload) {
      // ── GP upload flow ──
      if (!bodyInvestorId) {
        return res.status(400).json({
          error: "investorId is required for GP uploads",
        });
      }

      const userTeam = await prisma.userTeam.findFirst({
        where: {
          userId: session.user.id,
          teamId: fund.teamId,
          role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        },
      });

      if (!userTeam) {
        return res.status(403).json({
          error: "You do not have permission to upload documents for this fund",
        });
      }

      const investor = await prisma.investor.findUnique({
        where: { id: bodyInvestorId },
        select: { id: true, fundId: true },
      });

      if (!investor) {
        return res.status(404).json({ error: "Investor not found" });
      }

      if (investor.fundId !== fundId) {
        const inv = await prisma.investment.findFirst({
          where: { investorId: bodyInvestorId, fundId },
          select: { id: true },
        });
        if (!inv) {
          return res.status(400).json({
            error: "Investor is not associated with this fund",
          });
        }
      }

      const fileBuffer = Buffer.from(fileData, "base64");
      const fileSize = BigInt(fileBuffer.length);

      const { path: storageKey, hash } = await uploadInvestorDocument(
        bodyInvestorId,
        documentType,
        fileBuffer,
        fileName
      );

      const lpDocument = await prisma.lPDocument.create({
        data: {
          title,
          documentType: documentType as LPDocumentType,
          fundId,
          investorId: bodyInvestorId,
          uploadedByUserId: session.user.id,
          uploadSource: "GP_UPLOADED_FOR_LP" as LPDocumentUploadSource,
          storageKey,
          storageType: "REPLIT",
          originalFilename: fileName,
          fileSize,
          mimeType: mimeType || "application/octet-stream",
          reviewNotes: notes || null,
          isOfflineSigned: false,
          externalSigningDate: externalSigningDate
            ? new Date(externalSigningDate)
            : null,
          investmentId: investmentId || null,
          status: "APPROVED",
          reviewedByUserId: session.user.id,
          reviewedAt: new Date(),
        },
      });

      await logAuditEvent({
        eventType: "ADMIN_ACTION",
        userId: session.user.id,
        teamId: fund.teamId,
        resourceType: "Document",
        resourceId: lpDocument.id,
        metadata: {
          action: "GP uploaded document for investor",
          documentType,
          title,
          fileName,
          fileSize: fileSize.toString(),
          investorId: bodyInvestorId,
          fundId,
          hash,
          uploadSource: "GP_UPLOADED_FOR_LP",
          actorEmail: session.user.email,
        },
        ipAddress: req.socket?.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
      });

      return res.status(201).json({
        success: true,
        document: {
          id: lpDocument.id,
          title: lpDocument.title,
          documentType: lpDocument.documentType,
          status: lpDocument.status,
          createdAt: lpDocument.createdAt,
        },
      });
    } else {
      // ── LP upload flow ──
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          investorProfile: {
            select: { id: true, fundId: true },
          },
        },
      });

      const investorId = dbUser?.investorProfile?.id;
      if (!investorId) {
        return res.status(400).json({
          error:
            "No investor profile found. Please complete your investor setup first.",
        });
      }

      if (dbUser.investorProfile?.fundId !== fundId) {
        return res.status(403).json({
          error: "You can only upload documents to your associated fund.",
        });
      }

      if (investmentId) {
        const investment = await prisma.investment.findFirst({
          where: { id: investmentId, investorId, fundId },
        });
        if (!investment) {
          return res.status(400).json({
            error: "Invalid investment ID - not associated with your account.",
          });
        }
      }

      const fileBuffer = Buffer.from(fileData, "base64");
      const fileSize = BigInt(fileBuffer.length);

      const { path: storageKey, hash } = await uploadInvestorDocument(
        investorId,
        documentType,
        fileBuffer,
        fileName
      );

      const uploadSource: LPDocumentUploadSource =
        requestedSource === "LP_UPLOADED_EXTERNAL" || isOfflineSigned
          ? "LP_UPLOADED_EXTERNAL"
          : "LP_UPLOADED";

      const lpDocument = await prisma.lPDocument.create({
        data: {
          title,
          documentType: documentType as LPDocumentType,
          fundId,
          investorId,
          uploadedByUserId: session.user.id,
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

      const fundData = lpDocument.fund as { name: string; teamId: string } | null;

      await logAuditEvent({
        eventType: "ADMIN_ACTION",
        userId: session.user.id,
        teamId: fundData?.teamId || fundId,
        resourceType: "Document",
        resourceId: lpDocument.id,
        metadata: {
          action: "LP document uploaded",
          documentType,
          title,
          fileName,
          fileSize: fileSize.toString(),
          investorId,
          fundId,
          hash,
          uploadSource,
          actorEmail: session.user.email,
        },
        ipAddress: req.socket?.remoteAddress || null,
        userAgent: req.headers["user-agent"] || null,
      });

      // Fire-and-forget: notify GP admins about new LP upload
      notifyGPOfLPUpload(
        fundData?.teamId || fundId,
        session.user.email || "LP",
        lpDocument.title,
        lpDocument.documentType
      ).catch((err) => {
        reportError(err as Error);
        console.error("[DOC_UPLOAD] Failed to notify GP:", err);
      });

      return res.status(201).json({
        success: true,
        document: {
          id: lpDocument.id,
          title: lpDocument.title,
          documentType: lpDocument.documentType,
          status: lpDocument.status,
          createdAt: lpDocument.createdAt,
        },
      });
    }
  } catch (error: unknown) {
    console.error("[DOC_UPLOAD] Error:", error);
    reportError(error as Error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function notifyGPOfLPUpload(
  teamId: string,
  lpEmail: string,
  docTitle: string,
  docType: string
) {
  try {
    const admins = await prisma.userTeam.findMany({
      where: {
        teamId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      },
      include: { user: { select: { email: true } } },
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
    console.error("[DOC_UPLOAD] Failed to notify GP:", error);
  }
}
