"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Eye,
  Users,
  FileText,
  Clock,
  Download,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle,
  RefreshCcw,
  ChevronDown,
  BarChart3,
  Flame,
  Thermometer,
  Snowflake,
  Calendar,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// ── Types ──

interface AnalyticsOverview {
  totalViews: number;
  uniqueVisitors: number;
  totalDocuments: number;
  avgDwellTimeMs: number;
  viewsTrend: number; // % change vs previous period
}

interface VisitorRow {
  email: string;
  viewerName: string | null;
  totalViews: number;
  lastActive: string;
  uniqueDocuments: number;
  verified: boolean;
  totalDuration: string;
  engagementTier: "HOT" | "WARM" | "COOL" | "NONE";
}

interface DocumentRow {
  id: string;
  name: string;
  views: number;
  downloads: number;
  totalDuration: string;
  lastViewed: string | null;
  completionRate: number;
}

interface VisitorSourceData {
  name: string;
  value: number;
}

interface ViewEvent {
  id: string;
  viewerEmail: string;
  documentName: string;
  linkName: string;
  viewedAt: string;
  totalDuration: string;
  completionRate: number;
}

interface DataroomOption {
  id: string;
  name: string;
}

type TimeRange = "24h" | "7d" | "30d" | "90d" | "custom";
type TabKey = "overview" | "visitors" | "documents" | "events";

// ── Constants ──

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

const PIE_COLORS = ["#0066FF", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4"];

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "visitors", label: "Visitors" },
  { key: "documents", label: "Documents" },
  { key: "events", label: "Events" },
];

