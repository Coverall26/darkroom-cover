import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/marketplace/auth";
import { uploadProofOfPayment } from "@/lib/wire-transfer";
import { reportError } from "@/lib/error";
import { appRouterUploadRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ investmentId: string }>;
};

/**
 * POST /api/lp/manual-investments/[investmentId]/proof
 * LP uploads proof of payment for a manual investment.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const blocked = await appRouterUploadRateLimit(req);
  if (blocked) return blocked;

  try {
    const { investmentId } = await params;
    const auth = await authenticateUser();
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.storageKey || !body.storageType || !body.fileType || !body.fileName) {
      return NextResponse.json(
        { error: "storageKey, storageType, fileType, and fileName are required" },
        { status: 400 },
      );
    }

    const result = await uploadProofOfPayment(
      investmentId,
      {
        storageKey: body.storageKey,
        storageType: body.storageType,
        fileType: body.fileType,
        fileName: body.fileName,
        fileSize: body.fileSize ?? 0,
        notes: body.notes,
      },
      auth.userId,
    );

    return NextResponse.json({ success: true, investment: result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "";
    const status = message.includes("not found") ? 404
      : message.includes("Unauthorized") ? 403
      : message.includes("already been verified") ? 409
      : 500;
    console.error("Upload proof error:", error);
    reportError(error as Error);
    const clientMessage = status === 404 ? "Investment not found"
      : status === 403 ? "Unauthorized"
      : status === 409 ? "Payment has already been verified"
      : "Internal server error";
    return NextResponse.json({ error: clientMessage }, { status });
  }
}
