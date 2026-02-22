/**
 * Tests for lib/middleware/admin-auth.ts
 *
 * Verifies edge-compatible admin authentication enforcement:
 *   - JWT session validation via next-auth/jwt getToken()
 *   - LP role blocking on admin routes
 *   - Path exemptions (login, health checks, webhooks)
 *   - User context headers for defense-in-depth
 *   - Correct HTTP status codes (401, 403) and redirects
 */

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import {
  enforceAdminAuth,
  applyAdminAuthHeaders,
  AdminAuthResult,
} from "@/lib/middleware/admin-auth";

// Mock next-auth/jwt at the module level
jest.mock("next-auth/jwt", () => ({
  getToken: jest.fn(),
}));

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(path: string, method = "GET"): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: {
      host: "localhost:3000",
      "x-forwarded-for": "127.0.0.1",
    },
  });
}

// ---------------------------------------------------------------------------
// enforceAdminAuth — Exempt Paths
// ---------------------------------------------------------------------------

describe("enforceAdminAuth — exempt paths", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should allow /admin/login without auth", async () => {
    const req = makeRequest("/admin/login");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
    expect(result.response).toBeUndefined();
    // getToken should NOT be called for exempt paths
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("should allow /admin/login/callback without auth", async () => {
    const req = makeRequest("/admin/login/callback");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("should allow /api/admin/rollbar-errors without auth", async () => {
    const req = makeRequest("/api/admin/rollbar-errors");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("should allow /api/admin/deployment-readiness without auth", async () => {
    const req = makeRequest("/api/admin/deployment-readiness");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
  });

  it("should allow /api/admin/db-health without auth", async () => {
    const req = makeRequest("/api/admin/db-health");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
  });

  it("should allow /api/admin/launch-health without auth", async () => {
    const req = makeRequest("/api/admin/launch-health");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
  });

  it("should allow bare /admin path (let AppMiddleware handle it)", async () => {
    const req = makeRequest("/admin");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
    expect(mockGetToken).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// enforceAdminAuth — Unauthenticated Requests
// ---------------------------------------------------------------------------

describe("enforceAdminAuth — unauthenticated requests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue(null);
  });

  it("should return 401 for unauthenticated /api/admin/* requests", async () => {
    const req = makeRequest("/api/admin/settings");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(true);
    expect(result.response).toBeDefined();
    expect(result.response!.status).toBe(401);

    const body = await result.response!.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should redirect unauthenticated /admin/* page requests to login", async () => {
    const req = makeRequest("/admin/dashboard");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(true);
    expect(result.response).toBeDefined();
    expect(result.response!.status).toBe(307); // redirect status

    const location = result.response!.headers.get("location");
    expect(location).toContain("/admin/login");
    expect(location).toContain("next=%2Fadmin%2Fdashboard");
  });

  it("should preserve query string in login redirect", async () => {
    const req = makeRequest("/admin/fund/123?tab=wire");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(true);
    const location = result.response!.headers.get("location");
    expect(location).toContain("/admin/login");
    expect(location).toContain(encodeURIComponent("/admin/fund/123?tab=wire"));
  });

  it("should return 401 when token has no email", async () => {
    mockGetToken.mockResolvedValue({ sub: "user-1" } as any);
    const req = makeRequest("/api/admin/settings");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(true);
    expect(result.response!.status).toBe(401);
  });

  it("should treat token decode errors as unauthenticated", async () => {
    mockGetToken.mockRejectedValue(new Error("Token decode failure"));
    const req = makeRequest("/api/admin/settings");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(true);
    expect(result.response!.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// enforceAdminAuth — LP Role Blocking
// ---------------------------------------------------------------------------

describe("enforceAdminAuth — LP role blocking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 403 for LP users on /api/admin/* routes", async () => {
    mockGetToken.mockResolvedValue({
      sub: "user-lp-1",
      email: "lp@example.com",
      role: "LP",
    } as any);

    const req = makeRequest("/api/admin/investors");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(true);
    expect(result.response!.status).toBe(403);

    const body = await result.response!.json();
    expect(body.error).toBe("Forbidden: admin access required");
  });

  it("should redirect LP users from /admin/* pages to LP dashboard", async () => {
    mockGetToken.mockResolvedValue({
      sub: "user-lp-2",
      email: "lp2@example.com",
      role: "LP",
    } as any);

    const req = makeRequest("/admin/dashboard");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(true);
    expect(result.response!.status).toBe(307);

    const location = result.response!.headers.get("location");
    expect(location).toContain("/lp/dashboard");
  });

  it("should treat users with no role claim as LP (default)", async () => {
    mockGetToken.mockResolvedValue({
      sub: "user-norole",
      email: "norole@example.com",
      // no role field — defaults to "LP"
    } as any);

    const req = makeRequest("/api/admin/settings");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(true);
    expect(result.response!.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// enforceAdminAuth — Authenticated Admin Users
// ---------------------------------------------------------------------------

describe("enforceAdminAuth — authenticated admin users", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should allow ADMIN role through /api/admin/*", async () => {
    mockGetToken.mockResolvedValue({
      sub: "user-admin-1",
      email: "admin@example.com",
      role: "ADMIN",
    } as any);

    const req = makeRequest("/api/admin/settings");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
    expect(result.response).toBeUndefined();
    expect(result.userId).toBe("user-admin-1");
    expect(result.userEmail).toBe("admin@example.com");
    expect(result.userRole).toBe("ADMIN");
  });

  it("should allow OWNER role through /admin/* pages", async () => {
    mockGetToken.mockResolvedValue({
      sub: "user-owner-1",
      email: "owner@example.com",
      role: "OWNER",
    } as any);

    const req = makeRequest("/admin/fund/abc-123");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
    expect(result.userId).toBe("user-owner-1");
    expect(result.userEmail).toBe("owner@example.com");
    expect(result.userRole).toBe("OWNER");
  });

  it("should allow SUPER_ADMIN role", async () => {
    mockGetToken.mockResolvedValue({
      sub: "user-sa-1",
      email: "sa@example.com",
      role: "SUPER_ADMIN",
    } as any);

    const req = makeRequest("/api/admin/reports");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
    expect(result.userRole).toBe("SUPER_ADMIN");
  });

  it("should allow MANAGER role", async () => {
    mockGetToken.mockResolvedValue({
      sub: "user-mgr-1",
      email: "mgr@example.com",
      role: "MANAGER",
    } as any);

    const req = makeRequest("/admin/investors");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
    expect(result.userRole).toBe("MANAGER");
  });

  it("should allow MEMBER role (non-LP)", async () => {
    mockGetToken.mockResolvedValue({
      sub: "user-member-1",
      email: "member@example.com",
      role: "MEMBER",
    } as any);

    const req = makeRequest("/admin/settings");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
    expect(result.userRole).toBe("MEMBER");
  });

  it("should use token.id as fallback when token.sub is missing", async () => {
    mockGetToken.mockResolvedValue({
      id: "user-id-fallback",
      email: "user@example.com",
      role: "ADMIN",
    } as any);

    const req = makeRequest("/api/admin/dashboard");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
    expect(result.userId).toBe("user-id-fallback");
  });
});

// ---------------------------------------------------------------------------
// enforceAdminAuth — getToken configuration
// ---------------------------------------------------------------------------

describe("enforceAdminAuth — getToken configuration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockResolvedValue(null);
  });

  it("should pass NEXTAUTH_SECRET to getToken", async () => {
    process.env.NEXTAUTH_SECRET = "test-secret-123";
    const req = makeRequest("/api/admin/test");
    await enforceAdminAuth(req);

    expect(mockGetToken).toHaveBeenCalledWith(
      expect.objectContaining({
        secret: "test-secret-123",
      })
    );
  });

  it("should pass the correct cookie name to getToken", async () => {
    const req = makeRequest("/api/admin/test");
    await enforceAdminAuth(req);

    expect(mockGetToken).toHaveBeenCalledWith(
      expect.objectContaining({
        cookieName: expect.any(String),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// applyAdminAuthHeaders
// ---------------------------------------------------------------------------

describe("applyAdminAuthHeaders", () => {
  it("should set user context headers on response", () => {
    const response = NextResponse.next();
    const authResult: AdminAuthResult = {
      blocked: false,
      userId: "user-123",
      userEmail: "admin@fundroom.ai",
      userRole: "ADMIN",
    };

    applyAdminAuthHeaders(response, authResult);

    expect(response.headers.get("x-middleware-user-id")).toBe("user-123");
    expect(response.headers.get("x-middleware-user-email")).toBe("admin@fundroom.ai");
    expect(response.headers.get("x-middleware-user-role")).toBe("ADMIN");
  });

  it("should not set headers when auth result has no user data", () => {
    const response = NextResponse.next();
    const authResult: AdminAuthResult = {
      blocked: false,
    };

    applyAdminAuthHeaders(response, authResult);

    expect(response.headers.get("x-middleware-user-id")).toBeNull();
    expect(response.headers.get("x-middleware-user-email")).toBeNull();
    expect(response.headers.get("x-middleware-user-role")).toBeNull();
  });

  it("should handle partial user data", () => {
    const response = NextResponse.next();
    const authResult: AdminAuthResult = {
      blocked: false,
      userId: "user-456",
      // no email or role
    };

    applyAdminAuthHeaders(response, authResult);

    expect(response.headers.get("x-middleware-user-id")).toBe("user-456");
    expect(response.headers.get("x-middleware-user-email")).toBeNull();
    expect(response.headers.get("x-middleware-user-role")).toBeNull();
  });

  it("should return the same response object", () => {
    const response = NextResponse.next();
    const authResult: AdminAuthResult = {
      blocked: false,
      userId: "user-789",
      userEmail: "test@example.com",
      userRole: "OWNER",
    };

    const returned = applyAdminAuthHeaders(response, authResult);
    expect(returned).toBe(response);
  });
});

// ---------------------------------------------------------------------------
// enforceAdminAuth — edge cases
// ---------------------------------------------------------------------------

describe("enforceAdminAuth — edge cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should handle /api/admin/rollbar-errors/subpath as exempt", async () => {
    const req = makeRequest("/api/admin/rollbar-errors/ingest");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(false);
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("should NOT exempt /api/admin/rollbar-error (no trailing s)", async () => {
    mockGetToken.mockResolvedValue(null);
    const req = makeRequest("/api/admin/rollbar-error");
    const result = await enforceAdminAuth(req);

    // This path is NOT in the exempt list, so it should require auth
    expect(result.blocked).toBe(true);
  });

  it("should enforce auth on /admin/setup", async () => {
    mockGetToken.mockResolvedValue(null);
    const req = makeRequest("/admin/setup");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(true);
    // Should redirect to login (not 401) since it's a page
    expect(result.response!.status).toBe(307);
  });

  it("should enforce auth on /admin/fund/123/wire", async () => {
    mockGetToken.mockResolvedValue(null);
    const req = makeRequest("/admin/fund/123/wire");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(true);
    const location = result.response!.headers.get("location");
    expect(location).toContain("/admin/login");
  });

  it("should enforce auth on /api/admin/settings/full", async () => {
    mockGetToken.mockResolvedValue(null);
    const req = makeRequest("/api/admin/settings/full");
    const result = await enforceAdminAuth(req);

    expect(result.blocked).toBe(true);
    expect(result.response!.status).toBe(401);
  });
});