const ENGAGEMENT_CONFIG: Record<string, { label: string; icon: typeof Flame; className: string }> = {
  HOT: { label: "Hot", icon: Flame, className: "text-red-600 bg-red-50 dark:bg-red-950/40" },
  WARM: { label: "Warm", icon: Thermometer, className: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
  COOL: { label: "Cool", icon: Snowflake, className: "text-blue-600 bg-blue-50 dark:bg-blue-950/40" },
  NONE: { label: "-", icon: Snowflake, className: "text-muted-foreground bg-muted" },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Main Component ──

export default function DataroomAnalyticsClient() {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [datarooms, setDatarooms] = useState<DataroomOption[]>([]);
  const [selectedDataroom, setSelectedDataroom] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [events, setEvents] = useState<ViewEvent[]>([]);
  const [graphData, setGraphData] = useState<{ date: string; views: number }[]>([]);
  const [visitorSources, setVisitorSources] = useState<VisitorSourceData[]>([]);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [docViewers, setDocViewers] = useState<ViewEvent[]>([]);

  // Initial load: fetch team + datarooms
  useEffect(() => {
    async function init() {
      try {
        const teamRes = await fetch("/api/admin/team-context");
        if (!teamRes.ok) throw new Error("Failed to load team");
        const teamData = await teamRes.json();
        const tid = teamData.teamId;
        setTeamId(tid);

        // Fetch datarooms for selector
        const drRes = await fetch(`/api/teams/${tid}/datarooms`);
        if (drRes.ok) {
          const drData = await drRes.json();
          const drs = (drData.datarooms || drData || []).map((dr: { id: string; name: string }) => ({
            id: dr.id,
            name: dr.name,
          }));
          setDatarooms(drs);
          if (drs.length > 0) setSelectedDataroom(drs[0].id);
        }
      } catch {
        setError("Failed to load analytics data.");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Fetch analytics data based on selections
  const fetchAnalytics = useCallback(async (isRefresh = false) => {
    if (!teamId) return;
    if (isRefresh) setRefreshing(true);

    try {
      const params = new URLSearchParams({
        teamId,
        interval: timeRange,
        type: "overview",
      });

      // Fetch overview
      const overviewRes = await fetch(`/api/analytics?${params}`);
      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setOverview({
          totalViews: data.totalViews || 0,
          uniqueVisitors: data.uniqueVisitors || 0,
          totalDocuments: data.totalDocuments || 0,
          avgDwellTimeMs: data.avgDwellTimeMs || 0,
          viewsTrend: data.viewsTrend || 0,
        });
        setGraphData(data.graphData || []);
      }

      // Fetch visitors
      const visitorsParams = new URLSearchParams({ teamId, interval: timeRange, type: "visitors" });
      const visitorsRes = await fetch(`/api/analytics?${visitorsParams}`);
      if (visitorsRes.ok) {
        const vData = await visitorsRes.json();
        setVisitors(
          (vData.visitors || []).map((v: Record<string, unknown>) => ({
            email: v.email || "",
            viewerName: v.viewerName || null,
            totalViews: v.totalViews || 0,
            lastActive: v.lastActive || "",
            uniqueDocuments: v.uniqueDocuments || 0,
            verified: v.verified || false,
            totalDuration: v.totalDuration || "0s",
            engagementTier: getEngagementTier(v),
          })),
        );
      }

      // Compute visitor sources from engagement tiers
      if (visitors.length > 0) {
        const tierCounts: Record<string, number> = {};
        for (const v of visitors) {
          const tier = v.engagementTier || "NONE";
          tierCounts[tier] = (tierCounts[tier] || 0) + 1;
        }
        setVisitorSources(
          Object.entries(tierCounts).map(([name, value]) => ({
            name: ENGAGEMENT_CONFIG[name]?.label || name,
            value,
          })),
        );
      }

      // Fetch documents
      const docsParams = new URLSearchParams({ teamId, interval: timeRange, type: "documents" });
      const docsRes = await fetch(`/api/analytics?${docsParams}`);
      if (docsRes.ok) {
        const dData = await docsRes.json();
        setDocuments(
          (dData.documents || []).map((d: Record<string, unknown>) => ({
            id: (d.id as string) || "",
            name: (d.name as string) || "Untitled",
            views: (d.views as number) || 0,
            downloads: (d.downloads as number) || 0,
            totalDuration: (d.totalDuration as string) || "0s",
            lastViewed: (d.lastViewed as string) || null,
            completionRate: (d.completionRate as number) || 0,
          })),
        );
      }

      // Fetch view events
      const viewsParams = new URLSearchParams({ teamId, interval: timeRange, type: "views" });
      const viewsRes = await fetch(`/api/analytics?${viewsParams}`);
      if (viewsRes.ok) {
        const eData = await viewsRes.json();
        setEvents(
          (eData.views || []).map((e: Record<string, unknown>) => ({
            id: (e.id as string) || "",
            viewerEmail: (e.viewerEmail as string) || "",
            documentName: (e.documentName as string) || "",
            linkName: (e.linkName as string) || "",
            viewedAt: (e.viewedAt as string) || "",
            totalDuration: (e.totalDuration as string) || "0s",
            completionRate: (e.completionRate as number) || 0,
          })),
        );
      }
    } catch {
      setError("Failed to load analytics.");
    } finally {
      setRefreshing(false);
    }
  }, [teamId, timeRange]);

  useEffect(() => {
    if (teamId) fetchAnalytics();
  }, [teamId, timeRange, fetchAnalytics]);

  function getEngagementTier(v: Record<string, unknown>): "HOT" | "WARM" | "COOL" | "NONE" {
    const views = (v.totalViews as number) || 0;
    const docs = (v.uniqueDocuments as number) || 0;
    const score = views * 1 + docs * 2;
    if (score >= 10) return "HOT";
    if (score >= 4) return "WARM";
    if (score >= 1) return "COOL";
    return "NONE";
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="flex justify-between">
            <div className="h-8 bg-muted rounded w-48" />
            <div className="flex gap-2">
              <div className="h-9 bg-muted rounded w-24" />
              <div className="h-9 bg-muted rounded w-24" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-lg" />
            ))}
          </div>
          <div className="h-64 bg-muted rounded-lg" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive font-medium">{error}</p>
        <Button onClick={() => { setError(null); fetchAnalytics(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  const trendPositive = (overview?.viewsTrend || 0) >= 0;

  // ── Empty state: no datarooms ──
  if (datarooms.length === 0 && !overview) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center mb-4">
          <BarChart3 className="h-7 w-7 text-gray-400" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-medium text-white mb-1">No analytics data yet</h3>
        <p className="text-sm text-gray-400 max-w-md mb-6">
          Create a dataroom and share it with investors to start seeing engagement analytics here.
        </p>
        <Button asChild variant="outline" className="min-h-[44px]">
          <Link href="/datarooms">Create Dataroom</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dataroom Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Viewer engagement, document activity, and visitor insights
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Dataroom selector */}
          {datarooms.length > 1 && (
            <div className="relative">
              <select
                value={selectedDataroom || ""}
                onChange={(e) => setSelectedDataroom(e.target.value)}
                className="appearance-none h-8 pl-3 pr-8 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-[#0066FF]"
              >
                <option value="">All Datarooms</option>
                {datarooms.map((dr) => (
                  <option key={dr.id} value={dr.id}>{dr.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
          )}

          {/* Time range toggle */}
          <div className="flex border rounded-md overflow-hidden">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.value}
                onClick={() => setTimeRange(tr.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  timeRange === tr.value
                    ? "bg-[#0066FF] text-white"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted"
                }`}
              >
                {tr.label}
              </button>
            ))}
            <button
              onClick={() => setTimeRange("custom")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1 ${
                timeRange === "custom"
                  ? "bg-[#0066FF] text-white"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted"
              }`}
            >
              <Calendar className="h-3 w-3" />
              Custom
            </button>
          </div>

          {/* Custom date range inputs */}
          {timeRange === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-8 px-2 text-xs border rounded-md bg-background"
                aria-label="Start date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-8 px-2 text-xs border rounded-md bg-background"
                aria-label="End date"
              />
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => fetchAnalytics(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-l-4 border-l-[#0066FF]">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="h-4 w-4 text-[#0066FF]" />
              <span className="text-xs text-muted-foreground">Total Views</span>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-2xl font-bold font-mono tabular-nums">{overview?.totalViews || 0}</p>
              {overview && overview.viewsTrend !== 0 && (
                <span className={`flex items-center text-[10px] font-medium mb-0.5 ${trendPositive ? "text-emerald-600" : "text-red-600"}`}>
                  {trendPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(overview.viewsTrend)}%
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Unique Visitors</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">{overview?.uniqueVisitors || 0}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#10B981]">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-[#10B981]" />
              <span className="text-xs text-muted-foreground">Docs Viewed</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">{overview?.totalDocuments || 0}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#F59E0B]">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-[#F59E0B]" />
              <span className="text-xs text-muted-foreground">Avg. Dwell Time</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">
              {formatDuration(overview?.avgDwellTimeMs || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? "text-[#0066FF] border-[#0066FF]"
                : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/30"
            }`}
          >
            {tab.label}
            {tab.key === "visitors" && visitors.length > 0 && (
              <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">
                ({visitors.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Views Over Time — Recharts AreaChart */}
          <Card className="shadow-sm">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">Views Over Time</h3>
                <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
              {graphData.length > 0 ? (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={graphData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0066FF" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0066FF" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(v) =>
                          new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        }
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          background: "#0A1628",
                          border: "none",
                          borderRadius: "6px",
                          color: "#fff",
                          fontSize: "12px",
                          fontFamily: "var(--font-mono, monospace)",
                        }}
                        labelFormatter={(v) =>
                          new Date(v).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        }
                        formatter={(value) => [`${value} views`, "Views"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="views"
                        stroke="#0066FF"
                        strokeWidth={2}
                        fill="url(#viewsGradient)"
                        dot={false}
                        activeDot={{ r: 4, fill: "#0066FF", stroke: "#fff", strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                  No view data for this period
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Documents + Top Visitors side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Documents */}
            <Card className="shadow-sm">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">Top Documents</h3>
                  <button
                    onClick={() => setActiveTab("documents")}
                    className="text-[10px] text-[#0066FF] hover:underline"
                  >
                    View All
                  </button>
                </div>
                {documents.length > 0 ? (
                  <div className="space-y-3">
                    {documents.slice(0, 5).map((doc, idx) => {
                      const maxViews = Math.max(...documents.slice(0, 5).map((d) => d.views), 1);
                      const barWidth = (doc.views / maxViews) * 100;
                      return (
                        <div key={doc.id} className="group">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-medium truncate max-w-[200px]">
                              <span className="text-muted-foreground mr-1.5 font-mono">{idx + 1}.</span>
                              {doc.name}
                            </p>
                            <span className="text-xs font-mono tabular-nums text-muted-foreground">
                              {doc.views} views
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#0066FF]/60 rounded-full transition-all"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-6 text-center">No document views yet</p>
                )}
              </CardContent>
            </Card>

            {/* Engagement Breakdown — Pie Chart */}
            <Card className="shadow-sm">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">Engagement Breakdown</h3>
                  <button
                    onClick={() => setActiveTab("visitors")}
                    className="text-[10px] text-[#0066FF] hover:underline"
                  >
                    View All
                  </button>
                </div>
                {visitors.length > 0 ? (
                  <>
                    {/* Pie Chart */}
                    {visitorSources.length > 0 && (
                      <div className="h-44 w-full mb-3">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={visitorSources}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={65}
                              paddingAngle={3}
                              dataKey="value"
                              nameKey="name"
                            >
                              {visitorSources.map((_entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Legend
                              iconType="circle"
                              iconSize={8}
                              wrapperStyle={{ fontSize: "11px" }}
                            />
                            <RechartsTooltip
                              contentStyle={{
                                background: "#0A1628",
                                border: "none",
                                borderRadius: "6px",
                                color: "#fff",
                                fontSize: "12px",
                              }}
                              formatter={(value, name) => [`${value} visitors`, name]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Top engaged visitors */}
                    <div className="space-y-2">
                      {visitors.slice(0, 4).map((visitor) => {
                        return (
                          <div key={visitor.email} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
                                visitor.engagementTier === "HOT" ? "bg-red-500" :
                                visitor.engagementTier === "WARM" ? "bg-amber-500" :
                                "bg-blue-400"
                              }`} />
                              <span className="text-xs truncate max-w-[180px]">
                                {visitor.viewerName || visitor.email}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono tabular-nums text-muted-foreground flex-shrink-0 ml-2">
                              {visitor.totalViews} views
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground py-6 text-center">No visitor data yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "visitors" && (
        <Card className="shadow-sm">
          <CardContent className="p-0">
            {visitors.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50">
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left py-2.5 px-4 font-medium">Visitor</th>
                      <th className="text-left py-2.5 px-3 font-medium">Engagement</th>
                      <th className="text-center py-2.5 px-3 font-medium">Views</th>
                      <th className="text-center py-2.5 px-3 font-medium hidden md:table-cell">Documents</th>
                      <th className="text-right py-2.5 px-3 font-medium hidden lg:table-cell">Time Spent</th>
                      <th className="text-right py-2.5 px-3 font-medium">Last Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visitors.map((visitor) => {
                      const config = ENGAGEMENT_CONFIG[visitor.engagementTier];
                      const TierIcon = config.icon;
                      return (
                        <tr key={visitor.email} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-4">
                            <p className="text-sm font-medium">{visitor.viewerName || visitor.email}</p>
                            {visitor.viewerName && (
                              <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                {visitor.email}
                              </p>
                            )}
                            {visitor.verified && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 mt-0.5 text-emerald-600 border-emerald-200">
                                Verified
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {visitor.engagementTier !== "NONE" ? (
                              <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${config.className}`}>
                                <TierIcon className="h-3 w-3 mr-0.5" />
                                {config.label}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="font-mono tabular-nums">{visitor.totalViews}</span>
                          </td>
                          <td className="py-2.5 px-3 text-center hidden md:table-cell">
                            <span className="font-mono tabular-nums">{visitor.uniqueDocuments}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right hidden lg:table-cell">
                            <span className="font-mono tabular-nums text-xs text-muted-foreground">
                              {visitor.totalDuration}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="text-xs text-muted-foreground font-mono">
                              {visitor.lastActive ? formatRelativeTime(visitor.lastActive) : "-"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-3">
                  <Users className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No visitors yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Share your dataroom link to start tracking engagement.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "documents" && (<>
        <Card className="shadow-sm">
          <CardContent className="p-0">
            {documents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50">
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left py-2.5 px-4 font-medium">Document</th>
                      <th className="text-center py-2.5 px-3 font-medium">Views</th>
                      <th className="text-center py-2.5 px-3 font-medium hidden sm:table-cell">Downloads</th>
                      <th className="text-right py-2.5 px-3 font-medium hidden md:table-cell">Time Spent</th>
                      <th className="text-center py-2.5 px-3 font-medium hidden lg:table-cell">Completion</th>
                      <th className="text-right py-2.5 px-3 font-medium">Last Viewed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {documents.map((doc) => (
                      <tr
                        key={doc.id}
                        className={`hover:bg-muted/30 transition-colors cursor-pointer ${selectedDocId === doc.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                        onClick={() => {
                          setSelectedDocId(selectedDocId === doc.id ? null : doc.id);
                          // Filter events for this document
                          setDocViewers(events.filter((e) => e.documentName === doc.name));
                        }}
                      >
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                            <p className="text-sm font-medium truncate max-w-[280px]">{doc.name}</p>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="font-mono tabular-nums">{doc.views}</span>
                        </td>
                        <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                          <span className="font-mono tabular-nums">{doc.downloads}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right hidden md:table-cell">
                          <span className="font-mono tabular-nums text-xs text-muted-foreground">{doc.totalDuration}</span>
                        </td>
                        <td className="py-2.5 px-3 hidden lg:table-cell">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${Math.min(doc.completionRate, 100)}%` }}
                              />
                            </div>
                            <span className="font-mono tabular-nums text-[10px] text-muted-foreground">
                              {Math.round(doc.completionRate)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="text-xs text-muted-foreground font-mono">
                            {doc.lastViewed ? formatRelativeTime(doc.lastViewed) : "-"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-3">
                  <FileText className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No document views yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Document Detail Panel */}
        {selectedDocId && (
          <DocumentDetailPanel
            document={documents.find((d) => d.id === selectedDocId) || null}
            viewers={docViewers}
            onClose={() => setSelectedDocId(null)}
          />
        )}
      </>)}

      {activeTab === "events" && (
        <Card className="shadow-sm">
          <CardContent className="p-0">
            {events.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50">
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left py-2.5 px-4 font-medium">Viewer</th>
                      <th className="text-left py-2.5 px-3 font-medium">Document</th>
                      <th className="text-left py-2.5 px-3 font-medium hidden md:table-cell">Link</th>
                      <th className="text-right py-2.5 px-3 font-medium hidden lg:table-cell">Duration</th>
                      <th className="text-center py-2.5 px-3 font-medium hidden lg:table-cell">Completion</th>
                      <th className="text-right py-2.5 px-3 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {events.map((event) => (
                      <tr key={event.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-4">
                          <p className="text-xs truncate max-w-[160px]">{event.viewerEmail || "Anonymous"}</p>
                        </td>
                        <td className="py-2.5 px-3">
                          <p className="text-xs font-medium truncate max-w-[180px]">{event.documentName}</p>
                        </td>
                        <td className="py-2.5 px-3 hidden md:table-cell">
                          <p className="text-xs text-muted-foreground truncate max-w-[120px]">{event.linkName || "-"}</p>
                        </td>
                        <td className="py-2.5 px-3 text-right hidden lg:table-cell">
                          <span className="font-mono tabular-nums text-xs text-muted-foreground">{event.totalDuration}</span>
                        </td>
                        <td className="py-2.5 px-3 hidden lg:table-cell">
                          <div className="flex items-center justify-center gap-1">
                            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${Math.min(event.completionRate, 100)}%` }}
                              />
                            </div>
                            <span className="font-mono tabular-nums text-[10px] text-muted-foreground">
                              {Math.round(event.completionRate)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="text-xs text-muted-foreground font-mono">
                            {formatRelativeTime(event.viewedAt)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-3">
                  <Eye className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No view events yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Document Detail Panel ──

function DocumentDetailPanel({
  document,
  viewers,
  onClose,
}: {
  document: DocumentRow | null;
  viewers: ViewEvent[];
  onClose: () => void;
}) {
  if (!document) return null;

  // Aggregate unique viewers
  const uniqueViewers = new Map<string, { email: string; views: number; totalTime: string; lastSeen: string }>();
  for (const v of viewers) {
    const existing = uniqueViewers.get(v.viewerEmail);
    if (existing) {
      existing.views += 1;
      if (new Date(v.viewedAt) > new Date(existing.lastSeen)) {
        existing.lastSeen = v.viewedAt;
      }
    } else {
      uniqueViewers.set(v.viewerEmail, {
        email: v.viewerEmail,
        views: 1,
        totalTime: v.totalDuration,
        lastSeen: v.viewedAt,
      });
    }
  }

  const viewerList = Array.from(uniqueViewers.values()).sort((a, b) => b.views - a.views);

  return (
    <Card className="shadow-sm border-primary/20">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="font-semibold text-lg">{document.name}</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Document Analytics Detail</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close document details">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Total Views</p>
            <p className="text-xl font-bold font-mono tabular-nums">{document.views}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Downloads</p>
            <p className="text-xl font-bold font-mono tabular-nums">{document.downloads}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Avg. Completion</p>
            <p className="text-xl font-bold font-mono tabular-nums">{Math.round(document.completionRate)}%</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Time Spent</p>
            <p className="text-xl font-bold font-mono tabular-nums">{document.totalDuration}</p>
          </div>
        </div>

        {/* Completion Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Completion Rate</span>
            <span className="text-xs font-mono tabular-nums">{Math.round(document.completionRate)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(document.completionRate, 100)}%` }}
            />
          </div>
        </div>

        {/* Viewer List */}
        <div>
          <h4 className="text-sm font-semibold mb-3">Viewers ({viewerList.length})</h4>
          {viewerList.length > 0 ? (
            <div className="space-y-2">
              {viewerList.map((viewer) => (
                <div
                  key={viewer.email}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Users className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm truncate">{viewer.email || "Anonymous"}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {viewer.views} view{viewer.views !== 1 ? "s" : ""} · Last seen {formatRelativeTime(viewer.lastSeen)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono tabular-nums ml-2 flex-shrink-0">
                    {viewer.totalTime}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No viewer data available for this document.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
