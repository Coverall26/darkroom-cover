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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  TrendingUp,
  Users,
  DollarSign,
  Download,
  Loader2,
  PieChart,
  Target,
  Clock,
  FileCheck,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Timer,
  Banknote,
} from "lucide-react";

// === Types ===

interface FundReport {
  id: string;
  name: string;
  targetRaise: number;
  totalCommitted: number;
  totalFunded: number;
  investorCount: number;
  stages: {
    applied: number;
    underReview: number;
    approved: number;
    committed: number;
    funded: number;
    rejected: number;
  };
  conversionFunnel: {
    dataroomViews: number;
    emailsCaptured: number;
    onboardingStarted: number;
    ndaSigned: number;
    committed: number;
    funded: number;
  };
  recentActivity: Array<{
    date: string;
    type: string;
    description: string;
  }>;
}

interface OperationalReport {
  fundId: string;
  fundName: string;
  wireReconciliation: {
    totalTransactions: number;
    completed: number;
    pending: number;
    failed: number;
    totalExpected: number;
    totalReceived: number;
    totalVariance: number;
    variancePercent: number;
    avgConfirmationDays: number | null;
    overdueCount: number;
    slaDays: number;
  };
  documentMetrics: Array<{
    type: string;
    total: number;
    approved: number;
    rejected: number;
    pending: number;
    completionRate: number;
    rejectionRate: number;
    avgReviewHours: number | null;
  }>;
  signatureMetrics: {
    totalRequired: number;
    completed: number;
    completionRate: number;
    avgSigningDays: number | null;
    totalRecipients: number;
    signedRecipients: number;
  };
  conversionTiming: {
    avgDaysToOnboarding: number | null;
    avgDaysToCommitted: number | null;
    avgDaysToFunded: number | null;
    totalInvestors: number;
    onboardingCompleted: number;
    ndaSigned: number;
    committed: number;
    funded: number;
  };
  sla: {
    wireConfirmation: {
      slaDays: number;
      onTrack: number;
      overdue: number;
      avgDays: number | null;
    };
    documentReview: {
      slaHours: number;
      onTrack: number;
      overdue: number;
      avgHours: number | null;
    };
    signing: {
      totalPending: number;
      avgDays: number | null;
    };
  };
  generatedAt: string;
}

// === Helpers ===

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return `$${amount.toFixed(0)}`;
}

function formatPercent(value: number, total: number): string {
  if (total === 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function formatDocType(type: string): string {
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// === Components ===

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = "blue",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  accent?: "blue" | "emerald" | "amber" | "red" | "purple";
}) {
  const accentColors = {
    blue: "bg-blue-500/10 text-blue-600",
    emerald: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    red: "bg-red-500/10 text-red-600",
    purple: "bg-purple-500/10 text-purple-600",
  };
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={`rounded-md p-1.5 ${accentColors[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl font-bold tabular-nums">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SLAIndicator({
  label,
  onTrack,
  overdue,
  slaLabel,
  avgLabel,
}: {
  label: string;
  onTrack: number;
  overdue: number;
  slaLabel: string;
  avgLabel: string | null;
}) {
  const total = onTrack + overdue;
  const overduePercent = total > 0 ? (overdue / total) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Badge
          variant={overdue > 0 ? "destructive" : "secondary"}
          className="font-mono text-xs"
        >
          {overdue > 0 ? `${overdue} overdue` : "On track"}
        </Badge>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {total > 0 && (
          <>
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${100 - overduePercent}%` }}
            />
            <div
              className="h-full bg-red-500 transition-all"
              style={{ width: `${overduePercent}%` }}
            />
          </>
        )}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>SLA: {slaLabel}</span>
        {avgLabel && <span>Avg: {avgLabel}</span>}
      </div>
    </div>
  );
}

// === Tab: Raise Summary ===

