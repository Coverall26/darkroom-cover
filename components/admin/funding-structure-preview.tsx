"use client";

/**
 * FundingStructurePreview — Mini bar chart showing pricing tiers (GP_FUND)
 * or funding rounds (STARTUP) in a compact, embeddable format.
 *
 * Used in:
 *   - GP Setup Wizard Step 6 (inline preview)
 *   - Settings Center fund-settings section
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TierData {
  tranche: number;
  name: string;
  pricePerUnit: string;
  unitsAvailable: string;
}

interface RoundData {
  roundName: string;
  targetAmount: string;
  instrumentType: string;
  valuationCap: string;
  discount: string;
  status?: "COMPLETED" | "ACTIVE" | "PLANNED";
}

interface FundingStructurePreviewProps {
  mode: "GP_FUND" | "STARTUP" | "";
  tiers?: TierData[];
  rounds?: RoundData[];
  className?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(val: string | number): string {
  const num = typeof val === "string" ? parseFloat(val.replace(/[^0-9.-]/g, "")) : val;
  if (isNaN(num) || num === 0) return "$0";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-blue-500",
  ACTIVE: "bg-emerald-500",
  PLANNED: "bg-amber-400",
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Completed",
  ACTIVE: "Active",
  PLANNED: "Planned",
};

// ─── Tier Preview (GP_FUND) ─────────────────────────────────────────────────

function TierPreview({ tiers }: { tiers: TierData[] }) {
  const maxUnits = useMemo(
    () => Math.max(...tiers.map((t) => parseInt(t.unitsAvailable) || 0), 1),
    [tiers],
  );

  const totalUnits = useMemo(
    () => tiers.reduce((sum, t) => sum + (parseInt(t.unitsAvailable) || 0), 0),
    [tiers],
  );

  const totalValue = useMemo(
    () =>
      tiers.reduce((sum, t) => {
        const price = parseFloat(t.pricePerUnit) || 0;
        const units = parseInt(t.unitsAvailable) || 0;
        return sum + price * units;
      }, 0),
    [tiers],
  );

  if (tiers.length === 0) {
    return (
      <div className="text-center py-3">
        <p className="text-xs text-muted-foreground">No tiers configured</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Summary line */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {tiers.length} tier{tiers.length !== 1 ? "s" : ""} &middot;{" "}
          <span className="font-mono tabular-nums">{totalUnits}</span> units
        </span>
        <span className="font-mono tabular-nums">{formatCurrency(totalValue)}</span>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-1" style={{ height: 48 }}>
        {tiers.map((tier, i) => {
          const units = parseInt(tier.unitsAvailable) || 0;
          const heightPct = Math.max((units / maxUnits) * 100, 8);
          const isFirst = i === 0;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center gap-0.5"
              title={`${tier.name || `Tier ${tier.tranche}`}: ${units} units @ ${formatCurrency(tier.pricePerUnit)}`}
            >
              <span className="text-[8px] font-mono tabular-nums text-muted-foreground">
                {formatCurrency(tier.pricePerUnit)}
              </span>
              <div
                className={`w-full rounded-t transition-all ${
                  isFirst
                    ? "bg-blue-500/80"
                    : i === 1
                      ? "bg-blue-500/60"
                      : "bg-blue-500/40"
                }`}
                style={{ height: `${heightPct}%`, minHeight: 4 }}
              />
              <span className="text-[8px] text-muted-foreground truncate max-w-full">
                T{tier.tranche}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Rounds Preview (STARTUP) ───────────────────────────────────────────────

function RoundsPreview({ rounds }: { rounds: RoundData[] }) {
  const maxAmount = useMemo(
    () =>
      Math.max(
        ...rounds.map((r) => parseFloat(r.targetAmount.replace(/[^0-9.-]/g, "")) || 0),
        1,
      ),
    [rounds],
  );

  const totalTarget = useMemo(
    () =>
      rounds.reduce(
        (sum, r) => sum + (parseFloat(r.targetAmount.replace(/[^0-9.-]/g, "")) || 0),
        0,
      ),
    [rounds],
  );

  if (rounds.length === 0) {
    return (
      <div className="text-center py-3">
        <p className="text-xs text-muted-foreground">No rounds configured</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Summary */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {rounds.length} round{rounds.length !== 1 ? "s" : ""}
        </span>
        <span className="font-mono tabular-nums">{formatCurrency(totalTarget)}</span>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-1" style={{ height: 48 }}>
        {rounds.map((round, i) => {
          const amount =
            parseFloat(round.targetAmount.replace(/[^0-9.-]/g, "")) || 0;
          const heightPct = Math.max((amount / maxAmount) * 100, 8);
          const status = round.status || "PLANNED";
          const barColor = STATUS_COLORS[status] || "bg-gray-400";
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center gap-0.5"
              title={`${round.roundName}: ${formatCurrency(round.targetAmount)} (${round.instrumentType || "—"})`}
            >
              <span className="text-[8px] font-mono tabular-nums text-muted-foreground">
                {formatCurrency(round.targetAmount)}
              </span>
              <div
                className={`w-full rounded-t transition-all ${barColor}`}
                style={{ height: `${heightPct}%`, minHeight: 4, opacity: 0.7 }}
              />
              <span className="text-[8px] text-muted-foreground truncate max-w-full">
                {round.roundName.length > 6
                  ? round.roundName.slice(0, 5) + "…"
                  : round.roundName}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-2 justify-center">
        {["COMPLETED", "ACTIVE", "PLANNED"]
          .filter((s) => rounds.some((r) => (r.status || "PLANNED") === s))
          .map((s) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[s]}`}
              />
              <span className="text-[8px] text-muted-foreground">
                {STATUS_LABELS[s]}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function FundingStructurePreview({
  mode,
  tiers = [],
  rounds = [],
  className = "",
}: FundingStructurePreviewProps) {
  if (!mode) return null;

  return (
    <div
      className={`rounded-md border border-border bg-muted/20 dark:bg-gray-900/20 p-3 ${className}`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Funding Structure Preview
        </p>
        <Badge
          variant="outline"
          className="text-[9px] px-1.5 py-0"
        >
          {mode === "GP_FUND" ? "Tranches" : "Rounds"}
        </Badge>
      </div>

      {mode === "GP_FUND" ? (
        <TierPreview tiers={tiers} />
      ) : (
        <RoundsPreview rounds={rounds} />
      )}
    </div>
  );
}
