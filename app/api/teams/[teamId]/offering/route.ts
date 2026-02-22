import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

/**
 * GET /api/teams/[teamId]/offering
 * Returns offering page(s) for the team's funds.
 * Auth: GP admin (OWNER/ADMIN/SUPER_ADMIN).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { teamId } = await params;

    const userTeam = await prisma.userTeam.findFirst({
      where: {
        teamId,
        user: { email: session.user.email },
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"] },
      },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const offerings = await prisma.offeringPage.findMany({
      where: { teamId },
      include: {
        fund: {
          select: { id: true, name: true, status: true, targetRaise: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ offerings });
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching offerings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/teams/[teamId]/offering
 * Create or update an offering page for a fund.
 * Auth: GP admin (OWNER/ADMIN/SUPER_ADMIN).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { teamId } = await params;

    const userTeam = await prisma.userTeam.findFirst({
      where: {
        teamId,
        user: { email: session.user.email },
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { fundId, ...offeringData } = body;

    if (!fundId) {
      return NextResponse.json({ error: "fundId is required" }, { status: 400 });
    }

    // Verify fund belongs to team
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    // Generate slug from fund name if not provided
    const slug =
      offeringData.slug ||
      fund.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    // Check slug uniqueness
    const existingSlug = await prisma.offeringPage.findUnique({
      where: { slug },
      select: { id: true, fundId: true },
    });

    if (existingSlug && existingSlug.fundId !== fundId) {
      return NextResponse.json(
        { error: "Slug already in use by another offering" },
        { status: 409 }
      );
    }

    // Upsert: create or update offering for this fund
    const offering = await prisma.offeringPage.upsert({
      where: existingSlug ? { slug } : { slug: `__nonexistent_${Date.now()}` },
      create: {
        fundId,
        teamId,
        slug,
        ...sanitizeOfferingData(offeringData),
      },
      update: {
        ...sanitizeOfferingData(offeringData),
      },
    });

    return NextResponse.json({ offering }, { status: existingSlug ? 200 : 201 });
  } catch (error) {
    reportError(error as Error);
    console.error("Error creating/updating offering:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/teams/[teamId]/offering
 * Update specific fields of an offering page.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { teamId } = await params;

    const userTeam = await prisma.userTeam.findFirst({
      where: {
        teamId,
        user: { email: session.user.email },
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { offeringId, ...updates } = body;

    if (!offeringId) {
      return NextResponse.json({ error: "offeringId is required" }, { status: 400 });
    }

    // Verify offering belongs to team
    const existing = await prisma.offeringPage.findFirst({
      where: { id: offeringId, teamId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Offering not found" }, { status: 404 });
    }

    const offering = await prisma.offeringPage.update({
      where: { id: offeringId },
      data: sanitizeOfferingData(updates),
    });

    return NextResponse.json({ offering });
  } catch (error) {
    reportError(error as Error);
    console.error("Error updating offering:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeOfferingData(data: Record<string, unknown>) {
  const allowed = [
    "isPublic",
    "heroHeadline",
    "heroSubheadline",
    "heroImageUrl",
    "heroBadgeText",
    "offeringDescription",
    "keyMetrics",
    "highlights",
    "dealTerms",
    "timeline",
    "leadership",
    "gallery",
    "dataroomDocuments",
    "financialProjections",
    "advantages",
    "ctaText",
    "ctaSecondary",
    "emailGateEnabled",
    "brandColor",
    "accentColor",
    "logoUrl",
    "customCss",
    "disclaimerText",
    "removeBranding",
    "metaTitle",
    "metaDescription",
    "metaImageUrl",
  ];

  const sanitized: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in data) {
      sanitized[key] = data[key];
    }
  }
  return sanitized;
}
