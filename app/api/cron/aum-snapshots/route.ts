/**
 * AUM Snapshot Cron Job
 *
 * POST /api/cron/aum-snapshots
 *
 * Scheduled daily. Processes all active funds based on their
 * configured aumCalculationFrequency (DAILY, WEEKLY, MONTHLY, ANNUAL).
 *
 * - DAILY funds: processed every day
 * - WEEKLY funds: processed on Mondays
 * - MONTHLY funds: processed on the 1st of each month
 * - ANNUAL funds: processed on January 1st
 */

import { NextResponse } from "next/server";
import { receiver } from "@/lib/cron";
import { reportError } from "@/lib/error";
import { runScheduledAumCalculations } from "@/lib/funds/aum-calculator";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.json();

  // Verify QStash signature in production
  if (process.env.VERCEL === "1") {
    if (!receiver) {
      return new Response("Receiver not configured", { status: 500 });
    }
    const isValid = await receiver.verify({
      signature: req.headers.get("Upstash-Signature") || "",
      body: JSON.stringify(body),
    });
    if (!isValid) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const result = await runScheduledAumCalculations();

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      results: result.results,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    reportError(error as Error);
    console.error("AUM snapshot cron error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
