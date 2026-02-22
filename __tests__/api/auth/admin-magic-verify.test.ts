// @ts-nocheck
/**
 * Admin Magic Link Verify API Tests (App Router)
 *
 * Tests for app/api/auth/admin-magic-verify/route.ts
 *
 * These tests validate:
 * - Rate limiting
 * - Token and email validation
 * - Magic link verification
 * - User lookup and JWT creation
 * - Cookie setting with proper attributes
 * - Redirect path validation (open redirect protection)
 * - Error handling and redirects
 */

import { NextRequest } from "next/server";

// Mock functions
const mockVerifyAdminMagicLink = jest.fn();
const mockAppRouterAuthRateLimit = jest.fn();
const mockEncode = jest.fn();
const mockUserUpsert = jest.fn();
const mockRollbarInfo = jest.fn();
const mockRollbarError = jest.fn();
const mockReportError = jest.fn();

// Mock dependencies
jest.mock("@/lib/auth/admin-magic-link", () => ({
  verifyAdminMagicLink: (...args: any[]) => mockVerifyAdminMagicLink(...args),
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  appRouterAuthRateLimit: (...args: any[]) => mockAppRouterAuthRateLimit(...args),
}));

jest.mock("next-auth/jwt", () => ({
  encode: (...args: any[]) => mockEncode(...args),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    user: {
      upsert: (...args: any[]) => mockUserUpsert(...args),
    },
  },
}));

jest.mock("@/lib/rollbar", () => ({
  serverInstance: {
    info: (...args: any[]) => mockRollbarInfo(...args),
    error: (...args: any[]) => mockRollbarError(...args),
  },
}));

jest.mock("@/lib/error", () => ({
  reportError: (...args: any[]) => mockReportError(...args),
}));

jest.mock("@/lib/constants/auth-cookies", () => ({
  SESSION_COOKIE_NAME: "next-auth.session-token",
}));

import { GET } from "@/app/api/auth/admin-magic-verify/route";

function makeRequest(query: Record<string, string> = {}, headers?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/auth/admin-magic-verify");
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, {
    method: "GET",
    headers: {
      "x-forwarded-for": "127.0.0.1",
      "user-agent": "test-agent",
      ...(headers || {}),
    },
  });
}

