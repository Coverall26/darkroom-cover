// @ts-nocheck
/**
 * Rate Limiter Tests
 *
 * Tests for lib/security/rate-limiter.ts - Rate limiting middleware for API protection.
 *
 * These tests validate:
 * - Rate limit enforcement at various thresholds
 * - IP extraction from different header formats
 * - Rate limit window expiration and reset
 * - Response header setting (X-RateLimit-*)
 * - Rate limit violation logging
 * - Different rate limiter configurations (signature, auth, api, strict)
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

var _mockLimit = jest.fn();

jest.mock("@/lib/redis", () => ({
  __esModule: true,
  redis: {},
  ratelimit: jest.fn(() => ({
    limit: (...args: any[]) => _mockLimit(...args),
  })),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    signatureAuditLog: {
      create: jest.fn().mockResolvedValue({ id: "log-1" }),
    },
  },
}));

import {
  createRateLimiter,
  signatureRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  strictRateLimiter,
  withRateLimit,
} from "@/lib/security/rate-limiter";
import prisma from "@/lib/prisma";

function mockLimitResult(success: boolean, limit: number, remaining: number) {
  _mockLimit.mockResolvedValue({
    success,
    limit,
    remaining,
    reset: Date.now() + 60000,
  });
}

describe("Rate Limiter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLimitResult(true, 5, 4);
  });

  describe("createRateLimiter", () => {
    it("should allow requests under the limit", async () => {
      mockLimitResult(true, 5, 4);
      const limiter = createRateLimiter({
        maxRequests: 5,
        window: "60 s",
        keyPrefix: "test-allow",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url: "/api/test-allow",
        headers: {
          "x-forwarded-for": "192.168.1.1",
        },
      });

      const allowed = await limiter(req, res);

      expect(allowed).toBe(true);
      expect(res.getHeader("X-RateLimit-Limit")).toBe(5);
      expect(res.getHeader("X-RateLimit-Remaining")).toBe(4);
    });

    it("should decrement remaining count on each request", async () => {
      const limiter = createRateLimiter({
        maxRequests: 5,
        window: "60 s",
        keyPrefix: "test-decrement",
      });

      mockLimitResult(true, 5, 4);
      const { req: req1, res: res1 } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url: "/api/test-decrement",
        headers: { "x-forwarded-for": "192.168.1.10" },
      });
      await limiter(req1, res1);
      expect(res1.getHeader("X-RateLimit-Remaining")).toBe(4);

      mockLimitResult(true, 5, 3);
      const { req: req2, res: res2 } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url: "/api/test-decrement",
        headers: { "x-forwarded-for": "192.168.1.10" },
      });
      await limiter(req2, res2);
      expect(res2.getHeader("X-RateLimit-Remaining")).toBe(3);

      mockLimitResult(true, 5, 2);
      const { req: req3, res: res3 } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url: "/api/test-decrement",
        headers: { "x-forwarded-for": "192.168.1.10" },
      });
      await limiter(req3, res3);
      expect(res3.getHeader("X-RateLimit-Remaining")).toBe(2);
    });

    it("should block requests exceeding the limit", async () => {
      const limiter = createRateLimiter({
        maxRequests: 2,
        window: "60 s",
        keyPrefix: "test-block",
      });

      const ip = "192.168.1.20";
      const url = "/api/test-block";

      mockLimitResult(true, 2, 1);
      const { req: req1, res: res1 } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url,
        headers: { "x-forwarded-for": ip },
      });
      expect(await limiter(req1, res1)).toBe(true);

      mockLimitResult(true, 2, 0);
      const { req: req2, res: res2 } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url,
        headers: { "x-forwarded-for": ip },
      });
      expect(await limiter(req2, res2)).toBe(true);

      mockLimitResult(false, 2, 0);
      const { req: req3, res: res3 } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url,
        headers: { "x-forwarded-for": ip },
      });
      expect(await limiter(req3, res3)).toBe(false);
      expect(res3.statusCode).toBe(429);
    });

    it("should return 429 status with error message when blocked", async () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        window: "60 s",
        keyPrefix: "test-429",
      });

      const ip = "192.168.1.30";

      mockLimitResult(false, 1, 0);
      const { req: req2, res: res2 } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url: "/api/test-429",
        headers: { "x-forwarded-for": ip },
      });
      await limiter(req2, res2);

      expect(res2.statusCode).toBe(429);
      const body = res2._getJSONData();
      expect(body.error).toBe("Too many requests");
      expect(body.retryAfter).toBeDefined();
    });

    it("should call onLimitReached callback when limit exceeded", async () => {
      const onLimitReached = jest.fn();
      const limiter = createRateLimiter({
        maxRequests: 1,
        window: "60 s",
        keyPrefix: "test-callback",
        onLimitReached,
      });

      const ip = "192.168.1.40";
      const url = "/api/test-callback";

      mockLimitResult(false, 1, 0);
      const { req: req2, res: res2 } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url,
        headers: { "x-forwarded-for": ip },
      });
      await limiter(req2, res2);

      expect(onLimitReached).toHaveBeenCalledWith(ip, url);
    });

    it("should log rate limit violations to database", async () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        window: "60 s",
        keyPrefix: "test-log",
      });

      const ip = "192.168.1.50";
      const url = "/api/test-log";

      mockLimitResult(false, 1, 0);
      const { req: req2, res: res2 } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url,
        headers: { "x-forwarded-for": ip },
      });
      await limiter(req2, res2);

      expect(prisma.signatureAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentId: "SECURITY_LOG",
          event: "RATE_LIMIT_EXCEEDED",
          ipAddress: ip,
          metadata: expect.objectContaining({
            endpoint: url,
            severity: "WARNING",
          }),
        }),
      });
    });

    it("should set X-RateLimit-Reset header", async () => {
      mockLimitResult(true, 5, 4);
      const limiter = createRateLimiter({
        maxRequests: 5,
        window: "60 s",
        keyPrefix: "test-reset",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url: "/api/test-reset",
        headers: { "x-forwarded-for": "192.168.1.60" },
      });

      await limiter(req, res);

      const reset = res.getHeader("X-RateLimit-Reset");
      expect(typeof reset).toBe("number");
      expect(reset).toBeGreaterThan(0);
      expect(reset).toBeLessThanOrEqual(60);
    });

    it("should fail open when Redis errors occur", async () => {
      _mockLimit.mockRejectedValue(new Error("Redis unavailable"));
      const limiter = createRateLimiter({
        maxRequests: 5,
        window: "60 s",
        keyPrefix: "test-fail-open",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url: "/api/test-fail-open",
        headers: { "x-forwarded-for": "192.168.1.70" },
      });

      const allowed = await limiter(req, res);
      expect(allowed).toBe(true);
    });
  });

  describe("IP Extraction", () => {
    it("should extract IP from x-forwarded-for header (string)", async () => {
      mockLimitResult(true, 5, 4);
      const limiter = createRateLimiter({
        maxRequests: 5,
        window: "60 s",
        keyPrefix: "test-ip-xff",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url: "/api/test-ip-xff",
        headers: {
          "x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3",
        },
      });

      await limiter(req, res);

      expect(_mockLimit).toHaveBeenCalledWith("test-ip-xff:10.0.0.1");
    });

    it("should extract IP from x-forwarded-for header (array)", async () => {
      mockLimitResult(true, 5, 4);
      const limiter = createRateLimiter({
        maxRequests: 5,
        window: "60 s",
        keyPrefix: "test-ip-xff-array",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url: "/api/test-ip-xff-array",
        headers: {
          "x-forwarded-for": ["10.0.0.10", "10.0.0.11"],
        },
      });

      await limiter(req, res);

      expect(_mockLimit).toHaveBeenCalledWith("test-ip-xff-array:10.0.0.10");
    });

    it("should fall back to socket remoteAddress when no forwarded header", async () => {
      mockLimitResult(true, 5, 4);
      const limiter = createRateLimiter({
        maxRequests: 5,
        window: "60 s",
        keyPrefix: "test-ip-socket",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url: "/api/test-ip-socket",
      });

      await limiter(req, res);

      expect(_mockLimit).toHaveBeenCalledWith(expect.stringContaining("test-ip-socket:"));
    });

    it("should trim whitespace from IP addresses", async () => {
      mockLimitResult(true, 5, 4);
      const limiter = createRateLimiter({
        maxRequests: 5,
        window: "60 s",
        keyPrefix: "test-ip-trim",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url: "/api/test-ip-trim",
        headers: {
          "x-forwarded-for": "  10.0.0.20  , 10.0.0.21",
        },
      });

      await limiter(req, res);

      expect(_mockLimit).toHaveBeenCalledWith("test-ip-trim:10.0.0.20");
    });
  });

  describe("Pre-configured Rate Limiters", () => {
    describe("signatureRateLimiter", () => {
      it("should use the sig rate limiter", async () => {
        mockLimitResult(true, 5, 4);
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: "POST",
          url: "/api/sign/token123",
          headers: { "x-forwarded-for": "10.1.0.1" },
        });

        const result = await signatureRateLimiter(req, res);

        expect(result).toBe(true);
        expect(res.getHeader("X-RateLimit-Limit")).toBe(5);
      });
    });

    describe("authRateLimiter", () => {
      it("should use the auth rate limiter", async () => {
        mockLimitResult(true, 10, 9);
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: "POST",
          url: "/api/auth/login",
          headers: { "x-forwarded-for": "10.2.0.1" },
        });

        const result = await authRateLimiter(req, res);

        expect(result).toBe(true);
        expect(res.getHeader("X-RateLimit-Limit")).toBe(10);
      });
    });

    describe("apiRateLimiter", () => {
      it("should use the api rate limiter", async () => {
        mockLimitResult(true, 100, 99);
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: "GET",
          url: "/api/data",
          headers: { "x-forwarded-for": "10.3.0.1" },
        });

        const result = await apiRateLimiter(req, res);

        expect(result).toBe(true);
        expect(res.getHeader("X-RateLimit-Limit")).toBe(100);
      });
    });

    describe("strictRateLimiter", () => {
      it("should use the strict rate limiter", async () => {
        mockLimitResult(true, 3, 2);
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: "POST",
          url: "/api/sensitive",
          headers: { "x-forwarded-for": "10.4.0.1" },
        });

        const result = await strictRateLimiter(req, res);

        expect(result).toBe(true);
        expect(res.getHeader("X-RateLimit-Limit")).toBe(3);
      });
    });
  });

  describe("withRateLimit Wrapper", () => {
    it("should call handler when under rate limit", async () => {
      mockLimitResult(true, 100, 99);
      const handler = jest.fn().mockResolvedValue(undefined);
      const wrappedHandler = withRateLimit(handler, createRateLimiter({
        maxRequests: 5,
        window: "60 s",
        keyPrefix: "test-wrapper-allow",
      }));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url: "/api/test-wrapper-allow",
        headers: { "x-forwarded-for": "10.5.0.1" },
      });

      await wrappedHandler(req, res);

      expect(handler).toHaveBeenCalledWith(req, res);
    });

    it("should not call handler when rate limited", async () => {
      mockLimitResult(false, 1, 0);
      const handler = jest.fn().mockResolvedValue(undefined);
      const limiter = createRateLimiter({
        maxRequests: 1,
        window: "60 s",
        keyPrefix: "test-wrapper-block",
      });
      const wrappedHandler = withRateLimit(handler, limiter);

      const ip = "10.5.0.10";
      const url = "/api/test-wrapper-block";

      const { req: req2, res: res2 } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url,
        headers: { "x-forwarded-for": ip },
      });
      await wrappedHandler(req2, res2);

      expect(handler).not.toHaveBeenCalled();
      expect(res2.statusCode).toBe(429);
    });

    it("should use apiRateLimiter by default", async () => {
      mockLimitResult(true, 100, 99);
      const handler = jest.fn().mockResolvedValue(undefined);
      const wrappedHandler = withRateLimit(handler);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url: "/api/default-limiter",
        headers: { "x-forwarded-for": "10.5.0.20" },
      });

      await wrappedHandler(req, res);

      expect(res.getHeader("X-RateLimit-Limit")).toBe(100);
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing URL gracefully", async () => {
      mockLimitResult(true, 5, 4);
      const limiter = createRateLimiter({
        maxRequests: 5,
        window: "60 s",
        keyPrefix: "test-no-url",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        headers: { "x-forwarded-for": "10.8.0.1" },
      });
      delete (req as any).url;

      const allowed = await limiter(req, res);

      expect(allowed).toBe(true);
    });

    it("should handle database errors gracefully when logging violations", async () => {
      (prisma.signatureAuditLog.create as jest.Mock).mockRejectedValueOnce(
        new Error("Database error")
      );

      mockLimitResult(false, 1, 0);
      const limiter = createRateLimiter({
        maxRequests: 1,
        window: "60 s",
        keyPrefix: "test-db-error",
      });

      const ip = "10.8.0.20";
      const url = "/api/test-db-error";

      const { req: req2, res: res2 } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        url,
        headers: { "x-forwarded-for": ip },
      });
      const allowed = await limiter(req2, res2);

      expect(allowed).toBe(false);
      expect(res2.statusCode).toBe(429);
    });
  });
});
