import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/marketplace/auth";
import {
  browseListings,
  getMarketplaceCategories,
} from "@/lib/marketplace";
import type { MarketplaceFilters } from "@/lib/marketplace";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

/**
 * GET /api/marketplace/browse
 * Browse active marketplace listings (LP-facing).
 * Requires authentication but not team membership.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateUser();
    if ("error" in auth) return auth.error;

    const url = new URL(req.url);

    // Check if requesting categories
    if (url.searchParams.get("categories") === "true") {
      const categories = await getMarketplaceCategories();
      return NextResponse.json({ categories });
    }

    const page = parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSize = parseInt(url.searchParams.get("pageSize") ?? "20", 10);

    const filters: MarketplaceFilters = {};
    const category = url.searchParams.get("category");
    if (category) filters.category = category;
    const sector = url.searchParams.get("sector");
    if (sector) filters.sector = sector;
    const geography = url.searchParams.get("geography");
    if (geography) filters.geography = geography;
    const dealType = url.searchParams.get("dealType");
    if (dealType)
      filters.dealType =
        dealType.split(",") as MarketplaceFilters["dealType"];
    const search = url.searchParams.get("search");
    if (search) filters.search = search;
    const tags = url.searchParams.get("tags");
    if (tags) filters.tags = tags.split(",");
    const featured = url.searchParams.get("featured");
    if (featured) filters.featured = featured === "true";
    const minTicket = url.searchParams.get("minTicket");
    if (minTicket) filters.minTicket = parseFloat(minTicket);
    const maxTicket = url.searchParams.get("maxTicket");
    if (maxTicket) filters.maxTicket = parseFloat(maxTicket);

    const result = await browseListings(filters, page, pageSize);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Browse listings error:", error);
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
