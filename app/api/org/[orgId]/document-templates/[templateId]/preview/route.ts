import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

/**
 * GET /api/org/[orgId]/document-templates/[templateId]/preview
 *
 * Returns a presigned URL for previewing a custom document template.
 * For S3_PATH storage, generates a presigned GET URL.
 * For VERCEL_BLOB storage, returns the blob URL directly.
 */
export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ orgId: string; templateId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orgId, templateId } = await params;

    // Verify user has access to this org
    const membership = await prisma.userTeam.findFirst({
      where: {
        userId: session.user.id,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
        team: { organizationId: orgId },
      },
      include: { team: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Check DocumentTemplate model first (HTML-based templates)
    const docTemplate = await prisma.documentTemplate.findFirst({
      where: {
        id: templateId,
        teamId: membership.team.id,
      },
    });

    if (docTemplate) {
      // HTML template — return rendered HTML preview with sample data
      const { renderTemplateFromString } = await import(
        "@/lib/documents/template-renderer"
      );
      const { MERGE_FIELD_TAGS } = await import(
        "@/lib/documents/merge-fields"
      );

      // Build sample merge data for preview
      const sampleData: Record<string, string> = {};
      for (const [key, tag] of Object.entries(MERGE_FIELD_TAGS)) {
        sampleData[key] = `[${tag}]`;
      }

      const renderedHtml = docTemplate.content
        ? renderTemplateFromString(docTemplate.content, sampleData as any)
        : "";

      return NextResponse.json({
        type: "html",
        html: renderedHtml,
        label: docTemplate.name,
        numPages: null,
        documentType: docTemplate.documentType,
        isDefault: docTemplate.isDefault,
      });
    }

    // Fall back to SignatureTemplate (uploaded PDFs)
    const template = await prisma.signatureTemplate.findFirst({
      where: {
        id: templateId,
        teamId: membership.team.id,
      },
    });

    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    }

    // Generate preview URL based on storage type
    let previewUrl: string;

    if (template.storageType === "VERCEL_BLOB") {
      previewUrl = template.file;
    } else {
      // S3_PATH — generate a presigned GET URL
      try {
        const { S3Client, GetObjectCommand } = await import(
          "@aws-sdk/client-s3"
        );
        const { getSignedUrl } = await import(
          "@aws-sdk/s3-request-presigner"
        );

        const s3Client = new S3Client({
          region: process.env.AWS_REGION || "us-east-1",
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
          },
        });

        const command = new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME || "",
          Key: template.file,
        });

        previewUrl = await getSignedUrl(s3Client, command, {
          expiresIn: 3600, // 1 hour
        });
      } catch {
        previewUrl = template.file;
      }
    }

    const fields = template.fields as Record<string, unknown> | null;

    return NextResponse.json({
      type: "pdf",
      previewUrl,
      fileName: (fields?.fileName as string) || template.name,
      numPages: template.numPages,
      storageType: template.storageType,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
