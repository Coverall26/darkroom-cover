import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { calculateProfileCompleteness } from "@/lib/marketplace/profile-completeness";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

/**
 * GET /api/admin/profile-completeness
 * Returns the organization's profile completeness score and breakdown.
 * Used by GP dashboard and marketplace listing quality gate.
 */
export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const auth = await requireAdminAppRouter();
    if (auth instanceof NextResponse) return auth;

    // Fetch team with organization, brand, and funds
    const team = await prisma.team.findUnique({
      where: { id: auth.teamId },
      include: {
        organization: {
          include: {
            defaults: true,
          },
        },
        brand: true,
        funds: {
          where: { status: { not: "CLOSED" } },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!team) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const org = team.organization;
    const fund = team.funds[0] || null;

    const result = calculateProfileCompleteness({
      organization: {
        name: org?.name ?? null,
        entityType: org?.entityType ?? null,
        ein: org?.ein ?? null,
        phone: org?.phone ?? null,
        addressLine1: org?.addressLine1 ?? null,
        addressCity: org?.addressCity ?? null,
        addressState: org?.addressState ?? null,
        addressZip: org?.addressZip ?? null,
        addressCountry: org?.addressCountry ?? null,
        companyDescription: org?.companyDescription ?? null,
        sector: org?.sector ?? null,
        geography: org?.geography ?? null,
        website: org?.website ?? null,
        foundedYear: org?.foundedYear ?? null,
        regulationDExemption: org?.regulationDExemption ?? null,
        productMode: org?.productMode ?? null,
      },
      brand: team.brand
        ? {
            logo: team.brand.logo,
            brandColor: team.brand.brandColor,
            accentColor: team.brand.accentColor,
          }
        : null,
      fund: fund
        ? {
            name: fund.name,
            targetRaise: fund.targetRaise?.toString() ?? null,
            fundType: fund.fundStrategy,
            waterfallType: fund.waterfallType,
            managementFeePct: fund.managementFeePct?.toString() ?? null,
            carryPct: fund.carryPct?.toString() ?? null,
            marketplaceInterest: fund.marketplaceInterest,
            marketplaceDescription: fund.marketplaceDescription,
            marketplaceCategory: fund.marketplaceCategory,
          }
        : null,
      orgDefaults: org?.defaults
        ? {
            accreditationMethod: org.defaults.accreditationMethod,
            allowExternalDocUpload: org.defaults.allowExternalDocUpload,
          }
        : null,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Profile completeness error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
