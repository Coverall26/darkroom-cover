"use client";

import Link from "next/link";
import { useTier } from "@/lib/hooks/use-tier";

interface ContactCapCounterProps {
  current?: number;
  limit?: number | null;
}

/**
 * Renders "12 of 20 contacts used" with a progress bar.
 * At 80%+: amber warning. At 100%: red + upgrade CTA.
 *
 * Can be used with explicit props or auto-fetches via useTier().
 */
export function ContactCapCounter({ current: propCurrent, limit: propLimit }: ContactCapCounterProps = {}) {
  const { usage } = useTier();

  const current = propCurrent ?? usage?.contactCount ?? 0;
  const limit = propLimit !== undefined ? propLimit : (usage?.contactLimit ?? null);

  if (limit === null) {
    return (
      <div className="text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{current}</span> contacts
      </div>
    );
  }

  const pct = Math.min((current / limit) * 100, 100);
  const isWarning = pct >= 80 && pct < 100;
  const isAtLimit = pct >= 100;

  const barColor = isAtLimit
    ? "bg-red-500"
    : isWarning
      ? "bg-amber-500"
      : "bg-blue-600";

  const textColor = isAtLimit
    ? "text-red-600 dark:text-red-400"
    : isWarning
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={textColor}>
          <span className="font-mono tabular-nums">{current}</span> of{" "}
          <span className="font-mono tabular-nums">{limit}</span> contacts used
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
