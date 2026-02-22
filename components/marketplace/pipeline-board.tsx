"use client";

import { useState } from "react";
import type { DealStage, DealType } from "@prisma/client";
import { DEAL_STAGE_CONFIG } from "@/lib/marketplace/types";
import { DealCard } from "./deal-card";

type DealSummary = {
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

interface PipelineBoardProps {
  deals: DealSummary[];
  onDealClick?: (dealId: string) => void;
  /** Which stages to show as columns */
  visibleStages?: DealStage[];
}

const DEFAULT_VISIBLE_STAGES: DealStage[] = [
  "SOURCED",
  "SCREENING",
  "DUE_DILIGENCE",
  "TERM_SHEET",
  "COMMITMENT",
  "CLOSING",
  "FUNDED",
];

export function PipelineBoard({
  deals,
  onDealClick,
  visibleStages = DEFAULT_VISIBLE_STAGES,
}: PipelineBoardProps) {
  const [collapsedColumns, setCollapsedColumns] = useState<Set<DealStage>>(
    new Set(),
  );

  // Group deals by stage
  const dealsByStage: Record<DealStage, DealSummary[]> = {} as Record<
    DealStage,
    DealSummary[]
  >;
  for (const stage of visibleStages) {
    dealsByStage[stage] = [];
  }
  for (const deal of deals) {
    if (dealsByStage[deal.stage]) {
      dealsByStage[deal.stage].push(deal);
    }
  }

  const toggleCollapse = (stage: DealStage) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) {
        next.delete(stage);
      } else {
        next.add(stage);
      }
      return next;
    });
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {visibleStages.map((stage) => {
        const config = DEAL_STAGE_CONFIG[stage];
        const stageDeals = dealsByStage[stage];
        const isCollapsed = collapsedColumns.has(stage);

        return (
          <div
            key={stage}
            className={`flex-shrink-0 rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50 ${
              isCollapsed ? "w-12" : "w-72"
            } transition-all`}
          >
            {/* Column header */}
            <button
              onClick={() => toggleCollapse(stage)}
              className="flex w-full items-center gap-2 border-b border-gray-200 p-3 text-left dark:border-gray-700"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: config.color }}
              />
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {config.label}
                  </span>
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                    {stageDeals.length}
                  </span>
                </>
              )}
            </button>

            {/* Cards */}
            {!isCollapsed && (
              <div className="max-h-[calc(100vh-16rem)] space-y-3 overflow-y-auto p-3">
                {stageDeals.length === 0 ? (
                  <p className="py-8 text-center text-xs text-gray-400">
                    No deals
                  </p>
                ) : (
                  stageDeals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      onClick={() => onDealClick?.(deal.id)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
