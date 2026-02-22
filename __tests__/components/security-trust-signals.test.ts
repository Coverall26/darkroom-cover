"use strict";

/**
 * Tests for P1-A: Security Trust Signals in UI
 * - EncryptionBadge component
 * - DocumentIntegrityBadge component
 * - Session Info API
 * - Compliance Status API
 */

// ── Mock setup ──────────────────────────────────────────────────────────────
const mockPrisma = {
  auditLog: { findFirst: jest.fn() },
  userTeam: { findFirst: jest.fn() },
  fund: { findFirst: jest.fn() },
  investor: { count: jest.fn() },
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: mockPrisma,
}));

const mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

jest.mock("next-auth/next", () => ({
  getServerSession: mockGetServerSession,
}));

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  apiRateLimiter: jest.fn().mockResolvedValue(undefined),
  appRouterRateLimit: jest.fn().mockResolvedValue(null),
}));

const mockRequireAuthAppRouter = jest.fn();
const mockRequireAdminAppRouter = jest.fn();
jest.mock("@/lib/auth/rbac", () => ({
  requireAuthAppRouter: (...args: any[]) => mockRequireAuthAppRouter(...args),
  requireAdminAppRouter: (...args: any[]) => mockRequireAdminAppRouter(...args),
  enforceRBAC: jest.fn(),
  requireAdmin: jest.fn(),
  enforceRBACAppRouter: jest.fn(),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/types", () => ({}));

// ── Helper: create mock req/res ─────────────────────────────────────────────
function createMockReqRes(method = "GET", query: Record<string, string> = {}) {
  const req = {
    method,
    query,
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "x-forwarded-for": "192.168.1.100",
    },
    socket: { remoteAddress: "127.0.0.1" },
  } as any;

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  } as any;

  return { req, res };
}

// ── Session Info API Tests ──────────────────────────────────────────────────
describe("Session Info API (/api/admin/session-info)", () => {
  let handler: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import("@/app/api/admin/session-info/route");
    const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
    handler = wrapAppRouteHandler(mod);
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("rejects non-GET methods", async () => {
    const { req, res } = createMockReqRes("POST");
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it("returns 401 for unauthenticated requests", async () => {
    const { NextResponse } = require("next/server");
    mockRequireAuthAppRouter.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const { req, res } = createMockReqRes("GET");
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns session info with last login details", async () => {
    mockRequireAuthAppRouter.mockResolvedValue({
      userId: "u1",
      email: "admin@test.com",
      teamId: "",
      role: "MEMBER",
      session: { user: { id: "u1", email: "admin@test.com" } },
    });
    (mockPrisma.auditLog.findFirst as jest.Mock).mockResolvedValue({
      createdAt: new Date("2026-02-18T10:00:00Z"),
      ipAddress: "192.168.1.50",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    });
    const { req, res } = createMockReqRes("GET");
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data).toHaveProperty("lastLogin");
    expect(data.lastLogin).not.toBeNull();
    expect(data.lastLogin.timestamp).toBeDefined();
    // IP should be masked
    expect(data.lastLogin.ipAddress).toMatch(/^\d+\.\d+\.\*\.\*$/);
    // Browser should be parsed
    expect(data.lastLogin.browser).toBe("Chrome");
  });

  it("returns null lastLogin for first session", async () => {
    mockRequireAuthAppRouter.mockResolvedValue({
      userId: "u1",
      email: "admin@test.com",
      teamId: "",
      role: "MEMBER",
      session: { user: { id: "u1", email: "admin@test.com" } },
    });
    (mockPrisma.auditLog.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createMockReqRes("GET");
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.lastLogin).toBeNull();
  });
});

// ── Compliance Status API Tests ─────────────────────────────────────────────
describe("Compliance Status API (/api/admin/compliance-status)", () => {
  let handler: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import("@/app/api/admin/compliance-status/route");
    const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
    handler = wrapAppRouteHandler(mod);
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("rejects non-GET methods", async () => {
    const { req, res } = createMockReqRes("POST");
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const { NextResponse } = require("next/server");
    mockRequireAdminAppRouter.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const { req, res } = createMockReqRes("GET");
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 403 for non-admin users", async () => {
    const { NextResponse } = require("next/server");
    mockRequireAdminAppRouter.mockResolvedValue(
      NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 })
    );
    const { req, res } = createMockReqRes("GET");
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns compliance data for admin users", async () => {
    mockRequireAdminAppRouter.mockResolvedValue({
      userId: "u1",
      email: "admin@test.com",
      teamId: "team1",
      role: "ADMIN",
      session: { user: { id: "u1", email: "admin@test.com" } },
    });
    (mockPrisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      teamId: "team1",
      team: {
        organization: {
          badActorCertified: true,
          badActorCertifiedAt: new Date("2026-02-01"),
        },
      },
    });
    // compliance-status uses prisma.team.findUnique for org data
    (mockPrisma as any).team = { findUnique: jest.fn().mockResolvedValue({
      id: "team1",
      organization: {
        badActorCertified: true,
        badActorCertifiedAt: new Date("2026-02-01"),
      },
    })};
    (mockPrisma.fund.findFirst as jest.Mock).mockResolvedValue({
      id: "fund1",
      regulationDExemption: "506C",
      formDFilingDate: new Date("2026-02-15"),
    });
    (mockPrisma.investor.count as jest.Mock)
      .mockResolvedValueOnce(10) // total investors
      .mockResolvedValueOnce(8); // accredited investors
    const { req, res } = createMockReqRes("GET");
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.badActorCertified).toBe(true);
    expect(data.regulationDExemption).toBe("506C");
    expect(data.totalInvestors).toBe(10);
    expect(data.accreditedInvestors).toBe(8);
    expect(data.fundId).toBe("fund1");
  });

  it("handles no fund found gracefully", async () => {
    mockRequireAdminAppRouter.mockResolvedValue({
      userId: "u1",
      email: "admin@test.com",
      teamId: "team1",
      role: "ADMIN",
      session: { user: { id: "u1", email: "admin@test.com" } },
    });
    (mockPrisma as any).team = { findUnique: jest.fn().mockResolvedValue({
      id: "team1",
      organization: {
        badActorCertified: false,
        badActorCertifiedAt: null,
      },
    })};
    (mockPrisma.fund.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.investor.count as jest.Mock)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    const { req, res } = createMockReqRes("GET");
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.badActorCertified).toBe(false);
    expect(data.formDFilingDate).toBeNull();
    expect(data.fundId).toBeNull();
    expect(data.totalInvestors).toBe(0);
  });
});

