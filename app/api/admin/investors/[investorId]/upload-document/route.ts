import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { uploadInvestorDocument } from "@/lib/storage/investor-storage";
import { logAuditEventFromRequest } from "@/lib/audit/audit-logger";
import { reportError } from "@/lib/error";
import { DocumentStorageType } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/investors/[investorId]/upload-document
 *
 * Allows a GP to upload documents on behalf of an LP.
 * Documents uploaded by GP are auto-confirmed (status: APPROVED).
 */

const VALID_DOCUMENT_TYPES = [
  "NDA",
  "SUBSCRIPTION_AGREEMENT",
  "LPA",
  "SIDE_LETTER",
  "WIRE_CONFIRMATION",
  "PROOF_OF_FUNDS",
  "ACCREDITATION_PROOF",
  "IDENTITY_DOCUMENT",
  "K1_TAX_FORM",
  "ACH_RECEIPT",
  "OTHER",
] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ investorId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { investorId } = await params;
    if (!investorId) {
      return NextResponse.json(
        { error: "Investor ID required" },
        { status: 400 },
      );
    }

    // Verify GP has admin access
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        teams: {
          where: {
            role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
          },
          select: { teamId: true, role: true },
        },
      },
    });

    if (!user || user.teams.length === 0) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    const adminTeamIds = user.teams.map((t) => t.teamId);

    // Verify investor exists and belongs to one of the GP's teams
    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      include: {
        fund: { select: { id: true, teamId: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!investor) {
      return NextResponse.json(
        { error: "Investor not found" },
        { status: 404 },
      );
    }

    if (!investor.fund || !adminTeamIds.includes(investor.fund.teamId)) {
      return NextResponse.json(
        { error: "You do not have access to this investor" },
        { status: 403 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const { documentType, fileData, fileName, title, notes } = body as {
      documentType?: string;
      fileData?: string;
      fileName?: string;
      title?: string;
      notes?: string;
    };

    if (!documentType || !fileData || !fileName) {
      return NextResponse.json(
        { error: "documentType, fileData, and fileName are required" },
        { status: 400 },
      );
    }

    if (
      !VALID_DOCUMENT_TYPES.includes(
        documentType as (typeof VALID_DOCUMENT_TYPES)[number],
      )
    ) {
      return NextResponse.json(
        {
          error: `Invalid document type. Must be one of: ${VALID_DOCUMENT_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Convert base64 to buffer
    const fileBuffer = Buffer.from(fileData as string, "base64");

    if (fileBuffer.length > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File exceeds 25MB limit" },
        { status: 400 },
      );
    }

    // Upload to storage (encrypted)
    const { path: storagePath } = await uploadInvestorDocument(
      investorId,
      documentType,
      fileBuffer,
      fileName as string,
    );

    // Create LPDocument record — auto-approved since GP uploaded it
    const document = await prisma.lPDocument.create({
      data: {
        investorId,
        fundId: investor.fund.id,
        title: (title as string) || `${documentType} — uploaded by GP`,
        documentType: documentType as (typeof VALID_DOCUMENT_TYPES)[number],
        storageKey: storagePath,
        storageType: DocumentStorageType.ENCRYPTED,
        originalFilename: fileName as string,
        fileSize: fileBuffer.length,
        status: "APPROVED",
        uploadSource: "GP_UPLOADED_FOR_LP",
        isOfflineSigned: true,
        uploadedByUserId: user.id,
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
        reviewNotes:
          (notes as string) ||
          "Auto-approved: uploaded by GP on behalf of LP",
        lpNotes: "Uploaded by fund manager",
      },
    });

    // Audit log
    await logAuditEventFromRequest(req, {
      eventType: "ADMIN_ACTION",
      userId: user.id,
      teamId: investor.fund.teamId,
      resourceType: "Document",
      resourceId: document.id,
      metadata: {
        action: "GP_UPLOAD_FOR_LP",
        investorId,
        investorName: investor.user?.name,
        documentType,
        fileName,
        fileSize: fileBuffer.length,
        autoApproved: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        document: {
          id: document.id,
          title: document.title,
          documentType: document.documentType,
          status: document.status,
          fileName: document.originalFilename,
          createdAt: document.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    reportError(error as Error);
    console.error("Error uploading document for investor:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
