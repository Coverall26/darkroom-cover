"use client";

import { useState } from "react";
import { AlertTriangle, X, RefreshCw } from "lucide-react";
import { useDbHealth } from "@/lib/hooks/use-db-health";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// DbHealthBanner — GP Dashboard only
//
// Only renders when database health is NOT "healthy".
// Never shown to LP users — only used in GP admin pages.
// Dismissible via X button, but reappears if status changes.
// ---------------------------------------------------------------------------

interface DbHealthBannerProps {
  /** Set to false to disable polling (e.g., if user is not an admin). */
  enabled?: boolean;
}

export function DbHealthBanner({ enabled = true }: DbHealthBannerProps) {
  const { status, data, refresh, loading } = useDbHealth(enabled);
  const [dismissed, setDismissed] = useState(false);
  const [dismissedStatus, setDismissedStatus] = useState<string | null>(null);

  // Don't render for healthy status
  if (status === "healthy") return null;

  // If dismissed for the current status, hide
  if (dismissed && dismissedStatus === status) return null;

  // Build the message based on status
  let message = "Data sync delayed — some recent changes may not be reflected.";
  if (data) {
    if (data.primaryStatus === "disconnected") {
      message = "Primary database unreachable — operating in degraded mode. Recent changes may be delayed.";
    } else if (data.backupStatus === "disconnected") {
      message = "Backup database unreachable — data is being served from primary only.";
    } else if (data.totalDrift > 0) {
      message = `Data sync delayed — ${data.totalDrift} record${data.totalDrift === 1 ? "" : "s"} pending sync between databases.`;
    }
  }

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 dark:border-amber-700 dark:bg-amber-900/20"
      role="status"
      aria-live="polite"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <span className="flex-1 text-sm text-amber-800 dark:text-amber-300">
        {message}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => refresh()}
        disabled={loading}
        className="h-7 w-7 p-0 text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
        title="Refresh health status"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setDismissed(true);
          setDismissedStatus(status);
        }}
        className="h-7 w-7 p-0 text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
