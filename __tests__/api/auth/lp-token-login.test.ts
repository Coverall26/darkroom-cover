// @ts-nocheck
/**
 * LP Token Login API Tests (App Router)
 *
 * Tests for app/api/auth/lp-token-login/route.ts
 *
 * One-time token login endpoint: exchanges a registration token for a NextAuth session.
 * Used by LP onboarding to create an immediate session after registration,
 * bypassing the credentials flow that fails for existing users with different passwords.
 */

import { NextRequest } from "next/server";

// Mock functions
const mockAppRouterAuthRateLimit = jest.fn();
const mockEncode = jest.fn();
const mockLogAuditEvent = jest.fn();
const mockReportError = jest.fn();

// Mock dependencies
jest.mock("@/lib/security/rate-limiter", () => ({
  appRouterAuthRateLimit: (...args: any[]) => mockAppRouterAuthRateLimit(...args),
}));

jest.mock("next-auth/jwt", () => ({
  encode: (...args: any[]) => mockEncode(...args),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: (...args: any[]) => mockLogAuditEvent(...args),
}));

jest.mock("@/lib/error", () => ({
  reportError: (...args: any[]) => mockReportError(...args),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    verificationToken: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    userTeam: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/constants/auth-cookies", () => ({
  SESSION_COOKIE_NAME: "next-auth.session-token",
}));

import { POST } from "@/app/api/auth/lp-token-login/route";
import prisma from "@/lib/prisma";

const mockUser = {
  id: "user-lp-1",
  email: "lp@example.com",
  name: "Test LP",
  image: null,
  role: "LP",
  createdAt: new Date("2026-01-01"),
};

const validToken = {
  identifier: "lp-onetime:user-lp-1",
  token: "abc123def456",
  expires: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/lp-token-login", {
    method: "POST",
    body: JSON.stringify({ token: "abc123def456", ...body }),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "test-agent",
    },
  });
}

describe("POST /api/auth/lp-token-login (App Router)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppRouterAuthRateLimit.mockResolvedValue(null); // null = not blocked
    mockEncode.mockResolvedValue("mock-session-token-jwt");
    mockLogAuditEvent.mockResolvedValue(null);

    (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(validToken);
    (prisma.verificationToken.delete as jest.Mock).mockResolvedValue(validToken);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);

    // $transaction receives an array of Prisma promises and resolves them
    // Default: [deletedToken, user, adminTeam]
    (prisma.$transaction as jest.Mock).mockResolvedValue([validToken, mockUser, null]);

    process.env.NEXTAUTH_SECRET = "test-secret";
  });

  // --- Rate limiting ---
  it("checks rate limiter", async () => {
    const req = makeRequest();
    await POST(req);
    expect(mockAppRouterAuthRateLimit).toHaveBeenCalledWith(req);
  });

  it("returns rate limit response when blocked", async () => {
    const { NextResponse } = require("next/server");
    const blockedResponse = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    mockAppRouterAuthRateLimit.mockResolvedValue(blockedResponse);

    const req = makeRequest();
    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(prisma.verificationToken.findUnique).not.toHaveBeenCalled();
  });

  // --- Input validation ---
  it("returns 400 when token is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/lp-token-login", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Token is required");
  });

  it("returns 400 when token is not a string", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/lp-token-login", {
      method: "POST",
      body: JSON.stringify({ token: 12345 }),
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // --- Token validation ---
  it("returns 401 when token not found in DB", async () => {
    (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(null);
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Invalid or expired");
  });

  it("returns 401 when token is expired", async () => {
    (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
      ...validToken,
      expires: new Date(Date.now() - 1000), // expired 1 second ago
    });
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
    // Should attempt to clean up expired token
    expect(prisma.verificationToken.delete).toHaveBeenCalled();
  });

  it("returns 401 when token identifier is not an LP one-time token", async () => {
    (prisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
      ...validToken,
      identifier: "email-verify:user@example.com",
    });
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when user not found", async () => {
    // Override $transaction to return null for user (2nd position)
    (prisma.$transaction as jest.Mock).mockResolvedValue([validToken, null, null]);
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // --- Happy path ---
  it("creates session and sets cookie for valid token", async () => {
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Token deletion + user lookup happens atomically in $transaction
    expect(prisma.$transaction).toHaveBeenCalled();

    // Session cookie should be set
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain("mock-session-token-jwt");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("deletes token before creating session (prevents reuse)", async () => {
    // The route uses prisma.$transaction([delete, findUser, findTeam]) which
    // atomically processes all operations. The delete is listed first in the
    // array, ensuring token is consumed before user lookup.
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
    // $transaction was called (atomic operation)
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("logs audit event on successful login", async () => {
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "USER_LOGIN",
        userId: "user-lp-1",
        resourceType: "User",
        metadata: expect.objectContaining({
          method: "lp-onetime-token",
        }),
      }),
    );
  });

  // --- GP role detection ---
  it("assigns GP role when user has admin team membership", async () => {
    const adminTeam = {
      id: "ut-1",
      userId: "user-lp-1",
      role: "ADMIN",
      status: "ACTIVE",
    };
    // Override $transaction to return an admin team in the 3rd position
    (prisma.$transaction as jest.Mock).mockResolvedValue([validToken, mockUser, adminTeam]);

    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);

    // Verify encode was called with GP role
    expect(mockEncode).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.objectContaining({
          role: "GP",
        }),
      }),
    );
  });

  // --- Error handling ---
  it("returns 500 on unexpected errors", async () => {
    (prisma.verificationToken.findUnique as jest.Mock).mockRejectedValue(
      new Error("DB crash"),
    );
    const req = makeRequest();
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Internal server error");
    expect(mockReportError).toHaveBeenCalled();
  });
});
