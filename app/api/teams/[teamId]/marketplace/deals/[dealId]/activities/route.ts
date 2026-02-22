import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import { listDealActivities, createManualActivity } from "@/lib/marketplace";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; dealId: string }>;
};

/**
 * GET /api/teams/[teamId]/marketplace/deals/[dealId]/activities
 * List activities for a deal with pagination.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);
    const activityType = url.searchParams.get("activityType") ?? undefined;
    const page = parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSize = parseInt(url.searchParams.get("pageSize") ?? "25", 10);

    const result = await listDealActivities(dealId, {
      activityType,
      page,
      pageSize,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("List activities error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/teams/[teamId]/marketplace/deals/[dealId]/activities
 * Create a manual activity (MEETING, CALL, EMAIL).
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.activityType || !body.title) {
      return NextResponse.json(
        { error: "activityType and title are required" },
        { status: 400 },
      );
    }

    const activity = await createManualActivity(
      dealId,
      {
        activityType: body.activityType,
        title: body.title,
        description: body.description,
        metadata: body.metadata,
      },
      auth.userId,
    );

    return NextResponse.json({ success: true, activity }, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "";
    const status = message.includes("Invalid manual activity type") ? 400 : 500;
    console.error("Create activity error:", error);
    reportError(error as Error);
    return NextResponse.json(
      status === 400
        ? { error: "Invalid manual activity type" }
        : { error: "Internal server error" },
      { status },
    );
  }
}
