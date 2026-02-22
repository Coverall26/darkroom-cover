import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import { reportError } from "@/lib/error";
import { putFileServer } from "@/lib/files/put-file-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/setup/upload-document
 * Uploads a document template during GP Organization Setup Wizard.
 * Accepts multipart form data with "file" and optional "documentType" fields.
 * Returns the storage key/URL of the uploaded document.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const documentType = formData.get("documentType") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PDF, DOCX" },
        { status: 400 },
      );
    }

    // Validate file size (25MB max)
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum 25MB." },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await putFileServer({
      file: {
        name: file.name,
        type: file.type,
        buffer,
      },
      teamId: `setup-${auth.userId}`,
      restricted: true,
    });

    return NextResponse.json({
      url: result.data,
      type: result.type,
      documentType: documentType || null,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
