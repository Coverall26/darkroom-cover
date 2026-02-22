"use client";

import type { DealStage, DealType, DealVisibility } from "@prisma/client";
import { DealStageBadge } from "./deal-stage-badge";
import {
  DEAL_TYPE_CONFIG,
  DEAL_VISIBILITY_CONFIG,
} from "@/lib/marketplace/types";

interface DealDetailHeaderProps {
  deal: {
    title: string;
    targetName?: string | null;
    description?: string | null;
    thesis?: string | null;
    dealType: DealType;
    stage: DealStage;
    visibility: DealVisibility;
    targetRaise?: string | null;
    totalCommitted?: string | null;
    totalAllocated?: string | null;
    investorCount: number;
    targetSector?: string | null;
    targetGeography?: string | null;
    expectedReturn?: string | null;
    holdPeriod?: string | null;
    managementFee?: string | null;
    carriedInterest?: string | null;
    preferredReturn?: string | null;
    leadSponsor?: string | null;
    isLeadDeal: boolean;
    closingDate?: string | null;
    deadlineAt?: string | null;
    riskScore?: number | null;
    fund?: { id: string; name: string } | null;
    createdByUser?: { name: string | null } | null;
  };
}

function formatCurrency(value: string | number | null | undefined): string {
  if (!value) return "--";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

function formatPercent(value: string | number | null | undefined): string {
  if (!value) return "--";
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `${(num * 100).toFixed(1)}%`;
}

export function DealDetailHeader({ deal }: DealDetailHeaderProps) {
  const commitmentPct =
    deal.targetRaise && deal.totalCommitted
      ? Math.min(
          100,
          (parseFloat(deal.totalCommitted) / parseFloat(deal.targetRaise)) *
            100,
        )
      : 0;

  return (
    <div>
      {/* Title section */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {deal.title}
          </h1>
          {deal.targetName && (
            <p className="mt-1 text-lg text-gray-500">{deal.targetName}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <DealStageBadge stage={deal.stage} />
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-sm text-gray-600 dark:bg-gray-800">
              {DEAL_TYPE_CONFIG[deal.dealType].label}
            </span>
            <span className="text-sm text-gray-400">
              {DEAL_VISIBILITY_CONFIG[deal.visibility].label}
            </span>
            {deal.fund && (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-sm text-blue-600 dark:bg-blue-900/20">
                Fund: {deal.fund.name}
              </span>
            )}
          </div>
        </div>
        {deal.riskScore && (
          <div className="text-center">
            <p className="text-xs uppercase text-gray-400">Risk</p>
            <p
              className={`text-2xl font-bold ${
                deal.riskScore <= 3
                  ? "text-green-600"
                  : deal.riskScore <= 6
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {deal.riskScore}/10
            </p>
          </div>
        )}
      </div>

      {/* Financial metrics */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard
          label="Target Raise"
          value={formatCurrency(deal.targetRaise)}
        />
        <MetricCard
          label="Committed"
          value={formatCurrency(deal.totalCommitted)}
          highlight
        />
        <MetricCard
          label="Allocated"
          value={formatCurrency(deal.totalAllocated)}
        />
        <MetricCard
          label="Investors"
          value={deal.investorCount.toString()}
        />
        <MetricCard
          label="Progress"
          value={`${commitmentPct.toFixed(0)}%`}
          highlight={commitmentPct >= 80}
        />
      </div>

      {/* Progress bar */}
      {deal.targetRaise && (
        <div className="mb-6">
          <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all"
              style={{ width: `${commitmentPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Terms grid */}
      <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50 lg:grid-cols-4">
        <TermItem label="Expected Return" value={deal.expectedReturn ?? "--"} />
        <TermItem label="Hold Period" value={deal.holdPeriod ?? "--"} />
        <TermItem
          label="Management Fee"
          value={formatPercent(deal.managementFee)}
        />
        <TermItem
          label="Carried Interest"
          value={formatPercent(deal.carriedInterest)}
        />
        <TermItem
          label="Preferred Return"
          value={formatPercent(deal.preferredReturn)}
        />
        <TermItem label="Sector" value={deal.targetSector ?? "--"} />
        <TermItem label="Geography" value={deal.targetGeography ?? "--"} />
        <TermItem
          label="Lead Sponsor"
          value={
            deal.isLeadDeal
              ? "Your team (Lead)"
              : deal.leadSponsor ?? "--"
          }
        />
      </div>

      {/* Thesis / Description */}
      {deal.thesis && (
        <div className="mb-4">
          <h3 className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Investment Thesis
          </h3>
          <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
            {deal.thesis}
          </p>
        </div>
      )}
      {deal.description && (
        <div>
          <h3 className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
            Description
          </h3>
          <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
            {deal.description}
          </p>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-bold ${
          highlight
            ? "text-green-600"
            : "text-gray-900 dark:text-gray-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TermItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {value}
      </p>
    </div>
  );
}
