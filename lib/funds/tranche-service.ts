/**
 * Tranche Pricing Engine
 *
 * Enforces sequential tranche selling rules:
 * - Only one tranche active at a time
 * - No split-tranche purchases
 * - Auto-advance when a tranche sells out
 */

import prisma from "@/lib/prisma";

export interface ActiveTranche {
  id: string;
  tranche: number;
  name: string | null;
  pricePerUnit: number;
  unitsAvailable: number;
  unitsTotal: number;
  unitsSold: number;
}

export interface TrancheQuote {
  trancheId: string;
  trancheName: string;
  trancheNumber: number;
  pricePerUnit: number;
  units: number;
  totalAmount: number;
  unitsRemainingAfter: number;
}

/**
 * Get the current active tranche for a fund.
 * Only one tranche is active at a time (sequential selling).
 */
export async function getActiveTranche(
  fundId: string,
): Promise<ActiveTranche | null> {
  const tier = await prisma.fundPricingTier.findFirst({
    where: { fundId, isActive: true },
    orderBy: { tranche: "asc" },
  });

  if (!tier) return null;

  return {
    id: tier.id,
    tranche: tier.tranche,
    name: tier.name,
    pricePerUnit: parseFloat(tier.pricePerUnit.toString()),
    unitsAvailable: tier.unitsAvailable,
    unitsTotal: tier.unitsTotal,
    unitsSold: tier.unitsTotal - tier.unitsAvailable,
  };
}

/**
 * Get all tranches for a fund (for GP dashboard display).
 */
export async function getAllTranches(fundId: string) {
  return prisma.fundPricingTier.findMany({
    where: { fundId },
    orderBy: { tranche: "asc" },
  });
}

/**
 * Quote a purchase: validate units requested against current tranche.
 * Returns null if the purchase is invalid.
 */
export async function quotePurchase(
  fundId: string,
  unitsRequested: number,
): Promise<TrancheQuote | null> {
  const active = await getActiveTranche(fundId);
  if (!active) return null;

  // Cannot buy more than available in current tranche
  if (unitsRequested > active.unitsAvailable) return null;
  if (unitsRequested < 1) return null;

  return {
    trancheId: active.id,
    trancheName: active.name || `Tranche ${active.tranche}`,
    trancheNumber: active.tranche,
    pricePerUnit: active.pricePerUnit,
    units: unitsRequested,
    totalAmount: unitsRequested * active.pricePerUnit,
    unitsRemainingAfter: active.unitsAvailable - unitsRequested,
  };
}

/**
 * Execute a purchase: decrement units, auto-advance tranche if sold out.
 * MUST be called inside a Prisma transaction.
 */
export async function executePurchase(
  tx: any,
  fundId: string,
  trancheId: string,
  unitsPurchased: number,
) {
  // Decrement available units
  const updated = await tx.fundPricingTier.update({
    where: { id: trancheId },
    data: { unitsAvailable: { decrement: unitsPurchased } },
  });

  // If tranche is sold out, auto-advance
  if (updated.unitsAvailable <= 0) {
    // Deactivate current tranche
    await tx.fundPricingTier.update({
      where: { id: trancheId },
      data: { isActive: false },
    });

    // Activate next tranche
    const nextTranche = await tx.fundPricingTier.findFirst({
      where: {
        fundId,
        tranche: { gt: updated.tranche },
        isActive: false,
        unitsAvailable: { gt: 0 },
      },
      orderBy: { tranche: "asc" },
    });

    if (nextTranche) {
      await tx.fundPricingTier.update({
        where: { id: nextTranche.id },
        data: { isActive: true },
      });

      // Update fund minimum investment to new tranche price
      await tx.fund.update({
        where: { id: fundId },
        data: { minimumInvestment: nextTranche.pricePerUnit },
      });
    }
  }

  // Update fund currentRaise
  const allTiers = await tx.fundPricingTier.findMany({
    where: { fundId },
  });

  const totalRaised = allTiers.reduce((sum: number, t: any) => {
    const unitsSold = t.unitsTotal - t.unitsAvailable;
    return sum + unitsSold * parseFloat(t.pricePerUnit.toString());
  }, 0);

  await tx.fund.update({
    where: { id: fundId },
    data: { currentRaise: totalRaised },
  });

  return updated;
}

/**
 * Get fund progress summary (for dashboards).
 */
export async function getFundProgress(fundId: string) {
  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
    include: {
      pricingTiers: { orderBy: { tranche: "asc" } },
    },
  });

  if (!fund) return null;

  const tiers = fund.pricingTiers;
  const totalUnits = tiers.reduce((s, t) => s + t.unitsTotal, 0);
  const unitsSold = tiers.reduce(
    (s, t) => s + (t.unitsTotal - t.unitsAvailable),
    0,
  );
  const totalRaised = tiers.reduce((s, t) => {
    const sold = t.unitsTotal - t.unitsAvailable;
    return s + sold * parseFloat(t.pricePerUnit.toString());
  }, 0);

  const activeTier = tiers.find((t) => t.isActive);
  const target = parseFloat(fund.targetRaise.toString());

  return {
    fundName: fund.name,
    targetRaise: target,
    currentRaise: totalRaised,
    percentRaised: target > 0 ? (totalRaised / target) * 100 : 0,
    totalUnits,
    unitsSold,
    unitsAvailable: totalUnits - unitsSold,
    activeTranche: activeTier
      ? {
          number: activeTier.tranche,
          name: activeTier.name,
          pricePerUnit: parseFloat(activeTier.pricePerUnit.toString()),
          unitsAvailable: activeTier.unitsAvailable,
          unitsTotal: activeTier.unitsTotal,
        }
      : null,
    tranches: tiers.map((t) => ({
      number: t.tranche,
      name: t.name,
      pricePerUnit: parseFloat(t.pricePerUnit.toString()),
      unitsTotal: t.unitsTotal,
      unitsSold: t.unitsTotal - t.unitsAvailable,
      unitsAvailable: t.unitsAvailable,
      isActive: t.isActive,
      percentSold:
        t.unitsTotal > 0
          ? ((t.unitsTotal - t.unitsAvailable) / t.unitsTotal) * 100
          : 0,
    })),
  };
}
