import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/error";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

interface RollbarItem {
  id: number;
  counter: number;
  environment: string;
  framework: string;
  hash: string;
  level: string;
  occurrences: number;
  status: string;
  title: string;
  unique_occurrences: number;
  first_occurrence_timestamp: number;
  last_occurrence_timestamp: number;
  total_occurrences: number;
}

interface RollbarOccurrence {
  id: number;
  timestamp: number;
  level: string;
  environment: string;
  body: {
    trace?: {
      exception?: {
        class: string;
        message: string;
      };
      frames?: Array<{
        filename: string;
        lineno: number;
        method: string;
      }>;
    };
    message?: {
      body: string;
    };
  };
  request?: {
    url: string;
    method: string;
    user_ip: string;
  };
  client?: {
    javascript?: {
      browser: string;
    };
  };
}

/**
 * GET /api/admin/rollbar-errors
 *
 * Proxies Rollbar API for error items and occurrences.
 * Supports type=items|occurrences, limit, level, environment query params.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  const readToken = process.env.ROLLBAR_READ_TOKEN;
  if (!readToken) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "items";
    const limit = searchParams.get("limit") || "20";
    const level = searchParams.get("level");
    const environment = searchParams.get("environment") || "production";

    if (type === "items") {
      const params = new URLSearchParams({
        access_token: readToken,
        status: "active",
        level: level || "error",
        environment,
      });

      const response = await fetch(
        `https://api.rollbar.com/api/1/items?${params.toString()}`,
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[ROLLBAR] API error:", response.status, errorText);
        return NextResponse.json(
          { error: "Failed to fetch from Rollbar" },
          { status: response.status },
        );
      }

      const data = await response.json();
      const items: RollbarItem[] = data.result?.items || [];

      const formattedItems = items.slice(0, parseInt(limit)).map((item) => ({
        id: item.id,
        counter: item.counter,
        level: item.level,
        title: item.title,
        environment: item.environment,
        occurrences: item.total_occurrences || item.occurrences,
        status: item.status,
        firstSeen: new Date(
          item.first_occurrence_timestamp * 1000,
        ).toISOString(),
        lastSeen: new Date(
          item.last_occurrence_timestamp * 1000,
        ).toISOString(),
        rollbarUrl: `https://rollbar.com/item/${item.counter}`,
      }));

      return NextResponse.json({
        success: true,
        count: formattedItems.length,
        items: formattedItems,
      });
    }

    if (type === "occurrences") {
      const itemId = searchParams.get("itemId");
      if (!itemId) {
        return NextResponse.json(
          { error: "itemId required for occurrences" },
          { status: 400 },
        );
      }

      const params = new URLSearchParams({
        access_token: readToken,
      });

      const response = await fetch(
        `https://api.rollbar.com/api/1/item/${itemId}/instances?${params.toString()}`,
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          "[ROLLBAR] Occurrences API error:",
          response.status,
          errorText,
        );
        return NextResponse.json(
          { error: "Failed to fetch occurrences" },
          { status: response.status },
        );
      }

      const data = await response.json();
      const occurrences: RollbarOccurrence[] = data.result?.instances || [];

      const formattedOccurrences = occurrences
        .slice(0, parseInt(limit))
        .map((occ) => ({
          id: occ.id,
          timestamp: new Date(occ.timestamp * 1000).toISOString(),
          level: occ.level,
          environment: occ.environment,
          message:
            occ.body?.trace?.exception?.message ||
            occ.body?.message?.body ||
            "Unknown error",
          exceptionClass: occ.body?.trace?.exception?.class,
          url: occ.request?.url,
          browser: occ.client?.javascript?.browser,
          userIp: occ.request?.user_ip,
          frames: occ.body?.trace?.frames?.slice(0, 5).map((f) => ({
            file: f.filename,
            line: f.lineno,
            method: f.method,
          })),
        }));

      return NextResponse.json({
        success: true,
        count: formattedOccurrences.length,
        occurrences: formattedOccurrences,
      });
    }

    return NextResponse.json(
      { error: "Invalid type parameter" },
      { status: 400 },
    );
  } catch (error) {
    console.error("[ROLLBAR] Error fetching errors:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
