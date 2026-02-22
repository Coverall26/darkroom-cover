"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
  DollarSign,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Settings,
  AlertTriangle,
  RefreshCw,
  Banknote,
  FileText,
  ArrowRight,
  ArrowDownToLine,
  UserCheck,
  Store,
} from "lucide-react";
import { FundOverviewTab } from "@/components/admin/fund-detail/fund-overview-tab";
import { InvestorTimeline } from "@/components/admin/investor-timeline";
import { CapitalTrackingDashboard } from "@/components/admin/capital-tracking-dashboard";
import { BulkActionWizard } from "@/components/admin/bulk-action-wizard";
import { InvestorPipelineTab } from "@/components/admin/investor-pipeline-tab";
import { FundDocumentsTab } from "@/components/admin/fund-documents-tab";
import { CapitalCallsTab } from "@/components/admin/capital-calls";
import { QuickWireConfirmModal } from "@/components/admin/quick-wire-confirm-modal";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { FundTabNav, resolveTab } from "@/components/admin/fund-detail/fund-tab-nav";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { toast } from "sonner";

const POLL_INTERVAL = 30000;

interface FundDetails {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  style: string | null;
  status: string;
  entityMode: string | null;
  fundSubType: string | null;
  regulationDExemption: string | null;
  targetRaise: number;
  currentRaise: number;
  minimumInvestment: number;
  aumTarget: number | null;
  callFrequency: string;
  capitalCallThresholdEnabled: boolean;
  capitalCallThreshold: number | null;
  // Fund economics
  managementFeePct: number | null;
  carryPct: number | null;
  hurdleRate: number | null;
  waterfallType: string | null;
  termYears: number | null;
  extensionYears: number | null;
  highWaterMark: boolean;
  gpCommitmentAmount: number | null;
  gpCommitmentPct: number | null;
  investmentPeriodYears: number | null;
  preferredReturnMethod: string | null;
  recyclingEnabled: boolean;
  clawbackProvision: boolean;
  // Threshold fields
  initialThresholdEnabled: boolean;
  initialThresholdAmount: number | null;
  fullAuthorizedAmount: number | null;
  initialThresholdMet: boolean;
  stagedCommitmentsEnabled: boolean;
  marketplaceInterest: boolean;
  closingDate: string | null;
  createdAt: string;
  aggregate: {
    totalInbound: number;
    totalOutbound: number;
    totalCommitted: number;
    thresholdEnabled: boolean;
    thresholdAmount: number | null;
    initialThresholdEnabled: boolean;
    initialThresholdAmount: number | null;
    fullAuthorizedAmount: number | null;
    initialThresholdMet: boolean;
    initialThresholdMetAt: string | null;
    fullAuthorizedProgress: number;
  } | null;
  investors: Array<{
    id: string;
    name: string;
    email: string;
    commitment: number;
    funded: number;
    status: string;
  }>;
  capitalCalls: Array<{
    id: string;
    callNumber: number;
    amount: number;
    dueDate: string;
    status: string;
  }>;
  distributions: Array<{
    id: string;
    distributionNumber: number;
    totalAmount: number;
    distributionDate: string;
    status: string;
  }>;
}

const CALL_FREQUENCY_LABELS: Record<string, string> = {
  AS_NEEDED: "As Needed",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMI_ANNUAL: "Semi-Annual",
  ANNUAL: "Annual",
};

const STYLE_LABELS: Record<string, string> = {
  TRADITIONAL: "Traditional",
  STAGED_COMMITMENTS: "Staged Commitments",
  EVERGREEN: "Evergreen",
  VARIABLE_CALLS: "Variable Calls",
};

const FUND_TYPE_LABELS: Record<string, string> = {
  VENTURE_CAPITAL: "Venture Capital",
  PRIVATE_EQUITY: "Private Equity",
  REAL_ESTATE: "Real Estate",
  HEDGE_FUND: "Hedge Fund",
  SPV_COINVEST: "SPV / Co-Invest",
  SEARCH_FUND: "Search Fund",
  FUND_OF_FUNDS: "Fund of Funds",
  CUSTOM: "Custom",
  SAFE: "SAFE",
  CONVERTIBLE_NOTE: "Convertible Note",
  PRICED_EQUITY: "Priced Equity",
};

