/**
 * POST /api/cron/sequences — Process due sequence enrollments.
 *
 * Called by Vercel Cron or external scheduler.
 * Executes outreach steps for enrollments where nextStepAt <= now.
 * Protected by CRON_SECRET header check.
 */

import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/error";
import { processDueEnrollments } from "@/lib/outreach/sequence-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for batch processing

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.replace("Bearer ", "");

    if (cronSecret && bearerToken !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await processDueEnrollments(50);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Also support GET for Vercel Cron (which sends GET requests)
export async function GET(req: NextRequest) {
  return POST(req);
}
