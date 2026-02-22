import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { CustomUser } from "@/lib/types";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

export interface FeeConfig {
  managementFee: {
    rate: number;
    frequency: "MONTHLY" | "QUARTERLY" | "ANNUALLY";
    calculationBasis: "COMMITTED" | "CALLED" | "NAV";
  };
  performanceFee: {
    carriedInterest: number;
    hurdleRate: number;
    catchUp: boolean;
    catchUpPercentage?: number;
  };
  organizationalFees: {
    amount: number;
    amortizePeriod?: number;
  };
  expenseRatio?: number;
  adminFee?: number;
}

export interface TierConfig {
  tiers: Array<{
    id: string;
    name: string;
    minInvestment: number;
    maxInvestment?: number;
    managementFeeDiscount?: number;
    performanceFeeDiscount?: number;
    benefits?: string[];
  }>;
  defaultTierId?: string;
}

/**
 * GET /api/admin/entities/[id]/config
 *
 * Get entity fee and tier configuration.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as CustomUser;

  // Inline GP role check (equivalent to getUserWithRole + requireRole(["GP"]))
  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: user.id,
      role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      status: "ACTIVE",
    },
  });

  if (!userTeam) {
    return NextResponse.json({ error: "GP access required" }, { status: 403 });
  }

  // Get all team IDs for this user
  const allTeams = await prisma.userTeam.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { teamId: true },
  });
  const teamIds = allTeams.map((t: { teamId: string }) => t.teamId);

  const entity = await prisma.entity.findUnique({
    where: { id },
    include: { team: true },
  });

  if (!entity || !teamIds.includes(entity.teamId)) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: entity.id,
    name: entity.name,
    mode: entity.mode,
    feeConfig: entity.feeConfig,
    tierConfig: entity.tierConfig,
    customSettings: entity.customSettings,
  });
}

/**
 * PUT /api/admin/entities/[id]/config
 *
 * Update entity fee and tier configuration.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as CustomUser;

  // Inline GP role check
  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: user.id,
      role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      status: "ACTIVE",
    },
  });

  if (!userTeam) {
    return NextResponse.json({ error: "GP access required" }, { status: 403 });
  }

  // Get all team IDs for this user
  const allTeams = await prisma.userTeam.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { teamId: true },
  });
  const teamIds = allTeams.map((t: { teamId: string }) => t.teamId);

  const entity = await prisma.entity.findUnique({
    where: { id },
    include: { team: true },
  });

  if (!entity || !teamIds.includes(entity.teamId)) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  try {
    const { feeConfig, tierConfig, customSettings } = await req.json();

    if (feeConfig) {
      validateFeeConfig(feeConfig);
    }

    if (tierConfig) {
      validateTierConfig(tierConfig);
    }

    const updated = await prisma.entity.update({
      where: { id },
      data: {
        feeConfig: feeConfig !== undefined ? feeConfig : entity.feeConfig,
        tierConfig: tierConfig !== undefined ? tierConfig : entity.tierConfig,
        customSettings: customSettings !== undefined ? customSettings : entity.customSettings,
      },
    });

    return NextResponse.json({
      success: true,
      entity: {
        id: updated.id,
        feeConfig: updated.feeConfig,
        tierConfig: updated.tierConfig,
        customSettings: updated.customSettings,
      },
    });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function validateFeeConfig(config: FeeConfig) {
  if (config.managementFee) {
    if (typeof config.managementFee.rate !== "number" || config.managementFee.rate < 0 || config.managementFee.rate > 100) {
      throw new Error("Management fee rate must be between 0 and 100");
    }
    if (!["MONTHLY", "QUARTERLY", "ANNUALLY"].includes(config.managementFee.frequency)) {
      throw new Error("Invalid management fee frequency");
    }
    if (!["COMMITTED", "CALLED", "NAV"].includes(config.managementFee.calculationBasis)) {
      throw new Error("Invalid management fee calculation basis");
    }
  }

  if (config.performanceFee) {
    if (typeof config.performanceFee.carriedInterest !== "number" || config.performanceFee.carriedInterest < 0 || config.performanceFee.carriedInterest > 100) {
      throw new Error("Carried interest must be between 0 and 100");
    }
    if (typeof config.performanceFee.hurdleRate !== "number" || config.performanceFee.hurdleRate < 0) {
      throw new Error("Hurdle rate must be non-negative");
    }
  }
}

function validateTierConfig(config: TierConfig) {
  if (!Array.isArray(config.tiers)) {
    throw new Error("Tiers must be an array");
  }

  for (const tier of config.tiers) {
    if (!tier.id || !tier.name) {
      throw new Error("Each tier must have an id and name");
    }
    if (typeof tier.minInvestment !== "number" || tier.minInvestment < 0) {
      throw new Error("Minimum investment must be non-negative");
    }
    if (tier.maxInvestment !== undefined && tier.maxInvestment <= tier.minInvestment) {
      throw new Error("Maximum investment must be greater than minimum");
    }
  }
}
