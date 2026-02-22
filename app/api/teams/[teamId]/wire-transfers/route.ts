import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import {
  listPendingProofs,
  getWireTransferSummary,
} from "@/lib/wire-transfer";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string }>;
};

/**
 * GET /api/teams/[teamId]/wire-transfers
 * GP dashboard: list wire transfers and pending proofs.
 *
 * Query params:
 * - view: "pending" (default) | "all"
 * - fundId: filter by fund
 * - page, pageSize: pagination (for pending view)
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const view = url.searchParams.get("view") ?? "pending";
    const fundId = url.searchParams.get("fundId") ?? undefined;

    if (view === "pending") {
      const page = parseInt(url.searchParams.get("page") ?? "1", 10);
      const pageSize = parseInt(url.searchParams.get("pageSize") ?? "25", 10);

      const result = await listPendingProofs(teamId, { fundId, page, pageSize });
      return NextResponse.json(result);
    }

    // "all" view — wire transfer summary
    const summary = await getWireTransferSummary(teamId, fundId);
    return NextResponse.json({ transfers: summary, total: summary.length });
  } catch (error: unknown) {
    console.error("Wire transfers error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