// ── EncryptionBadge Component Unit Tests ────────────────────────────────────
describe("EncryptionBadge component", () => {
  it("exports as a named export", () => {
    const mod = require("@/components/ui/encryption-badge");
    expect(mod.EncryptionBadge).toBeDefined();
    expect(typeof mod.EncryptionBadge).toBe("function");
  });

  it("accepts variant, label, and className props without error", () => {
    const mod = require("@/components/ui/encryption-badge");
    const { EncryptionBadge } = mod;
    expect(() => {
      EncryptionBadge({ variant: "compact" });
      EncryptionBadge({ variant: "full", label: "Custom Label" });
      EncryptionBadge({ className: "extra-class" });
      EncryptionBadge({}); // all defaults
    }).not.toThrow();
  });
});

// ── DocumentIntegrityBadge Component Unit Tests ─────────────────────────────
describe("DocumentIntegrityBadge component", () => {
  it("exports as a named export", () => {
    const mod = require("@/components/documents/integrity-badge");
    expect(mod.DocumentIntegrityBadge).toBeDefined();
    expect(typeof mod.DocumentIntegrityBadge).toBe("function");
  });

  it("accepts all prop combinations without error", () => {
    const mod = require("@/components/documents/integrity-badge");
    const { DocumentIntegrityBadge } = mod;
    expect(() => {
      DocumentIntegrityBadge({ signedAt: null });
      DocumentIntegrityBadge({ signedAt: "2026-02-18T10:00:00Z" });
      DocumentIntegrityBadge({
        signedAt: "2026-02-18T10:00:00Z",
        checksum: "abc123def456",
      });
      DocumentIntegrityBadge({
        signedAt: "2026-02-18T10:00:00Z",
        verified: false,
      });
      DocumentIntegrityBadge({
        signedAt: "2026-02-18T10:00:00Z",
        checksum: "abc123def456",
        verified: true,
        className: "extra",
      });
    }).not.toThrow();
  });
});
