"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { DealStage } from "@prisma/client";
import { PipelineBoard } from "@/components/marketplace/pipeline-board";
import { PipelineStatsCards } from "@/components/marketplace/pipeline-stats-cards";
import { DealCard } from "@/components/marketplace/deal-card";
import type { PipelineStats } from "@/lib/marketplace/types";
import { DEAL_STAGE_CONFIG } from "@/lib/marketplace/types";

interface MarketplaceDashboardClientProps {
  teamId: string;
  teamName: string;
}

type DealSummary = {
  id: string;
  title: string;
  targetName?: string | null;
  targetSector?: string | null;
  targetGeography?: string | null;
  dealType: "EQUITY" | "DEBT" | "CONVERTIBLE" | "FUND_OF_FUNDS" | "SECONDARY" | "CO_INVESTMENT" | "SPV";
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

type ViewMode = "board" | "list";

export default function MarketplaceDashboardClient({
  teamId,
  teamName,
}: MarketplaceDashboardClientProps) {
  const router = useRouter();
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [dealsRes, statsRes] = await Promise.all([
        fetch(
          `/api/teams/${teamId}/marketplace/deals?pageSize=100${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`,
        ),
        fetch(`/api/teams/${teamId}/marketplace/pipeline`),
      ]);

      if (dealsRes.ok) {
        const data = await dealsRes.json();
        setDeals(data.deals ?? []);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats ?? null);
      }
    } catch (err) {
      console.error("Failed to fetch marketplace data:", err);
    } finally {
      setLoading(false);
    }
  }, [teamId, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDealClick = (dealId: string) => {
    router.push(`/admin/marketplace/deals/${dealId}`);
  };

  const handleCreateDeal = () => {
    router.push("/admin/marketplace/deals/new");
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Deal Pipeline
          </h1>
          <p className="text-sm text-gray-500">{teamName}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setViewMode("board")}
              className={`px-3 py-1.5 text-sm ${
                viewMode === "board"
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              } rounded-l-lg`}
            >
              Board
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-sm ${
                viewMode === "list"
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              } rounded-r-lg`}
            >
              List
            </button>
          </div>

          <button
            onClick={handleCreateDeal}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New Deal
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && <PipelineStatsCards stats={stats} />}

      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search deals by name, company, or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Pipeline view */}
      {viewMode === "board" ? (
        <PipelineBoard deals={deals} onDealClick={handleDealClick} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onClick={() => handleDealClick(deal.id)}
            />
          ))}
          {deals.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500">
              <p className="text-lg font-medium">No deals yet</p>
              <p className="mt-1 text-sm">
                Create your first deal to start building your pipeline.
              </p>
              <button
                onClick={handleCreateDeal}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                + New Deal
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
