"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DollarSign, Clock, Send, CreditCard } from "lucide-react";
import DashboardSectionWrapper, {
  TransactionsSkeleton,
} from "@/components/lp/dashboard-section-wrapper";

interface Transaction {
  id: string;
  type: string;
  description?: string;
  amount: number | string;
  status: string;
  initiatedAt: string;
  completedAt?: string | null;
}

interface LPTransactionTimelineProps {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/**
 * LPTransactionTimeline — Wire proofs, confirmations, funding status.
 * Displays recent wire transfers and capital movements.
 */
export function LPTransactionTimeline({
  transactions,
  loading,
  error,
  onRetry,
}: LPTransactionTimelineProps) {
  if (!loading && !error && transactions.length === 0) return null;

  return (
    <div className="mt-6">
      <DashboardSectionWrapper
        title="Transaction History"
        isLoading={loading}
        error={error}
        onRetry={onRetry}
        skeleton={
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <CreditCard className="h-5 w-5 mr-2 text-blue-500" />
                Transaction History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TransactionsSkeleton />
            </CardContent>
          </Card>
        }
      >
        {transactions.length > 0 && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <CreditCard className="h-5 w-5 mr-2 text-blue-500" />
                Transaction History
              </CardTitle>
              <CardDescription className="text-gray-400">
                Recent wire transfers and capital movements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          tx.type === "DISTRIBUTION"
                            ? "bg-emerald-500/20"
                            : tx.type === "CAPITAL_CALL"
                              ? "bg-amber-500/20"
                              : "bg-blue-500/20"
                        }`}
                      >
                        {tx.type === "DISTRIBUTION" ? (
                          <DollarSign className="h-4 w-4 text-emerald-400" />
                        ) : tx.type === "CAPITAL_CALL" ? (
                          <Clock className="h-4 w-4 text-amber-400" />
                        ) : (
                          <Send className="h-4 w-4 text-blue-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">
                          {tx.description || tx.type.replace(/_/g, " ")}
                        </p>
                        <p className="text-gray-400 text-xs">
                          {new Date(tx.initiatedAt).toLocaleDateString()}
                          {tx.completedAt &&
                            ` — Completed ${new Date(tx.completedAt).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold font-mono tabular-nums ${
                          tx.type === "DISTRIBUTION" ? "text-emerald-400" : "text-white"
                        }`}
                      >
                        {tx.type === "DISTRIBUTION" ? "+" : ""}$
                        {typeof tx.amount === "number"
                          ? tx.amount.toLocaleString()
                          : tx.amount}
                      </p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          tx.status === "COMPLETED"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : tx.status === "PENDING"
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-gray-600/50 text-gray-400"
                        }`}
                      >
                        {tx.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </DashboardSectionWrapper>
    </div>
  );
}
