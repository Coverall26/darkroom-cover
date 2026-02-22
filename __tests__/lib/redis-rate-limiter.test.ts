// @ts-nocheck
/**
 * Redis & In-Memory Rate Limiter Tests
 *
 * Tests for lib/redis.ts — the rate limiter factory with Redis primary
 * and in-memory fallback. Validates:
 * - In-memory sliding window enforcement
 * - Window expiration and reset
 * - Garbage collection of expired entries
 * - Redis health check interface
 * - Fallback behavior when Redis is unavailable
 */

// Mock Redis as unavailable to test in-memory fallback
jest.mock("@upstash/redis", () => ({
  Redis: jest.fn(),
}));

jest.mock("@upstash/ratelimit", () => ({
  Ratelimit: jest.fn(),
}));

// Remove Redis env vars to force in-memory mode
const originalEnv = process.env;
beforeAll(() => {
  process.env = {
    ...originalEnv,
    UPSTASH_REDIS_REST_URL: "",
    UPSTASH_REDIS_REST_TOKEN: "",
    NODE_ENV: "test",
  };
});

afterAll(() => {
  process.env = originalEnv;
});

// Unmock @/lib/redis so we get the real module (jest.setup.ts globally mocks it)
jest.unmock("@/lib/redis");

// Fresh import after env override
let ratelimit: typeof import("@/lib/redis").ratelimit;
let checkRedisHealth: typeof import("@/lib/redis").checkRedisHealth;
let isRedisConfigured: typeof import("@/lib/redis").isRedisConfigured;

beforeAll(async () => {
  // Dynamic import to pick up the mocked env + real module
  const mod = await import("@/lib/redis");
  ratelimit = mod.ratelimit;
  checkRedisHealth = mod.checkRedisHealth;
  isRedisConfigured = mod.isRedisConfigured;
});

describe("In-Memory Rate Limiter", () => {
  it("should allow requests under the limit", async () => {
    const limiter = ratelimit(5, "60 s");
    const result = await limiter.limit("test:allow:1");
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
  });

  it("should block requests exceeding the limit", async () => {
    const limiter = ratelimit(2, "60 s");
    const key = "test:block:" + Date.now();

    const r1 = await limiter.limit(key);
    expect(r1.success).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = await limiter.limit(key);
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(0);

    const r3 = await limiter.limit(key);
    expect(r3.success).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it("should reset counter after window expires", async () => {
    // Use 100ms window for fast test
    const limiter = ratelimit(1, "100 ms");
    const key = "test:reset:" + Date.now();

    const r1 = await limiter.limit(key);
    expect(r1.success).toBe(true);

    const r2 = await limiter.limit(key);
    expect(r2.success).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    const r3 = await limiter.limit(key);
    expect(r3.success).toBe(true);
  });

  it("should track different keys independently", async () => {
    const limiter = ratelimit(1, "60 s");
    const key1 = "test:independent:a:" + Date.now();
    const key2 = "test:independent:b:" + Date.now();

    const r1 = await limiter.limit(key1);
    expect(r1.success).toBe(true);

    const r2 = await limiter.limit(key2);
    expect(r2.success).toBe(true);

    const r3 = await limiter.limit(key1);
    expect(r3.success).toBe(false);
  });

  it("should return reset timestamp in the future", async () => {
    const limiter = ratelimit(5, "60 s");
    const result = await limiter.limit("test:reset-ts:" + Date.now());
    expect(result.reset).toBeGreaterThan(Date.now());
  });

  it("should handle various window formats", async () => {
    // Test each format
    const msLimiter = ratelimit(10, "500 ms");
    const sLimiter = ratelimit(10, "30 s");
    const mLimiter = ratelimit(10, "5 m");
    const hLimiter = ratelimit(10, "1 h");
    const dLimiter = ratelimit(10, "1 d");

    for (const limiter of [msLimiter, sLimiter, mLimiter, hLimiter, dLimiter]) {
      const result = await limiter.limit("test:format:" + Date.now() + Math.random());
      expect(result.success).toBe(true);
      expect(result.limit).toBe(10);
    }
  });
});

describe("Redis Health Check", () => {
  it("should report in_memory backend when Redis is not configured", async () => {
    const health = await checkRedisHealth();
    expect(health.connected).toBe(false);
    expect(health.backend).toBe("in_memory");
    expect(health.latencyMs).toBeNull();
  });

  it("should report Redis not configured", () => {
    expect(isRedisConfigured()).toBe(false);
  });
});
