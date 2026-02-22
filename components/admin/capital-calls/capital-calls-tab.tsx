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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Banknote,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { CapitalCallStatusBadge } from "./capital-call-status-badge";
import { CapitalCallCreateWizard } from "./capital-call-create-wizard";
import { CapitalCallDetail } from "./capital-call-detail";

interface CapitalCall {
  id: string;
  callNumber: number;
  amount: number;
  purpose: string | null;
  dueDate: string;
  status: string;
  sentAt: string | null;
  fundedAt: string | null;
  proRataPercentage: number | null;
  createdAt: string;
  responses: Array<{
    id: string;
    amountDue: number;
    amountPaid: number;
    status: string;
    investor: {
      id: string;
      name: string | null;
      user: { email: string } | null;
    } | null;
  }>;
}

interface CapitalCallsTabProps {
  fundId: string;
  teamId: string;
}

export function CapitalCallsTab({ fundId, teamId }: CapitalCallsTabProps) {
  const [calls, setCalls] = useState<CapitalCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const fetchCalls = useCallback(async () => {
    try {
      const url = new URL(
        `/api/teams/${teamId}/funds/${fundId}/capital-calls`,
        window.location.origin,
      );
      if (statusFilter !== "all") {
        url.searchParams.set("status", statusFilter);
      }

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setCalls(data.calls || []);
    } catch {
      setError("Failed to load capital calls");
    } finally {
      setLoading(false);
    }
  }, [fundId, teamId, statusFilter]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const formatCurrency = (v: number) =>
    `$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  // If viewing a specific call detail, show that instead
  if (selectedCallId) {
    return (
      <CapitalCallDetail
        callId={selectedCallId}
        teamId={teamId}
        fundId={fundId}
        onBack={() => {
          setSelectedCallId(null);
          fetchCalls();
        }}
      />
    );
  }

  // Summary stats
  const totalCalled = calls.reduce((sum, c) => sum + c.amount, 0);
  const totalFunded = calls
    .filter((c) => c.status === "FUNDED")
    .reduce((sum, c) => sum + c.amount, 0);
  const activeCalls = calls.filter(
    (c) => c.status === "SENT" || c.status === "PARTIALLY_FUNDED",
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Capital Calls</h3>
          <p className="text-sm text-muted-foreground">
            Manage capital call notices and track investor payments
          </p>
        </div>
        <Button onClick={() => setShowCreateWizard(true)}>
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          New Capital Call
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Calls</p>
            <p className="text-2xl font-bold font-mono tabular-nums">
              {calls.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Called</p>
            <p className="text-2xl font-bold font-mono tabular-nums">
              {formatCurrency(totalCalled)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total Funded</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totalFunded)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Active Calls</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">
              {activeCalls}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter + Refresh */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]" aria-label="Filter by status">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="PARTIALLY_FUNDED">Partially Funded</SelectItem>
            <SelectItem value="FUNDED">Funded</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            fetchCalls();
          }}
          aria-label="Refresh capital calls"
        >
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Capital Calls List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 bg-muted animate-pulse rounded-lg"
            />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground" role="alert">{error}</p>
            <Button variant="outline" onClick={fetchCalls} className="mt-3">
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : calls.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Banknote
              className="h-12 w-12 mx-auto mb-3 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-muted-foreground mb-1">
              No capital calls yet
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first capital call to request funds from investors
            </p>
            <Button onClick={() => setShowCreateWizard(true)}>
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Create Capital Call
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {calls.map((call) => {
            const totalDue = call.responses.reduce(
              (s, r) => s + r.amountDue,
              0,
            );
            const totalPaid = call.responses.reduce(
              (s, r) => s + r.amountPaid,
              0,
            );
            const fundedPercent =
              totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;
            const isOverdue =
              call.status === "SENT" && new Date(call.dueDate) < new Date();

            return (
              <Card
                key={call.id}
                className="cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                onClick={() => setSelectedCallId(call.id)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="shrink-0">
                        <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                          <Banknote
                            className="h-5 w-5 text-blue-500"
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">
                            Call #{call.callNumber}
                          </span>
                          <CapitalCallStatusBadge status={call.status} />
                          {isOverdue && (
                            <CapitalCallStatusBadge status="OVERDUE" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {call.purpose || "No purpose specified"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="font-mono tabular-nums font-semibold">
                          {formatCurrency(call.amount)}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          Due{" "}
                          {new Date(call.dueDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </div>

                      {call.status !== "DRAFT" && (
                        <div className="text-right hidden md:block w-24">
                          <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all"
                              style={{
                                width: `${Math.min(fundedPercent, 100)}%`,
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 font-mono tabular-nums">
                            {fundedPercent}% funded
                          </p>
                        </div>
                      )}

                      <ChevronRight
                        className="h-5 w-5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Wizard Modal */}
      <CapitalCallCreateWizard
        open={showCreateWizard}
        onClose={() => setShowCreateWizard(false)}
        onCreated={() => {
          setShowCreateWizard(false);
          fetchCalls();
        }}
        teamId={teamId}
        fundId={fundId}
      />
    </div>
  );
}
