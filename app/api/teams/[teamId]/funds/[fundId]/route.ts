/**
 * Fund Detail API
 *
 * GET   /api/teams/[teamId]/funds/[fundId] — Get fund details
 * PATCH /api/teams/[teamId]/funds/[fundId] — Update fund terms
 *
 * ADMIN, OWNER, and SUPER_ADMIN roles only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";


export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string; fundId: string }>;
};

const VALID_ROLES: Role[] = ["ADMIN", "OWNER", "SUPER_ADMIN"];
const VALID_WATERFALL_TYPES = ["EUROPEAN", "AMERICAN", "DEAL_BY_DEAL"];
const VALID_PREFERRED_RETURN = ["COMPOUNDED", "SIMPLE"];

async function authorizeGP(teamId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }

  const membership = await prisma.userTeam.findFirst({
    where: {
      userId: session.user.id,
      teamId,
      role: { in: VALID_ROLES },
    },
  });

  if (!membership) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
  }

  return { error: null, session };
}

/**
 * GET /api/teams/[teamId]/funds/[fundId]
 * Returns full fund details including economics, wire instructions, and marketplace config.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId, fundId } = await params;
    const auth = await authorizeGP(teamId);
    if (auth.error) return auth.error;

    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: {
        id: true,
        name: true,
        description: true,
        entityMode: true,
        fundSubType: true,
        targetRaise: true,
        minimumInvestment: true,
        currentRaise: true,
        currency: true,
        status: true,
        managementFeePct: true,
        carryPct: true,
        hurdleRate: true,
        waterfallType: true,
        termYears: true,
        extensionYears: true,
        highWaterMark: true,
        gpCommitmentAmount: true,
        gpCommitmentPct: true,
        recyclingEnabled: true,
        keyPersonEnabled: true,
        keyPersonName: true,
        noFaultDivorceThreshold: true,
        investmentPeriodYears: true,
        preferredReturnMethod: true,
        clawbackProvision: true,
        mgmtFeeOffsetPct: true,
        regulationDExemption: true,
        marketplaceInterest: true,
        marketplaceDescription: true,
        marketplaceCategory: true,
        wireInstructions: true,
        featureFlags: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    // Convert Decimal fields to numbers for JSON serialization
    return NextResponse.json({
      ...fund,
      targetRaise: fund.targetRaise?.toNumber(),
      minimumInvestment: fund.minimumInvestment?.toNumber(),
      currentRaise: fund.currentRaise?.toNumber(),
      managementFeePct: fund.managementFeePct ? fund.managementFeePct.toNumber() * 100 : null,
      carryPct: fund.carryPct ? fund.carryPct.toNumber() * 100 : null,
      hurdleRate: fund.hurdleRate ? fund.hurdleRate.toNumber() * 100 : null,
      gpCommitmentAmount: fund.gpCommitmentAmount?.toNumber() ?? null,
      gpCommitmentPct: fund.gpCommitmentPct ? fund.gpCommitmentPct.toNumber() * 100 : null,
      noFaultDivorceThreshold: fund.noFaultDivorceThreshold?.toNumber() ?? null,
      mgmtFeeOffsetPct: fund.mgmtFeeOffsetPct?.toNumber() ?? null,
    });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Error fetching fund:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/teams/[teamId]/funds/[fundId]
 * Update fund terms (economics, structure, advanced provisions, marketplace, wire).
 * All fields are optional — only provided fields are updated.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { teamId, fundId } = await params;
    const auth = await authorizeGP(teamId);
    if (auth.error) return auth.error;

    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const body = await req.json();
    const updateData: Record<string, unknown> = {};
    const previousValues: Record<string, unknown> = {};

    // Fund name
    if (body.fundName !== undefined) {
      if (typeof body.fundName !== "string" || body.fundName.length === 0 || body.fundName.length > 200) {
        return NextResponse.json({ error: "Fund name must be 1-200 characters" }, { status: 400 });
      }
      previousValues.name = fund.name;
      updateData.name = body.fundName;
    }

    // Fund sub-type
    if (body.fundSubType !== undefined) {
      const validSubTypes = [
        "VENTURE_CAPITAL", "PRIVATE_EQUITY", "REAL_ESTATE", "HEDGE_FUND",
        "SPV_COINVEST", "SEARCH_FUND", "FUND_OF_FUNDS", "CUSTOM",
      ];
      if (body.fundSubType && !validSubTypes.includes(body.fundSubType)) {
        return NextResponse.json({ error: "Invalid fund sub-type" }, { status: 400 });
      }
      previousValues.fundSubType = fund.fundSubType;
      updateData.fundSubType = body.fundSubType || null;
    }

    // Target raise
    if (body.targetRaise !== undefined) {
      const val = parseFloat(body.targetRaise);
      if (isNaN(val) || val <= 0 || val > 100_000_000_000) {
        return NextResponse.json({ error: "Target raise must be positive and at most $100B" }, { status: 400 });
      }
      previousValues.targetRaise = fund.targetRaise?.toNumber();
      updateData.targetRaise = val;
    }

    // Currency
    if (body.currency !== undefined) {
      previousValues.currency = fund.currency;
      updateData.currency = body.currency || "USD";
    }

    // Minimum commitment
    if (body.minimumCommitment !== undefined) {
      const val = parseFloat(body.minimumCommitment);
      if (body.minimumCommitment && (isNaN(val) || val < 0 || val > 100_000_000_000)) {
        return NextResponse.json({ error: "Minimum commitment must be non-negative and at most $100B" }, { status: 400 });
      }
      previousValues.minimumInvestment = fund.minimumInvestment?.toNumber();
      updateData.minimumInvestment = body.minimumCommitment ? val : null;
    }

    // Management fee %
    if (body.managementFeePct !== undefined) {
      const val = parseFloat(body.managementFeePct);
      if (body.managementFeePct && (isNaN(val) || val < 0 || val > 10)) {
        return NextResponse.json({ error: "Management fee must be between 0% and 10%" }, { status: 400 });
      }
      previousValues.managementFeePct = fund.managementFeePct ? Number(fund.managementFeePct) * 100 : null;
      updateData.managementFeePct = body.managementFeePct ? val / 100 : null;
    }

    // Carry %
    if (body.carryPct !== undefined) {
      const val = parseFloat(body.carryPct);
      if (body.carryPct && (isNaN(val) || val < 0 || val > 50)) {
        return NextResponse.json({ error: "Carried interest must be between 0% and 50%" }, { status: 400 });
      }
      previousValues.carryPct = fund.carryPct ? Number(fund.carryPct) * 100 : null;
      updateData.carryPct = body.carryPct ? val / 100 : null;
    }

    // Term years
    if (body.termYears !== undefined) {
      const val = parseInt(body.termYears);
      if (body.termYears && (isNaN(val) || val < 1 || val > 40)) {
        return NextResponse.json({ error: "Fund term must be between 1 and 40 years" }, { status: 400 });
      }
      previousValues.termYears = fund.termYears;
      updateData.termYears = body.termYears ? val : null;
    }

    // Extension years
    if (body.extensionYears !== undefined) {
      const val = parseInt(body.extensionYears);
      if (body.extensionYears && (isNaN(val) || val < 0 || val > 10)) {
        return NextResponse.json({ error: "Extension must be between 0 and 10 years" }, { status: 400 });
      }
      previousValues.extensionYears = fund.extensionYears;
      updateData.extensionYears = body.extensionYears ? val : null;
    }

    // Waterfall type
    if (body.waterfallType !== undefined) {
      if (body.waterfallType && !VALID_WATERFALL_TYPES.includes(body.waterfallType)) {
        return NextResponse.json({ error: "Invalid waterfall type" }, { status: 400 });
      }
      previousValues.waterfallType = fund.waterfallType;
      updateData.waterfallType = body.waterfallType || null;
    }

    // Hurdle rate %
    if (body.hurdleRate !== undefined) {
      const val = parseFloat(body.hurdleRate);
      if (body.hurdleRate && (isNaN(val) || val < 0 || val > 30)) {
        return NextResponse.json({ error: "Hurdle rate must be between 0% and 30%" }, { status: 400 });
      }
      previousValues.hurdleRate = fund.hurdleRate ? Number(fund.hurdleRate) * 100 : null;
      updateData.hurdleRate = body.hurdleRate ? val / 100 : null;
    }

    // High-water mark
    if (body.highWaterMark !== undefined) {
      previousValues.highWaterMark = fund.highWaterMark;
      updateData.highWaterMark = Boolean(body.highWaterMark);
    }

    // GP commitment amount
    if (body.gpCommitmentAmount !== undefined) {
      const val = parseFloat(body.gpCommitmentAmount);
      if (body.gpCommitmentAmount && (isNaN(val) || val < 0 || val > 100_000_000_000)) {
        return NextResponse.json({ error: "GP commitment must be non-negative and at most $100B" }, { status: 400 });
      }
      previousValues.gpCommitmentAmount = fund.gpCommitmentAmount?.toNumber() ?? null;
      updateData.gpCommitmentAmount = body.gpCommitmentAmount ? val : null;
    }

    // GP commitment %
    if (body.gpCommitmentPct !== undefined) {
      const val = parseFloat(body.gpCommitmentPct);
      if (body.gpCommitmentPct && (isNaN(val) || val < 0 || val > 100)) {
        return NextResponse.json({ error: "GP commitment % must be between 0% and 100%" }, { status: 400 });
      }
      previousValues.gpCommitmentPct = fund.gpCommitmentPct ? Number(fund.gpCommitmentPct) * 100 : null;
      updateData.gpCommitmentPct = body.gpCommitmentPct ? val / 100 : null;
    }

    // Advanced provisions
    if (body.recyclingEnabled !== undefined) {
      previousValues.recyclingEnabled = fund.recyclingEnabled;
      updateData.recyclingEnabled = Boolean(body.recyclingEnabled);
    }

    if (body.keyPersonEnabled !== undefined) {
      previousValues.keyPersonEnabled = fund.keyPersonEnabled;
      updateData.keyPersonEnabled = Boolean(body.keyPersonEnabled);
    }

    if (body.keyPersonName !== undefined) {
      previousValues.keyPersonName = fund.keyPersonName;
      updateData.keyPersonName = body.keyPersonName || null;
    }

    if (body.noFaultDivorceThreshold !== undefined) {
      const val = parseFloat(body.noFaultDivorceThreshold);
      if (body.noFaultDivorceThreshold && (isNaN(val) || val < 0 || val > 100)) {
        return NextResponse.json({ error: "No-fault divorce threshold must be between 0% and 100%" }, { status: 400 });
      }
      previousValues.noFaultDivorceThreshold = fund.noFaultDivorceThreshold?.toNumber() ?? null;
      updateData.noFaultDivorceThreshold = body.noFaultDivorceThreshold ? val : null;
    }

    if (body.investmentPeriodYears !== undefined) {
      const val = parseInt(body.investmentPeriodYears);
      if (body.investmentPeriodYears && (isNaN(val) || val < 1 || val > 20)) {
        return NextResponse.json({ error: "Investment period must be between 1 and 20 years" }, { status: 400 });
      }
      previousValues.investmentPeriodYears = fund.investmentPeriodYears;
      updateData.investmentPeriodYears = body.investmentPeriodYears ? val : null;
    }

    if (body.preferredReturnMethod !== undefined) {
      if (body.preferredReturnMethod && !VALID_PREFERRED_RETURN.includes(body.preferredReturnMethod)) {
        return NextResponse.json({ error: "Invalid preferred return method" }, { status: 400 });
      }
      previousValues.preferredReturnMethod = fund.preferredReturnMethod;
      updateData.preferredReturnMethod = body.preferredReturnMethod || "COMPOUNDED";
    }

    if (body.clawbackProvision !== undefined) {
      previousValues.clawbackProvision = fund.clawbackProvision;
      updateData.clawbackProvision = Boolean(body.clawbackProvision);
    }

    if (body.mgmtFeeOffsetPct !== undefined) {
      const val = parseFloat(body.mgmtFeeOffsetPct);
      if (body.mgmtFeeOffsetPct && (isNaN(val) || val < 0 || val > 100)) {
        return NextResponse.json({ error: "Management fee offset must be between 0% and 100%" }, { status: 400 });
      }
      previousValues.mgmtFeeOffsetPct = fund.mgmtFeeOffsetPct?.toNumber() ?? null;
      updateData.mgmtFeeOffsetPct = body.mgmtFeeOffsetPct ? val : null;
    }

    // Regulation D
    if (body.regulationDExemption !== undefined) {
      if (body.regulationDExemption && !["506B", "506C"].includes(body.regulationDExemption)) {
        return NextResponse.json({ error: "Invalid Regulation D exemption" }, { status: 400 });
      }
      previousValues.regulationDExemption = fund.regulationDExemption;
      updateData.regulationDExemption = body.regulationDExemption || null;
    }

    // Marketplace
    if (body.marketplaceInterest !== undefined) {
      previousValues.marketplaceInterest = fund.marketplaceInterest;
      updateData.marketplaceInterest = Boolean(body.marketplaceInterest);
      if (body.marketplaceInterest && !fund.marketplaceInterest) {
        updateData.marketplaceInterestDate = new Date();
      }
    }

    if (body.marketplaceDescription !== undefined) {
      previousValues.marketplaceDescription = fund.marketplaceDescription;
      updateData.marketplaceDescription = body.marketplaceDescription?.slice(0, 280) || null;
    }

    if (body.marketplaceCategory !== undefined) {
      previousValues.marketplaceCategory = fund.marketplaceCategory;
      updateData.marketplaceCategory = body.marketplaceCategory || null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true, message: "No changes" });
    }

    await prisma.fund.update({
      where: { id: fundId },
      data: updateData,
    });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "";

    await logAuditEvent({
      eventType: "FUND_SETTINGS_UPDATE",
      userId: auth.session!.user!.id,
      teamId,
      resourceType: "Fund",
      resourceId: fundId,
      ipAddress: ip,
      userAgent: req.headers.get("user-agent") || "",
      metadata: { previousValues, newValues: updateData },
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Error updating fund:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
