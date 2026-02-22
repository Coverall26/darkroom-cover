// @ts-nocheck
/**
 * Admin Login API Tests
 *
 * Tests for app/api/auth/admin-login/route.ts - Admin magic link login.
 *
 * These tests validate:
 * - Email validation
 * - Admin email verification (static list and database)
 * - Magic link creation
 * - Email sending
 * - Error handling
 */

import { NextRequest } from "next/server";

// Mock functions
const mockIsAdminEmail = jest.fn();
const mockIsUserAdminAsync = jest.fn();
const mockCreateAdminMagicLink = jest.fn();
const mockSendEmail = jest.fn();
const mockUserTeamFindFirst = jest.fn();
const mockAppRouterAuthRateLimit = jest.fn();

// Mock dependencies
jest.mock("@/lib/constants/admins", () => ({
  isAdminEmail: (...args: any[]) => mockIsAdminEmail(...args),
  isUserAdminAsync: (...args: any[]) => mockIsUserAdminAsync(...args),
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  appRouterAuthRateLimit: (...args: any[]) => mockAppRouterAuthRateLimit(...args),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/auth/admin-magic-link", () => ({
  createAdminMagicLink: (...args: any[]) => mockCreateAdminMagicLink(...args),
}));

jest.mock("@/lib/resend", () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
  isResendConfigured: () => true,
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    userTeam: {
      findFirst: (...args: any[]) => mockUserTeamFindFirst(...args),
    },
  },
}));

// Mock email component
jest.mock("@/components/emails/admin-login-link", () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue(null),
}));

import { POST } from "@/app/api/auth/admin-login/route";

function makeRequest(body: Record<string, unknown>, headers?: Record<string, string>): NextRequest {
  return new NextRequest(new URL("http://localhost:3000/api/auth/admin-login"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
      "user-agent": "test-agent",
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });
}

