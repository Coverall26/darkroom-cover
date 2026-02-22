import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import { reviewProofOfPayment } from "@/lib/wire-transfer";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; investmentId: string }>;
};

/**
 * POST /api/teams/[teamId]/manual-investments/[investmentId]/proof
 * GP reviews (verifies or rejects) proof of payment.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { teamId, investmentId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.action || !["verify", "reject"].includes(body.action)) {
      return NextResponse.json(
        { error: "action is required and must be 'verify' or 'reject'" },
        { status: 400 },
      );
    }

    if (body.action === "reject" && !body.rejectionReason) {
      return NextResponse.json(
        { error: "rejectionReason is required when rejecting" },
        { status: 400 },
      );
    }

    const result = await reviewProofOfPayment(
      investmentId,
      {
        action: body.action,
        rejectionReason: body.rejectionReason,
      },
      auth.userId,
    );

    return NextResponse.json({ success: true, investment: result });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "";
    const status = message.includes("not found") ? 404
      : message.includes("already been verified") ? 409
      : message.includes("No proof document") ? 400
      : 500;
    console.error("Review proof error:", error);
    reportError(error as Error);
    const statusMessages: Record<number, string> = {
      404: "Not found",
      409: "Conflict",
      400: "Bad request",
      500: "Internal server error",
    };
    return NextResponse.json({ error: statusMessages[status] || "Internal server error" }, { status });
  }
}
