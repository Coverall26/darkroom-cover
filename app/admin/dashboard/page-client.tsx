"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AlertCircle,
  RefreshCw,
  Users,
  UserPlus,
  Plus,
  Share2,
  Landmark,
  Send,
  Rocket,
  FolderLock,
  Copy,
  Check,
  Link as LinkIcon,
} from "lucide-react";

import dynamic from "next/dynamic";
import { GPDashboardSkeleton } from "@/components/admin/dashboard/gp-dashboard-skeleton";
import { RaiseProgressCard } from "@/components/admin/dashboard/raise-progress-card";
import { PendingActionsCard } from "@/components/admin/dashboard/pending-actions-card";
import { StatsPipelineGrid } from "@/components/admin/dashboard/stats-pipeline-grid";
import { ActivityNavGrid } from "@/components/admin/dashboard/activity-nav-grid";
import { ComplianceStatus } from "@/components/admin/compliance-status";
import { DbHealthBanner } from "@/components/admin/db-health-banner";

// Lazy-load chart components (recharts is heavy)
const StartupRoundsChart = dynamic(
  () => import("@/components/admin/startup-rounds-chart").then((m) => ({ default: m.StartupRoundsChart })),
  { ssr: false, loading: () => <div className="h-[400px] animate-pulse rounded-lg bg-muted/30" /> },
);
const UnitsByTierCard = dynamic(
  () => import("@/components/admin/units-by-tier-card").then((m) => ({ default: m.UnitsByTierCard })),
  { ssr: false, loading: () => <div className="h-[400px] animate-pulse rounded-lg bg-muted/30" /> },
);

// --- Types ---

interface DashboardStats {
  stats: {
    dataroomViews: number;
    emailsCaptured: number;
    commitments: number;
    totalCommitted: number;
    totalFunded: number;
  };
  raise: {
    totalTarget: number;
    totalCurrent: number;
    totalCommitted: number;
    totalFunded: number;
    funds: Array<{
      id: string;
      name: string;
      target: number;
      current: number;
      investorCount: number;
      status: string;
    }>;
  };
  pendingActions: {
    pendingWires: number;
    pendingDocs: number;
    needsReview: number;
    awaitingWire: number;
    total: number;
  };
  pipeline: Record<string, number>;
  fundCount: number;
  investorCount: number;
}

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  actor: string | null;
  timestamp: string;
  icon: string;
  link?: string;
}

// --- Mode Configuration ---

type OrgMode = "GP_FUND" | "STARTUP" | "DATAROOM_ONLY";

const MODE_CONFIG: Record<OrgMode, {
  fundLabel: string;
  fundsLabel: string;
  investorLabel: string;
  investorsLabel: string;
  progressLabel: string;
  emptyFundCta: string;
  emptyFundHref: string;
  emptyInvestorText: string;
  emptyInvestorCta: string;
  emptyInvestorHref: string;
  icon: typeof Landmark;
}> = {
  GP_FUND: {
    fundLabel: "Fund",
    fundsLabel: "Funds",
    investorLabel: "LP",
    investorsLabel: "LPs",
    progressLabel: "Raise Progress",
    emptyFundCta: "Create Your First Fund",
    emptyFundHref: "/admin/setup",
    emptyInvestorText: "Share your dataroom to attract your first investor",
    emptyInvestorCta: "Go to Datarooms",
    emptyInvestorHref: "/datarooms",
    icon: Landmark,
  },
  STARTUP: {
    fundLabel: "Raise",
    fundsLabel: "Raises",
    investorLabel: "Investor",
    investorsLabel: "Investors",
    progressLabel: "Round Progress",
    emptyFundCta: "Create Your First Raise",
    emptyFundHref: "/admin/setup",
    emptyInvestorText: "Share your pitch to attract your first investor",
    emptyInvestorCta: "Go to Datarooms",
    emptyInvestorHref: "/datarooms",
    icon: Rocket,
  },
  DATAROOM_ONLY: {
    fundLabel: "Dataroom",
    fundsLabel: "Datarooms",
    investorLabel: "Lead",
    investorsLabel: "Leads",
    progressLabel: "View Analytics",
    emptyFundCta: "Create Your First Dataroom",
    emptyFundHref: "/datarooms",
    emptyInvestorText: "Share your dataroom link to capture leads",
    emptyInvestorCta: "Create Dataroom",
    emptyInvestorHref: "/datarooms",
    icon: FolderLock,
  },
};

// --- Helpers ---

