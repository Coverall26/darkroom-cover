import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireLPAuthAppRouter } from "@/lib/auth/rbac";

/**
 * GET /api/lp/pending-signatures
 * Returns pending signature documents for the authenticated LP.
 */
export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireLPAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const pendingSignatures = await prisma.signatureRecipient.findMany({
      where: {
        email: auth.email,
        status: { in: ["PENDING", "SENT", "VIEWED"] },
        role: "SIGNER",
        document: {
          status: { in: ["SENT", "VIEWED", "PARTIALLY_SIGNED"] },
        },
      },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            sentAt: true,
            expirationDate: true,
            team: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedSignatures = pendingSignatures.map((sig) => ({
      id: sig.id,
      documentId: sig.document.id,
      documentTitle: sig.document.title,
      teamName: sig.document.team.name,
      signingToken: sig.signingToken,
      status: sig.status,
      sentAt: sig.document.sentAt,
      expirationDate: sig.document.expirationDate,
    }));

    return NextResponse.json({
      pendingSignatures: formattedSignatures,
    });
  } catch (error: unknown) {
    console.error("LP pending signatures error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
