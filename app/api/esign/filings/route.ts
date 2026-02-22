/**
 * GET /api/esign/filings — List document filings with stats
 *
 * Query params:
 *   sourceType, destinationType, envelopeId, contactVaultId, page, pageSize
 *   stats=true — include filing stats summary
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import {
  getFilingHistory,
  getFilingStats,
} from "@/lib/esign/document-filing-service";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const blocked = await appRouterRateLimit(req);
    if (blocked) return blocked;

    const auth = await requireAuthAppRouter();
    if (auth instanceof NextResponse) return auth;

    const userTeam = await prisma.userTeam.findFirst({
      where: {
        user: { email: auth.email },
        status: "ACTIVE",
      },
      select: { teamId: true },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "No active team" }, { status: 403 });
    }

    const url = req.nextUrl;
    const sourceType = url.searchParams.get("sourceType") || undefined;
    const destinationType = url.searchParams.get("destinationType") || undefined;
    const envelopeId = url.searchParams.get("envelopeId") || undefined;
    const contactVaultId = url.searchParams.get("contactVaultId") || undefined;
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(url.searchParams.get("pageSize") || "20", 10);
    const includeStats = url.searchParams.get("stats") === "true";

    const filingResult = await getFilingHistory({
      teamId: userTeam.teamId,
      sourceType: sourceType as any,
      destinationType: destinationType as any,
      envelopeId,
      contactVaultId,
      page,
      pageSize,
    });

    // Serialize BigInt values
    const serializedFilings = filingResult.filings.map((f: any) => ({
      ...f,
      filedFileSize: f.filedFileSize ? Number(f.filedFileSize) : null,
    }));

    const response: any = {
      filings: serializedFilings,
      total: filingResult.total,
      page: filingResult.page,
      pageSize: filingResult.pageSize,
    };

    if (includeStats) {
      const stats = await getFilingStats(userTeam.teamId);
      response.stats = {
        totalFilings: stats.totalFilings,
        byDestination: stats.byDestination,
        bySource: stats.bySource,
        totalSizeBytes: Number(stats.totalSizeBytes),
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
