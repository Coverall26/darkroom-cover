import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import {
  expressInterest,
  listDealInterests,
  updateInterestStatus,
} from "@/lib/marketplace";
import { verifyNotBot } from "@/lib/security/bot-protection";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; dealId: string }>;
};

/**
 * GET /api/teams/[teamId]/marketplace/deals/[dealId]/interest
 * List all interest expressions for a deal (GP view).
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const statusFilter = url.searchParams.get("status")?.split(",") as
      | import("@prisma/client").InterestStatus[]
      | undefined;

    const interests = await listDealInterests(dealId, statusFilter);
    return NextResponse.json({ interests });
  } catch (error: unknown) {
    console.error("List interests error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/teams/[teamId]/marketplace/deals/[dealId]/interest
 * Express interest in a deal (can be LP or GP adding on behalf).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const botCheck = await verifyNotBot();
    if (botCheck.blocked) return botCheck.response;

    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    const interest = await expressInterest(
      {
        dealId,
        indicativeAmount: body.indicativeAmount,
        notes: body.notes,
        conditionsOrTerms: body.conditionsOrTerms,
      },
      auth.userId,
      body.investorId,
    );

    return NextResponse.json({ success: true, interest }, { status: 201 });
  } catch (error: unknown) {
    console.error("Express interest error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/teams/[teamId]/marketplace/deals/[dealId]/interest
 * Update interest status (GP action).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const botCheck = await verifyNotBot();
    if (botCheck.blocked) return botCheck.response;

    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.interestId || !body.status) {
      return NextResponse.json(
        { error: "interestId and status are required" },
        { status: 400 },
      );
    }

    const interest = await updateInterestStatus(
      body.interestId,
      body.status,
      auth.userId,
      body.gpNotes,
    );

    return NextResponse.json({ success: true, interest });
  } catch (error: unknown) {
    console.error("Update interest error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
