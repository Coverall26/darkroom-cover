import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { putFileServer } from "@/lib/files/put-file-server";
import { appRouterUploadRateLimit } from "@/lib/security/rate-limiter";
import { DocumentStorageType } from "@prisma/client";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

// Note: App Router handles body size via route segment config if needed

/**
 * POST /api/lp/upload-signed-doc
 * Upload an externally signed document (e.g., wet-ink signed subscription agreement).
 * Creates an LPDocument record with status UPLOADED_PENDING_REVIEW.
 * GP will review and approve/reject the document.
 */
export async function POST(req: NextRequest) {
  const blocked = await appRouterUploadRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const documentType = formData.get("documentType") as string | null;
    const fundId = formData.get("fundId") as string | null;
    const externalSigningDate = formData.get("externalSigningDate") as
      | string
      | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    if (!documentType) {
      return NextResponse.json(
        { error: "Document type is required" },
        { status: 400 },
      );
    }

    // Validate file type
    const allowedTypes = ["application/pdf", "image/png", "image/jpeg"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PDF, PNG, JPG" },
        { status: 400 },
      );
    }

    // Validate size (25MB)
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum 25MB." },
        { status: 400 },
      );
    }

    // Find investor
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: { investorProfile: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const investor = user.investorProfile;
    if (!investor) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 404 },
      );
    }

    // Get teamId from fund
    let teamId: string | null = null;
    if (fundId) {
      const fund = await prisma.fund.findUnique({
        where: { id: fundId },
        select: { teamId: true },
      });
      teamId = fund?.teamId || null;
    }

    // Upload file
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await putFileServer({
      file: {
        name: file.name,
        type: file.type,
        buffer,
      },
      teamId: teamId || `lp-${investor.id}`,
      restricted: true,
    });

    // Create LPDocument record
    const doc = await prisma.lPDocument.create({
      data: {
        investor: { connect: { id: investor.id } },
        fund: { connect: { id: fundId || investor.fundId || "" } },
        title: `${documentType} - ${file.name}`,
        documentType: documentType as never,
        status: "UPLOADED_PENDING_REVIEW",
        storageKey: uploadResult.data || "",
        storageType: String(uploadResult.type) as DocumentStorageType,
        originalFilename: file.name,
        fileSize: file.size,
        mimeType: file.type,
        uploadedBy: { connect: { id: user.id } },
        uploadSource: "LP_UPLOADED_EXTERNAL",
        isOfflineSigned: true,
        externalSigningDate: externalSigningDate
          ? new Date(externalSigningDate)
          : null,
      },
    });

    // Audit log
    await logAuditEvent({
      eventType: "DOCUMENT_SIGNED",
      userId: user.id,
      teamId: teamId || undefined,
      resourceType: "Document",
      resourceId: doc.id,
      metadata: {
        action: "externally_signed_doc_uploaded",
        documentType,
        fundId: fundId || null,
        fileName: file.name,
        fileSize: file.size,
        isOfflineSigned: true,
        externalSigningDate: externalSigningDate || null,
      },
    });

    return NextResponse.json({
      success: true,
      documentId: doc.id,
      status: doc.status,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
