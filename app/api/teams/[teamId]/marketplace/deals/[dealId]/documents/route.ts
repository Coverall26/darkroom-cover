import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import {
  createDealDocument,
  listDealDocuments,
} from "@/lib/marketplace";
import { verifyNotBot } from "@/lib/security/bot-protection";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; dealId: string }>;
};

/**
 * GET /api/teams/[teamId]/marketplace/deals/[dealId]/documents
 * List documents for a deal.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const category = url.searchParams.get("category") ?? undefined;

    const documents = await listDealDocuments(dealId, category);
    return NextResponse.json({ documents });
  } catch (error: unknown) {
    console.error("List documents error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/teams/[teamId]/marketplace/deals/[dealId]/documents
 * Upload/create a document record for a deal.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const botCheck = await verifyNotBot();
    if (botCheck.blocked) return botCheck.response;

    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 },
      );
    }

    const document = await createDealDocument(
      dealId,
      {
        name: body.name,
        description: body.description,
        category: body.category,
        storageKey: body.storageKey,
        storageType: body.storageType,
        fileType: body.fileType,
        fileSize: body.fileSize,
        requiredStage: body.requiredStage,
        restricted: body.restricted,
      },
      auth.userId,
    );

    return NextResponse.json({ success: true, document }, { status: 201 });
  } catch (error: unknown) {
    console.error("Create document error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/teams/[teamId]/marketplace/deals/[dealId]/documents
 * Update a document's metadata.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.documentId) {
      return NextResponse.json(
        { error: "documentId is required" },
        { status: 400 },
      );
    }

    const { updateDealDocument } = await import("@/lib/marketplace");
    const document = await updateDealDocument(
      body.documentId,
      {
        name: body.name,
        description: body.description,
        category: body.category,
        requiredStage: body.requiredStage,
        restricted: body.restricted,
      },
      auth.userId,
    );

    return NextResponse.json({ success: true, document });
  } catch (error: unknown) {
    console.error("Update document error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/teams/[teamId]/marketplace/deals/[dealId]/documents
 * Delete a document.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const documentId = url.searchParams.get("documentId");

    if (!documentId) {
      return NextResponse.json(
        { error: "documentId query parameter is required" },
        { status: 400 },
      );
    }

    const { deleteDealDocument } = await import("@/lib/marketplace");
    const document = await deleteDealDocument(documentId, auth.userId);

    return NextResponse.json({ success: true, document });
  } catch (error: unknown) {
    console.error("Delete document error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
