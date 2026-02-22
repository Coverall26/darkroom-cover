"use client";

import type { PipelineStats } from "@/lib/marketplace/types";

interface PipelineStatsCardsProps {
  stats: PipelineStats;
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export function PipelineStatsCards({ stats }: PipelineStatsCardsProps) {
  const cards = [
    {
      label: "Total Deals",
      value: stats.totalDeals.toString(),
      sub: `${stats.byStage.FUNDED + stats.byStage.MONITORING + stats.byStage.EXIT} funded`,
    },
    {
      label: "Target Pipeline",
      value: formatCurrency(stats.totalTargetRaise),
      sub: `${formatCurrency(stats.totalCommitted)} committed`,
    },
    {
      label: "Conversion Rate",
      value: `${stats.conversionRate.toFixed(1)}%`,
      sub: `${stats.passRate.toFixed(1)}% pass rate`,
    },
    {
      label: "Active Deals",
      value: (
        stats.byStage.SCREENING +
        stats.byStage.DUE_DILIGENCE +
        stats.byStage.TERM_SHEET +
        stats.byStage.COMMITMENT +
        stats.byStage.CLOSING
      ).toString(),
      sub: `${stats.byStage.SOURCED} in sourcing`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
            {card.label}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
            {card.value}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
