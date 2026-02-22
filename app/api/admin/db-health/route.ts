import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

const CRITICAL_TABLES = [
  "user",
  "team",
  "document",
  "dataroom",
  "fund",
  "investor",
  "transaction",
  "auditLog",
  "signatureDocument",
  "organization",
];

/**
 * GET /api/admin/db-health
 *
 * Dual-database health check. Compares primary (Supabase) and backup (Replit)
 * databases for connectivity, latency, and table count drift.
 */
export async function GET() {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  const primaryUrl =
    process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  const backupUrl = process.env.REPLIT_DATABASE_URL;
  const backupEnabled = process.env.BACKUP_DB_ENABLED !== "false";

  if (!primaryUrl) {
    return NextResponse.json(
      {
        error: "Primary database not configured",
        primaryStatus: "disconnected",
        backupStatus: "disconnected",
      },
      { status: 503 },
    );
  }

  if (!backupUrl || !backupEnabled) {
    // Primary-only mode
    let primaryStatus: "connected" | "disconnected" = "disconnected";
    let primaryLatencyMs = -1;
    try {
      const start = Date.now();
      await prisma.$queryRawUnsafe("SELECT 1");
      primaryLatencyMs = Date.now() - start;
      primaryStatus = "connected";
    } catch (err) {
      reportError(err as Error);
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      overallStatus: primaryStatus === "connected" ? "healthy" : "error",
      totalDrift: 0,
      primaryStatus,
      backupStatus: backupEnabled ? "not_configured" : "disabled",
      primaryLatencyMs,
      backupLatencyMs: -1,
      syncQueueDepth: 0,
      lastSyncTimestamp: null,
      tables: {},
    });
  }

  const primary = new PrismaClient({ datasourceUrl: primaryUrl });
  const backup = new PrismaClient({ datasourceUrl: backupUrl });

  let primaryStatus: "connected" | "disconnected" = "disconnected";
  let backupStatus: "connected" | "disconnected" = "disconnected";
  let primaryLatencyMs = -1;
  let backupLatencyMs = -1;

  try {
    const primaryStart = Date.now();
    try {
      await primary.$queryRawUnsafe("SELECT 1");
      primaryLatencyMs = Date.now() - primaryStart;
      primaryStatus = "connected";
    } catch (err) {
      reportError(err as Error);
    }

    const backupStart = Date.now();
    try {
      await backup.$queryRawUnsafe("SELECT 1");
      backupLatencyMs = Date.now() - backupStart;
      backupStatus = "connected";
    } catch (err) {
      reportError(err as Error);
    }

    if (primaryStatus === "disconnected" && backupStatus === "disconnected") {
      return NextResponse.json({
        timestamp: new Date().toISOString(),
        overallStatus: "error",
        totalDrift: -1,
        primaryStatus,
        backupStatus,
        primaryLatencyMs,
        backupLatencyMs,
        syncQueueDepth: 0,
        lastSyncTimestamp: null,
        tables: {},
      });
    }

    const results: Record<
      string,
      { primary: number; backup: number; drift: number; status: string }
    > = {};
    let totalDrift = 0;

    for (const tableName of CRITICAL_TABLES) {
      const primaryModel = (primary as any)[tableName];
      const backupModel = (backup as any)[tableName];

      if (!primaryModel || !backupModel) {
        results[tableName] = {
          primary: -1,
          backup: -1,
          drift: 0,
          status: "model_not_found",
        };
        continue;
      }

      try {
        const [primaryCount, backupCount] = await Promise.all([
          primaryStatus === "connected"
            ? primaryModel.count()
            : Promise.resolve(-1),
          backupStatus === "connected"
            ? backupModel.count()
            : Promise.resolve(-1),
        ]);

        const drift =
          primaryCount >= 0 && backupCount >= 0
            ? Math.abs(primaryCount - backupCount)
            : -1;
        if (drift > 0) totalDrift += drift;

        results[tableName] = {
          primary: primaryCount,
          backup: backupCount,
          drift,
          status:
            drift === 0 ? "in_sync" : drift > 0 ? "drifted" : "partial",
        };
      } catch (err) {
        reportError(err as Error);
        results[tableName] = {
          primary: -1,
          backup: -1,
          drift: -1,
          status: `error: ${err instanceof Error ? err.constructor.name : "unknown"}`,
        };
      }
    }

    let overallStatus: "healthy" | "degraded" | "error" = "healthy";
    if (primaryStatus === "disconnected" || backupStatus === "disconnected") {
      overallStatus = "degraded";
    } else if (totalDrift > 0) {
      overallStatus = "degraded";
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      overallStatus,
      totalDrift,
      primaryStatus,
      backupStatus,
      primaryLatencyMs,
      backupLatencyMs,
      syncQueueDepth: 0,
      lastSyncTimestamp: null,
      tables: results,
    });
  } finally {
    await primary.$disconnect();
    await backup.$disconnect();
  }
}
