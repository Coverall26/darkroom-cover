"use client";

import type { DealStage, DealType } from "@prisma/client";
import { DealStageBadge } from "./deal-stage-badge";
import { DEAL_TYPE_CONFIG } from "@/lib/marketplace/types";

interface DealCardProps {
  deal: {
    id: string;
    title: string;
    targetName?: string | null;
    targetSector?: string | null;
    targetGeography?: string | null;
    dealType: DealType;
    stage: DealStage;
    targetRaise?: string | null;
    totalCommitted?: string | null;
    investorCount?: number;
    tags?: string[];
    closingDate?: string | null;
    deadlineAt?: string | null;
    _count?: { interests: number; allocations: number };
    fund?: { id: string; name: string } | null;
    createdByUser?: { name: string | null } | null;
  };
  onClick?: () => void;
}

function formatCurrency(value: string | number | null | undefined): string {
  if (!value) return "--";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

export function DealCard({ deal, onClick }: DealCardProps) {
  const targetRaise = formatCurrency(deal.targetRaise);
  const totalCommitted = formatCurrency(deal.totalCommitted);
  const commitmentPct =
    deal.targetRaise && deal.totalCommitted
      ? Math.min(
          100,
          (parseFloat(deal.totalCommitted) / parseFloat(deal.targetRaise)) *
            100,
        )
      : 0;

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-gray-900 group-hover:text-blue-600 dark:text-gray-100">
            {deal.title}
          </h3>
          {deal.targetName && (
            <p className="mt-0.5 truncate text-sm text-gray-500">
              {deal.targetName}
            </p>
          )}
        </div>
        <DealStageBadge stage={deal.stage} size="sm" />
      </div>

      {/* Metadata row */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs text-gray-500">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
          {DEAL_TYPE_CONFIG[deal.dealType].label}
        </span>
        {deal.targetSector && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
            {deal.targetSector}
          </span>
        )}
        {deal.targetGeography && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
            {deal.targetGeography}
          </span>
        )}
        {deal.fund && (
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600 dark:bg-blue-900/20">
            {deal.fund.name}
          </span>
        )}
      </div>

      {/* Financial summary */}
      <div className="mb-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs text-gray-400">Target</p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {targetRaise}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Committed</p>
          <p className="text-sm font-medium text-green-600">{totalCommitted}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Investors</p>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {deal.investorCount ?? deal._count?.interests ?? 0}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {deal.targetRaise && (
        <div className="mb-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${commitmentPct}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-gray-400">
            {commitmentPct.toFixed(0)}% committed
          </p>
        </div>
      )}

      {/* Tags */}
      {deal.tags && deal.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {deal.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800"
            >
              {tag}
            </span>
          ))}
          {deal.tags.length > 3 && (
            <span className="text-xs text-gray-400">
              +{deal.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