const REG_D_LABELS: Record<string, string> = {
  "506B": "Rule 506(b)",
  "506C": "Rule 506(c)",
  "REG_A_PLUS": "Reg A+",
  "RULE_504": "Rule 504",
};

interface FundDetailPageClientProps {
  fundId: string;
}

interface PendingActions {
  pendingWires: number;
  pendingDocs: number;
  needsReview: number;
  awaitingWire: number;
  totalActions: number;
}

interface PendingWireItem {
  transactionId: string;
  investorId: string | null;
  name: string;
  email: string;
  amount: number;
  status: string;
  createdAt: string;
  proofFileName: string | null;
}

interface PendingDocItem {
  documentId: string;
  investorId: string | null;
  name: string;
  email: string;
  title: string;
  documentType: string;
  originalFilename: string | null;
  createdAt: string;
}

interface NeedsReviewItem {
  investorId: string;
  name: string;
  email: string;
  stage: string;
  createdAt: string;
}

interface AwaitingWireItem {
  investmentId: string;
  investorId: string | null;
  name: string;
  email: string;
  commitmentAmount: number;
  fundedAmount: number;
  createdAt: string;
}

interface PendingDetails {
  pendingWires: { items: PendingWireItem[]; total: number };
  pendingDocs: { items: PendingDocItem[]; total: number };
  needsReview: { items: NeedsReviewItem[]; total: number };
  awaitingWire: { items: AwaitingWireItem[]; total: number };
  totalActions: number;
}

