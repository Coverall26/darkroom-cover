import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/org/[orgId]/document-templates/[templateId]
 *
 * Deletes a custom document template, reverting to default (if one exists).
 * Only the file record is removed — the S3/Vercel object is NOT deleted
 * (storage cleanup is handled by a background job).
 */
export async function DELETE(
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

    // Verify user has admin access to this org
    const membership = await prisma.userTeam.findFirst({
      where: {
        userId: session.user.id,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        team: { organizationId: orgId },
      },
      include: { team: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify template exists and belongs to the team
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

    // Extract document type from fields metadata
    const fields = template.fields as Record<string, unknown> | null;
    const documentType = fields?.documentType as string | undefined;

    // Delete the template
    await prisma.signatureTemplate.delete({
      where: { id: templateId },
    });

    // Audit log
    await logAuditEvent({
      eventType: "SETTINGS_UPDATED",
      userId: session.user.id,
      teamId: membership.team.id,
      resourceType: "Document",
      resourceId: templateId,
      metadata: {
        action: "template_deleted",
        documentType: documentType || "unknown",
        templateName: template.name,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
