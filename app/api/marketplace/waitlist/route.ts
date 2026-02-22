import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { publishServerEvent } from "@/lib/tracking/server-events";

export const dynamic = "force-dynamic";

/**
 * POST /api/marketplace/waitlist
 * Public (unauthenticated) marketplace waitlist signup.
 * Captures potential investors who want to be notified about marketplace listings.
 */

const waitlistSchema = z.object({
  email: z.string().trim().toLowerCase().email("Valid email required"),
  name: z.string().trim().max(200).optional(),
  investorType: z
    .enum([
      "INDIVIDUAL",
      "INSTITUTIONAL",
      "FAMILY_OFFICE",
      "RIA",
      "OTHER",
    ])
    .optional(),
  investmentPreferences: z
    .object({
      sectors: z.array(z.string()).optional(),
      geographies: z.array(z.string()).optional(),
      minInvestment: z.number().min(0).optional(),
      maxInvestment: z.number().min(0).optional(),
    })
    .optional(),
  source: z
    .enum(["WEBSITE", "REFERRAL", "EVENT", "SOCIAL", "OTHER"])
    .default("WEBSITE"),
  referralCode: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const parsed = waitlistSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request data" },
        { status: 400 },
      );
    }

    const { email, name, investorType, investmentPreferences, source, referralCode } =
      parsed.data;

    // Upsert to avoid duplicates
    await prisma.marketplaceWaitlist.upsert({
      where: { email },
      update: {
        name: name || undefined,
        source,
        ...(investorType ? { investorType } : {}),
        ...(investmentPreferences ? { investmentPreferences } : {}),
        ...(referralCode ? { referralCode } : {}),
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

    // Analytics event (fire-and-forget)
    publishServerEvent("marketplace_waitlist_signup", {
      source,
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({ message: "Successfully joined the waitlist" });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
