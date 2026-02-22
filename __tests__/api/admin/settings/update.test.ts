/**
 * Tests for PATCH /api/admin/settings/update
 *
 * Per-section settings save: company, branding, compliance, dataroomDefaults,
 * linkDefaults, lpOnboarding, notifications, audit.
 * Covers: section routing, field filtering, applyToExisting cascade, audit logging
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

const mockSession = {
  user: { id: "gp-admin-1", email: "admin@test.com" },
  expires: "2099-01-01",
};

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn().mockResolvedValue({
    user: { id: "gp-admin-1", email: "admin@test.com" },
    expires: "2099-01-01",
  }),
}));

jest.mock("next-auth", () => ({
  getServerSession: jest.fn().mockResolvedValue({
    user: { id: "gp-admin-1", email: "admin@test.com" },
    expires: "2099-01-01",
  }),
}));

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

const mockPrisma = {
  team: { findUnique: jest.fn(), update: jest.fn() },
  organization: { update: jest.fn() },
  organizationDefaults: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  dataroom: { updateMany: jest.fn() },
  link: { updateMany: jest.fn() },
  userTeam: { findFirst: jest.fn() },
  $transaction: jest.fn((arr: unknown[]) => Promise.all(arr as Promise<unknown>[])),
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: mockPrisma,
}));

const { logAuditEvent } = require("@/lib/audit/audit-logger");
const { getServerSession } = require("next-auth/next");
const { getServerSession: getServerSessionNA } = require("next-auth");

const TEAM_ID = "team-update-test";
const ORG_ID = "org-update-test";

function mkReq(body: Record<string, unknown>) {
  const { req, res } = createMocks({ method: "PATCH" as "PATCH", body });
  return { req: req as unknown as NextApiRequest, res: res as unknown as NextApiResponse };
}

describe("Settings Update API (/api/admin/settings/update)", () => {
  let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

  beforeAll(async () => {
    const { PATCH } = await import("@/app/api/admin/settings/update/route");
    const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
    handler = wrapAppRouteHandler({ PATCH });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
    (getServerSessionNA as jest.Mock).mockResolvedValue(mockSession);
    mockPrisma.userTeam.findFirst.mockResolvedValue({ userId: "gp-admin-1", role: "ADMIN", status: "ACTIVE" });
    mockPrisma.team.findUnique.mockResolvedValue({ organizationId: ORG_ID, name: "Test Team" });
  });

  // --- Validation ---

  it("rejects non-PATCH methods", async () => {
    const { req, res } = createMocks({ method: "GET" as "GET" });
    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 400 when required params missing", async () => {
    const { req, res } = mkReq({ teamId: TEAM_ID, section: "company" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 401 when session missing", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    (getServerSessionNA as jest.Mock).mockResolvedValue(null);
    const { req, res } = mkReq({ teamId: TEAM_ID, section: "company", data: { name: "X" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    mockPrisma.userTeam.findFirst.mockResolvedValue(null);
    const { req, res } = mkReq({ teamId: TEAM_ID, section: "company", data: { name: "X" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  it("returns 404 when org not found", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({ organizationId: null });
    const { req, res } = mkReq({ teamId: TEAM_ID, section: "company", data: { name: "X" } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 400 for unknown section", async () => {
    const { req, res } = mkReq({ teamId: TEAM_ID, section: "unknown", data: { foo: true } });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain("Unknown section");
  });

  // --- Section: company ---

  it("updates company fields (filtered)", async () => {
    mockPrisma.organization.update.mockResolvedValue({});
    const { req, res } = mkReq({
      teamId: TEAM_ID,
      section: "company",
      data: { name: "Acme LLC", website: "acme.com", HACK_FIELD: "bad" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { name: "Acme LLC", website: "acme.com" },
    });
    // HACK_FIELD should be filtered out
    const callData = mockPrisma.organization.update.mock.calls[0][0].data;
    expect(callData.HACK_FIELD).toBeUndefined();
  });

  // --- Section: branding ---

  it("updates branding + email sender", async () => {
    mockPrisma.organization.update.mockResolvedValue({});
    mockPrisma.team.update.mockResolvedValue({});
    const { req, res } = mkReq({
      teamId: TEAM_ID,
      section: "branding",
      data: { brandColor: "#0066FF", emailSenderName: "Acme Fund" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { brandColor: "#0066FF" },
    });
    expect(mockPrisma.team.update).toHaveBeenCalledWith({
      where: { id: TEAM_ID },
      data: { emailFromName: "Acme Fund" },
    });
  });

  // --- Section: compliance ---

  it("creates org defaults when none exist (compliance)", async () => {
    mockPrisma.organizationDefaults.findUnique.mockResolvedValue(null);
    mockPrisma.organizationDefaults.create.mockResolvedValue({});
    const { req, res } = mkReq({
      teamId: TEAM_ID,
      section: "compliance",
      data: { ndaGateEnabled: true, requireMfa: true },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockPrisma.organizationDefaults.create).toHaveBeenCalledWith({
      data: { organizationId: ORG_ID, fundroomNdaGateEnabled: true, requireMfa: true },
    });
  });

  it("updates existing org defaults (compliance)", async () => {
    mockPrisma.organizationDefaults.findUnique.mockResolvedValue({ id: "od-1" });
    mockPrisma.organizationDefaults.update.mockResolvedValue({});
    const { req, res } = mkReq({
      teamId: TEAM_ID,
      section: "compliance",
      data: { kycRequired: true },
    });
    await handler(req, res);
    expect(mockPrisma.organizationDefaults.update).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID },
      data: { fundroomKycRequired: true },
    });
  });

  // --- Section: notifications (via lpOnboarding) ---

  it("updates notification toggles", async () => {
    mockPrisma.organizationDefaults.findUnique.mockResolvedValue({ id: "od-1" });
    mockPrisma.organizationDefaults.update.mockResolvedValue({});
    const { req, res } = mkReq({
      teamId: TEAM_ID,
      section: "lpOnboarding",
      data: { notifyGpCommitment: true, notifyLpWireConfirm: false },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  // --- Section: dataroomDefaults ---

  it("updates dataroom defaults", async () => {
    mockPrisma.organizationDefaults.findUnique.mockResolvedValue({ id: "od-1" });
    mockPrisma.organizationDefaults.update.mockResolvedValue({});
    const { req, res } = mkReq({
      teamId: TEAM_ID,
      section: "dataroomDefaults",
      data: { dataroomConversationsEnabled: true, dataroomAllowBulkDownload: false },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  // --- Section: linkDefaults ---

  it("updates link defaults", async () => {
    mockPrisma.organizationDefaults.findUnique.mockResolvedValue({ id: "od-1" });
    mockPrisma.organizationDefaults.update.mockResolvedValue({});
    const { req, res } = mkReq({
      teamId: TEAM_ID,
      section: "linkDefaults",
      data: { linkEmailProtected: true, linkPasswordRequired: false },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  // --- Section: lpOnboarding ---

  it("updates LP onboarding settings with document templates", async () => {
    mockPrisma.organizationDefaults.findUnique.mockResolvedValue({
      id: "od-1",
      featureFlags: { existingKey: true },
    });
    mockPrisma.organizationDefaults.update.mockResolvedValue({});
    const { req, res } = mkReq({
      teamId: TEAM_ID,
      section: "lpOnboarding",
      data: {
        accreditationMethod: "SELF_ACK",
        documentTemplates: { NDA: "template", LPA: "custom" },
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const updateCall = mockPrisma.organizationDefaults.update.mock.calls[0][0];
    expect(updateCall.data.accreditationMethod).toBe("SELF_ACK");
    expect(updateCall.data.featureFlags).toEqual({
      existingKey: true,
      documentTemplates: { NDA: "template", LPA: "custom" },
    });
  });

  // --- Section: audit ---

  it("updates audit retention days", async () => {
    mockPrisma.organizationDefaults.findUnique.mockResolvedValue({ id: "od-1" });
    mockPrisma.organizationDefaults.update.mockResolvedValue({});
    const { req, res } = mkReq({
      teamId: TEAM_ID,
      section: "audit",
      data: { auditLogRetentionDays: 1825 },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockPrisma.organizationDefaults.update).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID },
      data: { auditLogRetentionDays: 1825 },
    });
  });

  // --- applyToExisting cascade ---

  describe("applyToExisting cascade", () => {
    it("cascades dataroomDefaults to existing datarooms", async () => {
      mockPrisma.organizationDefaults.findUnique.mockResolvedValue({ id: "od-1" });
      mockPrisma.organizationDefaults.update.mockResolvedValue({});
      mockPrisma.dataroom.updateMany.mockResolvedValue({ count: 5 });
      const { req, res } = mkReq({
        teamId: TEAM_ID,
        section: "dataroomDefaults",
        data: { dataroomConversationsEnabled: true },
        applyToExisting: true,
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().appliedToExisting).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.dataroom.updateMany).toHaveBeenCalledWith({
        where: { teamId: TEAM_ID },
        data: { conversationsEnabled: true },
      });
    });

    it("cascades linkDefaults to existing links", async () => {
      mockPrisma.organizationDefaults.findUnique.mockResolvedValue({ id: "od-1" });
      mockPrisma.organizationDefaults.update.mockResolvedValue({});
      mockPrisma.link.updateMany.mockResolvedValue({ count: 10 });
      const { req, res } = mkReq({
        teamId: TEAM_ID,
        section: "linkDefaults",
        data: { linkAllowDownload: false },
        applyToExisting: true,
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(mockPrisma.link.updateMany).toHaveBeenCalledWith({
        where: { teamId: TEAM_ID, deletedAt: null },
        data: { allowDownload: false },
      });
    });

    it("clears passwords when disabling password requirement", async () => {
      mockPrisma.organizationDefaults.findUnique.mockResolvedValue({ id: "od-1" });
      mockPrisma.organizationDefaults.update.mockResolvedValue({});
      mockPrisma.link.updateMany.mockResolvedValue({ count: 3 });
      const { req, res } = mkReq({
        teamId: TEAM_ID,
        section: "linkDefaults",
        data: { linkPasswordRequired: false },
        applyToExisting: true,
      });
      await handler(req, res);
      expect(mockPrisma.link.updateMany).toHaveBeenCalledWith({
        where: { teamId: TEAM_ID, deletedAt: null },
        data: { password: null },
      });
    });

    it("does not cascade when applyToExisting is false", async () => {
      mockPrisma.organizationDefaults.findUnique.mockResolvedValue({ id: "od-1" });
      mockPrisma.organizationDefaults.update.mockResolvedValue({});
      const { req, res } = mkReq({
        teamId: TEAM_ID,
        section: "dataroomDefaults",
        data: { dataroomConversationsEnabled: true },
        applyToExisting: false,
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().appliedToExisting).toBe(false);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // --- Audit logging ---

  it("audit logs every section save", async () => {
    mockPrisma.organization.update.mockResolvedValue({});
    const { req, res } = mkReq({
      teamId: TEAM_ID,
      section: "company",
      data: { name: "NewName" },
    });
    await handler(req, res);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: TEAM_ID,
        eventType: "SETTINGS_UPDATED",
        resourceType: "Organization",
        resourceId: ORG_ID,
        metadata: expect.objectContaining({ section: "company" }),
      }),
    );
  });

  // --- Error handling ---

  it("returns 500 on unexpected error", async () => {
    mockPrisma.userTeam.findFirst.mockRejectedValue(new Error("DB down"));
    const { req, res } = mkReq({
      teamId: TEAM_ID,
      section: "company",
      data: { name: "X" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().error).toBe("Internal server error");
  });
});
