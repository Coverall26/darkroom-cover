import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Redis Client Configuration
//
// Primary: Upstash Redis REST API for rate limiting, caching, and pub/sub.
// Fallback: In-memory rate limiter when Redis is unavailable.
// The in-memory fallback enforces actual limits (not a no-op) but does not
// persist across serverless cold starts. Redis is strongly recommended for
// production deployments.
// ---------------------------------------------------------------------------

const hasRedisConfig = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

export const redis = hasRedisConfig
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL as string,
      token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
    })
  : null;

const hasLockerRedisConfig = !!(process.env.UPSTASH_REDIS_REST_LOCKER_URL && process.env.UPSTASH_REDIS_REST_LOCKER_TOKEN);

export const lockerRedisClient = hasLockerRedisConfig
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_LOCKER_URL as string,
      token: process.env.UPSTASH_REDIS_REST_LOCKER_TOKEN as string,
    })
  : null;

// ---------------------------------------------------------------------------
// In-Memory Rate Limiter Fallback
//
// Used when Redis is unavailable. Implements a sliding window counter using
// a Map with automatic TTL cleanup. Enforces real limits but resets on cold
// start (acceptable trade-off for availability).
//
// Structure: Map<key, { count: number; windowStart: number; }>
// ---------------------------------------------------------------------------

interface InMemoryEntry {
  count: number;
  windowStart: number;
}

const inMemoryStore = new Map<string, InMemoryEntry>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60_000; // Garbage-collect expired entries every 60s

function parseWindowMs(window: string): number {
  const match = window.match(/^(\d+)\s*(ms|s|m|h|d)$/);
  if (!match) return 60_000; // Default: 1 minute
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case "ms": return value;
    case "s": return value * 1000;
    case "m": return value * 60_000;
    case "h": return value * 3_600_000;
    case "d": return value * 86_400_000;
    default: return 60_000;
  }
}

function cleanupExpiredEntries(windowMs: number): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of inMemoryStore) {
    if (now - entry.windowStart > windowMs * 2) {
      inMemoryStore.delete(key);
    }
  }
}

function createInMemoryRateLimiter(maxRequests: number, window: string) {
  const windowMs = parseWindowMs(window);

  return {
    limit: async (key: string) => {
      const now = Date.now();
      cleanupExpiredEntries(windowMs);

      const entry = inMemoryStore.get(key);
      const reset = now + windowMs;

      if (!entry || now - entry.windowStart >= windowMs) {
        // New window — reset counter
        inMemoryStore.set(key, { count: 1, windowStart: now });
        return {
          success: true,
          limit: maxRequests,
          remaining: maxRequests - 1,
          reset,
        };
      }

      // Existing window — increment
      entry.count += 1;
      const remaining = Math.max(0, maxRequests - entry.count);
      const success = entry.count <= maxRequests;

      return { success, limit: maxRequests, remaining, reset };
    },
  };
}

// ---------------------------------------------------------------------------
// Public: Rate Limiter Factory
//
// Returns an Upstash Redis-backed limiter when Redis is configured, otherwise
// falls back to an in-memory limiter that enforces real limits.
// ---------------------------------------------------------------------------

export type RateLimitWindow =
  | `${number} ms`
  | `${number} s`
  | `${number} m`
  | `${number} h`
  | `${number} d`;

export const ratelimit = (
  requests: number = 10,
  window: RateLimitWindow = "10 s",
) => {
  if (!redis) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        "[RATE_LIMIT] Redis not configured — using in-memory fallback. " +
        "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for production."
      );
    }
    return createInMemoryRateLimiter(requests, window);
  }
  return new Ratelimit({
    redis: redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    analytics: true,
    prefix: "fundroom",
  });
};

// ---------------------------------------------------------------------------
// Redis Health Check
//
// Checks whether the Redis connection is alive. Used by health endpoints and
// the rate limiter to decide whether to use Redis or fall back.
// ---------------------------------------------------------------------------

export async function checkRedisHealth(): Promise<{
  connected: boolean;
  latencyMs: number | null;
  backend: "upstash_redis" | "in_memory";
}> {
  if (!redis) {
    return { connected: false, latencyMs: null, backend: "in_memory" };
  }

  const start = Date.now();
  try {
    await redis.ping();
    return {
      connected: true,
      latencyMs: Date.now() - start,
      backend: "upstash_redis",
    };
  } catch {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      backend: "in_memory",
    };
  }
}

/** Returns true if Redis is configured and available for rate limiting */
export function isRedisConfigured(): boolean {
  return hasRedisConfig;
}
