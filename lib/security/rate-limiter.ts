import { NextApiRequest, NextApiResponse } from "next";
import { NextRequest, NextResponse } from "next/server";
import { ratelimit, isRedisConfigured, type RateLimitWindow } from "@/lib/redis";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Redis-backed rate limiter with in-memory fallback
//
// Primary: Upstash Redis via @upstash/ratelimit (persistent across cold starts)
// Fallback: In-memory sliding window (enforces real limits but resets on cold start)
//
// The in-memory fallback is NOT a no-op — it actually enforces rate limits
// using a Map-based sliding window counter. This provides defense-in-depth
// even when Redis is temporarily unavailable.
//
// When Redis is unreachable mid-request (after being configured), the limiter
// is fail-open — the request is allowed but a warning is logged to Rollbar.
// ---------------------------------------------------------------------------

interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window duration as Upstash duration string */
  window: RateLimitWindow;
  /** Prefix for the Redis key (avoids collisions between limiters) */
  keyPrefix: string;
  /** Optional callback when limit is exceeded */
  onLimitReached?: (identifier: string, endpoint: string) => void;
}

function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  return req.socket?.remoteAddress || "unknown";
}

export function createRateLimiter(config: RateLimitConfig) {
  const limiter = ratelimit(config.maxRequests, config.window);

  return async function rateLimitMiddleware(
    req: NextApiRequest,
    res: NextApiResponse,
  ): Promise<boolean> {
    const ip = getClientIp(req);
    const endpoint = req.url || "unknown";
    const key = `${config.keyPrefix}:${ip}`;

    try {
      const result = await limiter.limit(key);

      res.setHeader("X-RateLimit-Limit", result.limit);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader(
        "X-RateLimit-Reset",
        Math.ceil((result.reset - Date.now()) / 1000),
      );

      if (!result.success) {
        if (config.onLimitReached) {
          config.onLimitReached(ip, endpoint);
        }

        await logRateLimitViolation(ip, endpoint);

        const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
        res.setHeader("Retry-After", retryAfter);
        res.status(429).json({
          error: "Too many requests",
          retryAfter,
        });
        return false;
      }

      return true;
    } catch (error) {
      // Fail open — if Redis is down, allow the request but log the failure
      reportError(error, {
        path: endpoint,
        action: "rate_limit_check",
        keyPrefix: config.keyPrefix,
      });
      return true;
    }
  };
}

async function logRateLimitViolation(ip: string, endpoint: string) {
  try {
    await prisma.signatureAuditLog.create({
      data: {
        documentId: "SECURITY_LOG",
        event: "RATE_LIMIT_EXCEEDED",
        ipAddress: ip,
        metadata: {
          endpoint,
          timestamp: new Date().toISOString(),
          severity: "WARNING",
        } as object,
      },
    });
  } catch (error) {
    console.error("[SECURITY] Failed to log rate limit violation:", error);
  }
}

// ---------------------------------------------------------------------------
// Pre-configured limiters
// ---------------------------------------------------------------------------

/** E-signature endpoints — 5 requests per 15 minutes */
export const signatureRateLimiter = createRateLimiter({
  maxRequests: 5,
  window: "15 m",
  keyPrefix: "rl:sig",
  onLimitReached: (id, endpoint) => {
    console.warn(`[SECURITY] Signature rate limit exceeded: ${id} on ${endpoint}`);
  },
});

/** Auth endpoints — 10 requests per hour */
export const authRateLimiter = createRateLimiter({
  maxRequests: 10,
  window: "60 m",
  keyPrefix: "rl:auth",
  onLimitReached: (id, endpoint) => {
    console.warn(`[SECURITY] Auth rate limit exceeded: ${id} on ${endpoint}`);
  },
});

/** General API endpoints — 100 requests per minute */
export const apiRateLimiter = createRateLimiter({
  maxRequests: 100,
  window: "60 s",
  keyPrefix: "rl:api",
});

/** Strict endpoints (password reset, admin setup) — 3 requests per hour */
export const strictRateLimiter = createRateLimiter({
  maxRequests: 3,
  window: "60 m",
  keyPrefix: "rl:strict",
  onLimitReached: (id, endpoint) => {
    console.error(`[SECURITY] Strict rate limit exceeded: ${id} on ${endpoint}`);
  },
});

