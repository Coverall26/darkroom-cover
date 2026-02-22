import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, ArrowRight, Eye, Settings } from "lucide-react";

interface RaiseData {
  totalTarget: number;
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
}

interface StatsData {
  dataroomViews: number;
  emailsCaptured: number;
}

interface RaiseProgressCardProps {
  mode: "GP_FUND" | "STARTUP" | "DATAROOM_ONLY";
  raise: RaiseData;
  stats: StatsData;
  investorCount: number;
  fundCount: number;
  committedPercent: number;
  fundedPercent: number;
  progressLabel: string;
  formatCurrency: (value: number) => string;
  formatCurrencyFull: (value: number) => string;
}

export function RaiseProgressCard({
  mode,
  raise,
  stats,
  investorCount,
  fundCount,
  committedPercent,
  fundedPercent,
  progressLabel,
  formatCurrency,
  formatCurrencyFull,
}: RaiseProgressCardProps) {
  if (mode === "DATAROOM_ONLY") {
    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-[#0066FF] flex items-center justify-center">
                <Eye className="h-3.5 w-3.5 text-white" />
              </div>
              View Analytics
            </CardTitle>
            <Link href="/admin/analytics">
              <Button variant="ghost" size="sm" className="text-xs h-8">
                View Details
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold font-mono tabular-nums">{stats.dataroomViews.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground">Total Views</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold font-mono tabular-nums">{stats.emailsCaptured.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground">Emails Captured</p>
            </div>
            <div className="text-center hidden sm:block">
              <p className="text-2xl font-bold font-mono tabular-nums">{investorCount.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground">Leads</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-[#0066FF] flex items-center justify-center">
                <TrendingUp className="h-3.5 w-3.5 text-white" />
              </div>
              {progressLabel}
            </CardTitle>
            <CardDescription className="mt-1.5 font-mono text-xs tabular-nums">
              {formatCurrencyFull(raise.totalCommitted)} committed &middot;{" "}
              {formatCurrencyFull(raise.totalFunded)} funded of{" "}
              {formatCurrencyFull(raise.totalTarget)} target
            </CardDescription>
          </div>
          <Link href="/admin/fund">
            <Button variant="ghost" size="sm" className="text-xs h-8">
              View Funds
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {/* Two-layer progress bar with shine */}
        <div className="relative h-8 bg-muted/80 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-[#0066FF]/20 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${committedPercent}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${fundedPercent}%`,
              background: "linear-gradient(90deg, #0052CC 0%, #0066FF 50%, #3385FF 100%)",
            }}
          >
            <div
              className="absolute inset-0 opacity-20"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
              }}
            />
          </div>
          {raise.totalTarget > 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className={`text-xs font-bold font-mono tabular-nums ${
                  fundedPercent > 40 ? "text-white drop-shadow-sm" : "text-foreground"
                }`}
              >
                {fundedPercent.toFixed(1)}% funded
              </span>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex justify-between mt-2.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#0066FF]" />
              Funded
              <span className="font-mono tabular-nums">{formatCurrency(raise.totalFunded)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#0066FF]/25" />
              Committed
              <span className="font-mono tabular-nums">{formatCurrency(raise.totalCommitted)}</span>
            </span>
          </div>
          <span className="font-mono tabular-nums">{formatCurrencyFull(raise.totalTarget)} target</span>
        </div>

        {/* Per-fund breakdown */}
        {raise.funds.length > 1 && (
          <div className="mt-4 pt-4 border-t space-y-3">
            {raise.funds.map((fund) => {
              const fTarget = fund.target || 1;
              const fPercent = Math.min(100, ((fund.current || 0) / fTarget) * 100);
              return (
                <div key={fund.id}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Link
                        href={`/admin/fund/${fund.id}`}
                        className="font-medium hover:text-[#0066FF] transition-colors"
                      >
                        {fund.name}
                      </Link>
                      <Link
                        href={`/admin/settings?tab=fundInvestor&fundId=${fund.id}`}
                        className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                        title="Fund Settings"
                      >
                        <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </span>
                    <span className="text-muted-foreground text-xs font-mono tabular-nums">
                      {formatCurrency(fund.current || 0)} / {formatCurrency(fund.target)}
                      <span className="ml-1.5 text-muted-foreground/50">
                        &middot; {fund.investorCount} LP{fund.investorCount !== 1 ? "s" : ""}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0066FF] rounded-full transition-all duration-700"
                      style={{ width: `${fPercent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