export default function FundDetailPageClient({ fundId }: FundDetailPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fund, setFund] = useState<FundDetails | null>(null);
  const [pendingActions, setPendingActions] = useState<PendingActions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showBulkWizard, setShowBulkWizard] = useState(false);
  const [activeTab, setActiveTab] = useState(() =>
    resolveTab(searchParams.get("tab"), null),
  );
  const [pendingDetails, setPendingDetails] = useState<PendingDetails | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [wireConfirmModal, setWireConfirmModal] = useState<{
    open: boolean;
    transactionId: string;
    investorName: string;
    expectedAmount: number;
  }>({ open: false, transactionId: "", investorName: "", expectedAmount: 0 });
  const [approvingDocId, setApprovingDocId] = useState<string | null>(null);
  const [rejectingDocId, setRejectingDocId] = useState<string | null>(null);

  // URL-synced tab navigation — updates ?tab= param on change
  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === "overview") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
      const qs = params.toString();
      router.replace(`/admin/fund/${fundId}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [fundId, router, searchParams],
  );

  // Clamp tab to valid set when fund data loads (mode may differ from URL)
  useEffect(() => {
    if (fund) {
      const resolved = resolveTab(activeTab, fund.entityMode);
      if (resolved !== activeTab) setActiveTab(resolved);
    }
  }, [fund, activeTab]);

  const fetchFundDetails = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsRefreshing(true);
      const [res, actionsRes] = await Promise.all([
        fetch(`/api/admin/fund/${fundId}`),
        fetch(`/api/admin/fund/${fundId}/pending-actions`),
      ]);
      if (!res.ok) {
        if (res.status === 403) {
          router.push("/login");
          return;
        }
        if (res.status === 404) {
          throw new Error("Fund not found");
        }
        throw new Error("Failed to fetch fund details");
      }
      const json = await res.json();
      setFund(json);

      if (actionsRes.ok) {
        const actionsJson = await actionsRes.json();
        setPendingActions(actionsJson);
      }
    } catch (err: any) {
      if (!silent) setError(err.message);
    } finally {
      setLoading(false);
      if (!silent) setIsRefreshing(false);
    }
  }, [fundId, router]);

  useEffect(() => {
    if (fundId) {
      fetchFundDetails();
    }
  }, [fundId, fetchFundDetails]);

  useEffect(() => {
    if (!fundId || !fund) return;

    const pollInterval = setInterval(() => {
      fetchFundDetails(true);
    }, POLL_INTERVAL);

    return () => clearInterval(pollInterval);
  }, [fundId, fund, fetchFundDetails]);

  const fetchPendingDetails = useCallback(async () => {
    if (!fundId) return;
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/admin/fund/${fundId}/pending-details?limit=3`);
      if (res.ok) {
        const data = await res.json();
        setPendingDetails(data);
      }
    } catch {
      // Non-critical — pending details are supplementary
    } finally {
      setDetailsLoading(false);
    }
  }, [fundId]);

  const handleExpandDetails = useCallback(() => {
    if (!detailsExpanded && !pendingDetails) {
      fetchPendingDetails();
    }
    setDetailsExpanded((prev) => !prev);
  }, [detailsExpanded, pendingDetails, fetchPendingDetails]);

  const handleApproveDoc = useCallback(async (documentId: string) => {
    setApprovingDocId(documentId);
    try {
      const res = await fetch(`/api/admin/documents/${documentId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to approve document");
      }
      toast.success("Document approved");
      fetchPendingDetails();
      fetchFundDetails(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setApprovingDocId(null);
    }
  }, [fetchPendingDetails, fetchFundDetails]);

  const handleRejectDoc = useCallback(async (documentId: string) => {
    setRejectingDocId(documentId);
    try {
      const res = await fetch(`/api/admin/documents/${documentId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reject document");
      }
      toast.success("Document rejected");
      fetchPendingDetails();
      fetchFundDetails(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setRejectingDocId(null);
    }
  }, [fetchPendingDetails, fetchFundDetails]);

  const handleWireConfirmed = useCallback(() => {
    fetchPendingDetails();
    fetchFundDetails(true);
    toast.success("Wire transfer confirmed");
  }, [fetchPendingDetails, fetchFundDetails]);

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? "yesterday" : `${days}d ago`;
  }

  function formatCurrency(value: number | string) {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-muted rounded w-24" />
          <div className="h-10 bg-muted rounded w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-muted rounded-lg" />
            ))}
          </div>
          <div className="h-10 bg-muted rounded w-full" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-muted rounded-lg" />
            <div className="h-64 bg-muted rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
        <p className="text-destructive font-medium">{error}</p>
        <div className="flex gap-2">
          <Link href="/admin/fund">
            <Button variant="outline">Back to Funds</Button>
          </Link>
          <Button onClick={() => { setError(null); setLoading(true); fetchFundDetails(); }}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!fund) return null;

  return (
    <>
      <div>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <Breadcrumb className="mb-2">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/admin/dashboard">Dashboard</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/admin/fund">Funds</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{fund.name}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <h1 className="text-2xl sm:text-3xl font-bold">{fund.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge variant={fund.status === "RAISING" ? "default" : "secondary"}>
                  {fund.status}
                </Badge>
                {fund.entityMode && (
                  <Badge variant="outline" className="text-[#0066FF] border-[#0066FF]/30">
                    {fund.entityMode === "FUND" ? "GP Fund" : fund.entityMode === "STARTUP" ? "Startup" : fund.entityMode}
                  </Badge>
                )}
                {fund.fundSubType && (
                  <Badge variant="outline">
                    {FUND_TYPE_LABELS[fund.fundSubType] || fund.fundSubType}
                  </Badge>
                )}
                {fund.regulationDExemption && (
                  <Badge variant="outline" className="text-purple-600 border-purple-300 dark:text-purple-400 dark:border-purple-700">
                    {REG_D_LABELS[fund.regulationDExemption] || fund.regulationDExemption}
                  </Badge>
                )}
                {fund.style && (
                  <Badge variant="outline">
                    {STYLE_LABELS[fund.style] || fund.style}
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  Calls: {CALL_FREQUENCY_LABELS[fund.callFrequency] || fund.callFrequency}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowBulkWizard(true)}>
                <ArrowDownToLine className="h-4 w-4 mr-2" aria-hidden="true" />
                Bulk Action
              </Button>
              <Button
                variant="outline"
                onClick={() => fetchFundDetails()}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </Button>
              <Link href={`/admin/fund/${fund.id}/wire`}>
                <Button variant="outline">
                  <Banknote className="h-4 w-4 mr-2" aria-hidden="true" />
                  Wire
                </Button>
              </Link>
              <Link href={`/admin/settings/fund?id=${fund.id}`}>
                <Button variant="outline">
                  <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
                  Settings
                </Button>
              </Link>
            </div>
          </div>

          {/* Pending Actions Card */}
          {pendingActions && pendingActions.totalActions > 0 && (
            <Card className="mb-6 border-[#F59E0B]/30 bg-amber-50/50 dark:bg-amber-950/10">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-[#F59E0B]" aria-hidden="true" />
                    Action Required
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                      {pendingActions.totalActions} pending
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleExpandDetails}
                      className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                    >
                      {detailsExpanded ? "Collapse" : "Show Details"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Summary row — always visible */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {pendingActions.pendingWires > 0 && (
                    <Link
                      href={`/admin/fund/${fundId}/wire`}
                      className="flex items-center gap-2 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                    >
                      <Banknote className="h-4 w-4 text-[#F59E0B] flex-shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{pendingActions.pendingWires} wire{pendingActions.pendingWires !== 1 ? "s" : ""}</p>
                        <p className="text-xs text-muted-foreground">to confirm</p>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto flex-shrink-0" aria-hidden="true" />
                    </Link>
                  )}
                  {pendingActions.pendingDocs > 0 && (
                    <Link
                      href="/admin/documents"
                      className="flex items-center gap-2 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                    >
                      <FileText className="h-4 w-4 text-[#0066FF] flex-shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{pendingActions.pendingDocs} doc{pendingActions.pendingDocs !== 1 ? "s" : ""}</p>
                        <p className="text-xs text-muted-foreground">to review</p>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto flex-shrink-0" aria-hidden="true" />
                    </Link>
                  )}
                  {pendingActions.needsReview > 0 && (
                    <button
                      onClick={() => setActiveTab("pipeline")}
                      className="flex items-center gap-2 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors text-left"
                    >
                      <UserCheck className="h-4 w-4 text-purple-500 flex-shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{pendingActions.needsReview} investor{pendingActions.needsReview !== 1 ? "s" : ""}</p>
                        <p className="text-xs text-muted-foreground">need review</p>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto flex-shrink-0" aria-hidden="true" />
                    </button>
                  )}
                  {pendingActions.awaitingWire > 0 && (
                    <Link
                      href={`/admin/fund/${fundId}/wire`}
                      className="flex items-center gap-2 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                    >
                      <DollarSign className="h-4 w-4 text-[#10B981] flex-shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{pendingActions.awaitingWire} awaiting</p>
                        <p className="text-xs text-muted-foreground">wire transfer</p>
                      </div>
                      <ArrowRight className="h-3 w-3 text-muted-foreground ml-auto flex-shrink-0" aria-hidden="true" />
                    </Link>
                  )}
                </div>

                {/* Expanded inline details */}
                {detailsExpanded && (
                  <div className="mt-4 space-y-4">
                    {detailsLoading && !pendingDetails && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
                      </div>
                    )}

                    {/* Pending Wires Section */}
                    {pendingDetails && pendingDetails.pendingWires.items.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                          {pendingDetails.pendingWires.total} Wire Confirmation{pendingDetails.pendingWires.total !== 1 ? "s" : ""} Pending
                        </h4>
                        <div className="space-y-1.5">
                          {pendingDetails.pendingWires.items.map((wire) => (
                            <div
                              key={wire.transactionId}
                              className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-lg border bg-background text-sm"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{wire.name}</span>
                                <span className="text-muted-foreground ml-1">
                                  ({formatCurrency(wire.amount)})
                                </span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {timeAgo(wire.createdAt)}
                                </span>
                              </div>
                              <div className="flex gap-1.5 flex-shrink-0">
                                <Button
                                  size="sm"
                                  className="h-7 px-2.5 text-xs bg-[#10B981] hover:bg-[#059669] min-h-[44px] sm:min-h-0"
                                  onClick={() =>
                                    setWireConfirmModal({
                                      open: true,
                                      transactionId: wire.transactionId,
                                      investorName: wire.name,
                                      expectedAmount: wire.amount,
                                    })
                                  }
                                >
                                  Confirm
                                </Button>
                                <Link href={`/admin/fund/${fundId}/wire`}>
                                  <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs min-h-[44px] sm:min-h-0">
                                    View
                                  </Button>
                                </Link>
                              </div>
                            </div>
                          ))}
                          {pendingDetails.pendingWires.total > pendingDetails.pendingWires.items.length && (
                            <Link
                              href={`/admin/fund/${fundId}/wire`}
                              className="block text-xs text-[#0066FF] hover:underline pl-2"
                            >
                              ...and {pendingDetails.pendingWires.total - pendingDetails.pendingWires.items.length} more
                            </Link>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Pending Documents Section */}
                    {pendingDetails && pendingDetails.pendingDocs.items.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                          {pendingDetails.pendingDocs.total} Document{pendingDetails.pendingDocs.total !== 1 ? "s" : ""} Need Review
                        </h4>
                        <div className="space-y-1.5">
                          {pendingDetails.pendingDocs.items.map((doc) => (
                            <div
                              key={doc.documentId}
                              className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-lg border bg-background text-sm"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{doc.name}</span>
                                <span className="text-muted-foreground ml-1">
                                  — {doc.title || doc.documentType}
                                </span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {timeAgo(doc.createdAt)}
                                </span>
                              </div>
                              <div className="flex gap-1.5 flex-shrink-0">
                                <Button
                                  size="sm"
                                  className="h-7 px-2.5 text-xs bg-[#10B981] hover:bg-[#059669] min-h-[44px] sm:min-h-0"
                                  disabled={approvingDocId === doc.documentId}
                                  onClick={() => handleApproveDoc(doc.documentId)}
                                >
                                  {approvingDocId === doc.documentId ? (
                                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                  ) : (
                                    "Approve"
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2.5 text-xs text-red-600 border-red-200 hover:bg-red-50 min-h-[44px] sm:min-h-0"
                                  disabled={rejectingDocId === doc.documentId}
                                  onClick={() => handleRejectDoc(doc.documentId)}
                                >
                                  {rejectingDocId === doc.documentId ? (
                                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                  ) : (
                                    "Reject"
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))}
                          {pendingDetails.pendingDocs.total > pendingDetails.pendingDocs.items.length && (
                            <Link
                              href="/admin/documents"
                              className="block text-xs text-[#0066FF] hover:underline pl-2"
                            >
                              ...and {pendingDetails.pendingDocs.total - pendingDetails.pendingDocs.items.length} more
                            </Link>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Investors Needing Review Section */}
                    {pendingDetails && pendingDetails.needsReview.items.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
                          {pendingDetails.needsReview.total} Investor{pendingDetails.needsReview.total !== 1 ? "s" : ""} Need Review
                        </h4>
                        <div className="space-y-1.5">
                          {pendingDetails.needsReview.items.map((inv) => (
                            <div
                              key={inv.investorId}
                              className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-lg border bg-background text-sm"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{inv.name}</span>
                                <span className="text-muted-foreground ml-1">({inv.email})</span>
                                <Badge variant="outline" className="ml-2 text-[10px] py-0">
                                  {inv.stage.replace("_", " ")}
                                </Badge>
                              </div>
                              <Link href={`/admin/investors/${inv.investorId}`}>
                                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs min-h-[44px] sm:min-h-0">
                                  Review
                                </Button>
                              </Link>
                            </div>
                          ))}
                          {pendingDetails.needsReview.total > pendingDetails.needsReview.items.length && (
                            <button
                              onClick={() => setActiveTab("pipeline")}
                              className="block text-xs text-[#0066FF] hover:underline pl-2"
                            >
                              ...and {pendingDetails.needsReview.total - pendingDetails.needsReview.items.length} more
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Awaiting Wire Section */}
                    {pendingDetails && pendingDetails.awaitingWire.items.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-[#10B981]" />
                          {pendingDetails.awaitingWire.total} Awaiting Wire Transfer
                        </h4>
                        <div className="space-y-1.5">
                          {pendingDetails.awaitingWire.items.map((inv) => (
                            <div
                              key={inv.investmentId}
                              className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-lg border bg-background text-sm"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{inv.name}</span>
                                <span className="text-muted-foreground ml-1">
                                  — commitment: {formatCurrency(inv.commitmentAmount)}
                                </span>
                              </div>
                              <Link href={`/admin/fund/${fundId}/wire`}>
                                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs min-h-[44px] sm:min-h-0">
                                  View
                                </Button>
                              </Link>
                            </div>
                          ))}
                          {pendingDetails.awaitingWire.total > pendingDetails.awaitingWire.items.length && (
                            <Link
                              href={`/admin/fund/${fundId}/wire`}
                              className="block text-xs text-[#0066FF] hover:underline pl-2"
                            >
                              ...and {pendingDetails.awaitingWire.total - pendingDetails.awaitingWire.items.length} more
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Tabs value={activeTab} onValueChange={handleTabChange} className="mb-6">
            <FundTabNav entityMode={fund.entityMode} />

            <TabsContent value="pipeline" className="mt-6">
              <InvestorPipelineTab fundId={fund.id} teamId={fund.teamId} />
            </TabsContent>

            <TabsContent value="documents" className="mt-6">
              <FundDocumentsTab fundId={fund.id} teamId={fund.teamId} />
            </TabsContent>

            <TabsContent value="capitalCalls" className="mt-6">
              <CapitalCallsTab fundId={fund.id} teamId={fund.teamId} />
            </TabsContent>

            <TabsContent value="capital" className="mt-6">
              <CapitalTrackingDashboard fundId={fund.id} />
            </TabsContent>

            <TabsContent value="timeline" className="mt-6">
              <InvestorTimeline teamId={fund.teamId} showNotes showReply />
            </TabsContent>

            <TabsContent value="marketplace" className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                      <Store className="h-5 w-5 text-blue-600" aria-hidden="true" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">FundRoom Marketplace</CardTitle>
                      <CardDescription>
                        List your fund on the FundRoom marketplace to reach accredited investors.
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="ml-auto">Coming Soon</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">
                      The FundRoom Marketplace will connect GPs with a curated network of accredited investors.
                      Express your interest now and be first in line when the marketplace launches.
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={fund.marketplaceInterest ?? false}
                          onChange={async (e) => {
                            try {
                              const resp = await fetch(`/api/teams/${fund.teamId}/funds/${fund.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ marketplaceInterest: e.target.checked }),
                              });
                              if (resp.ok) fetchFundDetails();
                            } catch {
                              // Silent fail — non-critical
                            }
                          }}
                          className="h-5 w-5 rounded border-gray-300 cursor-pointer"
                        />
                        <span className="text-sm font-medium">
                          I am interested in listing on the marketplace when it launches
                        </span>
                      </label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="overview" className="mt-0">
              <FundOverviewTab fund={fund} formatCurrency={formatCurrency} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <BulkActionWizard
        fundId={fund.id}
        isOpen={showBulkWizard}
        onClose={() => setShowBulkWizard(false)}
        onComplete={() => {
          setShowBulkWizard(false);
          fetchFundDetails();
        }}
      />

      <QuickWireConfirmModal
        isOpen={wireConfirmModal.open}
        onClose={() => setWireConfirmModal((prev) => ({ ...prev, open: false }))}
        onConfirmed={handleWireConfirmed}
        transactionId={wireConfirmModal.transactionId}
        teamId={fund.teamId}
        investorName={wireConfirmModal.investorName}
        expectedAmount={wireConfirmModal.expectedAmount}
      />
    </>
  );
}
