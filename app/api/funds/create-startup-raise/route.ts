import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { startupRaiseSchema } from "@/lib/validations/startup-raise-types";

export const dynamic = "force-dynamic";

/**
 * POST /api/funds/create-startup-raise
 * Creates a Fund record for a startup raise (SAFE, Convertible Note, Priced Equity, SPV).
 * Stores instrument-specific terms in featureFlags JSON field.
 * Requires session + ADMIN/OWNER/SUPER_ADMIN role on the team.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { teamId, ...raiseData } = body;

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId is required" },
        { status: 400 },
      );
    }

    // Validate the raise data against the Zod schema
    const parsed = startupRaiseSchema.safeParse(raiseData);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || "Invalid raise data" },
        { status: 400 },
      );
    }

    const validData = parsed.data;

    // Verify team membership with admin role
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        users: {
          some: {
            userId: auth.userId,
            role: { in: ["ADMIN", "OWNER", "SUPER_ADMIN"] },
          },
        },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: "Team not found or insufficient permissions" },
        { status: 403 },
      );
    }

    // Build fund data based on instrument type
    let fundName: string;
    let targetRaise: number;
    let minimumInvestment: number;
    const featureFlags: Record<string, unknown> = {
      instrumentType: validData.instrumentType,
    };

    if (validData.instrumentType === "SAFE") {
      fundName = validData.roundName;
      targetRaise = validData.targetRaise;
      minimumInvestment = validData.minimumInvestment;
      featureFlags.valuationCap = validData.valuationCap ?? null;
      featureFlags.discountRate = validData.discountRate ?? null;
      featureFlags.postMoney = validData.postMoney;
      featureFlags.mfn = validData.mfn;
      featureFlags.proRataRights = validData.proRataRights;
      featureFlags.sideLetterAllowance = validData.sideLetterAllowance;
    } else if (validData.instrumentType === "CONVERTIBLE_NOTE") {
      fundName = validData.roundName;
      targetRaise = validData.targetRaise;
      minimumInvestment = validData.minimumInvestment;
      featureFlags.valuationCap = validData.valuationCap ?? null;
      featureFlags.discountRate = validData.discountRate ?? null;
      featureFlags.postMoney = validData.postMoney;
      featureFlags.mfn = validData.mfn;
      featureFlags.proRataRights = validData.proRataRights;
      featureFlags.sideLetterAllowance = validData.sideLetterAllowance;
      featureFlags.interestRate = validData.interestRate ?? null;
      featureFlags.maturityDate = validData.maturityDate ?? null;
      featureFlags.qualifiedFinancingThreshold =
        validData.qualifiedFinancingThreshold ?? null;
      featureFlags.autoConvertAtMaturity = validData.autoConvertAtMaturity;
      featureFlags.maturityExtensionOption = validData.maturityExtensionOption;
    } else if (validData.instrumentType === "PRICED_EQUITY") {
      fundName =
        validData.roundName === "Custom"
          ? (validData.customRoundName || "Custom Round")
          : validData.roundName;
      targetRaise = validData.targetRaise;
      minimumInvestment = 0; // Priced rounds don't have a standard min — use share price
      featureFlags.roundType = validData.roundName;
      featureFlags.customRoundName = validData.customRoundName ?? null;
      featureFlags.preMoneyValuation = validData.preMoneyValuation;
      featureFlags.pricePerShare = validData.pricePerShare ?? null;
      featureFlags.sharesAuthorized = validData.sharesAuthorized ?? null;
      featureFlags.optionPoolPct = validData.optionPoolPct;
      featureFlags.liquidationPreference = validData.liquidationPreference;
      featureFlags.antiDilution = validData.antiDilution;
      featureFlags.boardSeats = validData.boardSeats ?? null;
      featureFlags.protectiveProvisions = validData.protectiveProvisions;
      featureFlags.informationRights = validData.informationRights;
      featureFlags.rofrCoSale = validData.rofrCoSale;
      featureFlags.dragAlong = validData.dragAlong;
    } else {
      // SPV
      fundName = validData.spvName;
      targetRaise = validData.allocationAmount;
      minimumInvestment = validData.minimumLpInvestment;
      featureFlags.targetCompanyName = validData.targetCompanyName;
      featureFlags.dealDescription = validData.dealDescription ?? null;
      featureFlags.maxInvestors = validData.maxInvestors;
      featureFlags.spvTerm = validData.spvTerm;
    }

    // Create the fund + aggregate in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const fund = await tx.fund.create({
        data: {
          teamId,
          name: fundName,
          entityMode: "STARTUP",
          fundSubType: validData.instrumentType,
          targetRaise,
          minimumInvestment,
          currency: "USD",
          status: "RAISING",
          featureFlags,
          // SPV-specific economics
          ...(validData.instrumentType === "SPV"
            ? {
                managementFeePct:
                  validData.managementFeePct != null
                    ? validData.managementFeePct / 100
                    : null,
                carryPct:
                  validData.carryPct != null
                    ? validData.carryPct / 100
                    : null,
                gpCommitmentAmount: validData.gpCommitmentAmount ?? null,
              }
            : {}),
          createdBy: auth.userId,
          audit: [
            {
              timestamp: new Date().toISOString(),
              userId: auth.userId,
              action: "STARTUP_RAISE_CREATED",
              details: {
                instrumentType: validData.instrumentType,
                fundName,
                targetRaise,
                minimumInvestment,
              },
            },
          ],
        },
      });

      await tx.fundAggregate.create({
        data: {
          fundId: fund.id,
          totalInbound: 0,
          totalOutbound: 0,
          totalCommitted: 0,
          audit: [
            {
              timestamp: new Date().toISOString(),
              action: "AGGREGATE_CREATED",
              fundId: fund.id,
            },
          ],
        },
      });

      return fund;
    });

    // Audit log
    await logAuditEvent({
      eventType: "FUND_CREATED",
      resourceType: "Fund",
      resourceId: result.id,
      userId: auth.userId,
      metadata: {
        instrumentType: validData.instrumentType,
        fundName,
        targetRaise,
        entityMode: "STARTUP",
      },
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({
      success: true,
      fund: { id: result.id, name: result.name },
    });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Startup raise creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
