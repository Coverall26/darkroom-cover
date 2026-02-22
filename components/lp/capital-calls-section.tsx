"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
} from "lucide-react";

interface LPCapitalCall {
  id: string;
  callNumber: number;
  amount: number;
  purpose: string | null;
  dueDate: string;
  status: string;
  noticeDate: string | null;
  noticePdfUrl: string | null;
  myResponse: {
    id: string;
    amountDue: number;
    amountPaid: number;
    status: string;
    proofDocumentId: string | null;
    proofUploadedAt: string | null;
    confirmedAt: string | null;
    fundReceivedDate: string | null;
    notes: string | null;
  } | null;
}

interface LPCapitalCallsSectionProps {
  fundId?: string;
  onViewDetail?: (callId: string) => void;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  PENDING: {
    bg: "bg-amber-500/20",
    text: "text-amber-400",
    label: "Payment Due",
  },
  PARTIALLY_FUNDED: {
    bg: "bg-blue-500/20",
    text: "text-blue-400",
    label: "Partial",
  },
  FUNDED: {
    bg: "bg-emerald-500/20",
    text: "text-emerald-400",
    label: "Paid",
  },
};

export function LPCapitalCallsSection({
  fundId,
  onViewDetail,
}: LPCapitalCallsSectionProps) {
  const [calls, setCalls] = useState<LPCapitalCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<LPCapitalCall | null>(null);

  const fetchCalls = useCallback(async () => {
    try {
      const url = new URL("/api/lp/capital-calls", window.location.origin);
      if (fundId) url.searchParams.set("fundId", fundId);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setCalls(data.calls || []);
    } catch {
      setError("Failed to load capital calls");
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const formatCurrency = (v: number) =>
    `$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  // Show detail view if a call is selected
  if (selectedCall) {
    return (
      <LPCapitalCallDetail
        call={selectedCall}
        onBack={() => {
          setSelectedCall(null);
          fetchCalls();
        }}
      />
    );
  }

  if (loading) {
    return (
      <Card className="bg-gray-800/50 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Banknote className="h-5 w-5 text-blue-500" aria-hidden="true" />
            Capital Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-16 bg-gray-700/50 animate-pulse rounded-lg"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-gray-800/50 border-gray-700">
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-400" aria-hidden="true" />
          <p className="text-gray-400 text-sm" role="alert">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCalls}
            className="mt-2"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Separate pending and completed
  const pendingCalls = calls.filter(
    (c) =>
      c.myResponse?.status === "PENDING" ||
      c.myResponse?.status === "PARTIALLY_FUNDED",
  );
  const completedCalls = calls.filter(
    (c) => c.myResponse?.status === "FUNDED",
  );

  return (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Banknote className="h-5 w-5 text-blue-500" aria-hidden="true" />
          Capital Calls
        </CardTitle>
        <CardDescription className="text-gray-400">
          Outstanding capital call notices
        </CardDescription>
      </CardHeader>
      <CardContent>
        {calls.length === 0 ? (
          <div className="text-center py-8">
            <Banknote
              className="h-12 w-12 mx-auto mb-3 text-gray-600"
              aria-hidden="true"
            />
            <p className="text-gray-500">No capital calls at this time</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pending (Action Required) */}
            {pendingCalls.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-amber-400 uppercase tracking-wider">
                  Action Required ({pendingCalls.length})
                </p>
                {pendingCalls.map((call) => (
                  <CapitalCallRow
                    key={call.id}
                    call={call}
                    formatCurrency={formatCurrency}
                    onClick={() =>
                      onViewDetail
                        ? onViewDetail(call.id)
                        : setSelectedCall(call)
                    }
                  />
                ))}
              </div>
            )}

            {/* Completed */}
            {completedCalls.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Completed ({completedCalls.length})
                </p>
                {completedCalls.map((call) => (
                  <CapitalCallRow
                    key={call.id}
                    call={call}
                    formatCurrency={formatCurrency}
                    onClick={() =>
                      onViewDetail
                        ? onViewDetail(call.id)
                        : setSelectedCall(call)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CapitalCallRow({
  call,
  formatCurrency,
  onClick,
}: {
  call: LPCapitalCall;
  formatCurrency: (v: number) => string;
  onClick: () => void;
}) {
  const resp = call.myResponse;
  const statusStyle = STATUS_STYLES[resp?.status || "PENDING"] || STATUS_STYLES.PENDING;
  const isOverdue =
    resp?.status === "PENDING" && new Date(call.dueDate) < new Date();

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700/80 transition-colors text-left min-h-[56px]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white font-medium">
            Capital Call #{call.callNumber}
          </p>
          {isOverdue && (
            <Badge className="bg-red-500/20 text-red-400 text-[10px]">
              Overdue
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Calendar className="h-3 w-3" aria-hidden="true" />
          Due{" "}
          {new Date(call.dueDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          {call.purpose && (
            <>
              <span className="text-gray-600">·</span>
              <span className="truncate">{call.purpose}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <div className="text-right">
          <p className="text-white font-bold font-mono tabular-nums">
            {formatCurrency(resp?.amountDue || 0)}
          </p>
          <span
            className={`text-xs px-2 py-0.5 rounded font-medium ${statusStyle.bg} ${statusStyle.text}`}
          >
            {statusStyle.label}
          </span>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-500" aria-hidden="true" />
      </div>
    </button>
  );
}

/**
 * LP Capital Call Detail — inline detail view within dashboard.
 */
function LPCapitalCallDetail({
  call,
  onBack,
}: {
  call: LPCapitalCall;
  onBack: () => void;
}) {
  const resp = call.myResponse;
  const formatCurrency = (v: number) =>
    `$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  const isPending = resp?.status === "PENDING" || resp?.status === "PARTIALLY_FUNDED";
  const isOverdue = isPending && new Date(call.dueDate) < new Date();

  return (
    <Card className="bg-gray-800/50 border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Banknote className="h-5 w-5 text-blue-500" aria-hidden="true" />
            Capital Call #{call.callNumber}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-gray-400"
          >
            Back to List
          </Button>
        </div>
        {call.purpose && (
          <CardDescription className="text-gray-400">
            {call.purpose}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Amount & Status */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-700/50 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-1">Amount Due</p>
            <p className="text-xl font-bold font-mono tabular-nums text-white">
              {formatCurrency(resp?.amountDue || 0)}
            </p>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-1">Amount Paid</p>
            <p className="text-xl font-bold font-mono tabular-nums text-emerald-400">
              {formatCurrency(resp?.amountPaid || 0)}
            </p>
          </div>
        </div>

        {/* Due Date */}
        <div className="flex items-center justify-between bg-gray-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Clock
              className={`h-4 w-4 ${isOverdue ? "text-red-400" : "text-gray-400"}`}
              aria-hidden="true"
            />
            <span className="text-gray-300">Due Date</span>
          </div>
          <span
            className={`font-medium ${isOverdue ? "text-red-400" : "text-white"}`}
          >
            {new Date(call.dueDate).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {isOverdue && " (Overdue)"}
          </span>
        </div>

        {/* Payment Status */}
        {resp?.status === "FUNDED" && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            <div>
              <p className="text-emerald-400 font-medium">Payment Confirmed</p>
              {resp.confirmedAt && (
                <p className="text-xs text-emerald-300/60">
                  Confirmed on{" "}
                  {new Date(resp.confirmedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Action: Pay Now */}
        {isPending && (
          <div className="space-y-3">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <p className="text-amber-400 font-medium text-sm">
                Payment Required
              </p>
              <p className="text-xs text-amber-300/60 mt-1">
                Please transfer funds via wire and upload your proof of payment.
              </p>
            </div>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white min-h-[44px]"
              onClick={() => {
                window.location.href = "/lp/wire";
              }}
            >
              <Banknote className="h-4 w-4 mr-2" aria-hidden="true" />
              View Wire Instructions & Pay
            </Button>
          </div>
        )}

        {/* Notes */}
        {resp?.notes && (
          <div className="bg-gray-700/50 rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-1">Notes</p>
            <p className="text-sm text-gray-300">{resp.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
