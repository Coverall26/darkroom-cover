import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Eye,
  Mail,
  HandCoins,
  DollarSign,
  Users,
  Share2,
  ArrowRight,
  Shield,
} from "lucide-react";

// --- Stat Card Sub-Component ---

function StatCard({
  icon: Icon,
  iconColor,
  label,
  value,
  subtitle,
}: {
  icon: typeof Eye;
  iconColor: string;
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 mb-1.5">
          <div className={`h-7 w-7 rounded-lg ${iconColor} flex items-center justify-center`}>
            <Icon className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
        </div>
        <p className="text-2xl font-bold font-mono tabular-nums tracking-tight">
          {value}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

const PIPELINE_STAGES = [
  { key: "APPLIED", label: "Applied", color: "bg-slate-400", textColor: "text-slate-600 dark:text-slate-400" },
  { key: "UNDER_REVIEW", label: "In Review", color: "bg-amber-400", textColor: "text-amber-600 dark:text-amber-400" },
  { key: "APPROVED", label: "Approved", color: "bg-blue-400", textColor: "text-blue-600 dark:text-blue-400" },
  { key: "COMMITTED", label: "Committed", color: "bg-indigo-500", textColor: "text-indigo-600 dark:text-indigo-400" },
  { key: "DOCS_APPROVED", label: "Docs OK", color: "bg-violet-500", textColor: "text-violet-600 dark:text-violet-400" },
  { key: "FUNDED", label: "Funded", color: "bg-emerald-500", textColor: "text-emerald-600 dark:text-emerald-400" },
] as const;

interface ModeConfig {
  investorsLabel: string;
  investorLabel: string;
  fundsLabel: string;
  emptyInvestorText: string;
  emptyInvestorCta: string;
  emptyInvestorHref: string;
}

interface StatsPipelineGridProps {
  mode: "GP_FUND" | "STARTUP" | "DATAROOM_ONLY";
  modeConfig: ModeConfig;
  stats: {
    dataroomViews: number;
    emailsCaptured: number;
    commitments: number;
    totalCommitted: number;
    totalFunded: number;
  };
  pipeline: Record<string, number>;
  pipelineTotal: number;
  investorCount: number;
  fundCount: number;
  formatCurrency: (value: number) => string;
}

export function StatsPipelineGrid({
  mode,
  modeConfig,
  stats: s,
  pipeline,
  pipelineTotal,
  investorCount,
  fundCount,
  formatCurrency,
}: StatsPipelineGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* Quick Stats */}
      <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard
          icon={Eye}
          iconColor="bg-[#0066FF]"
          label="Views"
          value={s.dataroomViews.toLocaleString()}
          subtitle="dataroom views"
        />
        <StatCard
          icon={Mail}
          iconColor="bg-purple-500"
          label="Emails"
          value={s.emailsCaptured.toLocaleString()}
          subtitle="captured"
        />
        {mode !== "DATAROOM_ONLY" && (
          <>
            <StatCard
              icon={HandCoins}
              iconColor="bg-[#0066FF]"
              label="Committed"
              value={formatCurrency(s.totalCommitted)}
              subtitle={`${s.commitments} commitment${s.commitments !== 1 ? "s" : ""}`}
            />
            <StatCard
              icon={DollarSign}
              iconColor="bg-[#10B981]"
              label="Funded"
              value={formatCurrency(s.totalFunded)}
              subtitle="received"
            />
          </>
        )}
        {mode === "DATAROOM_ONLY" && (
          <>
            <StatCard
              icon={Users}
              iconColor="bg-[#0066FF]"
              label="Leads"
              value={investorCount.toLocaleString()}
              subtitle="captured"
            />
            <StatCard
              icon={Share2}
              iconColor="bg-[#10B981]"
              label="Datarooms"
              value={fundCount.toLocaleString()}
              subtitle="active"
            />
          </>
        )}
      </div>

      {/* Investor Pipeline */}
      <Card className="lg:col-span-3 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-[#0066FF] flex items-center justify-center">
                <Users className="h-3.5 w-3.5 text-white" />
              </div>
              Investor Pipeline
            </CardTitle>
            <Link href="/admin/investors">
              <Button variant="ghost" size="sm" className="text-xs h-8">
                View All
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {pipelineTotal === 0 ? (
            <div className="text-center py-8">
              <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-2">
                <Users className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground mb-1">
                No {modeConfig.investorsLabel.toLowerCase()} yet
              </p>
              <p className="text-[11px] text-muted-foreground/60 mb-3">
                {modeConfig.emptyInvestorText}
              </p>
              <Link href={modeConfig.emptyInvestorHref}>
                <Button variant="outline" size="sm" className="text-xs h-7">
                  <Share2 className="h-3 w-3 mr-1" />
                  {modeConfig.emptyInvestorCta}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Pipeline bar */}
              <div className="flex h-9 gap-0.5 rounded-lg overflow-hidden min-w-0">
                {PIPELINE_STAGES.map((stage) => {
                  const count = pipeline[stage.key] || 0;
                  if (count === 0) return null;
                  const pct = (count / pipelineTotal) * 100;
                  return (
                    <div
                      key={stage.key}
                      className={`${stage.color} flex items-center justify-center transition-all duration-700 first:rounded-l-lg last:rounded-r-lg relative group cursor-default`}
                      style={{ width: `${Math.max(pct, 5)}%` }}
                    >
                      {pct > 10 && (
                        <span className="text-xs font-bold font-mono text-white drop-shadow-sm">
                          {count}
                        </span>
                      )}
                      <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] font-medium px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                        {stage.label}: {count}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Stage labels */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
                {PIPELINE_STAGES.map((stage) => {
                  const count = pipeline[stage.key] || 0;
                  return (
                    <div key={stage.key} className="text-center py-1">
                      <div className="flex items-center justify-center gap-1 mb-0.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${stage.color}`} />
                        <span className="text-[10px] text-muted-foreground">{stage.label}</span>
                      </div>
                      <p className={`text-sm font-bold font-mono tabular-nums ${count > 0 ? stage.textColor : "text-muted-foreground/40"}`}>
                        {count}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Rejected */}
              {(pipeline.REJECTED || 0) > 0 && (
                <div className="flex items-center gap-1.5 pt-2 border-t">
                  <Shield className="h-3 w-3 text-red-400" />
                  <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                    {pipeline.REJECTED} rejected
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
