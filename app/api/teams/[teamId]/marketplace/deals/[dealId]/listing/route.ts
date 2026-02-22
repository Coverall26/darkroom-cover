import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import {
  upsertListing,
  publishListing,
  unpublishListing,
} from "@/lib/marketplace";
import { verifyNotBot } from "@/lib/security/bot-protection";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; dealId: string }>;
};

/**
 * POST /api/teams/[teamId]/marketplace/deals/[dealId]/listing
 * Create or update a marketplace listing for a deal.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const botCheck = await verifyNotBot();
    if (botCheck.blocked) return botCheck.response;

    const { teamId, dealId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.headline || !body.summary) {
      return NextResponse.json(
        { error: "headline and summary are required" },
        { status: 400 },
      );
    }

    const listing = await upsertListing(
      {
        dealId,
        headline: body.headline,
        summary: body.summary,
        highlights: body.highlights,
        category: body.category,
        coverImageUrl: body.coverImageUrl,
        searchTags: body.searchTags,
      },
      teamId,
    );

    return NextResponse.json({ success: true, listing });
  } catch (error: unknown) {
    console.error("Upsert listing error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/teams/[teamId]/marketplace/deals/[dealId]/listing
 * Publish or unpublish a listing.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const botCheck = await verifyNotBot();
    if (botCheck.blocked) return botCheck.response;

    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();

    if (!body.listingId) {
      return NextResponse.json(
        { error: "listingId is required" },
        { status: 400 },
      );
    }

    const listing = body.publish
      ? await publishListing(body.listingId)
      : await unpublishListing(body.listingId);

    return NextResponse.json({ success: true, listing });
  } catch (error: unknown) {
    console.error("Publish/unpublish listing error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
