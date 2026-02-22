import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import {
  DollarSign,
  Users,
  TrendingUp,
  ArrowDownToLine,
  CheckCircle2,
  AlertTriangle,
  Target,
  Calendar,
  Banknote,
  Percent,
  Scale,
  Clock,
  Briefcase,
  Lock,
  ArrowUpFromLine,
} from "lucide-react";
import { UnitsByTierCard } from "@/components/admin/units-by-tier-card";
import { StartupRoundsChart } from "@/components/admin/startup-rounds-chart";

interface FundOverviewTabProps {
  fund: {
    id: string;
    teamId: string;
    name: string;
    entityMode?: string | null;
    style: string | null;
    targetRaise: number;
    currentRaise: number;
    minimumInvestment: number;
    aumTarget: number | null;
    callFrequency: string;
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
    capitalCallThreshold: number | null;
    closingDate: string | null;
    aggregate: {
      totalInbound: number;
      totalOutbound: number;
      totalCommitted: number;
      fullAuthorizedProgress: number;
    } | null;
    investors: Array<{
      id: string;
      name: string;
      commitment: number;
      funded: number;
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
  };
  formatCurrency: (value: number | string) => string;
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

const WATERFALL_LABELS: Record<string, string> = {
  EUROPEAN: "European (Whole-Fund)",
  AMERICAN: "American (Deal-by-Deal)",
  DEAL_BY_DEAL: "Deal-by-Deal",
};

const PREFERRED_RETURN_LABELS: Record<string, string> = {
  COMPOUNDED: "Compounded",
  SIMPLE: "Simple",
};

export function FundOverviewTab({ fund, formatCurrency }: FundOverviewTabProps) {
  const totalCommitted = fund.aggregate?.totalCommitted || 0;
  const initialThresholdAmount = fund.initialThresholdAmount;
  const initialThresholdProgress = initialThresholdAmount
    ? Math.min(100, (totalCommitted / initialThresholdAmount) * 100)
    : 0;

  const fullAuthorizedAmount = fund.fullAuthorizedAmount;
  const fullAuthorizedProgress = fullAuthorizedAmount
    ? Math.min(100, (totalCommitted / fullAuthorizedAmount) * 100)
    : fund.aggregate?.fullAuthorizedProgress || 0;

  const targetProgress = fund.targetRaise > 0
    ? Math.min(100, (fund.currentRaise / fund.targetRaise) * 100)
    : 0;

  const aumProgress = fund.aumTarget && fund.aumTarget > 0
    ? Math.min(100, (fund.currentRaise / fund.aumTarget) * 100)
    : 0;

  const investorChartData = fund.investors.slice(0, 10).map((inv) => ({
    name: inv.name.split(" ")[0],
    commitment: inv.commitment,
    funded: inv.funded,
  }));

  const flowData = [
    { name: "Committed", value: fund.aggregate?.totalCommitted || 0 },
    { name: "Inbound", value: fund.aggregate?.totalInbound || 0 },
    { name: "Outbound", value: fund.aggregate?.totalOutbound || 0 },
  ];

  return (
    <>
      {(fund.initialThresholdEnabled || fullAuthorizedAmount) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {fund.initialThresholdEnabled && initialThresholdAmount && (
            <Card className={`${fund.initialThresholdMet ? "border-green-500 bg-green-50/50 dark:bg-green-950/20" : "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20"}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-600" aria-hidden="true" />
                  <CardTitle className="text-base">Initial Closing Threshold</CardTitle>
                </div>
                <CardDescription className="text-xs">Gates capital calls until met</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  {fund.initialThresholdMet ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" aria-hidden="true" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${fund.initialThresholdMet ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
                      {fund.initialThresholdMet ? "Threshold Met - Capital Calls Enabled" : "Threshold Not Met - Capital Calls Blocked"}
                    </p>
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full transition-all ${fund.initialThresholdMet ? "bg-green-500" : "bg-blue-500"}`}
                          style={{ width: `${Math.min(100, initialThresholdProgress)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1 font-mono tabular-nums">
                        <span>{formatCurrency(totalCommitted)}</span>
                        <span>{initialThresholdProgress.toFixed(0)}%</span>
                        <span>{formatCurrency(initialThresholdAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {fullAuthorizedAmount && (
            <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-purple-600" aria-hidden="true" />
                  <CardTitle className="text-base">Full Authorized Amount</CardTitle>
                </div>
                <CardDescription className="text-xs">Progress tracking only (no gating)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-purple-500 flex-shrink-0" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-purple-700 dark:text-purple-400 font-mono tabular-nums">
                      {fullAuthorizedProgress.toFixed(0)}% of Full Authorization
                    </p>
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                        <div
                          className="h-2.5 rounded-full bg-purple-500 transition-all"
                          style={{ width: `${Math.min(100, fullAuthorizedProgress)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground mt-1 font-mono tabular-nums">
                        <span>{formatCurrency(totalCommitted)}</span>
                        <span>{fullAuthorizedProgress.toFixed(0)}%</span>
                        <span>{formatCurrency(fullAuthorizedAmount)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Target className="h-4 w-4" aria-hidden="true" /> Target Raise
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono tabular-nums">{formatCurrency(fund.targetRaise)}</p>
            <Progress value={targetProgress} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-1 font-mono tabular-nums">{targetProgress.toFixed(1)}% of target</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" aria-hidden="true" /> Current Raise
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono tabular-nums">{formatCurrency(fund.currentRaise)}</p>
            <p className="text-xs text-muted-foreground mt-1">Min: <span className="font-mono tabular-nums">{formatCurrency(fund.minimumInvestment)}</span></p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" aria-hidden="true" /> Total Committed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono tabular-nums">{formatCurrency(fund.aggregate?.totalCommitted || 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              From <span className="font-mono tabular-nums">{fund.investors.length}</span> investor{fund.investors.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="h-4 w-4" aria-hidden="true" /> Investors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono tabular-nums">{fund.investors.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-mono tabular-nums">{fund.capitalCalls.length}</span> calls, <span className="font-mono tabular-nums">{fund.distributions.length}</span> distributions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats — LP summary */}
      {fund.investors.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-3 rounded-lg border bg-muted/30">
            <p className="text-xs text-muted-foreground">Avg Commitment</p>
            <p className="text-lg font-semibold font-mono tabular-nums">
              {formatCurrency(
                fund.investors.reduce((s, i) => s + i.commitment, 0) / fund.investors.length
              )}
            </p>
          </div>
          <div className="p-3 rounded-lg border bg-muted/30">
            <p className="text-xs text-muted-foreground">Largest Commitment</p>
            <p className="text-lg font-semibold font-mono tabular-nums">
              {formatCurrency(Math.max(...fund.investors.map((i) => i.commitment)))}
            </p>
          </div>
          <div className="p-3 rounded-lg border bg-muted/30">
            <p className="text-xs text-muted-foreground">Smallest Commitment</p>
            <p className="text-lg font-semibold font-mono tabular-nums">
              {formatCurrency(Math.min(...fund.investors.map((i) => i.commitment)))}
            </p>
          </div>
          <div className="p-3 rounded-lg border bg-muted/30">
            <p className="text-xs text-muted-foreground">Avg Funded %</p>
            <p className="text-lg font-semibold font-mono tabular-nums">
              {(
                fund.investors.reduce((s, i) => s + (i.commitment > 0 ? i.funded / i.commitment : 0), 0) /
                fund.investors.length *
                100
              ).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* Fund Economics */}
      {(fund.managementFeePct !== null || fund.carryPct !== null || fund.hurdleRate !== null || fund.termYears !== null) && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-[#0066FF]" aria-hidden="true" />
              <CardTitle className="text-lg">Fund Economics</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {fund.managementFeePct !== null && (
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Percent className="h-3 w-3" aria-hidden="true" /> Management Fee
                  </p>
                  <p className="font-semibold font-mono tabular-nums">{fund.managementFeePct.toFixed(2)}%</p>
                </div>
              )}
              {fund.carryPct !== null && (
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" aria-hidden="true" /> Carried Interest
                  </p>
                  <p className="font-semibold font-mono tabular-nums">{fund.carryPct.toFixed(2)}%</p>
                </div>
              )}
              {fund.hurdleRate !== null && (
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Target className="h-3 w-3" aria-hidden="true" /> Hurdle Rate
                  </p>
                  <p className="font-semibold font-mono tabular-nums">{fund.hurdleRate.toFixed(2)}%</p>
                </div>
              )}
              {fund.waterfallType && (
                <div>
                  <p className="text-sm text-muted-foreground">Waterfall</p>
                  <p className="font-semibold">{WATERFALL_LABELS[fund.waterfallType] || fund.waterfallType}</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
              {fund.termYears !== null && (
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden="true" /> Fund Term
                  </p>
                  <p className="font-semibold font-mono tabular-nums">
                    {fund.termYears} yr{fund.termYears !== 1 ? "s" : ""}
                    {fund.extensionYears ? <span className="text-muted-foreground text-xs"> + {fund.extensionYears} ext</span> : ""}
                  </p>
                </div>
              )}
              {fund.investmentPeriodYears !== null && (
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Briefcase className="h-3 w-3" aria-hidden="true" /> Investment Period
                  </p>
                  <p className="font-semibold font-mono tabular-nums">{fund.investmentPeriodYears} yr{fund.investmentPeriodYears !== 1 ? "s" : ""}</p>
                </div>
              )}
              {fund.gpCommitmentAmount !== null && (
                <div>
                  <p className="text-sm text-muted-foreground">GP Commitment</p>
                  <p className="font-semibold font-mono tabular-nums">
                    {formatCurrency(fund.gpCommitmentAmount)}
                    {fund.gpCommitmentPct ? <span className="text-muted-foreground text-xs"> ({fund.gpCommitmentPct.toFixed(1)}%)</span> : ""}
                  </p>
                </div>
              )}
              {fund.preferredReturnMethod && (
                <div>
                  <p className="text-sm text-muted-foreground">Preferred Return</p>
                  <p className="font-semibold">{PREFERRED_RETURN_LABELS[fund.preferredReturnMethod] || fund.preferredReturnMethod}</p>
                </div>
              )}
            </div>
            {/* Advanced provisions row */}
            {(fund.highWaterMark || fund.recyclingEnabled || fund.clawbackProvision) && (
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                {fund.highWaterMark && (
                  <Badge variant="outline" className="text-[#0066FF] border-[#0066FF]/30">High-Water Mark</Badge>
                )}
                {fund.recyclingEnabled && (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700">Recycling</Badge>
                )}
                {fund.clawbackProvision && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700">Clawback</Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {fund.aumTarget && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">AUM Progress</CardTitle>
            <CardDescription>Progress toward {formatCurrency(fund.aumTarget)} AUM target</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={[
                    { name: "Current", value: fund.currentRaise },
                    { name: "Target", value: fund.aumTarget },
                  ]}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Area type="monotone" dataKey="value" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <Progress value={aumProgress} className="mt-4 h-3" />
            <p className="text-sm text-muted-foreground mt-2 text-center font-mono tabular-nums">{aumProgress.toFixed(1)}% toward AUM target</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Capital Flow</CardTitle>
            <CardDescription>Committed vs Inbound vs Outbound</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={flowData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Bar dataKey="value" fill="#0088FE" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Investors</CardTitle>
            <CardDescription>By commitment amount</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={investorChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="name" width={80} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Legend />
                  <Bar dataKey="commitment" fill="#0088FE" name="Commitment" />
                  <Bar dataKey="funded" fill="#00C49F" name="Funded" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        {fund.entityMode === "STARTUP" ? (
          <StartupRoundsChart fundId={fund.id} teamId={fund.teamId} />
        ) : (
          <UnitsByTierCard fundId={fund.id} teamId={fund.teamId} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Capital Calls</CardTitle>
              {fund.capitalCalls.length === 0 && (
                <Badge variant="secondary" className="text-[10px]">Phase 2</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {fund.capitalCalls.length === 0 ? (
              <div className="text-center py-6 space-y-4">
                <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/30">
                  <Banknote className="h-7 w-7 text-[#0066FF]" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium">Capital Call Management</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[280px] mx-auto">
                    Capital calls let you request committed capital from your LPs on a schedule. Create calls, track responses, and manage drawdowns.
                  </p>
                </div>
                <button
                  disabled
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                >
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Create Capital Call
                </button>
                <p className="text-[11px] text-muted-foreground/50">Coming in Phase 2</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fund.capitalCalls.slice(0, 5).map((call) => (
                  <div key={call.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Call #{call.callNumber}</p>
                      <p className="text-sm text-muted-foreground font-mono tabular-nums">Due: {new Date(call.dueDate).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium font-mono tabular-nums">{formatCurrency(call.amount)}</p>
                      <Badge variant={call.status === "COMPLETED" ? "default" : "secondary"}>{call.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Distributions</CardTitle>
              {fund.distributions.length === 0 && (
                <Badge variant="secondary" className="text-[10px]">Phase 2</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {fund.distributions.length === 0 ? (
              <div className="text-center py-6 space-y-4">
                <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                  <ArrowUpFromLine className="h-7 w-7 text-[#10B981]" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium">Distribution Wizard</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[280px] mx-auto">
                    Distribution wizard with waterfall calculation. Process distributions with European or American waterfall models.
                  </p>
                </div>
                {/* Waterfall mockup visualization */}
                <div className="max-w-[220px] mx-auto space-y-1">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="w-20 text-right">Return of Capital</span>
                    <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                      <div className="h-full w-[70%] bg-blue-400/40 rounded-full" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="w-20 text-right">Pref Return</span>
                    <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                      <div className="h-full w-[50%] bg-emerald-400/40 rounded-full" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="w-20 text-right">GP Catch-up</span>
                    <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                      <div className="h-full w-[30%] bg-amber-400/40 rounded-full" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="w-20 text-right">Carry Split</span>
                    <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                      <div className="h-full w-[45%] bg-purple-400/40 rounded-full" />
                    </div>
                  </div>
                </div>
                <button
                  disabled
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                >
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Create Distribution
                </button>
                <p className="text-[11px] text-muted-foreground/50">Coming in Phase 2</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fund.distributions.slice(0, 5).map((dist) => (
                  <div key={dist.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Distribution #{dist.distributionNumber}</p>
                      <p className="text-sm text-muted-foreground font-mono tabular-nums">{new Date(dist.distributionDate).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium font-mono tabular-nums">{formatCurrency(dist.totalAmount)}</p>
                      <Badge variant={dist.status === "COMPLETED" ? "default" : "secondary"}>{dist.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Fund Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Style</p>
              <p className="font-medium">{STYLE_LABELS[fund.style || ""] || fund.style || "Not Set"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Call Frequency</p>
              <p className="font-medium">{CALL_FREQUENCY_LABELS[fund.callFrequency] || fund.callFrequency}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Initial Threshold</p>
              <p className="font-medium">
                {fund.initialThresholdEnabled
                  ? formatCurrency(fund.initialThresholdAmount || fund.capitalCallThreshold || 0)
                  : "Disabled"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Full Authorized</p>
              <p className="font-medium">
                {fund.fullAuthorizedAmount ? formatCurrency(fund.fullAuthorizedAmount) : "Not Set"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground">Staged Commitments</p>
              <p className="font-medium">{fund.stagedCommitmentsEnabled ? "Enabled" : "Disabled"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Threshold Status</p>
              <p className={`font-medium ${fund.initialThresholdMet ? "text-green-600" : "text-amber-600"}`}>
                {fund.initialThresholdMet ? "Met" : "Not Met"}
              </p>
            </div>
          </div>
          {fund.closingDate && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm text-muted-foreground">
                  Closing Date: {new Date(fund.closingDate).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