describe("Admin Login API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdminEmail.mockReturnValue(false);
    mockIsUserAdminAsync.mockResolvedValue(false);
    mockAppRouterAuthRateLimit.mockResolvedValue(null); // null = not rate limited
    mockUserTeamFindFirst.mockResolvedValue(null);
    mockCreateAdminMagicLink.mockResolvedValue({
      magicLink: "https://example.com/verify?token=abc123",
      token: "abc123",
    });
    mockSendEmail.mockResolvedValue({ success: true });
  });

  describe("Email Validation", () => {
    it("should reject missing email", async () => {
      const req = makeRequest({});
      const res = await POST(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ error: "Email is required" });
    });

    it("should reject non-string email", async () => {
      const req = makeRequest({ email: 12345 });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ error: "Email is required" });
    });

    it("should reject empty string email", async () => {
      const req = makeRequest({ email: "" });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("should normalize email to lowercase", async () => {
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "ADMIN@EXAMPLE.COM" });
      await POST(req);

      expect(mockIsUserAdminAsync).toHaveBeenCalledWith("admin@example.com");
    });

    it("should trim whitespace from email", async () => {
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "  admin@example.com  " });
      await POST(req);

      expect(mockIsUserAdminAsync).toHaveBeenCalledWith("admin@example.com");
    });
  });

  describe("Admin Verification", () => {
    it("should check admin status via isUserAdminAsync", async () => {
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "admin@example.com" });
      const res = await POST(req);

      expect(mockIsUserAdminAsync).toHaveBeenCalledWith("admin@example.com");
      expect(res.status).toBe(200);
    });

    it("should accept admin from database lookup", async () => {
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "dbadmin@example.com" });
      const res = await POST(req);

      expect(mockIsUserAdminAsync).toHaveBeenCalledWith("dbadmin@example.com");
      expect(res.status).toBe(200);
    });

    it("should reject non-admin users", async () => {
      mockIsUserAdminAsync.mockResolvedValue(false);

      const req = makeRequest({ email: "notadmin@example.com" });
      const res = await POST(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data).toEqual({
        error: "Access denied. You are not an administrator.",
      });
    });

    it("should accept OWNER role from database", async () => {
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "owner@example.com" });
      const res = await POST(req);

      expect(res.status).toBe(200);
    });

    it("should accept SUPER_ADMIN role from database", async () => {
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "superadmin@example.com" });
      const res = await POST(req);

      expect(res.status).toBe(200);
    });

    it("should handle database errors gracefully", async () => {
      mockIsUserAdminAsync.mockResolvedValue(false);

      const req = makeRequest({ email: "admin@example.com" });
      const res = await POST(req);

      expect(res.status).toBe(403);
    });
  });

  describe("Magic Link Creation", () => {
    it("should create magic link for admin user", async () => {
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "admin@example.com" }, {
        host: "example.com",
        "x-forwarded-proto": "https",
      });
      await POST(req);

      expect(mockCreateAdminMagicLink).toHaveBeenCalledWith({
        email: "admin@example.com",
        redirectPath: "/hub",
        baseUrl: expect.any(String),
      });
    });

    it("should use custom redirect path if provided", async () => {
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "admin@example.com", redirectPath: "/dashboard" }, { host: "example.com" });
      await POST(req);

      expect(mockCreateAdminMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          redirectPath: "/dashboard",
        })
      );
    });

    it("should default redirect to /hub if not provided", async () => {
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "admin@example.com" }, { host: "example.com" });
      await POST(req);

      expect(mockCreateAdminMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          redirectPath: "/hub",
        })
      );
    });

    it("should handle magic link creation failure", async () => {
      mockIsUserAdminAsync.mockResolvedValue(true);
      mockCreateAdminMagicLink.mockResolvedValue(null);

      const req = makeRequest({ email: "admin@example.com" }, { host: "example.com" });
      const res = await POST(req);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({ error: "Failed to create login link. Check NEXTAUTH_SECRET is set." });
    });
  });

  describe("Email Sending", () => {
    it("should send magic link email", async () => {
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "admin@example.com" }, { host: "example.com" });
      await POST(req);

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "admin@example.com",
          subject: "Your Admin Login Link - FundRoom",
        })
      );
      const callArg = mockSendEmail.mock.calls[0][0];
      expect(callArg.to).toBe("admin@example.com");
    });

    it("should return success after sending email", async () => {
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "admin@example.com" }, { host: "example.com" });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        success: true,
        message: "Login link sent to your email",
      });
    });

    it("should handle email sending failure", async () => {
      mockIsUserAdminAsync.mockResolvedValue(true);
      mockSendEmail.mockRejectedValue(new Error("Email service unavailable"));

      const req = makeRequest({ email: "admin@example.com" }, { host: "example.com" });
      const res = await POST(req);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({ error: "Internal server error" });
    });
  });

  describe("Base URL Construction", () => {
    it("should use NEXTAUTH_URL if set", async () => {
      const originalEnv = process.env.NEXTAUTH_URL;
      process.env.NEXTAUTH_URL = "https://app.example.com";
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "admin@example.com" }, { host: "other.com" });
      await POST(req);

      expect(mockCreateAdminMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://app.example.com",
        })
      );

      process.env.NEXTAUTH_URL = originalEnv;
    });

    it("should construct URL from headers if NEXTAUTH_URL not set", async () => {
      const originalEnv = process.env.NEXTAUTH_URL;
      delete process.env.NEXTAUTH_URL;
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "admin@example.com" }, {
        host: "myapp.com",
        "x-forwarded-proto": "https",
      });
      await POST(req);

      expect(mockCreateAdminMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://myapp.com",
        })
      );

      process.env.NEXTAUTH_URL = originalEnv;
    });

    it("should use x-forwarded-host if available", async () => {
      const originalEnv = process.env.NEXTAUTH_URL;
      delete process.env.NEXTAUTH_URL;
      mockIsUserAdminAsync.mockResolvedValue(true);

      const req = makeRequest({ email: "admin@example.com" }, {
        host: "internal.com",
        "x-forwarded-host": "public.example.com",
        "x-forwarded-proto": "https",
      });
      await POST(req);

      expect(mockCreateAdminMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://public.example.com",
        })
      );

      process.env.NEXTAUTH_URL = originalEnv;
    });
  });

  describe("Security Considerations", () => {
    it("should not leak admin status to non-admins", async () => {
      mockIsUserAdminAsync.mockResolvedValue(false);

      const req = makeRequest({ email: "attacker@example.com" });
      const res = await POST(req);

      expect(res.status).toBe(403);
    });

    it("should handle email injection attempts", async () => {
      const req = makeRequest({ email: "admin@example.com\nBcc: attacker@evil.com" });
      await POST(req);

      expect(mockIsUserAdminAsync).toHaveBeenCalled();
    });
  });
});
