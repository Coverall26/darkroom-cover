import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import { transitionDealStage } from "@/lib/marketplace";
import { verifyNotBot } from "@/lib/security/bot-protection";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

/**
 * POST /api/teams/[teamId]/marketplace/deals/[dealId]/stage
 * Transition a deal to a new pipeline stage.
 */
export async function POST(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ teamId: string; dealId: string }> },
) {
  try {
    const botCheck = await verifyNotBot();
    if (botCheck.blocked) return botCheck.response;

    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.toStage) {
      return NextResponse.json(
        { error: "toStage is required" },
        { status: 400 },
      );
    }

    const deal = await transitionDealStage(
      dealId,
      {
        toStage: body.toStage,
        reason: body.reason,
        metadata: body.metadata,
      },
      auth.userId,
    );

    return NextResponse.json({ success: true, deal });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "";
    const status = message.includes("Invalid stage transition") ? 400 : 500;
    console.error("Stage transition error:", error);
    reportError(error as Error);
    return NextResponse.json(
      status === 400
        ? { error: "Invalid stage transition" }
        : { error: "Internal server error" },
      { status },
    );
  }
}
