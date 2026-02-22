"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DbHealthData {
  timestamp: string;
  overallStatus: "healthy" | "degraded" | "error";
  totalDrift: number;
  primaryStatus: "connected" | "disconnected" | "not_configured" | "disabled";
  backupStatus: "connected" | "disconnected" | "not_configured" | "disabled";
  primaryLatencyMs: number;
  backupLatencyMs: number;
  syncQueueDepth: number;
  lastSyncTimestamp: string | null;
  tables: Record<
    string,
    { primary: number; backup: number; drift: number; status: string }
  >;
}

export interface UseDbHealthResult {
  status: "healthy" | "degraded" | "error";
  lastSyncedAt: Date | null;
  latencyMs: number;
  loading: boolean;
  data: DbHealthData | null;
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook — polls /api/admin/db-health every 60 seconds (GP-side only)
// Only active for users with ADMIN or OWNER role.
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 60_000;

export function useDbHealth(enabled = true): UseDbHealthResult {
  const [data, setData] = useState<DbHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/admin/db-health", { signal });
      if (!res.ok) {
        // Non-admin user or endpoint error — treat as healthy to avoid false alerts
        if (res.status === 401 || res.status === 403) {
          setData(null);
          setLoading(false);
          return;
        }
        setData((prev) => prev ? { ...prev, overallStatus: "degraded" } : null);
        return;
      }
      const json: DbHealthData = await res.json();
      setData(json);
    } catch (err) {
      // Network error — mark as degraded if we had previous data
      if (err instanceof DOMException && err.name === "AbortError") return;
      setData((prev) => prev ? { ...prev, overallStatus: "degraded" } : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    fetchHealth(controller.signal);

    intervalRef.current = setInterval(() => {
      fetchHealth();
    }, POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, fetchHealth]);

  const refresh = useCallback(() => {
    fetchHealth();
  }, [fetchHealth]);

  return {
    status: data?.overallStatus ?? "healthy",
    lastSyncedAt: data?.lastSyncTimestamp ? new Date(data.lastSyncTimestamp) : null,
    latencyMs: data?.primaryLatencyMs ?? -1,
    loading,
    data,
    refresh,
  };
}
