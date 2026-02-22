/**
 * Investor Engagement Scoring System
 *
 * Calculates engagement scores for investors based on their
 * dataroom activity, document interactions, and platform usage.
 *
 * Scoring tiers:
 *   Hot (15+)  — Highly engaged, likely to invest
 *   Warm (5-14) — Moderately engaged, needs follow-up
 *   Cool (1-4)  — Low engagement, may need re-engagement
 */

import prisma from "@/lib/prisma";

export type EngagementTier = "HOT" | "WARM" | "COOL" | "NONE";

export interface EngagementScore {
  total: number;
  tier: EngagementTier;
  breakdown: {
    pageViews: number;
    uniquePages: number;
    dwellTimeMinutes: number;
    returnVisits: number;
    downloads: number;
    documentInteractions: number;
    ndaSigned: boolean;
    commitmentMade: boolean;
    proofUploaded: boolean;
  };
  lastActiveAt: Date | null;
}

// Scoring weights
const SCORE_WEIGHTS = {
  uniquePageView: 1,       // 1 point per unique page viewed
  dwellTime30s: 1,         // 1 point per 30 seconds of dwell time
  returnVisit: 3,          // 3 points per return visit
  download: 2,             // 2 points per document download
  ndaSigned: 5,            // 5 points for NDA signature
  commitmentMade: 10,      // 10 points for making a commitment
  proofUploaded: 5,        // 5 points for uploading wire proof
  documentInteraction: 1,  // 1 point per document interaction (view, sign)
} as const;

// Tier thresholds
const TIER_THRESHOLDS = {
  HOT: 15,
  WARM: 5,
  COOL: 1,
} as const;

function getTier(score: number): EngagementTier {
  if (score >= TIER_THRESHOLDS.HOT) return "HOT";
  if (score >= TIER_THRESHOLDS.WARM) return "WARM";
  if (score >= TIER_THRESHOLDS.COOL) return "COOL";
  return "NONE";
}

/**
 * Calculate engagement score for an investor across all their activity.
 */
export async function calculateEngagementScore(
  investorId: string,
): Promise<EngagementScore> {
  const investor = await prisma.investor.findUnique({
    where: { id: investorId },
    select: {
      userId: true,
      ndaSigned: true,
      investments: {
        select: {
          commitmentAmount: true,
          fundedAmount: true,
          status: true,
        },
      },
      lpDocuments: {
        select: { id: true, documentType: true, status: true },
      },
    },
  });

  if (!investor) {
    return {
      total: 0,
      tier: "NONE",
      breakdown: {
        pageViews: 0,
        uniquePages: 0,
        dwellTimeMinutes: 0,
        returnVisits: 0,
        downloads: 0,
        documentInteractions: 0,
        ndaSigned: false,
        commitmentMade: false,
        proofUploaded: false,
      },
      lastActiveAt: null,
    };
  }

  // Get viewer events for this user (page views, dwell time, etc.)
  const user = await prisma.user.findUnique({
    where: { id: investor.userId },
    select: { email: true },
  });

  let pageViews = 0;
  let uniquePages = 0;
  let dwellTimeMinutes = 0;
  let returnVisits = 0;
  let downloads = 0;
  let lastActiveAt: Date | null = null;

  if (user?.email) {
    // Count viewer sessions
    const viewers = await prisma.viewer.findMany({
      where: { email: user.email },
      select: {
        id: true,
        dataroomId: true,
        createdAt: true,
        views: {
          select: {
            id: true,
            viewedAt: true,
          },
          orderBy: { viewedAt: "desc" },
        },
      },
    });

    const sessionDates = new Set<string>();
    const viewedPages = new Set<string>();

    for (const viewer of viewers) {
      for (const view of viewer.views) {
        pageViews++;
        viewedPages.add(`${viewer.dataroomId}-${view.id}`);
        const dateKey = view.viewedAt.toISOString().split("T")[0];
        sessionDates.add(dateKey);

        if (!lastActiveAt || view.viewedAt > lastActiveAt) {
          lastActiveAt = view.viewedAt;
        }
      }
    }

    uniquePages = viewedPages.size;
    returnVisits = Math.max(0, sessionDates.size - 1);
  }

  // Document interactions
  const documentInteractions = investor.lpDocuments.length;

  // Milestones
  const ndaSigned = investor.ndaSigned;
  const commitmentMade = investor.investments.some(
    (inv) => Number(inv.commitmentAmount) > 0,
  );
  const proofUploaded = investor.lpDocuments.some(
    (doc) => doc.documentType === "WIRE_CONFIRMATION",
  );

  // Calculate total score
  let total = 0;
  total += uniquePages * SCORE_WEIGHTS.uniquePageView;
  total += Math.floor((dwellTimeMinutes * 60) / 30) * SCORE_WEIGHTS.dwellTime30s;
  total += returnVisits * SCORE_WEIGHTS.returnVisit;
  total += downloads * SCORE_WEIGHTS.download;
  total += documentInteractions * SCORE_WEIGHTS.documentInteraction;
  if (ndaSigned) total += SCORE_WEIGHTS.ndaSigned;
  if (commitmentMade) total += SCORE_WEIGHTS.commitmentMade;
  if (proofUploaded) total += SCORE_WEIGHTS.proofUploaded;

  return {
    total,
    tier: getTier(total),
    breakdown: {
      pageViews,
      uniquePages,
      dwellTimeMinutes,
      returnVisits,
      downloads,
      documentInteractions,
      ndaSigned,
      commitmentMade,
      proofUploaded,
    },
    lastActiveAt,
  };
}

/**
 * Calculate engagement scores for all investors in a fund.
 */
export async function calculateFundEngagementScores(
  fundId: string,
): Promise<Map<string, EngagementScore>> {
  const investors = await prisma.investor.findMany({
    where: { fundId },
    select: { id: true },
  });

  const scores = new Map<string, EngagementScore>();

  for (const investor of investors) {
    const score = await calculateEngagementScore(investor.id);
    scores.set(investor.id, score);
  }

  return scores;
}

/**
 * Get summary engagement stats for a fund.
 */
export async function getFundEngagementSummary(fundId: string): Promise<{
  total: number;
  hot: number;
  warm: number;
  cool: number;
  none: number;
  averageScore: number;
}> {
  const scores = await calculateFundEngagementScores(fundId);
  const values = Array.from(scores.values());

  const summary = {
    total: values.length,
    hot: values.filter((s) => s.tier === "HOT").length,
    warm: values.filter((s) => s.tier === "WARM").length,
    cool: values.filter((s) => s.tier === "COOL").length,
    none: values.filter((s) => s.tier === "NONE").length,
    averageScore:
      values.length > 0
        ? Math.round(values.reduce((sum, s) => sum + s.total, 0) / values.length)
        : 0,
  };

  return summary;
}

/**
 * Get the engagement tier badge config for display.
 */
export function getEngagementBadge(tier: EngagementTier): {
  label: string;
  color: string;
  bgColor: string;
  emoji: string;
} {
  switch (tier) {
    case "HOT":
      return {
        label: "Hot",
        color: "text-red-600",
        bgColor: "bg-red-100",
        emoji: "🔴",
      };
    case "WARM":
      return {
        label: "Warm",
        color: "text-amber-600",
        bgColor: "bg-amber-100",
        emoji: "🟡",
      };
    case "COOL":
      return {
        label: "Cool",
        color: "text-blue-600",
        bgColor: "bg-blue-100",
        emoji: "🔵",
      };
    case "NONE":
      return {
        label: "No Activity",
        color: "text-gray-400",
        bgColor: "bg-gray-100",
        emoji: "⚪",
      };
  }
}
