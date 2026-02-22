import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/compliance-status
 *
 * Returns accreditation counts, Form D filing info, and bad actor
 * certification status for the authenticated admin's organization.
 */
export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const auth = await requireAdminAppRouter();
    if (auth instanceof NextResponse) return auth;

    const teamId = auth.teamId;

    // Fetch team + organization data for compliance status
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { organization: true },
    });

    const org = team?.organization;

    // Get the primary fund for this team
    const fund = await prisma.fund.findFirst({
      where: { teamId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        regulationDExemption: true,
        formDFilingDate: true,
        status: true,
      },
    });

    // Count accredited investors
    const totalInvestors = await prisma.investor.count({
      where: { fundId: fund?.id },
    });

    const accreditedInvestors = await prisma.investor.count({
      where: {
        fundId: fund?.id,
        accreditationStatus: {
          in: ["SELF_CERTIFIED", "THIRD_PARTY_VERIFIED", "KYC_VERIFIED"],
        },
      },
    });

    return NextResponse.json({
      badActorCertified: org?.badActorCertified || false,
      badActorCertifiedAt: org?.badActorCertifiedAt
        ? (org.badActorCertifiedAt as Date).toISOString()
        : null,
      regulationDExemption: fund?.regulationDExemption || null,
      formDFilingDate: fund?.formDFilingDate
        ? (fund.formDFilingDate as Date).toISOString()
        : null,
      accreditedInvestors,
      totalInvestors,
      fundId: fund?.id || null,
    });
  } catch (error: unknown) {
    console.error("Error fetching compliance status:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