describe("Admin Magic Verify API (App Router)", () => {
  const mockUser = {
    id: "user-123",
    email: "admin@example.com",
    name: "Admin User",
    image: "https://example.com/avatar.jpg",
    role: "GP",
    createdAt: new Date("2024-01-01"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAppRouterAuthRateLimit.mockResolvedValue(null); // null = not blocked
    mockVerifyAdminMagicLink.mockResolvedValue(true);
    mockUserUpsert.mockResolvedValue(mockUser);
    mockEncode.mockResolvedValue("mock-jwt-token");
    process.env.NEXTAUTH_SECRET = "test-secret";
  });

  describe("Rate Limiting", () => {
    it("should check rate limiter", async () => {
      const req = makeRequest({ token: "token", email: "admin@example.com" });
      await GET(req);
      expect(mockAppRouterAuthRateLimit).toHaveBeenCalledWith(req);
    });

    it("should return rate limit response if blocked", async () => {
      const { NextResponse } = require("next/server");
      const blockedResponse = NextResponse.json({ error: "Too many requests" }, { status: 429 });
      mockAppRouterAuthRateLimit.mockResolvedValue(blockedResponse);

      const req = makeRequest({ token: "token", email: "admin@example.com" });
      const res = await GET(req);

      expect(res.status).toBe(429);
      expect(mockVerifyAdminMagicLink).not.toHaveBeenCalled();
    });
  });

  describe("Token and Email Validation", () => {
    it("should redirect on missing token", async () => {
      const req = makeRequest({ email: "admin@example.com" });
      const res = await GET(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/admin/login?error=InvalidLink");
    });

    it("should redirect on missing email", async () => {
      const req = makeRequest({ token: "valid-token" });
      const res = await GET(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/admin/login?error=InvalidLink");
    });

    it("should redirect on missing both token and email", async () => {
      const req = makeRequest({});
      const res = await GET(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/admin/login?error=InvalidLink");
    });
  });

  describe("Magic Link Verification", () => {
    it("should verify the magic link", async () => {
      const req = makeRequest({ token: "my-token", email: "admin@example.com" });
      await GET(req);

      expect(mockVerifyAdminMagicLink).toHaveBeenCalledWith({
        token: "my-token",
        email: "admin@example.com",
      });
    });

    it("should redirect on invalid token", async () => {
      mockVerifyAdminMagicLink.mockResolvedValue(false);

      const req = makeRequest({ token: "invalid-token", email: "admin@example.com" });
      const res = await GET(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/admin/login?error=ExpiredLink");
    });

    it("should redirect on expired token", async () => {
      mockVerifyAdminMagicLink.mockResolvedValue(false);

      const req = makeRequest({ token: "expired-token", email: "admin@example.com" });
      const res = await GET(req);

      const location = res.headers.get("location");
      expect(location).toContain("/admin/login?error=ExpiredLink");
    });
  });

  describe("User Upsert", () => {
    it("should upsert user by email (lowercased)", async () => {
      const req = makeRequest({ token: "valid-token", email: "ADMIN@EXAMPLE.COM" });
      await GET(req);

      expect(mockUserUpsert).toHaveBeenCalledWith({
        where: { email: "admin@example.com" },
        update: { role: "GP" },
        create: {
          email: "admin@example.com",
          emailVerified: expect.any(Date),
          role: "GP",
        },
      });
    });

    it("should create new user if not exists", async () => {
      const newUser = {
        id: "new-user-456",
        email: "newadmin@example.com",
        role: "GP",
        createdAt: new Date(),
      };
      mockUserUpsert.mockResolvedValue(newUser);

      const req = makeRequest({ token: "valid-token", email: "newadmin@example.com" });
      const res = await GET(req);

      // Should redirect to hub (not error)
      expect(res.status).toBe(302);
      const location = res.headers.get("location");
      expect(location).toContain("/hub");
    });

    it("should update existing user role to GP", async () => {
      const existingUser = { ...mockUser, role: "GP" };
      mockUserUpsert.mockResolvedValue(existingUser);

      const req = makeRequest({ token: "valid-token", email: "admin@example.com" });
      await GET(req);

      expect(mockUserUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { role: "GP" },
        }),
      );
    });
  });

  describe("JWT Token Creation", () => {
    it("should create JWT with correct payload", async () => {
      const req = makeRequest({ token: "valid-token", email: "admin@example.com" });
      await GET(req);

      expect(mockEncode).toHaveBeenCalledWith({
        token: expect.objectContaining({
          sub: mockUser.id,
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          picture: mockUser.image,
          role: "GP",
          loginPortal: "ADMIN",
        }),
        secret: process.env.NEXTAUTH_SECRET,
        maxAge: 30 * 24 * 60 * 60,
      });
    });

    it("should set GP role for admin users", async () => {
      const req = makeRequest({ token: "valid-token", email: "admin@example.com" });
      await GET(req);

      expect(mockEncode).toHaveBeenCalledWith(
        expect.objectContaining({
          token: expect.objectContaining({
            role: "GP",
          }),
        }),
      );
    });

    it("should set loginPortal to ADMIN", async () => {
      const req = makeRequest({ token: "valid-token", email: "admin@example.com" });
      await GET(req);

      expect(mockEncode).toHaveBeenCalledWith(
        expect.objectContaining({
          token: expect.objectContaining({
            loginPortal: "ADMIN",
          }),
        }),
      );
    });
  });

  describe("Cookie Setting", () => {
    it("should set session cookie with proper name", async () => {
      const req = makeRequest(
        { token: "valid-token", email: "admin@example.com" },
        { "x-forwarded-proto": "https" },
      );
      const res = await GET(req);

      const cookie = res.headers.get("set-cookie");
      expect(cookie).toContain("next-auth.session-token=");
    });

    it("should set HttpOnly flag", async () => {
      const req = makeRequest({ token: "valid-token", email: "admin@example.com" });
      const res = await GET(req);

      const cookie = res.headers.get("set-cookie");
      expect(cookie).toContain("HttpOnly");
    });

    it("should set SameSite=Lax", async () => {
      const req = makeRequest({ token: "valid-token", email: "admin@example.com" });
      const res = await GET(req);

      const cookie = res.headers.get("set-cookie");
      expect(cookie).toContain("SameSite=Lax");
    });

    it("should set Path=/", async () => {
      const req = makeRequest({ token: "valid-token", email: "admin@example.com" });
      const res = await GET(req);

      const cookie = res.headers.get("set-cookie");
      expect(cookie).toContain("Path=/");
    });

    it("should set Secure flag when protocol is https", async () => {
      const req = makeRequest(
        { token: "valid-token", email: "admin@example.com" },
        { "x-forwarded-proto": "https" },
      );
      const res = await GET(req);

      const cookie = res.headers.get("set-cookie");
      expect(cookie).toContain("Secure");
    });

    it("should not set Secure flag when protocol is http and not production", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const req = makeRequest(
        { token: "valid-token", email: "admin@example.com" },
        { "x-forwarded-proto": "http" },
      );
      const res = await GET(req);

      const cookie = res.headers.get("set-cookie") as string;
      const parts = cookie.split(";").map((p: string) => p.trim());
      expect(parts).not.toContain("Secure");

      process.env.NODE_ENV = originalEnv;
    });

    it("should set 30-day Max-Age", async () => {
      const req = makeRequest({ token: "valid-token", email: "admin@example.com" });
      const res = await GET(req);

      const cookie = res.headers.get("set-cookie");
      expect(cookie).toContain("Max-Age=2592000"); // 30 * 24 * 60 * 60
    });
  });

  describe("Redirect Path Validation (Open Redirect Protection)", () => {
    it("should redirect to /hub by default", async () => {
      const req = makeRequest({ token: "valid-token", email: "admin@example.com" });
      const res = await GET(req);

      expect(res.status).toBe(302);
      const location = res.headers.get("location");
      expect(location).toContain("/hub");
    });

    it("should allow /hub redirect", async () => {
      const req = makeRequest({ token: "valid-token", email: "admin@example.com", redirect: "/hub" });
      const res = await GET(req);

      const location = res.headers.get("location");
      expect(location).toContain("/hub");
    });

    it("should allow /datarooms redirect", async () => {
      const req = makeRequest({
        token: "valid-token",
        email: "admin@example.com",
        redirect: "/datarooms/123",
      });
      const res = await GET(req);

      const location = res.headers.get("location");
      expect(location).toContain("/datarooms/123");
    });

    it("should allow /admin redirect", async () => {
      const req = makeRequest({
        token: "valid-token",
        email: "admin@example.com",
        redirect: "/admin/users",
      });
      const res = await GET(req);

      const location = res.headers.get("location");
      expect(location).toContain("/admin/users");
    });

    it("should allow /dashboard redirect", async () => {
      const req = makeRequest({
        token: "valid-token",
        email: "admin@example.com",
        redirect: "/dashboard",
      });
      const res = await GET(req);

      const location = res.headers.get("location");
      expect(location).toContain("/dashboard");
    });

    it("should allow /admin/settings redirect", async () => {
      const req = makeRequest({
        token: "valid-token",
        email: "admin@example.com",
        redirect: "/admin/settings",
      });
      const res = await GET(req);

      const location = res.headers.get("location");
      expect(location).toContain("/admin/settings");
    });

    it("should block absolute URL redirects (open redirect)", async () => {
      const req = makeRequest({
        token: "valid-token",
        email: "admin@example.com",
        redirect: "https://evil.com",
      });
      const res = await GET(req);

      const location = res.headers.get("location");
      expect(location).toContain("/hub");
    });

    it("should block protocol-relative URL redirects", async () => {
      const req = makeRequest({
        token: "valid-token",
        email: "admin@example.com",
        redirect: "//evil.com",
      });
      const res = await GET(req);

      const location = res.headers.get("location");
      expect(location).toContain("/hub");
    });

    it("should block non-allowed paths", async () => {
      const req = makeRequest({
        token: "valid-token",
        email: "admin@example.com",
        redirect: "/api/secret",
      });
      const res = await GET(req);

      const location = res.headers.get("location");
      expect(location).toContain("/hub");
    });

    it("should block paths without leading slash", async () => {
      const req = makeRequest({
        token: "valid-token",
        email: "admin@example.com",
        redirect: "hub",
      });
      const res = await GET(req);

      const location = res.headers.get("location");
      expect(location).toContain("/hub");
    });
  });

  describe("Error Handling", () => {
    it("should redirect on verification error", async () => {
      mockVerifyAdminMagicLink.mockRejectedValue(new Error("Verification failed"));

      const req = makeRequest({ token: "valid-token", email: "admin@example.com" });
      const res = await GET(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/admin/login?error=VerificationFailed");
    });

    it("should log errors to Rollbar", async () => {
      mockVerifyAdminMagicLink.mockRejectedValue(new Error("Some error"));

      const req = makeRequest({ token: "valid-token", email: "admin@example.com" });
      await GET(req);

      expect(mockRollbarError).toHaveBeenCalledWith(
        "[ADMIN_MAGIC_VERIFY] Error",
        expect.any(Object),
      );
    });

    it("should log successful sign-ins to Rollbar", async () => {
      const req = makeRequest({ token: "valid-token", email: "admin@example.com" });
      await GET(req);

      expect(mockRollbarInfo).toHaveBeenCalledWith(
        "[ADMIN_MAGIC_VERIFY] Sign-in completed successfully",
        expect.objectContaining({
          userId: mockUser.id,
        }),
      );
    });
  });
});
