import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import { reportError } from "@/lib/error";
import { putFileServer } from "@/lib/files/put-file-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/setup/upload-logo
 * Uploads a company logo during GP Organization Setup Wizard.
 * Accepts multipart form data with a single "file" field.
 * Returns the public URL of the uploaded logo.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 },
      );
    }

    // Validate file type
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/svg+xml",
      "image/webp",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PNG, JPG, SVG, WebP" },
        { status: 400 },
      );
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum 5MB." },
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
      restricted: false,
    });

    return NextResponse.json({
      url: result.data,
      type: result.type,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
