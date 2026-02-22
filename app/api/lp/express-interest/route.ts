import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";

export const dynamic = "force-dynamic";

/**
 * Express Interest API
 *
 * POST /api/lp/express-interest
 *
 * Captures lead interest when no fund is configured ("Express Interest" button).
 * Stores in MarketplaceWaitlist or as a viewer record.
 */

const expressInterestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().optional(),
  dataroomSlug: z.string().optional(),
  teamId: z.string().optional(),
  referralCode: z.string().max(100).optional(),
  investorType: z.string().max(50).optional(),
  investmentPreferences: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const body = await req.json();
  const parsed = expressInterestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const {
    email,
    name,
    dataroomSlug,
    referralCode,
    investorType,
    investmentPreferences,
  } = parsed.data;

  // Determine source from context
  const source = dataroomSlug
    ? "WEBSITE"
    : referralCode
      ? "REFERRAL"
      : "DIRECT";

  try {
    // Store in MarketplaceWaitlist (upsert to avoid duplicates)
    await prisma.marketplaceWaitlist.upsert({
      where: { email },
      update: {
        name: name || undefined,
        source,
        ...(referralCode ? { referralCode } : {}),
        ...(investorType ? { investorType } : {}),
        ...(investmentPreferences ? { investmentPreferences } : {}),
      },
      create: {
        email,
        name: name || null,
        source,
        investorType: investorType || null,
        referralCode: referralCode || null,
        investmentPreferences: investmentPreferences || undefined,
      },
    });

    return NextResponse.json({ message: "Interest recorded" });
  } catch (error) {
    reportError(error as Error);
    console.error("[EXPRESS_INTEREST] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
