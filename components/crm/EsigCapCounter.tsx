"use client";

import Link from "next/link";

interface EsigCapCounterProps {
  used: number;
  limit: number | null;
}

/**
 * Renders "5 of 10 e-signatures used this month" with a progress bar.
 * At 80%+: amber warning. At 100%: red + upgrade CTA.
 */
export function EsigCapCounter({ used, limit }: EsigCapCounterProps) {
  if (limit === null) {
    return (
      <div className="text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{used}</span> e-signatures this month
      </div>
    );
  }

  const pct = Math.min((used / limit) * 100, 100);
  const isWarning = pct >= 80 && pct < 100;
  const isAtLimit = pct >= 100;

  const barColor = isAtLimit
    ? "bg-red-500"
    : isWarning
      ? "bg-amber-500"
      : "bg-emerald-600";

  const textColor = isAtLimit
    ? "text-red-600 dark:text-red-400"
    : isWarning
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={textColor}>
          <span className="font-mono tabular-nums">{used}</span> of{" "}
          <span className="font-mono tabular-nums">{limit}</span> e-signatures this month
        </span>
        {isAtLimit && (
          <Link
            href="/admin/settings?tab=billing"
            className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Upgrade
          </Link>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
