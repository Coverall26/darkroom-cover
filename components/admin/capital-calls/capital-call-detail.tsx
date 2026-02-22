"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Users,
} from "lucide-react";
import {
  CapitalCallStatusBadge,
  ResponseStatusBadge,
} from "./capital-call-status-badge";
import { ConfirmPaymentModal } from "./confirm-payment-modal";

interface CapitalCallResponse {
  id: string;
  amountDue: number;
  amountPaid: number;
  status: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  fundReceivedDate: string | null;
  notes: string | null;
  proofDocumentId: string | null;
  proofUploadedAt: string | null;
  investor: {
    id: string;
    name: string | null;
    entityType: string | null;
    user: { email: string; name: string | null } | null;
  } | null;
}

interface CapitalCallData {
  id: string;
  callNumber: number;
  amount: number;
  purpose: string | null;
  dueDate: string;
  status: string;
  sentAt: string | null;
  fundedAt: string | null;
  noticePdfUrl: string | null;
  proRataPercentage: number | null;
  notes: string | null;
  createdAt: string;
  responses: CapitalCallResponse[];
  summary: {
    totalDue: number;
    totalPaid: number;
    outstanding: number;
    percentFunded: number;
    responseCount: number;
    fundedCount: number;
    pendingCount: number;
  };
}

interface CapitalCallDetailProps {
  callId: string;
  teamId: string;
  fundId: string;
  onBack: () => void;
}

export function CapitalCallDetail({
  callId,
  teamId,
  fundId,
  onBack,
}: CapitalCallDetailProps) {
  const [call, setCall] = useState<CapitalCallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmingResponse, setConfirmingResponse] =
    useState<CapitalCallResponse | null>(null);

  const fetchCall = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/teams/${teamId}/funds/${fundId}/capital-calls/${callId}`,
      );
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setCall(data);
    } catch {
      setError("Failed to load capital call details");
    } finally {
      setLoading(false);
    }
  }, [callId, teamId, fundId]);

  useEffect(() => {
    fetchCall();
  }, [fetchCall]);

  async function handleSend() {
    if (!call || call.status !== "DRAFT") return;

    setSending(true);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/funds/${fundId}/capital-calls/${callId}/send`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to send");
        return;
      }
      await fetchCall();
    } catch {
      setError("Network error");
    } finally {
      setSending(false);
    }
  }

  const formatCurrency = (v: number) =>
    `$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-muted animate-pulse rounded-lg" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{error || "Call not found"}</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Back to Capital Calls
        </Button>
      </div>
    );
  }

  const isDraft = call.status === "DRAFT";
  const canSend = isDraft && call.responses.length > 0;
  const isOverdue =
    call.status === "SENT" && new Date(call.dueDate) < new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
            Back
          </Button>
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              Capital Call #{call.callNumber}
              <CapitalCallStatusBadge status={call.status} />
              {isOverdue && (
                <CapitalCallStatusBadge status="OVERDUE" />
              )}
            </h3>
            {call.purpose && (
              <p className="text-sm text-muted-foreground">{call.purpose}</p>
            )}
          </div>
        </div>

        {canSend && (
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            Send to Investors
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Call</p>
            <p className="text-lg font-bold font-mono tabular-nums">
              {formatCurrency(call.amount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Received</p>
            <p className="text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCurrency(call.summary.totalPaid)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-lg font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
              {formatCurrency(call.summary.outstanding)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Due Date</p>
            <p className="text-lg font-semibold flex items-center gap-1">
              <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {new Date(call.dueDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Funding Progress</span>
            <span className="text-sm font-mono tabular-nums font-semibold">
              {call.summary.percentFunded}%
            </span>
          </div>
          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(call.summary.percentFunded, 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>
              <Users className="h-3 w-3 inline mr-1" aria-hidden="true" />
              {call.summary.fundedCount} / {call.summary.responseCount} funded
            </span>
            <span>{call.summary.pendingCount} pending</span>
          </div>
        </CardContent>
      </Card>

      {/* Investor Responses Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            Investor Responses ({call.responses.length})
          </CardTitle>
          <CardDescription>
            Payment status for each investor in this capital call
          </CardDescription>
        </CardHeader>
        <CardContent>
          {call.responses.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No investor responses yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">
                      Investor
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">
                      Due
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">
                      Paid
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-center">
                      Status
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {call.responses.map((r) => (
                    <tr key={r.id} className="group">
                      <td className="py-3">
                        <div>
                          <p className="font-medium">
                            {r.investor?.name ||
                              r.investor?.user?.name ||
                              "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.investor?.user?.email}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums">
                        {formatCurrency(r.amountDue)}
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums">
                        {formatCurrency(r.amountPaid)}
                      </td>
                      <td className="py-3 text-center">
                        <ResponseStatusBadge status={r.status} />
                      </td>
                      <td className="py-3 text-right">
                        {r.status !== "FUNDED" &&
                          call.status !== "DRAFT" &&
                          call.status !== "CANCELLED" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmingResponse(r)}
                              className="min-h-[36px]"
                            >
                              <CheckCircle2
                                className="h-3.5 w-3.5 mr-1"
                                aria-hidden="true"
                              />
                              Confirm
                            </Button>
                          )}
                        {r.confirmedAt && (
                          <span className="text-xs text-muted-foreground block mt-1">
                            Confirmed{" "}
                            {new Date(r.confirmedAt).toLocaleDateString()}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {call.notes && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{call.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Confirm Payment Modal */}
      {confirmingResponse && (
        <ConfirmPaymentModal
          open={true}
          onClose={() => setConfirmingResponse(null)}
          onConfirm={() => {
            setConfirmingResponse(null);
            fetchCall();
          }}
          response={{
            id: confirmingResponse.id,
            investorName:
              confirmingResponse.investor?.name ||
              confirmingResponse.investor?.user?.name ||
              "Investor",
            amountDue: confirmingResponse.amountDue,
            amountPaid: confirmingResponse.amountPaid,
          }}
          teamId={teamId}
          fundId={fundId}
          callId={callId}
        />
      )}
    </div>
  );
}
