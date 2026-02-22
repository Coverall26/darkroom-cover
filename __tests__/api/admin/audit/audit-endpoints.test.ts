/**
 * Tests for Audit Log API Endpoints
 *
 * Covers:
 * - GET /api/admin/audit/export — General audit log export (CSV/JSON)
 * - GET /api/teams/[teamId]/audit/verify — Chain integrity verification
 * - POST /api/teams/[teamId]/audit/export — Compliance export with checksums
 * - GET /api/teams/[teamId]/signature-audit/export — Signature audit log export
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";

// ── Mocks ──

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/audit/immutable-audit-log", () => ({
  verifyAuditChain: jest.fn(),
  getAuditLogIntegrity: jest.fn(),
  exportAuditLogForCompliance: jest.fn(),
  createImmutableAuditEntry: jest.fn(),
}));
jest.mock("@/lib/security/rate-limiter", () => ({
  strictRateLimiter: jest.fn().mockResolvedValue(true),
  authRateLimiter: jest.fn().mockResolvedValue(true),
  apiRateLimiter: jest.fn().mockResolvedValue(true),
  uploadRateLimiter: jest.fn().mockResolvedValue(true),
  appRouterRateLimit: jest.fn().mockResolvedValue(null),
  appRouterStrictRateLimit: jest.fn().mockResolvedValue(null),
  appRouterUploadRateLimit: jest.fn().mockResolvedValue(null),
  appRouterAuthRateLimit: jest.fn().mockResolvedValue(null),
  appRouterMfaRateLimit: jest.fn().mockResolvedValue(null),
  appRouterSignatureRateLimit: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/security/bot-protection", () => ({
  verifyNotBotPages: jest.fn().mockResolvedValue(true),
  verifyNotBot: jest.fn().mockResolvedValue({ blocked: false }),
}));



// ── Test data ──

const mockAdminSession = {
  user: { id: "admin-1", email: "admin@example.com", name: "Admin" },
  expires: "2099-01-01",
};

const mockNonAdminSession = {
  user: { id: "user-1", email: "user@example.com", name: "User" },
  expires: "2099-01-01",
};

const mockTeamId = "team-123";

const mockAuditLogs = [
  {
    id: "log-1",
    createdAt: new Date("2026-02-01T10:00:00Z"),
    eventType: "INVESTOR_CREATED",
    resourceType: "Investor",
    resourceId: "inv-1",
    ipAddress: "192.168.1.1",
    userAgent: "Mozilla/5.0",
    metadata: { action: "manual_entry" },
    user: { id: "admin-1", name: "Admin", email: "admin@example.com" },
  },
  {
    id: "log-2",
    createdAt: new Date("2026-02-02T14:00:00Z"),
    eventType: "DOCUMENT_SIGNED",
    resourceType: "SignatureDocument",
    resourceId: "doc-1",
    ipAddress: "10.0.0.1",
    userAgent: "Chrome/120",
    metadata: null,
    user: { id: "user-2", name: "Investor", email: "investor@example.com" },
  },
];

// ── Helper ──

function createReq(
  method: string,
  query: Record<string, string> = {},
  body?: Record<string, unknown>,
) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: method as any,
    query,
    body,
  });
  return { req, res };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/audit/export
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/admin/audit/export", () => {
  let handler: any;

  beforeAll(async () => {
    const mod = await import("@/app/api/admin/audit/export/route");
    const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
    handler = wrapAppRouteHandler(mod);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // enforceRBAC (used by requireAdmin) imports getServerSession from "next-auth/next"
    const { getServerSession: getServerSessionNext } = jest.requireMock("next-auth/next");
    (getServerSessionNext as jest.Mock).mockResolvedValue(mockAdminSession);
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      teamId: mockTeamId,
      role: "ADMIN",
      status: "ACTIVE",
    });
    (prisma.team.findUnique as jest.Mock).mockResolvedValue({
      id: mockTeamId,
      name: "Test Team",
    });
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockAuditLogs);
  });

  it("rejects non-GET methods", async () => {
    const { req, res } = createReq("POST");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("requires authentication", async () => {
    const { getServerSession: getServerSessionNext } = jest.requireMock("next-auth/next");
    (getServerSessionNext as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq("GET", { format: "json", teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("requires admin role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq("GET", { format: "json", teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  it("returns JSON audit logs", async () => {
    const { req, res } = createReq("GET", { format: "json", teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.logs).toHaveLength(2);
    expect(data.logs[0].eventType).toBe("INVESTOR_CREATED");
    expect(data.logs[0].user.email).toBe("admin@example.com");
    expect(data.team.id).toBe(mockTeamId);
  });

  it("returns CSV when format=csv", async () => {
    const { req, res } = createReq("GET", { format: "csv", teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const headers = res._getHeaders();
    expect(headers["content-type"]).toContain("text/csv");
    expect(headers["content-disposition"]).toContain("attachment");

    const csv = res._getData();
    expect(csv).toContain("ID,Timestamp,Event Type");
    expect(csv).toContain("INVESTOR_CREATED");
  });

  it("filters by eventType", async () => {
    const { req, res } = createReq("GET", {
      format: "json",
      eventType: "INVESTOR_CREATED",
      teamId: mockTeamId,
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    // Verify Prisma was called with eventType in where clause
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventType: "INVESTOR_CREATED",
        }),
      }),
    );
  });

  it("filters by date range", async () => {
    const { req, res } = createReq("GET", {
      format: "json",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      teamId: mockTeamId,
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
  });

  it("sets download header for JSON download", async () => {
    const { req, res } = createReq("GET", {
      format: "json",
      download: "true",
      teamId: mockTeamId,
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const headers = res._getHeaders();
    expect(headers["content-disposition"]).toContain("attachment");
    expect(headers["content-disposition"]).toContain(".json");
  });

  it("respects limit parameter", async () => {
    const { req, res } = createReq("GET", { format: "json", limit: "50", teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
      }),
    );
  });

  it("caps limit at 10000", async () => {
    const { req, res } = createReq("GET", { format: "json", limit: "99999", teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10000,
      }),
    );
  });

  it("returns 500 on database error", async () => {
    (prisma.auditLog.findMany as jest.Mock).mockRejectedValue(
      new Error("DB error"),
    );
    const { req, res } = createReq("GET", { format: "json", teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe("Internal server error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/teams/[teamId]/audit/verify
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/teams/[teamId]/audit/verify", () => {
  let handler: any;
  const {
    verifyAuditChain,
    getAuditLogIntegrity,
  } = jest.requireMock("@/lib/audit/immutable-audit-log");

  beforeAll(async () => {
    handler = (
      await import("@/pages/api/teams/[teamId]/audit/verify")
    ).default;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Use the next-auth/next mock
    const { getServerSession: getServerSessionNext } = jest.requireMock("next-auth/next");
    (getServerSessionNext as jest.Mock).mockResolvedValue(mockAdminSession);

    (prisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
      role: "ADMIN",
    });

    verifyAuditChain.mockResolvedValue({
      isValid: true,
      totalEntries: 42,
      verifiedEntries: 42,
      errors: [],
    });

    getAuditLogIntegrity.mockResolvedValue({
      lastVerifiedAt: new Date(),
      chainLength: 42,
      isValid: true,
      genesisHash: "0".repeat(64),
      latestHash: "abc123def456",
    });
  });

  it("rejects non-GET methods", async () => {
    const { req, res } = createReq("POST", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("requires authentication", async () => {
    const { getServerSession: getServerSessionNext } = jest.requireMock("next-auth/next");
    (getServerSessionNext as jest.Mock).mockResolvedValue(null);

    const { req, res } = createReq("GET", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("requires teamId parameter", async () => {
    const { req, res } = createReq("GET", {});
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("requires team membership", async () => {
    (prisma.userTeam.findUnique as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq("GET", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  it("requires admin role", async () => {
    (prisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
      role: "MEMBER",
    });
    const { req, res } = createReq("GET", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  it("returns verification result for valid chain", async () => {
    const { req, res } = createReq("GET", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const data = JSON.parse(res._getData());
    expect(data.verification.isValid).toBe(true);
    expect(data.verification.totalEntries).toBe(42);
    expect(data.verification.verifiedEntries).toBe(42);
    expect(data.integrity.chainLength).toBe(42);
    expect(data.verifiedAt).toBeDefined();
  });

  it("returns errors for invalid chain", async () => {
    verifyAuditChain.mockResolvedValue({
      isValid: false,
      totalEntries: 42,
      verifiedEntries: 40,
      firstInvalidEntry: "log-41",
      errors: ["Entry log-41: Hash mismatch. Data may have been tampered."],
    });
    getAuditLogIntegrity.mockResolvedValue({
      lastVerifiedAt: new Date(),
      chainLength: 42,
      isValid: false,
      genesisHash: "0".repeat(64),
      latestHash: "corrupted",
    });

    const { req, res } = createReq("GET", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const data = JSON.parse(res._getData());
    expect(data.verification.isValid).toBe(false);
    expect(data.verification.errors).toHaveLength(1);
    expect(data.verification.firstInvalidEntry).toBe("log-41");
  });

  it("returns 500 on verification error", async () => {
    verifyAuditChain.mockRejectedValue(new Error("DB error"));
    const { req, res } = createReq("GET", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/teams/[teamId]/audit/export
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/teams/[teamId]/audit/export", () => {
  let handler: any;
  const {
    exportAuditLogForCompliance,
    createImmutableAuditEntry,
  } = jest.requireMock("@/lib/audit/immutable-audit-log");

  beforeAll(async () => {
    handler = (
      await import("@/pages/api/teams/[teamId]/audit/export")
    ).default;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    const { getServerSession: getServerSessionNext } = jest.requireMock("next-auth/next");
    (getServerSessionNext as jest.Mock).mockResolvedValue(mockAdminSession);

    (prisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
      role: "OWNER",
    });

    exportAuditLogForCompliance.mockResolvedValue({
      entries: mockAuditLogs,
      chainVerification: { isValid: true, totalEntries: 2, verifiedEntries: 2, errors: [] },
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        exportedBy: "system",
        teamId: mockTeamId,
        dateRange: { from: "2026-01-01", to: "2026-02-28" },
        totalRecords: 2,
        checksum: "sha256-abc123",
      },
    });

    createImmutableAuditEntry.mockResolvedValue({});
  });

  it("rejects non-POST methods", async () => {
    const { req, res } = createReq("GET", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("requires authentication", async () => {
    const { getServerSession: getServerSessionNext } = jest.requireMock("next-auth/next");
    (getServerSessionNext as jest.Mock).mockResolvedValue(null);

    const { req, res } = createReq("POST", { teamId: mockTeamId }, {
      fromDate: "2026-01-01",
      toDate: "2026-02-28",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("requires admin role", async () => {
    (prisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
      role: "MEMBER",
    });
    const { req, res } = createReq("POST", { teamId: mockTeamId }, {
      fromDate: "2026-01-01",
      toDate: "2026-02-28",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  it("requires date range", async () => {
    const { req, res } = createReq("POST", { teamId: mockTeamId }, {});
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("exports compliance data with checksum", async () => {
    const { req, res } = createReq("POST", { teamId: mockTeamId }, {
      fromDate: "2026-01-01",
      toDate: "2026-02-28",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const data = JSON.parse(res._getData());
    expect(data.entries).toHaveLength(2);
    expect(data.exportMetadata.checksum).toBeDefined();
    expect(data.exportMetadata.totalRecords).toBe(2);
    expect(data.chainVerification.isValid).toBe(true);
  });

  it("creates audit entry for the export action itself", async () => {
    const { req, res } = createReq("POST", { teamId: mockTeamId }, {
      fromDate: "2026-01-01",
      toDate: "2026-02-28",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    expect(createImmutableAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "AUDIT_LOG_EXPORT",
        userId: "admin-1",
        teamId: mockTeamId,
        resourceType: "AuditLog",
        metadata: expect.objectContaining({
          dateRange: { from: "2026-01-01", to: "2026-02-28" },
          recordCount: 2,
        }),
      }),
    );
  });

  it("returns 500 on export error", async () => {
    exportAuditLogForCompliance.mockRejectedValue(new Error("DB error"));
    const { req, res } = createReq("POST", { teamId: mockTeamId }, {
      fromDate: "2026-01-01",
      toDate: "2026-02-28",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/teams/[teamId]/signature-audit/export
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/teams/[teamId]/signature-audit/export", () => {
  let handler: any;

  const mockSignatureAuditLogs = [
    {
      id: "sal-1",
      createdAt: new Date("2026-02-10T10:00:00Z"),
      event: "document.created",
      documentId: "doc-1",
      recipientEmail: null,
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    },
    {
      id: "sal-2",
      createdAt: new Date("2026-02-11T14:00:00Z"),
      event: "recipient.signed",
      documentId: "doc-1",
      recipientEmail: "investor@example.com",
      ipAddress: "10.0.0.1",
      userAgent: "Chrome/120.0.0",
    },
  ];

  beforeAll(async () => {
    handler = (
      await import(
        "@/pages/api/teams/[teamId]/signature-audit/export"
      )
    ).default;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    (getServerSession as jest.Mock).mockResolvedValue(mockAdminSession);

    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "admin-1",
      teams: [
        {
          teamId: mockTeamId,
          role: "ADMIN",
          team: { id: mockTeamId },
        },
      ],
    });

    (prisma.signatureDocument.findMany as jest.Mock).mockResolvedValue([
      { id: "doc-1", title: "Subscription Agreement" },
    ]);

    // @ts-ignore - signatureAuditLog mock
    (prisma.signatureAuditLog as any) = {
      findMany: jest.fn().mockResolvedValue(mockSignatureAuditLogs),
    };
  });

  it("rejects non-GET methods", async () => {
    const { req, res } = createReq("POST", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("requires authentication", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq("GET", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("requires team membership", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "admin-1",
      teams: [],
    });
    const { req, res } = createReq("GET", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  it("requires admin role", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "admin-1",
      teams: [
        {
          teamId: mockTeamId,
          role: "MEMBER",
          team: { id: mockTeamId },
        },
      ],
    });
    const { req, res } = createReq("GET", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  it("returns JSON audit logs with document titles", async () => {
    const { req, res } = createReq("GET", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const data = JSON.parse(res._getData());
    expect(data.auditLogs).toHaveLength(2);
    expect(data.auditLogs[0].documentTitle).toBe("Subscription Agreement");
    expect(data.auditLogs[1].event).toBe("recipient.signed");
    expect(data.totalCount).toBe(2);
  });

  it("returns CSV when format=csv", async () => {
    const { req, res } = createReq("GET", {
      teamId: mockTeamId,
      format: "csv",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const headers = res._getHeaders();
    expect(headers["content-type"]).toContain("text/csv");
    expect(headers["content-disposition"]).toContain("signature-audit");

    const csv = res._getData();
    expect(csv).toContain("Timestamp,Document,Event");
    expect(csv).toContain("Subscription Agreement");
    expect(csv).toContain("recipient.signed");
  });

  it("returns HTML report when format=pdf", async () => {
    const { req, res } = createReq("GET", {
      teamId: mockTeamId,
      format: "pdf",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const headers = res._getHeaders();
    expect(headers["content-type"]).toContain("text/html");

    const html = res._getData();
    expect(html).toContain("Signature Audit Report");
    expect(html).toContain("SEC 506(c) Compliance Notice");
    expect(html).toContain("Subscription Agreement");
  });

  it("filters by document ID", async () => {
    const { req, res } = createReq("GET", {
      teamId: mockTeamId,
      documentId: "doc-1",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  it("rejects access to documents from other teams", async () => {
    const { req, res } = createReq("GET", {
      teamId: mockTeamId,
      documentId: "doc-other-team",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  it("returns 500 on database error", async () => {
    (prisma.signatureDocument.findMany as jest.Mock).mockRejectedValue(
      new Error("DB error"),
    );
    const { req, res } = createReq("GET", { teamId: mockTeamId });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
  });
});
