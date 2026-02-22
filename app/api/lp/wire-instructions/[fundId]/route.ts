import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/marketplace/auth";
import { getWireInstructionsPublic } from "@/lib/wire-transfer";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ fundId: string }>;
};

/**
 * GET /api/lp/wire-instructions/[fundId]
 * LP retrieves wire instructions for a fund (masked account number).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const { fundId } = await params;
    const auth = await authenticateUser();
    if ("error" in auth) return auth.error;

    const instructions = await getWireInstructionsPublic(fundId);

    if (!instructions) {
      return NextResponse.json(
        { error: "Wire instructions not configured for this fund" },
        { status: 404 },
      );
    }

    return NextResponse.json({ instructions });
  } catch (error: unknown) {
    console.error("Get LP wire instructions error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
