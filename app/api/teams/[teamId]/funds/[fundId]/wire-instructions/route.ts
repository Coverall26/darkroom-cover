import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import {
  setWireInstructions,
  getWireInstructions,
  deleteWireInstructions,
} from "@/lib/wire-transfer";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; fundId: string }>;
};

/**
 * GET /api/teams/[teamId]/funds/[fundId]/wire-instructions
 * Get wire instructions for a fund (GP view — full details).
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId, fundId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const instructions = await getWireInstructions(fundId);

    if (!instructions) {
      return NextResponse.json(
        { instructions: null, configured: false },
      );
    }

    return NextResponse.json({ instructions, configured: true });
  } catch (error: unknown) {
    console.error("Get wire instructions error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/teams/[teamId]/funds/[fundId]/wire-instructions
 * Set or update wire instructions for a fund.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { teamId, fundId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.bankName || !body.accountNumber || !body.routingNumber || !body.beneficiaryName) {
      return NextResponse.json(
        { error: "bankName, accountNumber, routingNumber, and beneficiaryName are required" },
        { status: 400 },
      );
    }

    // Validate routing number format (9 digits for US ABA)
    if (body.routingNumber && !/^\d{9}$/.test(body.routingNumber)) {
      return NextResponse.json(
        { error: "Routing number must be exactly 9 digits" },
        { status: 400 },
      );
    }

    // String length limits
    if (body.bankName.length > 200 || body.beneficiaryName.length > 200) {
      return NextResponse.json(
        { error: "Bank name and beneficiary name must be under 200 characters" },
        { status: 400 },
      );
    }

    const fund = await setWireInstructions(fundId, body, auth.userId);
    return NextResponse.json({ success: true, fund });
  } catch (error: unknown) {
    console.error("Set wire instructions error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/teams/[teamId]/funds/[fundId]/wire-instructions
 * Remove wire instructions from a fund.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { teamId, fundId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const fund = await deleteWireInstructions(fundId, auth.userId);
    return NextResponse.json({ success: true, fund });
  } catch (error: unknown) {
    console.error("Delete wire instructions error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
