import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

/**
 * Shared auth check for pricing tiers endpoints.
 * Verifies session, fund existence, and admin team membership.
 */
async function verifyAccess(fundId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { teams: true },
  });

  if (!user) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
    include: { team: true },
  });

  if (!fund) {
    return { error: NextResponse.json({ error: "Fund not found" }, { status: 404 }) };
  }

  const teamMembership = user.teams.find((t) => t.teamId === fund.teamId);
  if (!teamMembership || !["ADMIN", "OWNER", "SUPER_ADMIN"].includes(teamMembership.role)) {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }

  return { fund, user };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fundId: string }> },
) {
  try {
    const { fundId } = await params;
    const access = await verifyAccess(fundId);
    if ("error" in access) return access.error;

    const tiers = await prisma.fundPricingTier.findMany({
      where: { fundId },
      orderBy: { tranche: "asc" },
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    });

    return NextResponse.json({
      tiers: tiers.map((t) => ({
        id: t.id,
        tranche: t.tranche,
        name: t.name || `Tier ${t.tranche}`,
        pricePerUnit: t.pricePerUnit.toString(),
        unitsAvailable: t.unitsAvailable,
        unitsTotal: t.unitsTotal,
        isActive: t.isActive,
        subscriptionCount: t._count.subscriptions,
        createdAt: t.createdAt.toISOString(),
      })),
      flatModeEnabled: access.fund.flatModeEnabled,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Error fetching pricing tiers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ fundId: string }> },
) {
  try {
    const { fundId } = await params;
    const access = await verifyAccess(fundId);
    if ("error" in access) return access.error;

    const { tranche, pricePerUnit, unitsTotal } = await req.json();

    if (!tranche || !pricePerUnit || !unitsTotal) {
      return NextResponse.json(
        { error: "Tranche, price per unit, and units total are required" },
        { status: 400 },
      );
    }

    const existing = await prisma.fundPricingTier.findUnique({
      where: { fundId_tranche: { fundId, tranche: parseInt(tranche) } },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Tier ${tranche} already exists for this fund` },
        { status: 400 },
      );
    }

    const tier = await prisma.fundPricingTier.create({
      data: {
        fundId,
        tranche: parseInt(tranche),
        pricePerUnit: parseFloat(pricePerUnit),
        unitsTotal: parseInt(unitsTotal),
        unitsAvailable: parseInt(unitsTotal),
        isActive: tranche === 1,
      },
    });

    return NextResponse.json(
      {
        tier: {
          id: tier.id,
          tranche: tier.tranche,
          pricePerUnit: tier.pricePerUnit.toString(),
          unitsAvailable: tier.unitsAvailable,
          unitsTotal: tier.unitsTotal,
          isActive: tier.isActive,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    reportError(error as Error);
    console.error("Error creating pricing tier:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ fundId: string }> },
) {
  try {
    const { fundId } = await params;
    const access = await verifyAccess(fundId);
    if ("error" in access) return access.error;

    const { flatModeEnabled } = await req.json();

    if (typeof flatModeEnabled !== "boolean") {
      return NextResponse.json(
        { error: "flatModeEnabled must be a boolean" },
        { status: 400 },
      );
    }

    await prisma.fund.update({
      where: { id: fundId },
      data: { flatModeEnabled },
    });

    return NextResponse.json({
      success: true,
      flatModeEnabled,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("Error updating flat mode:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ fundId: string }> },
) {
  try {
    const { fundId } = await params;
    const access = await verifyAccess(fundId);
    if ("error" in access) return access.error;

    const { tierId } = await req.json();

    if (!tierId) {
      return NextResponse.json(
        { error: "Tier ID required" },
        { status: 400 },
      );
    }

    const tier = await prisma.fundPricingTier.findUnique({
      where: { id: tierId },
      include: { _count: { select: { subscriptions: true } } },
    });

    if (!tier) {
      return NextResponse.json(
        { error: "Tier not found" },
        { status: 404 },
      );
    }

    if (tier._count.subscriptions > 0) {
      return NextResponse.json(
        { error: "Cannot delete tier with existing subscriptions" },
        { status: 400 },
      );
    }

    await prisma.fundPricingTier.delete({
      where: { id: tierId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    reportError(error as Error);
    console.error("Error deleting pricing tier:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
