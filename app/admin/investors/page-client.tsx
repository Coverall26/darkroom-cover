"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Users,
  Search,
  ChevronRight,
  UserCheck,
  Clock,
  Shield,
  DollarSign,
  CheckCircle2,
  XCircle,
  Download,
  Send,
  Flame,
  AlertCircle,
  Plus,
  Upload,
  MoreHorizontal,
  Eye,
  Mail,
  Bell,
  Trash2,
  LayoutList,
  Columns3,
  Thermometer,
  Snowflake,
  User,
  Building2,
  Briefcase,
  CreditCard,
  X,
  CalendarDays,
  CheckSquare,
  Square,
  MinusSquare,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { InviteInvestorsModal } from "@/components/admin/invite-investors-modal";

// --- Types ---

interface InvestorSummary {
  id: string;
  name: string;
  email: string;
  entityName: string | null;
  entityType: string | null;
  commitment: number;
  funded: number;
  status: string;
  stage: string;
  accreditationStatus: string | null;
  ndaSigned: boolean;
  leadSource: string | null;
  createdAt: string;
  lastActivityAt?: string | null;
  fundingStatus?: string;
}

type ViewMode = "table" | "kanban";
type EngagementFilter = "all" | "hot" | "warm" | "cool" | "none";
type DateRange = "all" | "7d" | "30d" | "90d" | "custom";

// --- Constants ---

const STAGE_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; borderColor: string }
> = {
  APPLIED: { label: "Lead", color: "text-gray-600", bgColor: "bg-gray-100", borderColor: "border-gray-300" },
  UNDER_REVIEW: { label: "Under Review", color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-amber-300" },
  APPROVED: { label: "Approved", color: "text-emerald-600", bgColor: "bg-emerald-50", borderColor: "border-emerald-300" },
  COMMITTED: { label: "Committed", color: "text-purple-600", bgColor: "bg-purple-50", borderColor: "border-purple-300" },
  DOCS_APPROVED: { label: "Docs Approved", color: "text-indigo-600", bgColor: "bg-indigo-50", borderColor: "border-indigo-300" },
  FUNDED: { label: "Funded", color: "text-green-600", bgColor: "bg-green-50", borderColor: "border-green-300" },
  REJECTED: { label: "Rejected", color: "text-red-600", bgColor: "bg-red-50", borderColor: "border-red-300" },
};

// Kanban pipeline stages (excludes REJECTED — shown as overlay count)
const KANBAN_STAGES = ["APPLIED", "UNDER_REVIEW", "APPROVED", "COMMITTED", "DOCS_APPROVED", "FUNDED"];

const ENTITY_ICONS: Record<string, typeof User> = {
  INDIVIDUAL: User,
  JOINT: Users,
  LLC: Building2,
  CORPORATION: Building2,
  TRUST: Briefcase,
  PARTNERSHIP: Users,
  RETIREMENT: CreditCard,
  IRA: CreditCard,
  CHARITY: Shield,
  OTHER: User,
};

const ENTITY_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  JOINT: "Joint",
  LLC: "LLC",
  CORPORATION: "Corp",
  TRUST: "Trust",
  PARTNERSHIP: "Partnership",
  RETIREMENT: "IRA",
  IRA: "IRA",
  CHARITY: "Charity",
  OTHER: "Other",
};

const FUNDING_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  NOT_FUNDED: { label: "Not Funded", className: "text-gray-500" },
  PENDING_WIRE: { label: "Pending Wire", className: "text-amber-600" },
  WIRE_UPLOADED: { label: "Wire Uploaded", className: "text-blue-600" },
  CONFIRMED: { label: "Confirmed", className: "text-emerald-600" },
};

// --- Utility Functions ---

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
}

function getEngagementScore(investor: InvestorSummary): number {
  let score = 0;
  if (investor.ndaSigned) score += 5;
  if (investor.commitment > 0) score += 10;
  if (investor.funded > 0) score += 5;
  if (
    investor.accreditationStatus === "VERIFIED" ||
    investor.accreditationStatus === "SELF_ATTESTED" ||
    investor.accreditationStatus === "SELF_CERTIFIED" ||
    investor.accreditationStatus === "THIRD_PARTY_VERIFIED" ||
    investor.accreditationStatus === "KYC_VERIFIED"
  )
    score += 3;
  return score;
}

