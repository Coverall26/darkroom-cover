import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

/**
 * GET /api/teams/[teamId]/funds/[fundId]/signature-documents
 *
 * Lists signature documents associated with a specific fund.
 * Includes recipient signing status for GP dashboard visibility.
 *
 * POST /api/teams/[teamId]/funds/[fundId]/signature-documents
 *
 * Creates a new signature document linked to the fund.
 * Supports marking as requiredForOnboarding.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string; fundId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId, fundId } = await params;

  try {
    const userTeam = await prisma.userTeam.findFirst({
      where: {
        teamId,
        userId: (session.user as any).id,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
      },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify fund belongs to team
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const documents = await prisma.signatureDocument.findMany({
      where: { fundId, teamId },
      include: {
        recipients: {
          orderBy: { signingOrder: "asc" },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            signedAt: true,
            signingOrder: true,
          },
        },
        _count: {
          select: { fields: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Compute signing stats per document
    const documentsWithStats = documents.map((doc: typeof documents[number]) => {
      const signers = doc.recipients.filter((r: typeof doc.recipients[number]) => r.role === "SIGNER");
      const signedCount = signers.filter((r: typeof doc.recipients[number]) => r.status === "SIGNED").length;
      return {
        id: doc.id,
        title: doc.title,
        description: doc.description,
        documentType: doc.documentType,
        status: doc.status,
        requiredForOnboarding: doc.requiredForOnboarding,
        numPages: doc.numPages,
        fieldCount: doc._count.fields,
        createdAt: doc.createdAt,
        completedAt: doc.completedAt,
        signedFileUrl: doc.signedFileUrl,
        signedFileType: doc.signedFileType,
        signedAt: doc.signedAt,
        recipients: doc.recipients,
        signingStats: {
          total: signers.length,
          signed: signedCount,
          pending: signers.length - signedCount,
        },
      };
    });

    return NextResponse.json({ documents: documentsWithStats });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string; fundId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId, fundId } = await params;

  try {
    const userTeam = await prisma.userTeam.findFirst({
      where: {
        teamId,
        userId: (session.user as any).id,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify fund belongs to team
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const body = await req.json();
    const {
      title,
      description,
      file,
      storageType = "S3_PATH",
      documentType,
      requiredForOnboarding = false,
      numPages,
    } = body;

    if (!title || !file) {
      return NextResponse.json(
        { error: "Title and file are required" },
        { status: 400 },
      );
    }

    const document = await prisma.signatureDocument.create({
      data: {
        title,
        description,
        file,
        storageType,
        documentType,
        requiredForOnboarding,
        numPages,
        fundId,
        teamId,
        createdById: (session.user as any).id,
        status: "DRAFT",
      },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
