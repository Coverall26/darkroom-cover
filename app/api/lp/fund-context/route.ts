import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { requireFundroomActive } from "@/lib/auth/paywall";

export const dynamic = "force-dynamic";

/**
 * GET /api/lp/fund-context?teamId=xxx&fundId=yyy
 *
 * Public endpoint that returns limited fund/org context for LP onboarding.
 * Only returns non-sensitive data: org name, fund name, fund ID.
 * Used by the LP onboarding wizard when accessed from a dataroom link.
 */
export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");
  const fundId = searchParams.get("fundId");

  if (!teamId && !fundId) {
    return NextResponse.json(
      { error: "teamId or fundId is required" },
      { status: 400 },
    );
  }

  try {
    // If fundId is provided, resolve team from fund
    let team: { id: string; name: string; organization?: { name: string } | null };
    let activeFund: {
      id: string;
      name: string;
      minimumInvestment?: unknown;
      flatModeEnabled?: boolean;
      stagedCommitmentsEnabled?: boolean;
      targetRaise?: unknown;
      regulationDExemption?: string | null;
      featureFlags?: Record<string, unknown>;
    } | null = null;

    if (fundId) {
      const fund = await prisma.fund.findUnique({
        where: { id: fundId },
        select: {
          id: true,
          name: true,
          minimumInvestment: true,
          flatModeEnabled: true,
          stagedCommitmentsEnabled: true,
          targetRaise: true,
          regulationDExemption: true,
          featureFlags: true,
          team: {
            select: {
              id: true,
              name: true,
              organization: {
                select: { name: true },
              },
            },
          },
        },
      });

      if (!fund) {
        return NextResponse.json({ error: "Fund not found" }, { status: 404 });
      }

      // When both fundId and teamId are provided, verify the fund belongs to the team
      if (teamId && fund.team.id !== teamId) {
        return NextResponse.json(
          { error: "Fund does not belong to specified team" },
          { status: 400 },
        );
      }

      team = fund.team;
      const featureFlags = (fund.featureFlags as Record<string, unknown>) || {};
      activeFund = {
        id: fund.id,
        name: fund.name,
        minimumInvestment: fund.minimumInvestment,
        flatModeEnabled: fund.flatModeEnabled,
        stagedCommitmentsEnabled: fund.stagedCommitmentsEnabled,
        targetRaise: fund.targetRaise,
        regulationDExemption: fund.regulationDExemption,
        featureFlags,
      };
    } else {
      const teamWithFunds = await prisma.team.findUnique({
        where: { id: teamId as string },
        select: {
          id: true,
          name: true,
          organization: {
            select: {
              name: true,
            },
          },
          funds: {
            where: {
              status: { not: "CLOSED" },
            },
            select: {
              id: true,
              name: true,
              minimumInvestment: true,
              flatModeEnabled: true,
              stagedCommitmentsEnabled: true,
              targetRaise: true,
              regulationDExemption: true,
              featureFlags: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!teamWithFunds) {
        return NextResponse.json({ error: "Team not found" }, { status: 404 });
      }

      const { funds, ...teamData } = teamWithFunds;
      team = teamData;

      // If team has multiple active funds and no fundId was specified, require specificity
      if (funds.length > 1) {
        return NextResponse.json(
          {
            error: "Multiple active funds found. Please specify a fundId.",
            funds: funds.map((f) => ({ id: f.id, name: f.name })),
          },
          { status: 400 },
        );
      }

      const ff = (funds[0]?.featureFlags as Record<string, unknown>) || {};
      activeFund = funds[0]
        ? { ...funds[0], featureFlags: ff }
        : null;
    }

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Check if FundRoom features are active for this team/fund
    const fundroomActive = await requireFundroomActive(
      team.id,
      activeFund?.id || undefined,
    );

    // Extract LP visibility flags from fund featureFlags (default: all visible)
    const ff = activeFund?.featureFlags || {};
    const lpVisibility = {
      showCapitalCalls: ff.showCapitalCalls !== false,
      showDistributions: ff.showDistributions !== false,
      showNAV: ff.showNAV !== false,
      showDocuments: ff.showDocuments !== false,
      showTransactions: ff.showTransactions !== false,
      showReports: ff.showReports !== false,
    };

    return NextResponse.json({
      teamId: team.id,
      teamName: team.name,
      fundId: activeFund?.id || null,
      fundName: activeFund?.name || null,
      orgName: team.organization?.name || team.name,
      minimumInvestment: activeFund?.minimumInvestment
        ? parseFloat(String(activeFund.minimumInvestment))
        : null,
      maximumInvestment: activeFund?.targetRaise
        ? parseFloat(String(activeFund.targetRaise))
        : null,
      flatModeEnabled: activeFund?.flatModeEnabled ?? false,
      stagedCommitmentsEnabled: activeFund?.stagedCommitmentsEnabled ?? false,
      regulationDExemption: activeFund?.regulationDExemption || null,
      fundroomActive,
      lpVisibility,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
