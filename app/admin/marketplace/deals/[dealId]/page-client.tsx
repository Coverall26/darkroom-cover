"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DealDetailHeader } from "@/components/marketplace/deal-detail-header";
import { DealStageBadge } from "@/components/marketplace/deal-stage-badge";
import {
  STAGE_TRANSITIONS,
  DEAL_STAGE_CONFIG,
  INTEREST_STATUS_CONFIG,
} from "@/lib/marketplace/types";
import type { DealStage } from "@prisma/client";

interface DealDetailClientProps {
  dealId: string;
  teamId: string;
}

export default function DealDetailClient({
  dealId,
  teamId,
}: DealDetailClientProps) {
  const router = useRouter();
  const [deal, setDeal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "overview" | "interests" | "allocations" | "documents" | "activity"
  >("overview");
  const [transitioning, setTransitioning] = useState(false);

  const fetchDeal = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/teams/${teamId}/marketplace/deals/${dealId}`,
      );
      if (res.ok) {
        const data = await res.json();
        setDeal(data.deal);
      }
    } catch (err) {
      console.error("Failed to fetch deal:", err);
    } finally {
      setLoading(false);
    }
  }, [teamId, dealId]);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  const handleStageTransition = async (toStage: DealStage) => {
    const reason = window.prompt(
      `Reason for moving to ${DEAL_STAGE_CONFIG[toStage].label}:`,
    );
    if (reason === null) return; // User cancelled

    setTransitioning(true);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/marketplace/deals/${dealId}/stage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toStage, reason: reason || undefined }),
        },
      );

      if (res.ok) {
        await fetchDeal();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to transition stage");
      }
    } catch (err) {
      console.error("Stage transition failed:", err);
    } finally {
      setTransitioning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="py-20 text-center text-gray-500">
        <p className="text-lg">Deal not found</p>
        <button
          onClick={() => router.push("/admin/marketplace")}
          className="mt-4 text-blue-600 hover:underline"
        >
          Back to Pipeline
        </button>
      </div>
    );
  }

  const allowedTransitions = STAGE_TRANSITIONS[deal.stage as DealStage] ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      {/* Back nav */}
      <button
        onClick={() => router.push("/admin/marketplace")}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to Pipeline
      </button>

      {/* Header */}
      <DealDetailHeader deal={deal} />

      {/* Stage transition buttons */}
      {allowedTransitions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
          <span className="mr-2 text-sm font-medium text-gray-500">
            Move to:
          </span>
          {allowedTransitions.map((stage) => {
            const config = DEAL_STAGE_CONFIG[stage];
            const isTerminal = config.terminal;
            return (
              <button
                key={stage}
                onClick={() => handleStageTransition(stage)}
                disabled={transitioning}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  isTerminal
                    ? "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20"
                    : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {config.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6">
          {(
            [
              "overview",
              "interests",
              "allocations",
              "documents",
              "activity",
            ] as const
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 pb-3 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
              {tab === "interests" && deal._count?.interests > 0 && (
                <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
                  {deal._count.interests}
                </span>
              )}
              {tab === "allocations" && deal._count?.allocations > 0 && (
                <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">
                  {deal._count.allocations}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Stage History
          </h3>
          <div className="space-y-2">
            {(deal.stageHistory ?? []).map(
              (entry: {
                id: string;
                fromStage: DealStage | null;
                toStage: DealStage;
                reason?: string;
                createdAt: string;
                changedByUser?: { name: string | null };
              }) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded border border-gray-100 p-3 text-sm dark:border-gray-800"
                >
                  {entry.fromStage && (
                    <>
                      <DealStageBadge stage={entry.fromStage} size="sm" />
                      <span className="text-gray-400">&rarr;</span>
                    </>
                  )}
                  <DealStageBadge stage={entry.toStage} size="sm" />
                  {entry.reason && (
                    <span className="text-gray-500">{entry.reason}</span>
                  )}
                  <span className="ml-auto text-xs text-gray-400">
                    {entry.changedByUser?.name ?? "System"} &middot;{" "}
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ),
            )}
          </div>

          {/* Notes */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Notes
          </h3>
          <div className="space-y-2">
            {(deal.notes ?? []).length === 0 && (
              <p className="text-sm text-gray-400">No notes yet.</p>
            )}
            {(deal.notes ?? []).map(
              (note: {
                id: string;
                content: string;
                pinned: boolean;
                author: { name: string | null };
                createdAt: string;
              }) => (
                <div
                  key={note.id}
                  className={`rounded border p-3 text-sm ${
                    note.pinned
                      ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                      : "border-gray-100 dark:border-gray-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                    {note.content}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {note.author?.name ?? "Unknown"} &middot;{" "}
                    {new Date(note.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {activeTab === "interests" && (
        <div className="space-y-3">
          {(deal.interests ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No interest expressed yet.
            </p>
          ) : (
            (deal.interests ?? []).map(
              (interest: {
                id: string;
                status: keyof typeof INTEREST_STATUS_CONFIG;
                indicativeAmount?: string | null;
                notes?: string | null;
                investor?: {
                  entityName: string | null;
                  entityType: string;
                } | null;
                createdAt: string;
              }) => (
                <div
                  key={interest.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {interest.investor?.entityName ?? "Unknown Investor"}
                    </p>
                    <p className="text-sm text-gray-500">
                      {interest.investor?.entityType} &middot;{" "}
                      {interest.indicativeAmount
                        ? `$${parseFloat(interest.indicativeAmount).toLocaleString()}`
                        : "No amount specified"}
                    </p>
                    {interest.notes && (
                      <p className="mt-1 text-sm text-gray-400">
                        {interest.notes}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span
                      className="inline-block rounded-full px-2.5 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: `${INTEREST_STATUS_CONFIG[interest.status]?.color ?? "#6B7280"}20`,
                        color:
                          INTEREST_STATUS_CONFIG[interest.status]?.color ??
                          "#6B7280",
                      }}
                    >
                      {INTEREST_STATUS_CONFIG[interest.status]?.label ??
                        interest.status}
                    </span>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(interest.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ),
            )
          )}
        </div>
      )}

      {activeTab === "allocations" && (
        <div className="space-y-3">
          {(deal.allocations ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No allocations made yet.
            </p>
          ) : (
            (deal.allocations ?? []).map(
              (alloc: {
                id: string;
                status: string;
                requestedAmount: string;
                allocatedAmount: string;
                confirmedAmount?: string | null;
                investor?: {
                  entityName: string | null;
                  entityType: string;
                } | null;
                createdAt: string;
              }) => (
                <div
                  key={alloc.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {alloc.investor?.entityName ?? "Unknown Investor"}
                    </p>
                    <p className="text-sm text-gray-500">
                      Requested: $
                      {parseFloat(alloc.requestedAmount).toLocaleString()} |
                      Allocated: $
                      {parseFloat(alloc.allocatedAmount).toLocaleString()}
                      {alloc.confirmedAmount &&
                        ` | Confirmed: $${parseFloat(alloc.confirmedAmount).toLocaleString()}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800">
                      {alloc.status}
                    </span>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(alloc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ),
            )
          )}
        </div>
      )}

      {activeTab === "documents" && (
        <div className="space-y-3">
          {(deal.documents ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No documents uploaded yet.
            </p>
          ) : (
            (deal.documents ?? []).map(
              (doc: {
                id: string;
                name: string;
                category: string;
                fileType?: string | null;
                createdAt: string;
              }) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-sm font-medium text-gray-500 dark:bg-gray-800">
                      {doc.fileType?.split("/")[1]?.toUpperCase()?.slice(0, 3) ??
                        "DOC"}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {doc.name}
                      </p>
                      <p className="text-xs text-gray-500">{doc.category}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ),
            )
          )}
        </div>
      )}

      {activeTab === "activity" && (
        <div className="space-y-2">
          {(deal.activities ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No activity recorded yet.
            </p>
          ) : null}
          {/* Activity is loaded via _count, full list would need a separate API call */}
          <p className="text-sm text-gray-500">
            {deal._count?.activities ?? 0} activities recorded for this deal.
          </p>
        </div>
      )}
    </div>
  );
}
