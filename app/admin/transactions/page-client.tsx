"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Upload,
  Eye,
  RefreshCw,
  ArrowUpRight,
  Banknote,
  FileText,
} from "lucide-react";

// --- Types ---

interface Transaction {
  id: string;
  type: string;
  status: string;
  amount: number;
  investorName: string;
  investorEmail: string;
  fundName: string;
  fundId: string;
  bankReference?: string;
  createdAt: string;
  confirmedAt?: string;
  proofDocumentUrl?: string;
}

// --- Helpers ---

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(dateStr);
}

const STATUS_STYLES: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  PENDING: { label: "Pending", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300", icon: Clock },
  PROOF_UPLOADED: { label: "Proof Uploaded", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300", icon: Upload },
  PROCESSING: { label: "Processing", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300", icon: RefreshCw },
  COMPLETED: { label: "Confirmed", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300", icon: CheckCircle2 },
  FAILED: { label: "Failed", color: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300", icon: AlertCircle },
  CANCELLED: { label: "Cancelled", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/50 dark:text-gray-300", icon: AlertCircle },
};

// --- Component ---

export default function TransactionsClient() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);

  // Fetch team context
  useEffect(() => {
    async function fetchTeam() {
      try {
        const res = await fetch("/api/admin/team-context");
        if (res.ok) {
          const data = await res.json();
          setTeamId(data.teamId);
        }
      } catch {
        // Ignore
      }
    }
    fetchTeam();
  }, []);

  // Fetch transactions
  const fetchTransactions = useCallback(async (silent = false) => {
    if (!teamId) return;
    try {
      if (!silent) setIsRefreshing(true);

      const statusParam = statusFilter !== "ALL" ? `&status=${statusFilter}` : "";
      const res = await fetch(`/api/admin/transactions?teamId=${teamId}${statusParam}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      } else if (res.status === 403) {
        setError("You need GP admin access to view transactions.");
      } else {
        throw new Error("Failed to load transactions");
      }
    } catch (err: unknown) {
      if (!silent) setError(err instanceof Error ? err.message : "Failed to load transactions");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [teamId, statusFilter]);

  useEffect(() => {
    if (teamId) {
      fetchTransactions();
    }
  }, [teamId, fetchTransactions]);

  // Summary stats
  const pendingCount = transactions.filter((t) =>
    ["PENDING", "PROOF_UPLOADED", "PROCESSING"].includes(t.status),
  ).length;
  const confirmedCount = transactions.filter((t) => t.status === "COMPLETED").length;
  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
  const confirmedAmount = transactions
    .filter((t) => t.status === "COMPLETED")
    .reduce((sum, t) => sum + t.amount, 0);

  // --- Loading ---
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="animate-pulse space-y-5">
          <div className="h-8 bg-muted rounded w-40" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[80px] bg-muted rounded-xl" />
            ))}
          </div>
          <div className="h-[400px] bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <p className="text-destructive font-medium text-center max-w-sm">{error}</p>
        <Button
          onClick={() => { setError(null); setLoading(true); fetchTransactions(); }}
          className="bg-[#0066FF] hover:bg-[#0052CC] text-white"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Wire proofs, payments, and confirmations
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchTransactions()}
          disabled={isRefreshing}
          className="h-8 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="shadow-sm">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-md bg-amber-500 flex items-center justify-center">
                <Clock className="h-3 w-3 text-white" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pending</span>
            </div>
            <p className="text-xl font-bold font-mono tabular-nums">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-md bg-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="h-3 w-3 text-white" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Confirmed</span>
            </div>
            <p className="text-xl font-bold font-mono tabular-nums">{confirmedCount}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-md bg-[#0066FF] flex items-center justify-center">
                <DollarSign className="h-3 w-3 text-white" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
            </div>
            <p className="text-xl font-bold font-mono tabular-nums">{formatCurrency(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-6 rounded-md bg-emerald-500 flex items-center justify-center">
                <Banknote className="h-3 w-3 text-white" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Confirmed $</span>
            </div>
            <p className="text-xl font-bold font-mono tabular-nums">{formatCurrency(confirmedAmount)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {["ALL", "PENDING", "PROOF_UPLOADED", "COMPLETED", "FAILED"].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              statusFilter === status
                ? "bg-[#0066FF] text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {status === "ALL" ? "All" : STATUS_STYLES[status]?.label || status}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[#0066FF]" />
            All Transactions
            <span className="text-muted-foreground font-normal font-mono">
              ({transactions.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-12">
              <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-3">
                <CreditCard className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No transactions yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Wire proofs and confirmations will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-3 font-medium">Investor</th>
                    <th className="text-left py-2 pr-3 font-medium">Fund</th>
                    <th className="text-right py-2 pr-3 font-medium">Amount</th>
                    <th className="text-left py-2 pr-3 font-medium">Status</th>
                    <th className="text-left py-2 pr-3 font-medium">Date</th>
                    <th className="text-left py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((tx) => {
                    const style = STATUS_STYLES[tx.status] || STATUS_STYLES.PENDING;
                    const StatusIcon = style.icon;
                    return (
                      <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pr-3">
                          <div>
                            <p className="font-medium text-sm">{tx.investorName}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {tx.investorEmail}
                            </p>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <Link
                            href={`/admin/fund/${tx.fundId}`}
                            className="text-sm hover:text-[#0066FF] transition-colors"
                          >
                            {tx.fundName}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-3 text-right">
                          <span className="font-mono tabular-nums font-medium">
                            {formatCurrency(tx.amount)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge className={`text-[10px] px-2 py-0.5 ${style.color}`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {style.label}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="text-xs text-muted-foreground font-mono tabular-nums">
                            {formatRelativeTime(tx.createdAt)}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="flex items-center gap-1.5">
                            {tx.proofDocumentUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                asChild
                              >
                                <a href={tx.proofDocumentUrl} target="_blank" rel="noopener noreferrer">
                                  <FileText className="h-3 w-3 mr-1" />
                                  Proof
                                </a>
                              </Button>
                            )}
                            {(tx.status === "PENDING" || tx.status === "PROOF_UPLOADED") && (
                              <Link href={`/admin/fund/${tx.fundId}/wire`}>
                                <Button variant="outline" size="sm" className="h-7 text-xs">
                                  Confirm
                                  <ArrowUpRight className="h-3 w-3 ml-1" />
                                </Button>
                              </Link>
                            )}
                            {tx.status === "COMPLETED" && tx.bankReference && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                Ref: {tx.bankReference}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