function getEngagementTier(score: number): "hot" | "warm" | "cool" | "none" {
  if (score >= 15) return "hot";
  if (score >= 5) return "warm";
  if (score >= 1) return "cool";
  return "none";
}

function getEngagementBadge(score: number): {
  label: string;
  tier: "hot" | "warm" | "cool" | "none";
  className: string;
  icon: typeof Flame | null;
} {
  if (score >= 15) return { label: "Hot", tier: "hot", className: "bg-red-100 text-red-700 border-red-200", icon: Flame };
  if (score >= 5) return { label: "Warm", tier: "warm", className: "bg-amber-100 text-amber-700 border-amber-200", icon: Thermometer };
  if (score >= 1) return { label: "Cool", tier: "cool", className: "bg-blue-100 text-blue-700 border-blue-200", icon: Snowflake };
  return { label: "None", tier: "none", className: "bg-gray-100 text-gray-500 border-gray-200", icon: null };
}

function getFundingStatus(investor: InvestorSummary): string {
  if (investor.funded > 0 && investor.funded >= investor.commitment) return "CONFIRMED";
  if (investor.status === "PROOF_UPLOADED" || investor.fundingStatus === "PROOF_UPLOADED") return "WIRE_UPLOADED";
  if (investor.commitment > 0 && investor.funded === 0) return "PENDING_WIRE";
  return "NOT_FUNDED";
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function exportCSV(investors: InvestorSummary[]) {
  const headers = [
    "Name", "Email", "Entity", "Entity Type", "Stage", "Commitment",
    "Funded", "Funding Status", "NDA Signed", "Accreditation", "Engagement",
    "Lead Source", "Last Activity", "Date Added",
  ];
  const rows = investors.map((inv) => {
    const score = getEngagementScore(inv);
    const eng = getEngagementBadge(score);
    const funding = getFundingStatus(inv);
    return [
      inv.entityName || inv.name,
      inv.email,
      inv.entityName || "",
      inv.entityType || "",
      STAGE_CONFIG[inv.stage]?.label || inv.stage,
      inv.commitment.toString(),
      inv.funded.toString(),
      FUNDING_STATUS_CONFIG[funding]?.label || funding,
      inv.ndaSigned ? "Yes" : "No",
      inv.accreditationStatus || "N/A",
      eng.label,
      inv.leadSource || "Unknown",
      inv.lastActivityAt ? new Date(inv.lastActivityAt).toISOString() : "",
      new Date(inv.createdAt).toLocaleDateString(),
    ];
  });
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `investors-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Main Component ---

export default function InvestorsListClient() {
  const router = useRouter();
  const [investors, setInvestors] = useState<InvestorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState<string | null>(null);
  const [filterEngagement, setFilterEngagement] = useState<EngagementFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [fundId, setFundId] = useState<string | null>(null);
  const [funds, setFunds] = useState<Array<{ id: string; name: string }>>([]);
  const [filterFundId, setFilterFundId] = useState<string | null>(null);
  const [fundName, setFundName] = useState<string>("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "commitment" | "createdAt">("commitment");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const fetchInvestors = useCallback(async () => {
    try {
      const teamRes = await fetch("/api/teams");
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        const teams = teamData.teams || teamData;
        if (teams.length > 0) {
          const tid = teams[0].id || teams[0].teamId;
          setTeamId(tid);

          const res = await fetch(`/api/teams/${tid}/investors`);
          if (res.ok) {
            const data = await res.json();
            setInvestors(data.investors || []);
          }

          const fundsRes = await fetch(`/api/teams/${tid}/funds`);
          if (fundsRes.ok) {
            const fundsData = await fundsRes.json();
            const fundsList = fundsData.funds || fundsData || [];
            setFunds(fundsList.map((f: { id: string; name: string }) => ({ id: f.id, name: f.name || "Fund" })));
            if (fundsList.length > 0) {
              setFundId(fundsList[0].id);
              setFundName(fundsList[0].name || "Fund");
            }
          }
        }
      }
    } catch {
      setError("Failed to load investors. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvestors();
  }, [fetchInvestors]);

  // Filtering logic
  const filteredInvestors = useMemo(() => {
    return investors
      .filter((inv) => {
        const matchSearch =
          !search ||
          inv.name.toLowerCase().includes(search.toLowerCase()) ||
          inv.email.toLowerCase().includes(search.toLowerCase()) ||
          (inv.entityName || "").toLowerCase().includes(search.toLowerCase());
        const matchStage = !filterStage || inv.stage === filterStage;
        const matchFund = !filterFundId; // Fund filtering would need investment-level data
        const matchEngagement =
          filterEngagement === "all" ||
          getEngagementTier(getEngagementScore(inv)) === filterEngagement;

        // Date range filter
        let matchDate = true;
        if (dateRange !== "all") {
          const invDate = new Date(inv.createdAt).getTime();
          const now = Date.now();
          if (dateRange === "7d") matchDate = invDate >= now - 7 * 86400000;
          else if (dateRange === "30d") matchDate = invDate >= now - 30 * 86400000;
          else if (dateRange === "90d") matchDate = invDate >= now - 90 * 86400000;
          else if (dateRange === "custom") {
            if (customDateFrom) matchDate = invDate >= new Date(customDateFrom).getTime();
            if (customDateTo && matchDate) matchDate = invDate <= new Date(customDateTo).getTime() + 86400000;
          }
        }

        return matchSearch && matchStage && matchFund && matchEngagement && matchDate;
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        if (sortBy === "name") return dir * (a.name || "").localeCompare(b.name || "");
        if (sortBy === "commitment") return dir * (a.commitment - b.commitment);
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      });
  }, [investors, search, filterStage, filterFundId, filterEngagement, sortBy, sortDir, dateRange, customDateFrom, customDateTo]);

  // Stage counts
  const stageCounts = useMemo(
    () =>
      investors.reduce(
        (acc, inv) => {
          acc[inv.stage] = (acc[inv.stage] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    [investors],
  );

  const totalCommitted = useMemo(() => investors.reduce((s, inv) => s + inv.commitment, 0), [investors]);
  const totalFunded = useMemo(() => investors.reduce((s, inv) => s + inv.funded, 0), [investors]);

  const hasActiveFilters = !!filterStage || filterEngagement !== "all" || !!filterFundId || !!search || dateRange !== "all";

  function clearFilters() {
    setSearch("");
    setFilterStage(null);
    setFilterEngagement("all");
    setFilterFundId(null);
    setDateRange("all");
    setCustomDateFrom("");
    setCustomDateTo("");
  }

  function handleSort(col: "name" | "commitment" | "createdAt") {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir(col === "name" ? "asc" : "desc");
    }
  }

  // --- Batch Selection ---

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredInvestors.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInvestors.map((inv) => inv.id)));
    }
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const selectedInvestors = useMemo(
    () => filteredInvestors.filter((inv) => selectedIds.has(inv.id)),
    [filteredInvestors, selectedIds],
  );

  // --- Batch Actions ---

  async function handleBatchApprove() {
    if (!teamId || !fundId || selectedInvestors.length === 0) return;
    setBatchLoading(true);
    let successCount = 0;
    let failCount = 0;
    for (const inv of selectedInvestors) {
      if (inv.stage === "APPROVED" || inv.stage === "COMMITTED" || inv.stage === "DOCS_APPROVED" || inv.stage === "FUNDED") {
        successCount++;
        continue; // Already approved or beyond
      }
      try {
        const res = await fetch(`/api/admin/investors/${inv.id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve", fundId, teamId }),
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }
    setBatchLoading(false);
    if (successCount > 0) toast.success(`Approved ${successCount} investor${successCount !== 1 ? "s" : ""}`);
    if (failCount > 0) toast.error(`Failed to approve ${failCount} investor${failCount !== 1 ? "s" : ""}`);
    clearSelection();
    fetchInvestors();
  }

  function handleBatchEmail() {
    if (selectedInvestors.length === 0) return;
    const emails = selectedInvestors.map((inv) => inv.email).join(",");
    window.open(`mailto:${emails}`);
  }

  function handleBatchExport() {
    if (selectedInvestors.length === 0) return;
    exportCSV(selectedInvestors);
    toast.success(`Exported ${selectedInvestors.length} investor${selectedInvestors.length !== 1 ? "s" : ""}`);
  }

  // --- Render ---

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="flex justify-between">
            <div className="h-8 bg-muted rounded w-32" />
            <div className="flex gap-2">
              <div className="h-9 bg-muted rounded w-32" />
              <div className="h-9 bg-muted rounded w-24" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-lg" />
            ))}
          </div>
          <div className="h-10 bg-muted rounded w-full" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-muted rounded" />
            ))}
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
        <Button onClick={() => { setError(null); setLoading(true); fetchInvestors(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Investors</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Investors</h1>
          <p className="text-muted-foreground">
            {investors.length} investor{investors.length !== 1 ? "s" : ""}{" "}
            {filteredInvestors.length !== investors.length && (
              <span className="text-primary">({filteredInvestors.length} shown)</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV(filteredInvestors)}>
            <Download className="h-4 w-4 mr-2" aria-hidden="true" />
            Export CSV
          </Button>
          <Link href="/admin/investors/import">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" aria-hidden="true" />
              Import CSV
            </Button>
          </Link>
          <Link href="/admin/investors/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Add Investor
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[#0066FF]">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-[#0066FF]" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">Total Investors</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">{investors.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-purple-500" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">Total Committed</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">{formatCurrency(totalCommitted)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#10B981]">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-[#10B981]" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">Total Funded</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">{formatCurrency(totalFunded)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[#F59E0B]">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">Approved+</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">
              {(stageCounts.APPROVED || 0) +
                (stageCounts.COMMITTED || 0) +
                (stageCounts.DOCS_APPROVED || 0) +
                (stageCounts.FUNDED || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3">
        {/* Top row: Search + View Toggle */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search by name, email, or entity..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              aria-label="Search investors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex gap-2 items-center">
            {/* Engagement filter */}
            <select
              value={filterEngagement}
              onChange={(e) => setFilterEngagement(e.target.value as EngagementFilter)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Filter by engagement"
            >
              <option value="all">All Engagement</option>
              <option value="hot">Hot (15+)</option>
              <option value="warm">Warm (5-14)</option>
              <option value="cool">Cool (1-4)</option>
              <option value="none">None</option>
            </select>
            {/* Date range filter */}
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Filter by date range"
            >
              <option value="all">All Time</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="custom">Custom Range</option>
            </select>
            {/* Fund filter (if multiple funds) */}
            {funds.length > 1 && (
              <select
                value={filterFundId || ""}
                onChange={(e) => setFilterFundId(e.target.value || null)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                aria-label="Filter by fund"
              >
                <option value="">All Funds</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
            {/* View Toggle */}
            <div className="flex rounded-md border border-input overflow-hidden">
              <button
                className={`px-3 py-1.5 text-sm min-h-[36px] ${viewMode === "table" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                onClick={() => setViewMode("table")}
                aria-label="Table view"
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                className={`px-3 py-1.5 text-sm min-h-[36px] border-l ${viewMode === "kanban" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                onClick={() => setViewMode("kanban")}
                aria-label="Kanban view"
              >
                <Columns3 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Stage Filter Pills */}
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            variant={filterStage === null ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStage(null)}
          >
            All ({investors.length})
          </Button>
          {Object.entries(STAGE_CONFIG).map(([stage, config]) => {
            const count = stageCounts[stage] || 0;
            if (count === 0) return null;
            return (
              <Button
                key={stage}
                variant={filterStage === stage ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStage(filterStage === stage ? null : stage)}
              >
                <span className={filterStage !== stage ? config.color : ""}>
                  {config.label}
                </span>{" "}
                ({count})
              </Button>
            );
          })}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              <X className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Clear filters
            </Button>
          )}
        </div>

        {/* Custom Date Range Inputs */}
        {dateRange === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              type="date"
              value={customDateFrom}
              onChange={(e) => setCustomDateFrom(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Date from"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              value={customDateTo}
              onChange={(e) => setCustomDateTo(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Date to"
            />
          </div>
        )}
      </div>

      {/* Content Area */}
      {viewMode === "table" ? (
        <TableView
          investors={filteredInvestors}
          teamId={teamId}
          fundId={fundId}
          fundName={fundName}
          showInviteModal={showInviteModal}
          setShowInviteModal={setShowInviteModal}
          search={search}
          filterStage={filterStage}
          setSearch={setSearch}
          setFilterStage={setFilterStage}
          onSort={handleSort}
          sortBy={sortBy}
          sortDir={sortDir}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      ) : (
        <KanbanView investors={filteredInvestors} />
      )}

      {/* Floating Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-[#0A1628] text-white rounded-xl shadow-2xl px-5 py-3 border border-gray-700">
            <span className="text-sm font-medium whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <div className="w-px h-5 bg-gray-600" />
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10 gap-1.5"
              onClick={handleBatchApprove}
              disabled={batchLoading}
            >
              {batchLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserCheck className="h-4 w-4" aria-hidden="true" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10 gap-1.5"
              onClick={handleBatchEmail}
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              Email
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10 gap-1.5"
              onClick={handleBatchExport}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Export
            </Button>
            <div className="w-px h-5 bg-gray-600" />
            <button
              onClick={clearSelection}
              className="p-1 rounded hover:bg-white/10 min-h-[32px] min-w-[32px] flex items-center justify-center"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {teamId && fundId && (
        <InviteInvestorsModal
          open={showInviteModal}
          onOpenChange={setShowInviteModal}
          teamId={teamId}
          fundId={fundId}
          fundName={fundName}
        />
      )}
    </div>
  );
}

// --- Table View ---

function TableView({
  investors,
  teamId,
  fundId,
  fundName,
  showInviteModal,
  setShowInviteModal,
  search,
  filterStage,
  setSearch,
  setFilterStage,
  onSort,
  sortBy,
  sortDir,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: {
  investors: InvestorSummary[];
  teamId: string | null;
  fundId: string | null;
  fundName: string;
  showInviteModal: boolean;
  setShowInviteModal: (v: boolean) => void;
  search: string;
  filterStage: string | null;
  setSearch: (v: string) => void;
  setFilterStage: (v: string | null) => void;
  onSort: (col: "name" | "commitment" | "createdAt") => void;
  sortBy: string;
  sortDir: string;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}) {
  if (investors.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="text-center py-12">
            {search ? (
              <>
                <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
                <p className="text-muted-foreground font-medium">
                  No investors matching &ldquo;{search}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground mt-1">Try adjusting your search terms</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setSearch("")}>
                  Clear Search
                </Button>
              </>
            ) : filterStage ? (
              <>
                <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
                <p className="text-muted-foreground font-medium">
                  No {STAGE_CONFIG[filterStage]?.label || filterStage} investors
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setFilterStage(null)}>
                  Show All
                </Button>
              </>
            ) : (
              <>
                <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
                <p className="text-muted-foreground font-medium">No investors yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Share your dataroom link to start building your pipeline.
                </p>
                <div className="flex gap-2 justify-center mt-3">
                  {teamId && fundId && (
                    <Button size="sm" onClick={() => setShowInviteModal(true)}>
                      <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                      Invite
                    </Button>
                  )}
                  <Link href="/admin/investors/new">
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                      Add Manually
                    </Button>
                  </Link>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const allSelected = investors.length > 0 && selectedIds.size === investors.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < investors.length;

  const SelectAllIcon = allSelected ? CheckSquare : someSelected ? MinusSquare : Square;

  return (
    <Card>
      <CardContent className="p-0">
        {/* Table Header (desktop) */}
        <div className="hidden md:grid grid-cols-[36px_1fr_120px_120px_100px_100px_80px_40px] gap-2 px-4 py-2 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
          <button
            onClick={(e) => { e.preventDefault(); onToggleSelectAll(); }}
            className="flex items-center justify-center hover:text-foreground min-h-[28px]"
            aria-label={allSelected ? "Deselect all" : "Select all"}
          >
            <SelectAllIcon className={`h-4 w-4 ${selectedIds.size > 0 ? "text-[#0066FF]" : ""}`} />
          </button>
          <button className="text-left flex items-center gap-1 hover:text-foreground" onClick={() => onSort("name")}>
            Name {sortBy === "name" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
          <span>Status</span>
          <button className="text-right flex items-center gap-1 justify-end hover:text-foreground" onClick={() => onSort("commitment")}>
            Commitment {sortBy === "commitment" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
          <span className="text-center">Funding</span>
          <span className="text-center">Engagement</span>
          <button className="text-right flex items-center gap-1 justify-end hover:text-foreground" onClick={() => onSort("createdAt")}>
            Activity {sortBy === "createdAt" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
          <span />
        </div>
        <div className="divide-y">
          {investors.map((investor) => (
            <InvestorTableRow
              key={investor.id}
              investor={investor}
              isSelected={selectedIds.has(investor.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Investor Table Row ---

function InvestorTableRow({
  investor,
  isSelected,
  onToggleSelect,
}: {
  investor: InvestorSummary;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const stageConfig = STAGE_CONFIG[investor.stage] || STAGE_CONFIG.APPLIED;
  const score = getEngagementScore(investor);
  const engagement = getEngagementBadge(score);
  const fundingStatus = getFundingStatus(investor);
  const fundingConfig = FUNDING_STATUS_CONFIG[fundingStatus] || FUNDING_STATUS_CONFIG.NOT_FUNDED;
  const EntityIcon = (investor.entityType && ENTITY_ICONS[investor.entityType]) || User;
  const entityLabel = (investor.entityType && ENTITY_LABELS[investor.entityType]) || "";
  const lastActivity = investor.lastActivityAt || investor.createdAt;

  const router = useRouter();

  return (
    <div
      className={`flex md:grid md:grid-cols-[36px_1fr_120px_120px_100px_100px_80px_40px] gap-2 md:gap-2 items-center px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer ${isSelected ? "bg-[#0066FF]/5" : ""}`}
      onClick={() => router.push(`/admin/investors/${investor.id}`)}
    >
      {/* Checkbox */}
      <div
        className="hidden md:flex items-center justify-center"
        onClick={(e) => { e.stopPropagation(); onToggleSelect(investor.id); }}
      >
        <button
          className="p-0.5 rounded hover:bg-muted min-h-[28px] min-w-[28px] flex items-center justify-center"
          aria-label={isSelected ? `Deselect ${investor.name}` : `Select ${investor.name}`}
        >
          {isSelected ? (
            <CheckSquare className="h-4 w-4 text-[#0066FF]" />
          ) : (
            <Square className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Name + Entity */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{investor.entityName || investor.name}</p>
          {investor.ndaSigned && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" aria-hidden="true" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">{investor.email}</span>
          {entityLabel && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <EntityIcon className="h-3 w-3" aria-hidden="true" />
              {entityLabel}
            </span>
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div className="hidden md:block">
        <Badge variant="outline" className={`text-xs ${stageConfig.color}`}>
          {stageConfig.label}
        </Badge>
      </div>

      {/* Commitment */}
      <div className="text-right">
        <p className="text-sm font-medium font-mono tabular-nums">
          {investor.commitment > 0 ? formatCurrency(investor.commitment) : "-"}
        </p>
        {investor.funded > 0 && (
          <p className="text-[11px] text-emerald-600 font-mono tabular-nums">
            {formatCurrency(investor.funded)} funded
          </p>
        )}
      </div>

      {/* Funding Status */}
      <div className="hidden md:flex justify-center">
        <span className={`text-xs font-medium ${fundingConfig.className}`}>
          {fundingConfig.label}
        </span>
      </div>

      {/* Engagement */}
      <div className="hidden md:flex justify-center">
        {engagement.tier !== "none" && (
          <Badge variant="outline" className={`text-[10px] ${engagement.className}`}>
            {engagement.icon && <engagement.icon className="h-3 w-3 mr-0.5" aria-hidden="true" />}
            {engagement.label}
          </Badge>
        )}
      </div>

      {/* Last Activity */}
      <div className="hidden md:block text-right">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground cursor-default">
                {formatRelativeTime(lastActivity)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{formatFullDate(lastActivity)}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Actions */}
      <div className="hidden md:flex justify-end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded hover:bg-muted min-h-[32px] min-w-[32px] flex items-center justify-center" aria-label="Investor actions">
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/admin/investors/${investor.id}`}>
                <Eye className="h-4 w-4 mr-2" aria-hidden="true" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(`mailto:${investor.email}`)}>
              <Mail className="h-4 w-4 mr-2" aria-hidden="true" />
              Send Email
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(`mailto:${investor.email}?subject=Reminder`)}>
              <Bell className="h-4 w-4 mr-2" aria-hidden="true" />
              Send Reminder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile chevron */}
      <div className="md:hidden flex items-center">
        <Badge variant="outline" className={`text-[10px] mr-2 ${stageConfig.color}`}>
          {stageConfig.label}
        </Badge>
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  );
}

// --- Kanban View ---

function KanbanView({ investors }: { investors: InvestorSummary[] }) {
  const stageGroups = useMemo(() => {
    const groups: Record<string, InvestorSummary[]> = {};
    for (const stage of KANBAN_STAGES) {
      groups[stage] = [];
    }
    for (const inv of investors) {
      if (groups[inv.stage]) {
        groups[inv.stage].push(inv);
      } else if (inv.stage !== "REJECTED") {
        // Fall into APPLIED if unknown stage
        groups.APPLIED.push(inv);
      }
    }
    return groups;
  }, [investors]);

  const rejectedCount = investors.filter((inv) => inv.stage === "REJECTED").length;

  return (
    <div className="space-y-3">
      {rejectedCount > 0 && (
        <div className="text-xs text-muted-foreground px-1">
          <span className="inline-flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
            {rejectedCount} rejected investor{rejectedCount !== 1 ? "s" : ""} (not shown in pipeline)
          </span>
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {KANBAN_STAGES.map((stage) => {
          const config = STAGE_CONFIG[stage];
          const stageInvestors = stageGroups[stage];
          const totalCommitment = stageInvestors.reduce((s, i) => s + i.commitment, 0);

          return (
            <div
              key={stage}
              className={`flex-shrink-0 w-[260px] rounded-lg border ${config.borderColor} bg-card`}
            >
              {/* Column Header */}
              <div className={`px-3 py-2 border-b ${config.bgColor} rounded-t-lg`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-semibold ${config.color}`}>
                    {config.label}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {stageInvestors.length}
                  </Badge>
                </div>
                {totalCommitment > 0 && (
                  <p className="text-xs text-muted-foreground font-mono tabular-nums mt-0.5">
                    {formatCurrency(totalCommitment)}
                  </p>
                )}
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 max-h-[600px] overflow-y-auto">
                {stageInvestors.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground">
                    No investors
                  </div>
                ) : (
                  stageInvestors.map((inv) => (
                    <KanbanCard key={inv.id} investor={inv} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({ investor }: { investor: InvestorSummary }) {
  const score = getEngagementScore(investor);
  const engagement = getEngagementBadge(score);
  const EntityIcon = (investor.entityType && ENTITY_ICONS[investor.entityType]) || User;
  const lastActivity = investor.lastActivityAt || investor.createdAt;

  return (
    <Link
      href={`/admin/investors/${investor.id}`}
      className="block p-3 rounded-md border bg-background hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{investor.entityName || investor.name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <EntityIcon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <span className="text-[11px] text-muted-foreground truncate">{investor.email}</span>
          </div>
        </div>
        {engagement.tier !== "none" && engagement.icon && (
          <engagement.icon
            className={`h-4 w-4 flex-shrink-0 ${
              engagement.tier === "hot"
                ? "text-red-500"
                : engagement.tier === "warm"
                  ? "text-amber-500"
                  : "text-blue-400"
            }`}
            aria-label={`Engagement: ${engagement.label}`}
          />
        )}
      </div>
      {investor.commitment > 0 && (
        <p className="text-sm font-mono tabular-nums font-semibold mt-2">
          {formatCurrency(investor.commitment)}
        </p>
      )}
      <p className="text-[10px] text-muted-foreground mt-1">
        {formatRelativeTime(lastActivity)}
      </p>
    </Link>
  );
}
