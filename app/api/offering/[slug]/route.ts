import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

/**
 * GET /api/offering/[slug]
 * Public endpoint — returns offering page data for rendering.
 * No auth required (this is a public investor-facing page).
 * Rate limited via blanket middleware (200 req/min/IP).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    if (!slug || typeof slug !== "string") {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }

    const offering = await prisma.offeringPage.findUnique({
      where: { slug },
      include: {
        fund: {
          select: {
            id: true,
            name: true,
            description: true,
            targetRaise: true,
            minimumInvestment: true,
            currentRaise: true,
            status: true,
            closingDate: true,
            entityMode: true,
            fundSubType: true,
            regulationDExemption: true,
            managementFeePct: true,
            carryPct: true,
            hurdleRate: true,
            termYears: true,
            extensionYears: true,
            waterfallType: true,
            currency: true,
            instrumentType: true,
            teamId: true,
            aggregate: {
              select: {
                totalCommitted: true,
                totalInbound: true,
              },
            },
            investors: {
              select: { id: true },
            },
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            organization: {
              select: {
                name: true,
                logo: true,
                brandColor: true,
                accentColor: true,
                companyDescription: true,
                sector: true,
                geography: true,
                website: true,
                foundedYear: true,
                addressCity: true,
                addressState: true,
              },
            },
          },
        },
      },
    });

    if (!offering || !offering.isPublic) {
      return NextResponse.json({ error: "Offering not found" }, { status: 404 });
    }

    // Increment view count (fire-and-forget)
    prisma.offeringPage
      .update({
        where: { id: offering.id },
        data: { viewCount: { increment: 1 } },
      })
      .catch((e) => reportError(e as Error));

    // Build response — never expose internal IDs or sensitive fund data
    const response = {
      slug: offering.slug,
      fundId: offering.fund.id,
      teamId: offering.team.id,

      // Hero
      heroHeadline: offering.heroHeadline || offering.fund.name,
      heroSubheadline: offering.heroSubheadline || offering.fund.description,
      heroImageUrl: offering.heroImageUrl,
      heroBadgeText: offering.heroBadgeText,

      // Fund data (public-safe)
      fundName: offering.fund.name,
      fundStatus: offering.fund.status,
      targetRaise: offering.fund.targetRaise?.toString(),
      minimumInvestment: offering.fund.minimumInvestment?.toString(),
      currentRaise: offering.fund.currentRaise?.toString(),
      totalCommitted: offering.fund.aggregate?.totalCommitted?.toString() || "0",
      totalInbound: offering.fund.aggregate?.totalInbound?.toString() || "0",
      investorCount: offering.fund.investors?.length || 0,
      closingDate: offering.fund.closingDate,
      entityMode: offering.fund.entityMode,
      fundSubType: offering.fund.fundSubType,
      regulationDExemption: offering.fund.regulationDExemption,
      currency: offering.fund.currency,

      // Fund Economics (public-facing terms)
      managementFeePct: offering.fund.managementFeePct?.toString(),
      carryPct: offering.fund.carryPct?.toString(),
      hurdleRate: offering.fund.hurdleRate?.toString(),
      termYears: offering.fund.termYears,
      extensionYears: offering.fund.extensionYears,
      waterfallType: offering.fund.waterfallType,

      // Org/Team branding
      orgName: offering.team.organization?.name || offering.team.name,
      orgLogo: offering.team.organization?.logo,
      orgDescription: offering.team.organization?.companyDescription,
      orgSector: offering.team.organization?.sector,
      orgGeography: offering.team.organization?.geography,
      orgWebsite: offering.team.organization?.website,
      orgFoundedYear: offering.team.organization?.foundedYear,
      orgCity: offering.team.organization?.addressCity,
      orgState: offering.team.organization?.addressState,

      // GP-configured sections
      offeringDescription: offering.offeringDescription,
      keyMetrics: offering.keyMetrics,
      highlights: offering.highlights,
      dealTerms: offering.dealTerms,
      timeline: offering.timeline,
      leadership: offering.leadership,
      gallery: offering.gallery,
      dataroomDocuments: offering.dataroomDocuments,
      financialProjections: offering.financialProjections,
      advantages: offering.advantages,

      // CTA
      ctaText: offering.ctaText || "I Want to Invest",
      ctaSecondary: offering.ctaSecondary,
      emailGateEnabled: offering.emailGateEnabled,

      // Branding
      brandColor: offering.brandColor || offering.team.organization?.brandColor || "#0066FF",
      accentColor: offering.accentColor || offering.team.organization?.accentColor || "#0A1628",
      logoUrl: offering.logoUrl || offering.team.organization?.logo,
      customCss: offering.customCss,

      // Compliance
      disclaimerText: offering.disclaimerText,

      // Premium
      removeBranding: offering.removeBranding,

      // SEO
      metaTitle: offering.metaTitle || `${offering.fund.name} | Investment Offering`,
      metaDescription: offering.metaDescription || offering.fund.description,
      metaImageUrl: offering.metaImageUrl,
    };

    return NextResponse.json(response);
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching offering page:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
