// @ts-nocheck
/**
 * CORS Middleware Tests
 *
 * Tests for lib/middleware/cors.ts — configurable CORS origin validation.
 *
 * Validates:
 * - Platform domain allowlist (always allowed)
 * - CORS_ALLOWED_ORIGINS env var (extra origins)
 * - Wildcard mode (disables credentials)
 * - Preflight (OPTIONS) handling
 * - Vary: Origin header
 */

// Save original env
const originalEnv = { ...process.env };

// We need to re-import the module after changing env vars, so we use jest.isolateModules
function loadCorsModule(extraOrigins?: string) {
  let mod: typeof import("@/lib/middleware/cors");

  jest.isolateModules(() => {
    if (extraOrigins !== undefined) {
      process.env.CORS_ALLOWED_ORIGINS = extraOrigins;
    } else {
      delete process.env.CORS_ALLOWED_ORIGINS;
    }
    mod = require("@/lib/middleware/cors");
  });

  return mod!;
}

// Mock saas-config with test domains
jest.mock("@/lib/constants/saas-config", () => ({
  APP_DOMAIN: "app.fundroom.ai",
  LOGIN_DOMAIN: "app.login.fundroom.ai",
  ADMIN_DOMAIN: "app.admin.fundroom.ai",
  PLATFORM_DOMAIN: "fundroom.ai",
}));

function makeRequest(origin?: string, method = "GET"): any {
  return {
    method,
    headers: {
      get: (name: string) => {
        if (name === "origin") return origin ?? null;
        return null;
      },
    },
    nextUrl: { pathname: "/api/test" },
  };
}

function makeResponse(): any {
  const headers = new Map<string, string>();
  return {
    headers: {
      set: (k: string, v: string) => headers.set(k, v),
      get: (k: string) => headers.get(k) ?? null,
    },
    _headers: headers,
  };
}

afterEach(() => {
  process.env = { ...originalEnv };
  jest.resetModules();
});

describe("CORS Middleware — Default (no extra origins)", () => {
  it("should allow platform app domain", () => {
    const cors = loadCorsModule("");
    const result = cors.getAllowedOrigin("https://app.fundroom.ai");
    expect(result).toBe("https://app.fundroom.ai");
  });

  it("should allow platform login domain", () => {
    const cors = loadCorsModule("");
    expect(cors.getAllowedOrigin("https://app.login.fundroom.ai")).toBe(
      "https://app.login.fundroom.ai",
    );
  });

  it("should allow platform admin domain", () => {
    const cors = loadCorsModule("");
    expect(cors.getAllowedOrigin("https://app.admin.fundroom.ai")).toBe(
      "https://app.admin.fundroom.ai",
    );
  });

  it("should allow platform root domain", () => {
    const cors = loadCorsModule("");
    expect(cors.getAllowedOrigin("https://fundroom.ai")).toBe("https://fundroom.ai");
  });

  it("should allow www.fundroom.ai", () => {
    const cors = loadCorsModule("");
    expect(cors.getAllowedOrigin("https://www.fundroom.ai")).toBe(
      "https://www.fundroom.ai",
    );
  });

  it("should reject unknown origin", () => {
    const cors = loadCorsModule("");
    expect(cors.getAllowedOrigin("https://evil.com")).toBeNull();
  });

  it("should reject null origin", () => {
    const cors = loadCorsModule("");
    expect(cors.getAllowedOrigin(null)).toBeNull();
  });

  it("should not be in wildcard mode", () => {
    const cors = loadCorsModule("");
    expect(cors.isWildcardCors()).toBe(false);
  });
});

describe("CORS Middleware — Extra Origins", () => {
  it("should allow extra origins from env", () => {
    const cors = loadCorsModule("https://portal.acme.com,https://ir.bigfund.com");
    expect(cors.getAllowedOrigin("https://portal.acme.com")).toBe(
      "https://portal.acme.com",
    );
    expect(cors.getAllowedOrigin("https://ir.bigfund.com")).toBe(
      "https://ir.bigfund.com",
    );
  });

  it("should still allow platform domains with extra origins", () => {
    const cors = loadCorsModule("https://portal.acme.com");
    expect(cors.getAllowedOrigin("https://app.fundroom.ai")).toBe(
      "https://app.fundroom.ai",
    );
  });

  it("should reject non-listed origin even with extras configured", () => {
    const cors = loadCorsModule("https://portal.acme.com");
    expect(cors.getAllowedOrigin("https://evil.com")).toBeNull();
  });

  it("should strip trailing slashes from origins", () => {
    const cors = loadCorsModule("https://portal.acme.com/");
    expect(cors.getAllowedOrigin("https://portal.acme.com")).toBe(
      "https://portal.acme.com",
    );
  });

  it("should ignore invalid origins (no protocol)", () => {
    const cors = loadCorsModule("portal.acme.com,https://valid.com");
    expect(cors.getAllowedOrigin("https://portal.acme.com")).toBeNull();
    expect(cors.getAllowedOrigin("https://valid.com")).toBe("https://valid.com");
  });

  it("should handle whitespace in env var", () => {
    const cors = loadCorsModule("  https://a.com , https://b.com  ");
    expect(cors.getAllowedOrigin("https://a.com")).toBe("https://a.com");
    expect(cors.getAllowedOrigin("https://b.com")).toBe("https://b.com");
  });
});

describe("CORS Middleware — Wildcard Mode", () => {
  it("should allow any origin in wildcard mode", () => {
    const cors = loadCorsModule("*");
    expect(cors.getAllowedOrigin("https://anything.com")).toBe("https://anything.com");
    expect(cors.getAllowedOrigin("https://evil.com")).toBe("https://evil.com");
  });

  it("should report wildcard mode", () => {
    const cors = loadCorsModule("*");
    expect(cors.isWildcardCors()).toBe(true);
  });
});

describe("setCorsHeaders", () => {
  it("should set credentials true for platform origins", () => {
    const cors = loadCorsModule("");
    const req = makeRequest("https://app.fundroom.ai");
    const res = makeResponse();
    cors.setCorsHeaders(req, res);
    expect(res._headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.fundroom.ai",
    );
    expect(res._headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res._headers.get("Vary")).toBe("Origin");
  });

  it("should not set headers for rejected origins", () => {
    const cors = loadCorsModule("");
    const req = makeRequest("https://evil.com");
    const res = makeResponse();
    cors.setCorsHeaders(req, res);
    expect(res._headers.get("Access-Control-Allow-Origin")).toBeUndefined();
  });
});

describe("handleCorsPreflightRequest", () => {
  it("should return null for non-OPTIONS requests", () => {
    const cors = loadCorsModule("");
    const req = makeRequest("https://app.fundroom.ai", "GET");
    expect(cors.handleCorsPreflightRequest(req)).toBeNull();
  });

  it("should return 204 for OPTIONS with allowed origin", () => {
    const cors = loadCorsModule("");
    const req = makeRequest("https://app.fundroom.ai", "OPTIONS");
    const res = cors.handleCorsPreflightRequest(req);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(204);
  });

  it("should return 204 for OPTIONS with disallowed origin (no CORS headers)", () => {
    const cors = loadCorsModule("");
    const req = makeRequest("https://evil.com", "OPTIONS");
    const res = cors.handleCorsPreflightRequest(req);
    expect(res).not.toBeNull();
    expect(res?.status).toBe(204);
  });
});
