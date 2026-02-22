import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

/**
 * GET /api/lp/pending-counts
 * Returns pending document and signature counts for the authenticated LP.
 * Used by LP Bottom Tab Bar for badge indicators.
 */
export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    // Run both counts in parallel for efficiency
    const [pendingSignatures, pendingDocs] = await Promise.all([
      prisma.signatureRecipient.count({
        where: {
          email: auth.email,
          status: { in: ["PENDING", "SENT", "VIEWED"] },
          role: "SIGNER",
          document: {
            status: { in: ["SENT", "VIEWED", "PARTIALLY_SIGNED"] },
          },
        },
      }),
      prisma.lPDocument.count({
        where: {
          investor: {
            user: { email: auth.email },
          },
          status: "REVISION_REQUESTED",
        },
      }),
    ]);

    return NextResponse.json({
      pendingDocs,
      pendingSignatures,
    });
  } catch (error: unknown) {
    console.error("LP pending counts error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
