import { NextRequest, NextResponse } from "next/server";
import {
  browseListings,
  getMarketplaceCategories,
} from "@/lib/marketplace";
import type { MarketplaceFilters } from "@/lib/marketplace";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/public
 * Public (unauthenticated) marketplace listing browse endpoint.
 * Used by the public landing page at /marketplace.
 * Only returns active, published listings — no sensitive data.
 */
export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const url = new URL(req.url);

    // Categories endpoint
    if (url.searchParams.get("categories") === "true") {
      const categories = await getMarketplaceCategories();
      return NextResponse.json({ categories });
    }

    const page = parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSize = Math.min(
      parseInt(url.searchParams.get("pageSize") ?? "12", 10),
      24, // Cap public page size
    );

    const filters: MarketplaceFilters = {};
    const category = url.searchParams.get("category");
    if (category) filters.category = category;
    const search = url.searchParams.get("search");
    if (search) filters.search = search;
    const featured = url.searchParams.get("featured");
    if (featured) filters.featured = featured === "true";
    const dealType = url.searchParams.get("dealType");
    if (dealType)
      filters.dealType =
        dealType.split(",") as MarketplaceFilters["dealType"];

    const result = await browseListings(filters, page, pageSize);
    return NextResponse.json(result);
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