function formatCurrency(value: number) {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyFull(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
}

// --- Component ---

export default function GPDashboardClient() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mode, setMode] = useState<OrgMode>("GP_FUND");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [primaryFundId, setPrimaryFundId] = useState<string | null>(null);
  const [dataroomLink, setDataroomLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const prevActivityCountRef = useRef<number>(0);

  // Fetch org mode + first dataroom link on mount
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/team-context", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.mode) setMode(data.mode as OrgMode);
        if (data?.teamId) setTeamId(data.teamId);
        if (data?.funds?.length > 0) setPrimaryFundId(data.funds[0].id);
        // Fetch the first available dataroom share link for quick copy
        if (data?.teamId) {
          fetch(`/api/teams/${data.teamId}/datarooms`, { signal: controller.signal })
            .then((r) => (r.ok ? r.json() : null))
            .then((drData) => {
              const datarooms = drData?.datarooms || drData || [];
              if (Array.isArray(datarooms) && datarooms.length > 0) {
                const dr = datarooms[0];
                // Check for existing share links
                if (dr.links && dr.links.length > 0) {
                  const linkId = dr.links[0].id;
                  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
                  setDataroomLink(`${baseUrl}/view/${linkId}`);
                }
              }
            })
            .catch(() => { /* non-critical */ });
        }
      })
      .catch((e) => { if (e?.name !== "AbortError") console.error("Failed to load org mode:", e); });
    return () => controller.abort();
  }, []);

  const modeConfig = MODE_CONFIG[mode] || MODE_CONFIG.GP_FUND;

  const fetchStats = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsRefreshing(true);
      const res = await fetch("/api/admin/dashboard-stats");
      if (res.ok) {
        setStats(await res.json());
      } else if (res.status === 403) {
        setError("You need GP admin access to view this dashboard.");
      } else {
        throw new Error("Failed to load dashboard");
      }
    } catch (err: unknown) {
      if (!silent) setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
      if (!silent) setIsRefreshing(false);
    }
  }, []);

  const fetchActivity = useCallback(async (silent = false) => {
    try {
      const res = await fetch("/api/admin/dashboard-activity?limit=15");
      if (res.ok) {
        const data = await res.json();
        const newActivities: ActivityItem[] = data.activities || [];
        setActivities((prev) => {
          // Detect new activity items during silent polling
          if (silent && prev.length > 0 && newActivities.length > 0) {
            const prevIds = new Set(prev.map((a) => a.id));
            const freshCount = newActivities.filter((a) => !prevIds.has(a.id)).length;
            if (freshCount > 0 && prevActivityCountRef.current > 0) {
              toast.info(`${freshCount} new activit${freshCount === 1 ? "y" : "ies"}`, {
                description: "Your dashboard has been updated.",
                duration: 3000,
              });
            }
          }
          prevActivityCountRef.current = newActivities.length;
          return newActivities;
        });
      }
    } catch {
      // Silently fail on activity poll
    }
  }, []);

  const fetchDashboard = useCallback(async (silent = false) => {
    await Promise.all([fetchStats(silent), fetchActivity(silent)]);
  }, [fetchStats, fetchActivity]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Auto-refresh stats every 60s
  useEffect(() => {
    if (!stats) return;
    const interval = setInterval(() => fetchStats(true), 60000);
    return () => clearInterval(interval);
  }, [stats, fetchStats]);

  // Auto-refresh activity every 30s
  useEffect(() => {
    if (!stats) return;
    const interval = setInterval(() => fetchActivity(true), 30000);
    return () => clearInterval(interval);
  }, [stats, fetchActivity]);

  // Derived values
  const committedPercent = useMemo(() => {
    if (!stats) return 0;
    return stats.raise.totalTarget > 0
      ? Math.min(100, (stats.raise.totalCommitted / stats.raise.totalTarget) * 100)
      : 0;
  }, [stats]);

  const fundedPercent = useMemo(() => {
    if (!stats) return 0;
    return stats.raise.totalTarget > 0
      ? Math.min(100, (stats.raise.totalFunded / stats.raise.totalTarget) * 100)
      : 0;
  }, [stats]);

  const pipelineTotal = useMemo(() => {
    if (!stats?.pipeline) return 0;
    const keys = ["APPLIED", "UNDER_REVIEW", "APPROVED", "COMMITTED", "DOCS_APPROVED", "FUNDED"];
    return keys.reduce((sum, key) => sum + (stats.pipeline[key] || 0), 0);
  }, [stats]);

  // --- Loading skeleton ---
  if (loading) {
    return <GPDashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <p className="text-destructive font-medium text-center max-w-sm">{error}</p>
        <Button
          onClick={() => { setError(null); setLoading(true); fetchDashboard(); }}
          className="bg-[#0066FF] hover:bg-[#0052CC] text-white"
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (!stats) return null;

  const { stats: s, raise, pendingActions, pipeline } = stats;
  const isFirstTime = stats.fundCount === 0 && stats.investorCount === 0;

  return (
    <div className="space-y-5">
      {/* ---- HEADER ---- */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono tabular-nums">
            {stats.fundCount} {stats.fundCount !== 1 ? modeConfig.fundsLabel.toLowerCase() : modeConfig.fundLabel.toLowerCase()} &middot;{" "}
            {stats.investorCount} {stats.investorCount !== 1 ? modeConfig.investorsLabel.toLowerCase() : modeConfig.investorLabel.toLowerCase()}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchDashboard()}
          disabled={isRefreshing}
          className="h-8 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* ---- DB HEALTH BANNER (GP-only, shown when degraded/error) ---- */}
      <DbHealthBanner />

      {/* ---- QUICK ACTIONS BAR ---- */}
      {!isFirstTime && (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
          {dataroomLink ? (
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(dataroomLink);
                  setLinkCopied(true);
                  toast.success("Dataroom link copied to clipboard");
                  setTimeout(() => setLinkCopied(false), 2000);
                } catch {
                  toast.error("Failed to copy link");
                }
              }}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-[#0066FF]/30 bg-[#0066FF]/5 text-[#0066FF] hover:bg-[#0066FF]/10 transition-colors whitespace-nowrap"
            >
              {linkCopied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {linkCopied ? "Copied!" : "Copy Dataroom Link"}
            </button>
          ) : (
            <Link href="/datarooms">
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-[#0066FF]/30 bg-[#0066FF]/5 text-[#0066FF] hover:bg-[#0066FF]/10 transition-colors whitespace-nowrap">
                <LinkIcon className="h-3.5 w-3.5" />
                Share Dataroom
              </span>
            </Link>
          )}
          <Link href="/admin/investors/new">
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted transition-colors whitespace-nowrap">
              <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
              Add {modeConfig.investorLabel}
            </span>
          </Link>
          <Link href="/admin/investors">
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted transition-colors whitespace-nowrap">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              View Pipeline
            </span>
          </Link>
          {mode !== "DATAROOM_ONLY" && (
            <Link href="/admin/investors?action=send-update">
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted transition-colors whitespace-nowrap">
                <Send className="h-3.5 w-3.5 text-muted-foreground" />
                Send Update
              </span>
            </Link>
          )}
        </div>
      )}

      {/* ---- FIRST-TIME USER WELCOME ---- */}
      {isFirstTime && (
        <Card className="border-[#0066FF]/20 bg-[#0066FF]/5 dark:bg-[#0066FF]/10 shadow-sm">
          <CardContent className="py-8 text-center">
            <div className="h-14 w-14 rounded-2xl bg-[#0066FF]/10 flex items-center justify-center mx-auto mb-4">
              <modeConfig.icon className="h-7 w-7 text-[#0066FF]" />
            </div>
            <h2 className="text-lg font-semibold mb-1">Welcome to FundRoom</h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              {mode === "DATAROOM_ONLY"
                ? "Set up your first dataroom to start sharing documents and capturing leads."
                : "Complete your setup wizard to create your first fund and start accepting investors."}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link href={modeConfig.emptyFundHref}>
                <Button className="bg-[#0066FF] hover:bg-[#0052CC] text-white w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-1.5" />
                  {modeConfig.emptyFundCta}
                </Button>
              </Link>
              {mode !== "DATAROOM_ONLY" && (
                <Link href="/datarooms">
                  <Button variant="outline" className="w-full sm:w-auto">
                    <Share2 className="h-4 w-4 mr-1.5" />
                    Create Dataroom
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- SECTION 1: FUND RAISE PROGRESS ---- */}
      <RaiseProgressCard
        mode={mode}
        raise={raise}
        stats={s}
        investorCount={stats.investorCount}
        fundCount={stats.fundCount}
        committedPercent={committedPercent}
        fundedPercent={fundedPercent}
        progressLabel={modeConfig.progressLabel}
        formatCurrency={formatCurrency}
        formatCurrencyFull={formatCurrencyFull}
      />

      {/* ---- SECTION 2: PENDING ACTIONS ---- */}
      <PendingActionsCard pendingActions={pendingActions} />

      {/* ---- SECTION 2.5: FUNDING STRUCTURE CHART ---- */}
      {mode !== "DATAROOM_ONLY" && teamId && primaryFundId && (
        mode === "STARTUP" ? (
          <StartupRoundsChart fundId={primaryFundId} teamId={teamId} />
        ) : (
          <UnitsByTierCard fundId={primaryFundId} teamId={teamId} />
        )
      )}

      {/* ---- SECTION 3: COMPLIANCE STATUS ---- */}
      {mode !== "DATAROOM_ONLY" && <ComplianceStatus />}

      {/* ---- SECTION 4: STATS + PIPELINE ---- */}
      <StatsPipelineGrid
        mode={mode}
        modeConfig={modeConfig}
        stats={s}
        pipeline={pipeline}
        pipelineTotal={pipelineTotal}
        investorCount={stats.investorCount}
        fundCount={stats.fundCount}
        formatCurrency={formatCurrency}
      />

      {/* ---- SECTION 5: ACTIVITY + NAVIGATION ---- */}
      <ActivityNavGrid
        mode={mode}
        modeConfig={modeConfig}
        activities={activities}
        fundCount={stats.fundCount}
        investorCount={stats.investorCount}
      />
    </div>
  );
}
