import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/notification-preferences
 * Returns the current user's notification preferences.
 * Creates default preferences if none exist (upsert pattern).
 *
 * PATCH /api/user/notification-preferences
 * Updates notification preferences. Only whitelisted boolean + enum fields accepted.
 * Supports emailDigestFrequency: REALTIME | DAILY | WEEKLY | NEVER
 */

const BOOLEAN_FIELDS = [
  "emailDocumentViewed",
  "emailSignatureComplete",
  "emailCapitalCall",
  "emailDistribution",
  "emailNewDocument",
  "emailWeeklyDigest",
  "pushDocumentViewed",
  "pushSignatureComplete",
  "pushCapitalCall",
  "pushDistribution",
  "pushNewDocument",
] as const;

const VALID_DIGEST_FREQUENCIES = ["REALTIME", "DAILY", "WEEKLY", "NEVER"] as const;

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const userId = auth.userId;

    // Upsert: return existing or create defaults
    const preferences = await prisma.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    return NextResponse.json(preferences);
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const userId = auth.userId;
    const body = await req.json();

    // Build update data from whitelisted boolean fields
    const updateData: Record<string, boolean | string> = {};

    for (const field of BOOLEAN_FIELDS) {
      if (typeof body[field] === "boolean") {
        updateData[field] = body[field];
      }
    }

    // Handle emailDigestFrequency enum
    if (
      body.emailDigestFrequency &&
      VALID_DIGEST_FREQUENCIES.includes(body.emailDigestFrequency)
    ) {
      updateData.emailDigestFrequency = body.emailDigestFrequency;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const preferences = await prisma.notificationPreference.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        ...updateData,
      },
    });

    return NextResponse.json(preferences);
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
