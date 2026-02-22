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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  Rocket,
  RefreshCw,
  TrendingUp,
  Target,
  Users,
} from "lucide-react";

interface FundingRound {
  id: string;
  roundName: string;
  roundOrder: number;
  amountRaised: string;
  targetAmount: string | null;
  preMoneyVal: string | null;
  postMoneyVal: string | null;
  leadInvestor: string | null;
  investorCount: number;
  status: "COMPLETED" | "ACTIVE" | "PLANNED";
  instrumentType: string | null;
  valuationCap: string | null;
  discount: string | null;
}

interface StartupRoundsChartProps {
  fundId: string;
  teamId: string;
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "#10B981",
  ACTIVE: "#0066FF",
  PLANNED: "#6B7280",
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Completed",
  ACTIVE: "Active",
  PLANNED: "Planned",
};

const INSTRUMENT_LABELS: Record<string, string> = {
  SAFE: "SAFE",
  CONVERTIBLE_NOTE: "Conv. Note",
  PRICED_EQUITY: "Priced Equity",
  SPV: "SPV",
};

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatCurrency(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function StartupRoundsChart({ fundId, teamId }: StartupRoundsChartProps) {
  const [rounds, setRounds] = useState<FundingRound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchRounds = useCallback(
    async (silent = false) => {
      if (!silent) setIsRefreshing(true);
      try {
        const res = await fetch(
          `/api/teams/${teamId}/funds/${fundId}/funding-rounds`,
        );
        if (res.ok) {
          const data = await res.json();
          setRounds(data.rounds);
        }
      } catch {
        // Ignore fetch errors on silent refresh
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [fundId, teamId],
  );

  useEffect(() => {
    fetchRounds(true);
    const interval = setInterval(() => fetchRounds(true), 30000);
    return () => clearInterval(interval);
  }, [fetchRounds]);

  // Summary stats
  const totalRaised = rounds.reduce(
    (sum, r) => sum + parseFloat(r.amountRaised || "0"),
    0,
  );
  const totalTarget = rounds.reduce(
    (sum, r) => sum + parseFloat(r.targetAmount || "0"),
    0,
  );
  const totalInvestors = rounds.reduce((sum, r) => sum + r.investorCount, 0);
  const activeRound = rounds.find((r) => r.status === "ACTIVE");

  // Chart data — one bar per round
  const chartData = rounds.map((r) => ({
    name: r.roundName,
    raised: parseFloat(r.amountRaised || "0"),
    target: parseFloat(r.targetAmount || "0"),
    status: r.status,
    instrumentType: r.instrumentType,
    leadInvestor: r.leadInvestor,
    investorCount: r.investorCount,
    preMoneyVal: r.preMoneyVal,
    postMoneyVal: r.postMoneyVal,
    valuationCap: r.valuationCap,
    discount: r.discount,
  }));

  if (isLoading) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2">
            <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
            <span className="text-sm text-gray-400">Loading rounds...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (rounds.length === 0) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-blue-400" aria-hidden="true" />
            <CardTitle className="text-white">Funding Rounds</CardTitle>
          </div>
          <CardDescription className="text-gray-400">
            No funding rounds configured yet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <p className="text-sm text-gray-500">
              Add funding rounds from the Settings page to track your startup raise progression.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-blue-400" aria-hidden="true" />
            <CardTitle className="text-white">Funding Rounds</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchRounds()}
            disabled={isRefreshing}
            aria-label="Refresh funding rounds"
          >
            <RefreshCw
              className={`h-4 w-4 text-gray-400 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        <CardDescription className="text-gray-400">
          Startup raise progression
          {activeRound && (
            <span className="ml-2">
              — Active: <span className="text-blue-400 font-medium">{activeRound.roundName}</span>
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-gray-800 rounded-lg text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            </div>
            <div className="text-xl font-bold text-white font-mono tabular-nums">
              {formatCompact(totalRaised)}
            </div>
            <div className="text-gray-400 text-xs">Total Raised</div>
          </div>
          <div className="p-3 bg-gray-800 rounded-lg text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Target className="h-3.5 w-3.5 text-blue-400" aria-hidden="true" />
            </div>
            <div className="text-xl font-bold text-white font-mono tabular-nums">
              {formatCompact(totalTarget)}
            </div>
            <div className="text-gray-400 text-xs">Total Target</div>
          </div>
          <div className="p-3 bg-gray-800 rounded-lg text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Users className="h-3.5 w-3.5 text-purple-400" aria-hidden="true" />
            </div>
            <div className="text-xl font-bold text-white font-mono tabular-nums">
              {totalInvestors}
            </div>
            <div className="text-gray-400 text-xs">Total Investors</div>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#9CA3AF", fontSize: 12 }}
                axisLine={{ stroke: "#4B5563" }}
              />
              <YAxis
                tickFormatter={(v) => formatCompact(v)}
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={{ stroke: "#4B5563" }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-lg text-sm">
                      <p className="font-medium text-white mb-1">{d.name}</p>
                      <div className="space-y-0.5 text-gray-300">
                        <p>
                          <span className="text-gray-500">Raised:</span>{" "}
                          <span className="font-mono tabular-nums">{formatCurrency(d.raised)}</span>
                        </p>
                        {d.target > 0 && (
                          <p>
                            <span className="text-gray-500">Target:</span>{" "}
                            <span className="font-mono tabular-nums">{formatCurrency(d.target)}</span>
                          </p>
                        )}
                        {d.instrumentType && (
                          <p>
                            <span className="text-gray-500">Instrument:</span>{" "}
                            {INSTRUMENT_LABELS[d.instrumentType] || d.instrumentType}
                          </p>
                        )}
                        {d.leadInvestor && (
                          <p>
                            <span className="text-gray-500">Lead:</span> {d.leadInvestor}
                          </p>
                        )}
                        {d.investorCount > 0 && (
                          <p>
                            <span className="text-gray-500">Investors:</span>{" "}
                            <span className="font-mono tabular-nums">{d.investorCount}</span>
                          </p>
                        )}
                        {d.preMoneyVal && (
                          <p>
                            <span className="text-gray-500">Pre-Money:</span>{" "}
                            <span className="font-mono tabular-nums">{formatCurrency(d.preMoneyVal)}</span>
                          </p>
                        )}
                        {d.valuationCap && (
                          <p>
                            <span className="text-gray-500">Val Cap:</span>{" "}
                            <span className="font-mono tabular-nums">{formatCurrency(d.valuationCap)}</span>
                          </p>
                        )}
                      </div>
                      <Badge
                        className={`mt-2 text-[10px] ${
                          d.status === "COMPLETED"
                            ? "bg-green-900/30 text-green-400"
                            : d.status === "ACTIVE"
                              ? "bg-blue-900/30 text-blue-400"
                              : "bg-gray-800 text-gray-400"
                        }`}
                        variant="secondary"
                      >
                        {STATUS_LABELS[d.status]}
                      </Badge>
                    </div>
                  );
                }}
              />
              <Bar dataKey="raised" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={STATUS_COLORS[entry.status] || "#6B7280"}
                  />
                ))}
              </Bar>
              {/* Target overlay as reference lines per bar would be complex;
                  instead show target as a second bar with lower opacity */}
              <Bar dataKey="target" radius={[4, 4, 0, 0]} fillOpacity={0.15} fill="#9CA3AF" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#10B981]" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#0066FF]" />
            <span>Active</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#6B7280]" />
            <span>Planned</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-gray-400/15 border border-gray-600" />
            <span>Target</span>
          </div>
        </div>

        {/* Round details list */}
        <div className="space-y-2 pt-2 border-t border-gray-800">
          {rounds.map((round) => {
            const raised = parseFloat(round.amountRaised || "0");
            const target = parseFloat(round.targetAmount || "0");
            const pct = target > 0 ? Math.min(100, (raised / target) * 100) : 0;

            return (
              <div
                key={round.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800/50 transition-colors"
              >
                <div
                  className="w-1.5 h-8 rounded-full flex-shrink-0"
                  style={{ backgroundColor: STATUS_COLORS[round.status] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">
                      {round.roundName}
                    </span>
                    {round.instrumentType && (
                      <span className="text-[10px] text-gray-500">
                        {INSTRUMENT_LABELS[round.instrumentType] || round.instrumentType}
                      </span>
                    )}
                  </div>
                  {target > 0 && (
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: STATUS_COLORS[round.status],
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono tabular-nums">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-mono tabular-nums text-white">
                    {formatCurrency(round.amountRaised)}
                  </p>
                  {round.leadInvestor && (
                    <p className="text-[10px] text-gray-500 truncate max-w-[120px]">
                      {round.leadInvestor}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
