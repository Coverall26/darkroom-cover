"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
  Upload,
  Download,
  Calendar,
} from "lucide-react";
// ── Types ──

interface Transaction {
  id: string;
  type: string;
  amount: number;
  status: string;
  fundName: string;
  fundId: string;
  createdAt: string;
  fundsReceivedDate: string | null;
  bankReference: string | null;
  confirmationNotes: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  PENDING: {
    label: "Pending",
    icon: Clock,
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  PROOF_UPLOADED: {
    label: "Proof Uploaded",
    icon: Upload,
    className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  },
  COMPLETED: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  FAILED: {
    label: "Failed",
    icon: XCircle,
    className: "bg-red-500/20 text-red-400 border-red-500/30",
  },
  CANCELLED: {
    label: "Cancelled",
    icon: XCircle,
    className: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  },
};

const TYPE_CONFIG: Record<string, { label: string; icon: typeof ArrowUpRight; color: string }> = {
  CAPITAL_CALL: { label: "Capital Call", icon: ArrowUpRight, color: "text-blue-400" },
  DISTRIBUTION: { label: "Distribution", icon: ArrowDownRight, color: "text-emerald-400" },
  WIRE_TRANSFER: { label: "Wire Transfer", icon: ArrowUpRight, color: "text-purple-400" },
  SUBSCRIPTION: { label: "Subscription", icon: DollarSign, color: "text-amber-400" },
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
}

// ── Component ──

export default function TransactionsClient() {
  const { data: session } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTransactions = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/lp/transactions");
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      } else {
        setError("Failed to load transactions.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const filtered = filterStatus
    ? transactions.filter((tx) => tx.status === filterStatus)
    : transactions;

  const totalInbound = transactions
    .filter((tx) => tx.type === "CAPITAL_CALL" || tx.type === "WIRE_TRANSFER" || tx.type === "SUBSCRIPTION")
    .filter((tx) => tx.status === "COMPLETED")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalDistributed = transactions
    .filter((tx) => tx.type === "DISTRIBUTION")
    .filter((tx) => tx.status === "COMPLETED")
    .reduce((sum, tx) => sum + tx.amount, 0);

  const pendingCount = transactions.filter(
    (tx) => tx.status === "PENDING" || tx.status === "PROOF_UPLOADED",
  ).length;

  const statusCounts = transactions.reduce(
    (acc, tx) => {
      acc[tx.status] = (acc[tx.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Group filtered transactions by month/year for timeline display
  const groupedByDate = useMemo(() => {
    const groups: { label: string; key: string; transactions: Transaction[] }[] = [];
    const groupMap = new Map<string, Transaction[]>();

    for (const tx of filtered) {
      const date = new Date(tx.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;
      const label = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
        groups.push({ label, key, transactions: groupMap.get(key)! });
      }
      groupMap.get(key)!.push(tx);
    }

    return groups;
  }, [filtered]);

  if (loading) {
    return (
      <div>
        <div className="max-w-[800px] mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-700/50 rounded w-48" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-gray-700/50 rounded-lg" />
              ))}
            </div>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-gray-700/50 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <main className="max-w-[800px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Back nav */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/lp/dashboard">
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white h-8 px-2">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
          </Link>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Transaction History</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {transactions.length} transaction{transactions.length !== 1 ? "s" : ""} recorded
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-gray-700 text-gray-300 hover:bg-gray-800 h-8"
            onClick={() => fetchTransactions(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Refresh
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="bg-gray-800/50 border-gray-700/50 border-l-4 border-l-blue-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpRight className="h-4 w-4 text-blue-400" aria-hidden="true" />
                <span className="text-xs text-gray-400">Capital Invested</span>
              </div>
              <p className="text-xl font-bold text-white font-mono tabular-nums">
                {formatCurrency(totalInbound)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700/50 border-l-4 border-l-emerald-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownRight className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <span className="text-xs text-gray-400">Distributions</span>
              </div>
              <p className="text-xl font-bold text-white font-mono tabular-nums">
                {formatCurrency(totalDistributed)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700/50 border-l-4 border-l-amber-500">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-amber-400" aria-hidden="true" />
                <span className="text-xs text-gray-400">Pending</span>
              </div>
              <p className="text-xl font-bold text-white font-mono tabular-nums">{pendingCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter transactions by status">
          <button
            onClick={() => setFilterStatus(null)}
            aria-pressed={filterStatus === null}
            className={`px-3 py-2 min-h-[44px] text-xs rounded-full font-medium transition-colors ${
              filterStatus === null
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            All ({transactions.length})
          </button>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => {
            const count = statusCounts[key] || 0;
            if (count === 0) return null;
            return (
              <button
                key={key}
                onClick={() => setFilterStatus(filterStatus === key ? null : key)}
                aria-pressed={filterStatus === key}
                className={`px-3 py-2 min-h-[44px] text-xs rounded-full font-medium transition-colors ${
                  filterStatus === key
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {config.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center py-12 gap-4" role="alert">
            <AlertCircle className="h-12 w-12 text-red-400" aria-hidden="true" />
            <p className="text-red-400 font-medium">{error}</p>
            <Button
              variant="outline"
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
              onClick={() => { setError(null); fetchTransactions(); }}
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Transaction list */}
        {!error && (
          <div className="space-y-6">
            {groupedByDate.length > 0 ? (
              groupedByDate.map((group) => (
                <div key={group.key}>
                  {/* Date section header */}
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <Calendar className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                      {group.label}
                    </span>
                    <span className="text-xs text-gray-600 font-mono tabular-nums">
                      ({group.transactions.length})
                    </span>
                  </div>

                  <Card className="bg-gray-800/50 border-gray-700/50">
                    <CardContent className="p-0">
                      {group.transactions.map((tx, idx) => {
                        const statusConfig = STATUS_CONFIG[tx.status] || STATUS_CONFIG.PENDING;
                        const typeConfig = TYPE_CONFIG[tx.type] || TYPE_CONFIG.CAPITAL_CALL;
                        const StatusIcon = statusConfig.icon;
                        const TypeIcon = typeConfig.icon;
                        const isLast = idx === group.transactions.length - 1;

                        return (
                          <div
                            key={tx.id}
                            className="flex items-stretch hover:bg-gray-700/20 active:bg-gray-700/30 transition-colors"
                          >
                            {/* Timeline connector line */}
                            <div className="flex flex-col items-center w-10 shrink-0 py-3">
                              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                                tx.status === "COMPLETED" ? "bg-emerald-400" :
                                tx.status === "FAILED" || tx.status === "CANCELLED" ? "bg-red-400" :
                                tx.status === "PROOF_UPLOADED" ? "bg-blue-400" :
                                "bg-amber-400"
                              }`} />
                              {!isLast && (
                                <div className="w-px flex-1 bg-gray-700/50 mt-1" />
                              )}
                            </div>

                            {/* Transaction content */}
                            <div className="flex items-center justify-between flex-1 min-h-[56px] py-3 pr-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`h-9 w-9 rounded-full flex items-center justify-center bg-gray-700/50 shrink-0 ${typeConfig.color}`}>
                                  <TypeIcon className="h-4 w-4" aria-hidden="true" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-white">{typeConfig.label}</p>
                                  <p className="text-xs text-gray-500 truncate">
                                    {tx.fundName}
                                    {tx.bankReference && ` \u00B7 Ref: ${tx.bankReference}`}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                                <div className="text-right">
                                  <p className={`text-sm font-mono tabular-nums font-medium ${
                                    tx.type === "DISTRIBUTION" ? "text-emerald-400" : "text-white"
                                  }`}>
                                    {tx.type === "DISTRIBUTION" ? "+" : "-"}{formatCurrency(tx.amount)}
                                  </p>
                                  <p className="text-xs text-gray-500 font-mono tabular-nums">
                                    {new Date(tx.createdAt).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                  </p>
                                </div>

                                <Badge
                                  variant="outline"
                                  className={`text-xs px-2 py-0.5 hidden sm:flex ${statusConfig.className}`}
                                >
                                  <StatusIcon className="h-3 w-3 mr-0.5" aria-hidden="true" />
                                  {statusConfig.label}
                                </Badge>
                                <div
                                  className={`sm:hidden h-2.5 w-2.5 rounded-full shrink-0 ${
                                    tx.status === "COMPLETED" ? "bg-emerald-400" :
                                    tx.status === "FAILED" || tx.status === "CANCELLED" ? "bg-red-400" :
                                    "bg-amber-400"
                                  }`}
                                  role="status"
                                  aria-label={statusConfig.label}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </div>
              ))
            ) : (
              <Card className="bg-gray-800/50 border-gray-700/50">
                <CardContent className="py-12">
                  <div className="text-center">
                    <div className="h-12 w-12 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-3">
                      <DollarSign className="h-6 w-6 text-gray-500" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-medium text-gray-400">
                      {filterStatus ? "No transactions with this status" : "No transactions yet"}
                    </p>
                    {!filterStatus && (
                      <p className="text-xs text-gray-500 mt-1">
                        Your wire transfers and distributions will appear here.
                      </p>
                    )}
                    {filterStatus && (
                      <button
                        onClick={() => setFilterStatus(null)}
                        className="text-xs text-blue-400 hover:underline mt-2"
                      >
                        Show all transactions
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
