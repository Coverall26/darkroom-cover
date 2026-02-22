import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import {
  allocateDeal,
  listDealAllocations,
  respondToAllocation,
} from "@/lib/marketplace";
import { verifyNotBot } from "@/lib/security/bot-protection";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; dealId: string }>;
};

/**
 * GET /api/teams/[teamId]/marketplace/deals/[dealId]/allocations
 * List all allocations for a deal.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const allocations = await listDealAllocations(dealId);
    return NextResponse.json({ allocations });
  } catch (error: unknown) {
    console.error("List allocations error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/teams/[teamId]/marketplace/deals/[dealId]/allocations
 * Create a new allocation (GP allocates to an investor).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const botCheck = await verifyNotBot();
    if (botCheck.blocked) return botCheck.response;

    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.investorId || !body.allocatedAmount) {
      return NextResponse.json(
        { error: "investorId and allocatedAmount are required" },
        { status: 400 },
      );
    }

    const allocation = await allocateDeal(
      {
        dealId,
        investorId: body.investorId,
        allocatedAmount: body.allocatedAmount,
        allocationNotes: body.allocationNotes,
      },
      auth.userId,
    );

    return NextResponse.json(
      { success: true, allocation },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Create allocation error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/teams/[teamId]/marketplace/deals/[dealId]/allocations
 * LP responds to an allocation (accept/reject).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const botCheck = await verifyNotBot();
    if (botCheck.blocked) return botCheck.response;

    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.allocationId || body.accept === undefined) {
      return NextResponse.json(
        { error: "allocationId and accept (boolean) are required" },
        { status: 400 },
      );
    }

    const allocation = await respondToAllocation(
      body.allocationId,
      body.accept,
      body.confirmedAmount,
    );

    return NextResponse.json({ success: true, allocation });
  } catch (error: unknown) {
    console.error("Respond to allocation error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
