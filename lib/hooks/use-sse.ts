"use client";

/**
 * useSSE — Client-side hook for consuming Server-Sent Events
 *
 * Phase 2 Prep: Connect to /api/sse and receive real-time updates.
 * Auto-reconnects with exponential backoff on disconnection.
 *
 * Usage:
 *   const { lastEvent, isConnected } = useSSE({ orgId, onEvent });
 *
 * The hook is opt-in — pass `enabled: false` to disable without unmounting.
 */

import { useEffect, useRef, useState, useCallback } from "react";

export interface SSEEventData {
  type: string;
  orgId: string;
  fundId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface UseSSEOptions {
  /** Organization ID to scope events */
  orgId: string | null;
  /** Callback fired for each event */
  onEvent?: (event: SSEEventData) => void;
  /** Filter events by type prefix (e.g., "investor." to only receive investor events) */
  filterPrefix?: string;
  /** Enable/disable the connection (default: true) */
  enabled?: boolean;
}

interface UseSSEReturn {
  /** Most recent event received */
  lastEvent: SSEEventData | null;
  /** Whether the EventSource is connected */
  isConnected: boolean;
  /** Number of reconnection attempts */
  reconnectCount: number;
}

const MAX_RECONNECT_DELAY = 30_000; // 30s max backoff
const INITIAL_RECONNECT_DELAY = 1_000; // 1s initial

export function useSSE({
  orgId,
  onEvent,
  filterPrefix,
  enabled = true,
}: UseSSEOptions): UseSSEReturn {
  const [lastEvent, setLastEvent] = useState<SSEEventData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const filterPrefixRef = useRef(filterPrefix);
  filterPrefixRef.current = filterPrefix;

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled || !orgId) {
      cleanup();
      return;
    }

    let attemptCount = 0;

    function connect() {
      // Clean up previous connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource(`/api/sse?orgId=${encodeURIComponent(orgId!)}`);
      eventSourceRef.current = es;

      es.addEventListener("connected", () => {
        setIsConnected(true);
        attemptCount = 0;
        setReconnectCount(0);
      });

      // Listen for all event types via generic message handler
      es.onmessage = (messageEvent) => {
        try {
          const parsed: SSEEventData = JSON.parse(messageEvent.data);

          // Apply prefix filter
          if (filterPrefixRef.current && !parsed.type.startsWith(filterPrefixRef.current)) {
            return;
          }

          setLastEvent(parsed);
          onEventRef.current?.(parsed);
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        setIsConnected(false);
        es.close();

        // Exponential backoff reconnect
        attemptCount++;
        setReconnectCount(attemptCount);
        const delay = Math.min(
          INITIAL_RECONNECT_DELAY * Math.pow(2, attemptCount - 1),
          MAX_RECONNECT_DELAY
        );

        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      cleanup();
    };
  }, [orgId, enabled, cleanup]);

  return { lastEvent, isConnected, reconnectCount };
}
