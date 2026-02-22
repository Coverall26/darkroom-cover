import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { LPDocumentType, LPDocumentUploadSource } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { uploadInvestorDocument } from "@/lib/storage/investor-storage";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

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

interface UploadForInvestorRequest {
  investorId: string;
  title: string;
  documentType: string;
  fundId: string;
  notes?: string;
  investmentId?: string;
  fileData: string;
  fileName: string;
  mimeType: string;
}

/**
 * POST /api/admin/documents/upload-for-investor
 *
 * GP uploads a document on behalf of an LP investor.
 * Document is auto-approved (status: APPROVED) since GP uploaded it.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: UploadForInvestorRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const {
      investorId,
      title,
      documentType,
      fundId,
      notes,
      investmentId,
      fileData,
      fileName,
      mimeType,
    } = body;

    if (
      !investorId ||
      !title ||
      !documentType ||
      !fundId ||
      !fileData ||
      !fileName
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: investorId, title, documentType, fundId, fileData, fileName",
        },
        { status: 400 },
      );
    }

    if (
      !LPDocumentTypeValues.includes(
        documentType as (typeof LPDocumentTypeValues)[number],
      )
    ) {
      return NextResponse.json(
        {
          error: `Invalid document type. Must be one of: ${LPDocumentTypeValues.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Verify GP has admin access to the fund's team
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: { teamId: true, name: true },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const userTeam = await prisma.userTeam.findFirst({
      where: {
        userId: session.user.id,
        teamId: fund.teamId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      },
    });

    if (!userTeam) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to upload documents for this fund",
        },
        { status: 403 },
      );
    }

    // Verify investor exists and is associated with this fund
    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      select: { id: true, fundId: true, userId: true },
    });

    if (!investor) {
      return NextResponse.json(
        { error: "Investor not found" },
        { status: 404 },
      );
    }

    if (investor.fundId !== fundId) {
      // Also check if investor has an investment in this fund
      const investment = await prisma.investment.findFirst({
        where: { investorId, fundId },
        select: { id: true },
      });
      if (!investment) {
        return NextResponse.json(
          { error: "Investor is not associated with this fund" },
          { status: 400 },
        );
      }
    }

    // Validate investmentId if provided
    if (investmentId) {
      const investment = await prisma.investment.findFirst({
        where: {
          id: investmentId,
          investorId,
          fundId,
        },
      });
      if (!investment) {
        return NextResponse.json(
          { error: "Invalid investment ID" },
          { status: 400 },
        );
      }
    }

    const fileBuffer = Buffer.from(fileData, "base64");
    const fileSize = BigInt(fileBuffer.length);

    const { path: storageKey, hash } = await uploadInvestorDocument(
      investorId,
      documentType,
      fileBuffer,
      fileName,
    );

    // GP-uploaded docs are auto-approved (GP confirms by uploading)
    const lpDocument = await prisma.lPDocument.create({
      data: {
        title,
        documentType: documentType as LPDocumentType,
        fundId,
        investorId,
        uploadedByUserId: session.user.id,
        uploadSource: "GP_UPLOADED_FOR_LP" as LPDocumentUploadSource,
        storageKey,
        storageType: "REPLIT",
        originalFilename: fileName,
        fileSize,
        mimeType: mimeType || "application/octet-stream",
        reviewNotes: notes || null,
        isOfflineSigned: false,
        investmentId: investmentId || null,
        status: "APPROVED",
        reviewedByUserId: session.user.id,
        reviewedAt: new Date(),
      },
    });

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

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
        investorId,
        fundId,
        hash,
        actorEmail: session.user.email,
        uploadSource: "GP_UPLOADED_FOR_LP",
      },
      ipAddress,
      userAgent,
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
    console.error("[GP_DOC_UPLOAD_FOR_INVESTOR] Error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
