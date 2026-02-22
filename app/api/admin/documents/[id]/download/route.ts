import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { getInvestorDocument } from "@/lib/storage/investor-storage";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/documents/[id]/download
 *
 * Downloads an LP document. Returns binary file content.
 */
export async function GET(
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

    const lpDocument = await prisma.lPDocument.findUnique({
      where: { id: documentId },
      include: {
        fund: { select: { id: true, name: true, teamId: true } },
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
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN", "MEMBER"] },
      },
    });

    if (!userTeam) {
      return NextResponse.json(
        { error: "You do not have permission to view this document" },
        { status: 403 },
      );
    }

    const fileContent = await getInvestorDocument(lpDocument.storageKey);

    if (!fileContent) {
      return NextResponse.json(
        { error: "Document file not found" },
        { status: 404 },
      );
    }

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    await logAuditEvent({
      eventType: "DOCUMENT_DOWNLOADED",
      userId: session.user.id,
      teamId: lpDocument.fund.teamId,
      resourceType: "Document",
      resourceId: documentId,
      metadata: {
        action: "LP document downloaded by admin",
        documentType: lpDocument.documentType,
        title: lpDocument.title,
        fundId: lpDocument.fundId,
        investorId: lpDocument.investorId,
        actorEmail: session.user.email,
      },
      ipAddress,
      userAgent,
    });

    return new NextResponse(new Uint8Array(fileContent), {
      status: 200,
      headers: {
        "Content-Type": lpDocument.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(lpDocument.originalFilename || "document")}"`,
        "Content-Length": fileContent.length.toString(),
      },
    });
  } catch (error: unknown) {
    console.error("[LP_DOC_DOWNLOAD] Error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