function RaiseSummaryTab({ report }: { report: FundReport }) {
  const progressPercent =
    (report.totalCommitted / (report.targetRaise || 1)) * 100;
  const fundedPercent =
    (report.totalFunded / (report.targetRaise || 1)) * 100;

  return (
    <>
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          title="Target Raise"
          value={formatCurrency(report.targetRaise)}
          icon={Target}
        />
        <StatCard
          title="Total Committed"
          value={formatCurrency(report.totalCommitted)}
          subtitle={`${formatPercent(report.totalCommitted, report.targetRaise)} of target`}
          icon={TrendingUp}
          accent="emerald"
        />
        <StatCard
          title="Total Funded"
          value={formatCurrency(report.totalFunded)}
          subtitle={`${formatPercent(report.totalFunded, report.targetRaise)} of target`}
          icon={DollarSign}
          accent="purple"
        />
        <StatCard
          title="Total Investors"
          value={report.investorCount}
          subtitle={`${report.stages.funded} funded`}
          icon={Users}
        />
      </div>

      {/* Raise Progress Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Raise Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative h-6 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-blue-300 transition-all duration-500"
              style={{ width: `${Math.min(progressPercent, 100)}%` }}
            />
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-blue-600 transition-all duration-500"
              style={{ width: `${Math.min(fundedPercent, 100)}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>
              Committed: {formatCurrency(report.totalCommitted)} (
              <span className="font-mono tabular-nums">
                {progressPercent.toFixed(1)}%
              </span>
              )
            </span>
            <span>
              Funded: {formatCurrency(report.totalFunded)} (
              <span className="font-mono tabular-nums">
                {fundedPercent.toFixed(1)}%
              </span>
              )
            </span>
            <span>Target: {formatCurrency(report.targetRaise)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline & Conversion Funnel */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <PieChart className="h-4 w-4" />
              Pipeline Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Applied", count: report.stages.applied, color: "bg-blue-500" },
              { label: "Under Review", count: report.stages.underReview, color: "bg-amber-500" },
              { label: "Approved", count: report.stages.approved, color: "bg-emerald-500" },
              { label: "Committed", count: report.stages.committed, color: "bg-purple-500" },
              { label: "Funded", count: report.stages.funded, color: "bg-green-600" },
              { label: "Rejected", count: report.stages.rejected, color: "bg-red-500" },
            ].map((stage) => (
              <div key={stage.label} className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${stage.color}`} />
                <span className="flex-1 text-sm">{stage.label}</span>
                <Badge variant="secondary" className="font-mono">
                  {stage.count}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4" />
              Conversion Funnel
            </CardTitle>
            <CardDescription>
              From dataroom view to funded investor
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Dataroom Views", count: report.conversionFunnel.dataroomViews },
              { label: "Emails Captured", count: report.conversionFunnel.emailsCaptured },
              { label: "Onboarding Started", count: report.conversionFunnel.onboardingStarted },
              { label: "NDA Signed", count: report.conversionFunnel.ndaSigned },
              { label: "Committed", count: report.conversionFunnel.committed },
              { label: "Funded", count: report.conversionFunnel.funded },
            ].map((step, idx, arr) => {
              const prevCount = idx > 0 ? arr[idx - 1].count : step.count;
              const convRate =
                prevCount > 0
                  ? ((step.count / prevCount) * 100).toFixed(0)
                  : "—";
              const barWidth =
                arr[0].count > 0 ? (step.count / arr[0].count) * 100 : 0;
              return (
                <div key={step.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{step.label}</span>
                    <span className="font-medium">
                      <span className="font-mono tabular-nums">{step.count}</span>
                      {idx > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({convRate}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-500"
                      style={{ width: `${Math.max(barWidth, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// === Tab: Operations ===

function OperationsTab({ report }: { report: OperationalReport }) {
  const { wireReconciliation: wire, documentMetrics, signatureMetrics: sig, conversionTiming, sla } = report;

  return (
    <>
      {/* SLA Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" />
            SLA Dashboard
          </CardTitle>
          <CardDescription>
            Service level tracking for wire confirmations and document reviews
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SLAIndicator
            label="Wire Confirmations"
            onTrack={sla.wireConfirmation.onTrack}
            overdue={sla.wireConfirmation.overdue}
            slaLabel={`${sla.wireConfirmation.slaDays} business days`}
            avgLabel={sla.wireConfirmation.avgDays !== null ? `${sla.wireConfirmation.avgDays}d` : null}
          />
          <SLAIndicator
            label="Document Reviews"
            onTrack={sla.documentReview.onTrack}
            overdue={sla.documentReview.overdue}
            slaLabel={`${sla.documentReview.slaHours}h`}
            avgLabel={sla.documentReview.avgHours !== null ? `${sla.documentReview.avgHours}h` : null}
          />
          {sla.signing.totalPending > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="font-mono tabular-nums">{sla.signing.totalPending}</span> signature documents awaiting completion
              </div>
              {sla.signing.avgDays !== null && (
                <span className="text-xs text-muted-foreground">
                  Avg: {sla.signing.avgDays}d to complete
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wire Reconciliation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Banknote className="h-4 w-4" />
            Wire Reconciliation
          </CardTitle>
          <CardDescription>
            Expected vs received amounts and confirmation tracking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Expected</p>
              <p className="font-mono text-lg font-bold tabular-nums">
                {formatCurrency(wire.totalExpected)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Received</p>
              <p className="font-mono text-lg font-bold tabular-nums text-emerald-600">
                {formatCurrency(wire.totalReceived)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Variance</p>
              <p className={`font-mono text-lg font-bold tabular-nums ${wire.totalVariance > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                {wire.totalVariance > 0 ? formatCurrency(wire.totalVariance) : "$0"}
                {wire.variancePercent > 0 && (
                  <span className="ml-1 text-xs">({wire.variancePercent.toFixed(1)}%)</span>
                )}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Avg Confirm</p>
              <p className="font-mono text-lg font-bold tabular-nums">
                {wire.avgConfirmationDays !== null ? `${wire.avgConfirmationDays}d` : "—"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              { label: "Completed", count: wire.completed, color: "text-emerald-600" },
              { label: "Pending", count: wire.pending, color: "text-amber-600" },
              { label: "Failed", count: wire.failed, color: "text-red-600" },
              { label: "Overdue", count: wire.overdueCount, color: "text-red-600" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-lg border p-2"
              >
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <span className={`font-mono text-sm font-bold tabular-nums ${item.color}`}>
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Document Completion + Signatures side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Document Completion by Type */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <FileCheck className="h-4 w-4" />
              Document Completion
            </CardTitle>
            <CardDescription>
              LP document approval rates by type
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {documentMetrics.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents submitted yet</p>
            ) : (
              documentMetrics.map((doc) => (
                <div key={doc.type} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{formatDocType(doc.type)}</span>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                        <span className="font-mono tabular-nums">{doc.approved}</span>
                      </span>
                      {doc.rejected > 0 && (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                          <XCircle className="h-3 w-3" />
                          <span className="font-mono tabular-nums">{doc.rejected}</span>
                        </span>
                      )}
                      {doc.pending > 0 && (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <Timer className="h-3 w-3" />
                          <span className="font-mono tabular-nums">{doc.pending}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${doc.completionRate}%` }}
                    />
                    <div
                      className="h-full bg-red-500"
                      style={{ width: `${doc.rejectionRate}%` }}
                    />
                  </div>
                  {doc.avgReviewHours !== null && (
                    <p className="text-xs text-muted-foreground">
                      Avg review: {doc.avgReviewHours}h
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Signature Completion */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <FileCheck className="h-4 w-4" />
              E-Signature Status
            </CardTitle>
            <CardDescription>
              Required signing documents progress
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Documents</p>
                <p className="font-mono text-lg font-bold tabular-nums">
                  {sig.completed}/{sig.totalRequired}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sig.completionRate}% complete
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Recipients</p>
                <p className="font-mono text-lg font-bold tabular-nums">
                  {sig.signedRecipients}/{sig.totalRecipients}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sig.totalRecipients > 0
                    ? Math.round((sig.signedRecipients / sig.totalRecipients) * 100)
                    : 0}
                  % signed
                </p>
              </div>
            </div>
            {sig.avgSigningDays !== null && (
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Avg signing time</span>
                  <span className="font-mono font-bold tabular-nums">
                    {sig.avgSigningDays} days
                  </span>
                </div>
              </div>
            )}
            {/* Completion bar */}
            <div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${sig.completionRate}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {sig.totalRequired - sig.completed} documents pending
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Timing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ArrowRight className="h-4 w-4" />
            Investor Conversion Timing
          </CardTitle>
          <CardDescription>
            Average days between investor lifecycle stages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
            {[
              {
                label: "Applied",
                count: conversionTiming.totalInvestors,
                avgDays: null as number | null,
              },
              {
                label: "Onboarded",
                count: conversionTiming.onboardingCompleted,
                avgDays: conversionTiming.avgDaysToOnboarding,
              },
              {
                label: "Committed",
                count: conversionTiming.committed,
                avgDays: conversionTiming.avgDaysToCommitted,
              },
              {
                label: "Funded",
                count: conversionTiming.funded,
                avgDays: conversionTiming.avgDaysToFunded,
              },
            ].map((stage, idx, arr) => (
              <div key={stage.label} className="flex items-center gap-2">
                <div className="flex min-w-[100px] flex-col items-center rounded-lg border p-3">
                  <span className="font-mono text-xl font-bold tabular-nums">
                    {stage.count}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {stage.label}
                  </span>
                </div>
                {idx < arr.length - 1 && (
                  <div className="flex flex-col items-center">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    {arr[idx + 1].avgDays !== null && (
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {arr[idx + 1].avgDays}d
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// === Main Component ===

export default function ReportsClient() {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<FundReport | null>(null);
  const [opsReport, setOpsReport] = useState<OperationalReport | null>(null);
  const [selectedFundId, setSelectedFundId] = useState<string>("");
  const [funds, setFunds] = useState<Array<{ id: string; name: string }>>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"raise" | "operations">("raise");

  const fetchFunds = useCallback(async () => {
    try {
      const res = await fetch("/api/fund-settings/funds");
      if (res.ok) {
        const data = await res.json();
        setFunds(data.funds || []);
        if (data.funds?.length > 0 && !selectedFundId) {
          setSelectedFundId(data.funds[0].id);
        }
      }
    } catch {
      // Silently handle
    }
  }, [selectedFundId]);

  const fetchReport = useCallback(async () => {
    if (!selectedFundId) return;
    setLoading(true);
    try {
      const [summaryRes, opsRes] = await Promise.all([
        fetch(`/api/admin/reports?fundId=${selectedFundId}`),
        fetch(`/api/admin/reports/operational?fundId=${selectedFundId}`),
      ]);

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setReport(data.report);
      }
      if (opsRes.ok) {
        const data = await opsRes.json();
        setOpsReport(data);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [selectedFundId]);

  useEffect(() => {
    fetchFunds();
  }, [fetchFunds]);

  useEffect(() => {
    if (selectedFundId) {
      fetchReport();
    }
  }, [selectedFundId, fetchReport]);

  const handleExport = async (format: "csv" | "pdf") => {
    setExportLoading(true);
    try {
      const res = await fetch(
        `/api/admin/reports/export?fundId=${selectedFundId}&format=${format}`,
      );
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fund-report-${selectedFundId}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Silently handle
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Reports & Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Raise summary, operations, and investor activity
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedFundId} onValueChange={setSelectedFundId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select a fund" />
            </SelectTrigger>
            <SelectContent>
              {funds.map((fund) => (
                <SelectItem key={fund.id} value={fund.id}>
                  {fund.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport("csv")}
            disabled={exportLoading || !report}
          >
            {exportLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-1 rounded-lg border bg-muted p-1">
        <button
          onClick={() => setActiveTab("raise")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "raise"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="mr-2 inline-block h-4 w-4" />
          Raise Summary
        </button>
        <button
          onClick={() => setActiveTab("operations")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "operations"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Clock className="mr-2 inline-block h-4 w-4" />
          Operations
          {opsReport && (opsReport.sla.wireConfirmation.overdue > 0 || opsReport.sla.documentReview.overdue > 0) && (
            <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
              {opsReport.sla.wireConfirmation.overdue + opsReport.sla.documentReview.overdue}
            </Badge>
          )}
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-muted rounded-lg" />
            ))}
          </div>
          <div className="h-10 bg-muted rounded w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-64 bg-muted rounded-lg" />
            <div className="h-64 bg-muted rounded-lg" />
          </div>
          <div className="h-48 bg-muted rounded-lg" />
        </div>
      ) : !report ? (
        <Card>
          <CardContent className="flex h-64 flex-col items-center justify-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
              <BarChart3 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Select a fund to view reports
            </p>
            <p className="text-xs text-muted-foreground/60">
              Choose a fund from the dropdown above to see metrics and analytics
            </p>
          </CardContent>
        </Card>
      ) : activeTab === "raise" ? (
        <RaiseSummaryTab report={report} />
      ) : opsReport ? (
        <OperationsTab report={opsReport} />
      ) : (
        <Card>
          <CardContent className="flex h-64 flex-col items-center justify-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Operational data not available
            </p>
            <p className="text-xs text-muted-foreground/60">
              Wire reconciliation, document SLAs, and operational metrics will appear once activity begins
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
