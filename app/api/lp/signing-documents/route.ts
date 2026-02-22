/**
 * LP Signing Documents API (App Router)
 *
 * GET /api/lp/signing-documents
 *
 * Returns signature documents assigned to the authenticated LP investor,
 * ordered by signing priority (NDA first, then Subscription Agreement, then LPA).
 * Used by the sequential signing flow in LP onboarding.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const investor = await prisma.investor.findUnique({
      where: { userId: auth.userId },
      select: { id: true, fundId: true },
    });

    if (!investor) {
      return NextResponse.json(
        { error: "Investor profile not found" },
        { status: 404 },
      );
    }

    // Allow fundId from query param (for multi-fund LPs) or use investor's primary fund
    const { searchParams } = new URL(req.url);
    const fundId = searchParams.get("fundId") || investor.fundId;

    // Find signature documents where this user is a recipient
    // Filter by fund if available, to scope docs to the current fund context
    const recipients = await prisma.signatureRecipient.findMany({
      where: {
        email: auth.email,
        role: "SIGNER",
        ...(fundId
          ? {
              document: {
                OR: [
                  { fundId }, // Documents explicitly linked to this fund
                  { fundId: null }, // Global documents (not fund-specific)
                ],
              },
            }
          : {}),
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            numPages: true,
            completedAt: true,
            createdAt: true,
            fundId: true,
            requiredForOnboarding: true,
            signedFileUrl: true,
            signedFileType: true,
            signedAt: true,
          },
        },
      },
      orderBy: {
        document: { createdAt: "asc" },
      },
    });

    // Sort documents by type priority: NDA -> Subscription -> LPA -> Other
    const getDocumentPriority = (title: string): number => {
      const lower = title.toLowerCase();
      if (
        lower.includes("nda") ||
        lower.includes("non-disclosure") ||
        lower.includes("confidentiality")
      )
        return 1;
      if (lower.includes("subscription") || lower.includes("sub ag"))
        return 2;
      if (lower.includes("lpa") || lower.includes("limited partner"))
        return 3;
      if (lower.includes("side letter")) return 4;
      return 5;
    };

    const documents = recipients
      .filter((r) => {
        // Only include documents that are actionable
        const status = r.document.status;
        return status !== "VOIDED" && status !== "EXPIRED";
      })
      .sort(
        (a, b) =>
          getDocumentPriority(a.document.title) -
          getDocumentPriority(b.document.title),
      )
      .map((r) => ({
        id: r.document.id,
        title: r.document.title,
        description: r.document.description,
        documentStatus: r.document.status,
        recipientId: r.id,
        recipientStatus: r.status,
        signingToken: r.signingToken,
        signingUrl: r.signingUrl,
        signedAt: r.signedAt,
        numPages: r.document.numPages,
        completedAt: r.document.completedAt,
        fundId: r.document.fundId,
        requiredForOnboarding: r.document.requiredForOnboarding,
        signedFileUrl: r.document.signedFileUrl,
        signedFileType: r.document.signedFileType,
        documentSignedAt: r.document.signedAt,
      }));

    // Calculate overall signing progress
    const totalDocuments = documents.length;
    const signedDocuments = documents.filter(
      (d) => d.recipientStatus === "SIGNED",
    ).length;
    const currentDocument = documents.find(
      (d) =>
        d.recipientStatus !== "SIGNED" && d.recipientStatus !== "DECLINED",
    );

    return NextResponse.json({
      documents,
      progress: {
        total: totalDocuments,
        signed: signedDocuments,
        complete: totalDocuments > 0 && signedDocuments === totalDocuments,
      },
      currentDocumentId: currentDocument?.id || null,
    });
  } catch (error) {
    reportError(error, {
      path: "/api/lp/signing-documents",
      action: "fetch_signing_documents",
      method: "GET",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
