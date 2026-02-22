import { NextResponse } from "next/server";

import { reportWarning } from "@/lib/error";

export const dynamic = 'force-dynamic';

// Rate limit: track recent reports to avoid flooding
const recentReports = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const MAX_REPORTS_PER_WINDOW = 50;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // CSP reports come in two formats: { "csp-report": {...} } or { ... }
    const report = body["csp-report"] ?? body;

    const directive = report["violated-directive"] ?? report["effectiveDirective"] ?? "unknown";
    const blockedUri = report["blocked-uri"] ?? report["blockedURL"] ?? "unknown";
    const documentUri = report["document-uri"] ?? report["documentURL"] ?? "unknown";
    const originalPolicy = report["original-policy"] ?? "";

    // Filter false positives from browser extensions, inline, eval
    const blockedUriStr = String(blockedUri);
    if (
      blockedUriStr.startsWith("chrome-extension://") ||
      blockedUriStr.startsWith("moz-extension://") ||
      blockedUriStr.startsWith("safari-extension://") ||
      blockedUriStr === "inline" ||
      blockedUriStr === "eval"
    ) {
      return new NextResponse(null, { status: 204 });
    }

    // Rate limit by directive+blockedUri
    const key = `${directive}:${blockedUri}`;
    const now = Date.now();
    const lastSeen = recentReports.get(key);

    if (lastSeen && now - lastSeen < RATE_LIMIT_WINDOW) {
      return NextResponse.json({ success: true, deduplicated: true });
    }

    // Evict stale entries
    if (recentReports.size > MAX_REPORTS_PER_WINDOW) {
      for (const [k, v] of recentReports) {
        if (now - v > RATE_LIMIT_WINDOW) recentReports.delete(k);
      }
    }
    recentReports.set(key, now);

    // Log to Rollbar as warning (not error) for visibility
    reportWarning(`CSP Violation: ${directive}`, {
      action: "csp_violation",
      directive,
      blockedUri,
      documentUri,
      originalPolicy: originalPolicy.substring(0, 500),
    });

    if (process.env.NODE_ENV === "development") {
      console.warn("[CSP Violation]", { directive, blockedUri, documentUri });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true }); // Always 200 for CSP reports
  }
}
