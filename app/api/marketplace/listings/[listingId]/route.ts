import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/marketplace/auth";
import { getListingDetail, recordListingSave } from "@/lib/marketplace";
import { verifyNotBot } from "@/lib/security/bot-protection";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/listings/[listingId]
 * Get full listing detail (LP view). Auto-increments view count.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listingId: string }> },
) {
  try {
    const auth = await authenticateUser();
    if ("error" in auth) return auth.error;

    const { listingId } = await params;
    const listing = await getListingDetail(listingId);

    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ listing });
  } catch (error: unknown) {
    console.error("Get listing detail error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/marketplace/listings/[listingId]
 * Record a save/bookmark on a listing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ listingId: string }> },
) {
  try {
    const botCheck = await verifyNotBot();
    if (botCheck.blocked) return botCheck.response;

    const auth = await authenticateUser();
    if ("error" in auth) return auth.error;

    const { listingId } = await params;
    const body = await req.json();

    if (body.action === "save") {
      await recordListingSave(listingId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: 'Unknown action. Supported: "save"' },
      { status: 400 },
    );
  } catch (error: unknown) {
    console.error("Listing action error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
