import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import { getDeal, updateDeal, deleteDeal } from "@/lib/marketplace";
import { verifyNotBot } from "@/lib/security/bot-protection";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ teamId: string; dealId: string }> };

/**
 * GET /api/teams/[teamId]/marketplace/deals/[dealId]
 * Get deal details.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const deal = await getDeal(dealId);
    if (!deal || deal.teamId !== teamId) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    return NextResponse.json({ deal });
  } catch (error: unknown) {
    console.error("Get deal error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/teams/[teamId]/marketplace/deals/[dealId]
 * Update deal details.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const botCheck = await verifyNotBot();
    if (botCheck.blocked) return botCheck.response;

    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();
    const deal = await updateDeal(dealId, body, auth.userId);
    return NextResponse.json({ success: true, deal });
  } catch (error: unknown) {
    console.error("Update deal error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/teams/[teamId]/marketplace/deals/[dealId]
 * Soft-delete a deal.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const botCheck = await verifyNotBot();
    if (botCheck.blocked) return botCheck.response;

    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const deal = await deleteDeal(dealId, auth.userId);
    return NextResponse.json({ success: true, deal });
  } catch (error: unknown) {
    console.error("Delete deal error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
