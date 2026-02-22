import { NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import { isUserAdminAsync } from "@/lib/constants/admins";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reprocess-pdfs
 *
 * Finds stuck PDF documents (missing pages) and triggers reprocessing.
 * Platform admin only (via isUserAdminAsync).
 */
export async function POST() {
  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  if (!(await isUserAdminAsync(auth.email))) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 },
    );
  }

  try {
    const stuckPdfs = await prisma.documentVersion.findMany({
      where: {
        type: "pdf",
        isPrimary: true,
        OR: [
          { numPages: null },
          { hasPages: false },
          {
            pages: {
              none: {},
            },
          },
        ],
      },
      select: {
        id: true,
        file: true,
        numPages: true,
        hasPages: true,
        document: {
          select: {
            id: true,
            name: true,
            teamId: true,
          },
        },
        _count: {
          select: { pages: true },
        },
      },
      take: 50,
    });

    const results: { name: string; status: string; error?: string }[] = [];
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL;

    for (const version of stuckPdfs) {
      if (!version.document) continue;

      try {
        const response = await fetch(
          `${baseUrl}/api/mupdf/process-pdf-local`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
            },
            body: JSON.stringify({
              documentVersionId: version.id,
              teamId: version.document.teamId,
            }),
          },
        );

        if (response.ok) {
          results.push({
            name: version.document.name,
            status: "success",
          });
        } else {
          const error = await response
            .json()
            .catch(() => ({ error: "Unknown error" }));
          results.push({
            name: version.document.name,
            status: "failed",
            error: error.error || error.details || "Processing failed",
          });
        }
      } catch (error) {
        reportError(error as Error);
        results.push({
          name: version.document.name,
          status: "error",
        });
      }
    }

    return NextResponse.json({
      message: `Processed ${results.length} PDFs`,
      totalStuck: stuckPdfs.length,
      results,
    });
  } catch (error) {
    console.error("Reprocess PDFs error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