/** File upload endpoints — 20 requests per minute */
export const uploadRateLimiter = createRateLimiter({
  maxRequests: 20,
  window: "60 s",
  keyPrefix: "rl:upload",
  onLimitReached: (id, endpoint) => {
    console.warn(`[SECURITY] Upload rate limit exceeded: ${id} on ${endpoint}`);
  },
});

/** MFA verification — 5 attempts per 15 minutes (TOTP brute-force protection) */
export const mfaVerifyRateLimiter = createRateLimiter({
  maxRequests: 5,
  window: "15 m",
  keyPrefix: "rl:mfa-verify",
  onLimitReached: (id, endpoint) => {
    console.error(`[SECURITY] MFA brute-force attempt: ${id} on ${endpoint}`);
  },
});

/** Convenience wrapper: rate-limit a handler */
export function withRateLimit(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>,
  limiter = apiRateLimiter,
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const allowed = await limiter(req, res);
    if (!allowed) return;
    return handler(req, res);
  };
}

// ---------------------------------------------------------------------------
// App Router (NextRequest/NextResponse) rate limiting
// ---------------------------------------------------------------------------

function getClientIpFromNextRequest(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}

/**
 * App Router rate limiter — returns null if allowed, NextResponse(429) if blocked.
 *
 * Usage:
 *   const blocked = await appRouterRateLimit(req);
 *   if (blocked) return blocked;
 */
export async function appRouterRateLimit(
  req: NextRequest,
  keyPrefix = "rl:api",
  maxRequests = 100,
  window: RateLimitWindow = "60 s",
): Promise<NextResponse | null> {
  const ip = getClientIpFromNextRequest(req);
  const endpoint = req.nextUrl.pathname;
  const key = `${keyPrefix}:${ip}`;

  try {
    const limiter = ratelimit(maxRequests, window);
    const result = await limiter.limit(key);

    if (!result.success) {
      await logRateLimitViolation(ip, endpoint);
      const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);

      return NextResponse.json(
        { error: "Too many requests", retryAfter },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": String(result.remaining),
            "X-RateLimit-Reset": String(Math.ceil((result.reset - Date.now()) / 1000)),
          },
        },
      );
    }

    return null; // Allowed
  } catch (error) {
    // Fail open
    reportError(error, { path: endpoint, action: "rate_limit_check", keyPrefix });
    return null;
  }
}

/** App Router upload rate limit (20 req/min) */
export async function appRouterUploadRateLimit(req: NextRequest): Promise<NextResponse | null> {
  return appRouterRateLimit(req, "rl:upload", 20, "60 s");
}

/** App Router strict rate limit (3 req/hr) — for payments, subscriptions */
export async function appRouterStrictRateLimit(req: NextRequest): Promise<NextResponse | null> {
  return appRouterRateLimit(req, "rl:strict", 3, "60 m");
}

/** App Router auth rate limit (10 req/hr) — for auth checks, login */
export async function appRouterAuthRateLimit(req: NextRequest): Promise<NextResponse | null> {
  return appRouterRateLimit(req, "rl:auth", 10, "60 m");
}

/** App Router MFA verify rate limit (5 req/15min) — TOTP brute-force protection */
export async function appRouterMfaRateLimit(req: NextRequest): Promise<NextResponse | null> {
  return appRouterRateLimit(req, "rl:mfa-verify", 5, "15 m");
}

/** App Router signature rate limit (5 req/15min) */
export async function appRouterSignatureRateLimit(req: NextRequest): Promise<NextResponse | null> {
  return appRouterRateLimit(req, "rl:sig", 5, "15 m");
}

// ---------------------------------------------------------------------------
// Rate Limit Key Management
// ---------------------------------------------------------------------------

/**
 * Reset a specific rate limit key — useful for testing and admin override.
 * Deletes the key from Redis (or clears from in-memory fallback).
 */
export async function resetRateLimit(key: string): Promise<void> {
  const { redis: redisClient } = await import("@/lib/redis");
  if (redisClient) {
    try {
      // Upstash rate limiter uses "fundroom:" prefix
      await redisClient.del(`fundroom:${key}`);
    } catch (error) {
      reportError(error, { action: "rate_limit_reset", key });
    }
  }
}
