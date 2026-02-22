import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import {
  bulkRequireProof,
  bulkVerifyProofs,
  bulkRejectProofs,
  getProofStatusCounts,
} from "@/lib/wire-transfer";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string }>;
};

/**
 * GET /api/teams/[teamId]/wire-transfers/bulk
 * Get proof status counts for dashboard summary.
 *
 * Query params:
 * - fundId: optional filter by fund
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const fundId = url.searchParams.get("fundId") ?? undefined;

    const counts = await getProofStatusCounts(teamId, fundId);
    return NextResponse.json({ counts });
  } catch (error: unknown) {
    console.error("Proof status counts error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/teams/[teamId]/wire-transfers/bulk
 * Perform bulk operations on wire transfer proofs.
 *
 * Body:
 * - action: "require_proof" | "verify" | "reject"
 * - investmentIds: string[]
 * - rejectionReason?: string (required for "reject")
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.action || !body.investmentIds || !Array.isArray(body.investmentIds)) {
      return NextResponse.json(
        { error: "action and investmentIds[] are required" },
        { status: 400 },
      );
    }

    if (body.investmentIds.length === 0) {
      return NextResponse.json(
        { error: "investmentIds must not be empty" },
        { status: 400 },
      );
    }

    if (body.investmentIds.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 investments per bulk operation" },
        { status: 400 },
      );
    }

    switch (body.action) {
      case "require_proof": {
        const result = await bulkRequireProof(
          teamId,
          { investmentIds: body.investmentIds },
          auth.userId,
        );
        return NextResponse.json({ success: true, ...result });
      }

      case "verify": {
        const result = await bulkVerifyProofs(
          teamId,
          { investmentIds: body.investmentIds },
          auth.userId,
        );
        return NextResponse.json({ success: true, ...result });
      }

      case "reject": {
        if (!body.rejectionReason) {
          return NextResponse.json(
            { error: "rejectionReason is required for reject action" },
            { status: 400 },
          );
        }

        const result = await bulkRejectProofs(
          teamId,
          {
            investmentIds: body.investmentIds,
            rejectionReason: body.rejectionReason,
          },
          auth.userId,
        );
        return NextResponse.json({ success: true, ...result });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${body.action}. Valid: require_proof, verify, reject` },
          { status: 400 },
        );
    }
  } catch (error: unknown) {
    console.error("Bulk operation error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
