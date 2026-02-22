/**
 * Tests for GET /api/admin/settings/full
 *
 * Full Settings hydration: org, orgDefaults, team, funds, tierMap, members, counts
 * Covers: auth, org/team resolution, tier map computation, member formatting
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { NextResponse } from "next/server";

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

const mockRequireAdmin = jest.fn();
const mockRequireAdminAppRouter = jest.fn();
jest.mock("@/lib/auth/rbac", () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
  requireAdminAppRouter: (...args: unknown[]) => mockRequireAdminAppRouter(...args),
}));

const mockResolveSettings = jest.fn();
jest.mock("@/lib/settings/resolve", () => ({
  resolveSettings: (...args: unknown[]) => mockResolveSettings(...args),
}));

const mockPrisma = {
  team: { findUnique: jest.fn() },
  organization: { findUnique: jest.fn() },
  organizationDefaults: { findUnique: jest.fn() },
  fund: { findMany: jest.fn() },
  userTeam: { findMany: jest.fn() },
  dataroom: { count: jest.fn() },
  link: { count: jest.fn() },
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: mockPrisma,
}));

const TEAM_ID = "team-full-test";
const ORG_ID = "org-full-test";

const MOCK_SETTINGS = {
  ndaGateEnabled: false,
  accreditationRequired: true,
  kycRequired: false,
  dataroomConversationsEnabled: true,
};

function mkReq(query: Record<string, string>) {
  const { req, res } = createMocks({ method: "GET" as "GET", query });
  return { req: req as unknown as NextApiRequest, res: res as unknown as NextApiResponse };
}

describe("Settings Full API (/api/admin/settings/full)", () => {
  let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

  beforeAll(async () => {
    const { GET } = await import("@/app/api/admin/settings/full/route");
    const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
    handler = wrapAppRouteHandler({ GET });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ userId: "gp-admin-1" });
    mockRequireAdminAppRouter.mockResolvedValue({ userId: "gp-admin-1" });
    mockResolveSettings.mockResolvedValue(MOCK_SETTINGS);

    mockPrisma.team.findUnique.mockResolvedValue({
      id: TEAM_ID,
      name: "Test Team",
      organizationId: ORG_ID,
      emailFromName: "Test Sender",
      emailFromAddress: null,
      emailDomain: null,
      emailDomainStatus: null,
    });

    mockPrisma.organization.findUnique.mockResolvedValue({
      id: ORG_ID,
      name: "Test Org",
      slug: "test-org",
      description: null,
      entityType: "LLC",
      phone: null,
      addressLine1: null,
      addressLine2: null,
      addressCity: null,
      addressState: null,
      addressZip: null,
      addressCountry: null,
      brandColor: "#0066FF",
      accentColor: null,
      logo: null,
      favicon: null,
      companyDescription: null,
      sector: null,
      geography: null,
      website: null,
      foundedYear: null,
    });

    mockPrisma.organizationDefaults.findUnique.mockResolvedValue({
      dataroomConversationsEnabled: true,
      dataroomAllowBulkDownload: false,
      dataroomShowLastUpdated: true,
      linkEmailProtected: true,
      linkAllowDownload: true,
      linkEnableNotifications: true,
      linkEnableWatermark: false,
      linkExpirationDays: 30,
      linkPasswordRequired: false,
      fundroomNdaGateEnabled: true,
      fundroomKycRequired: false,
      fundroomAccreditationRequired: true,
      fundroomStagedCommitmentsEnabled: false,
      fundroomCallFrequency: null,
      auditLogRetentionDays: 365,
      requireMfa: false,
      regulationDExemption: "506C",
      accreditationMethod: "SELF_ACK",
      minimumInvestThreshold: null,
      onboardingStepConfig: null,
      documentTemplateConfig: null,
      allowExternalDocUpload: true,
      allowGpDocUploadForLp: true,
      requireGpApproval: true,
      notifyGpLpOnboardingStart: true,
      notifyGpCommitment: true,
      notifyGpWireUpload: true,
      notifyGpLpInactive: false,
      notifyGpExternalDocUpload: true,
      notifyLpStepComplete: true,
      notifyLpWireConfirm: true,
      notifyLpNewDocument: true,
      notifyLpChangeRequest: true,
      notifyLpOnboardingReminder: false,
    });

    mockPrisma.fund.findMany.mockResolvedValue([
      { id: "fund-1", name: "Fund I", entityMode: "FUND", waterfallType: "EUROPEAN" },
    ]);

    const now = new Date();
    mockPrisma.userTeam.findMany.mockResolvedValue([
      {
        role: "OWNER",
        status: "ACTIVE",
        user: { id: "u1", name: "Admin", email: "admin@co.com", image: null, createdAt: now },
      },
    ]);

    mockPrisma.dataroom.count.mockResolvedValue(3);
    mockPrisma.link.count.mockResolvedValue(7);
    mockPrisma.fund.count = jest.fn().mockResolvedValue(1);
  });

  // --- Validation ---

  it("rejects non-GET methods", async () => {
    const { req, res } = createMocks({ method: "POST" as "POST" });
    await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 400 when teamId missing", async () => {
    const { req, res } = mkReq({});
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns early when requireAdmin fails", async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockRequireAdminAppRouter.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const { req, res } = mkReq({ teamId: TEAM_ID });
    await handler(req, res);
    expect(mockPrisma.team.findUnique).not.toHaveBeenCalled();
  });

  // --- Successful response ---

  it("returns full settings data", async () => {
    const { req, res } = mkReq({ teamId: TEAM_ID });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();

    // Org data
    expect(data.org.id).toBe(ORG_ID);
    expect(data.org.name).toBe("Test Org");
    expect(data.org.brandColor).toBe("#0066FF");

    // Team data
    expect(data.team.id).toBe(TEAM_ID);
    expect(data.team.emailFromName).toBe("Test Sender");

    // Org defaults
    expect(data.orgDefaults).toBeTruthy();
    expect(data.orgDefaults.fundroomNdaGateEnabled).toBe(true);
    expect(data.orgDefaults.regulationDExemption).toBe("506C");
    expect(data.orgDefaults.notifyGpCommitment).toBe(true);
    expect(data.orgDefaults.notifyLpOnboardingReminder).toBe(false);

    // Funds
    expect(data.funds).toHaveLength(1);
    expect(data.funds[0].name).toBe("Fund I");

    // Tier map
    expect(data.tierMap).toBeDefined();
    expect(typeof data.tierMap).toBe("object");

    // Members
    expect(data.members).toHaveLength(1);
    expect(data.members[0].userId).toBe("u1");
    expect(data.members[0].role).toBe("OWNER");

    // Resource counts
    expect(data.counts).toEqual({ datarooms: 3, links: 7, funds: 1 });
  });

  it("resolves settings at correct tiers", async () => {
    const { req, res } = mkReq({ teamId: TEAM_ID, fundId: "fund-1" });
    await handler(req, res);

    // Should resolve at 4 tiers: system, org, team, fund
    expect(mockResolveSettings).toHaveBeenCalledTimes(4);
    expect(mockResolveSettings).toHaveBeenCalledWith({});
    expect(mockResolveSettings).toHaveBeenCalledWith({ orgId: ORG_ID });
    expect(mockResolveSettings).toHaveBeenCalledWith({ orgId: ORG_ID, teamId: TEAM_ID });
    expect(mockResolveSettings).toHaveBeenCalledWith({ orgId: ORG_ID, teamId: TEAM_ID, fundId: "fund-1" });
  });

  it("handles team without organization", async () => {
    mockPrisma.team.findUnique.mockResolvedValue({
      id: TEAM_ID,
      name: "Orphan Team",
      organizationId: null,
    });
    mockPrisma.organization.findUnique.mockResolvedValue(null);
    mockPrisma.organizationDefaults.findUnique.mockResolvedValue(null);

    const { req, res } = mkReq({ teamId: TEAM_ID });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.org).toBeNull();
    expect(data.orgDefaults).toBeNull();
  });

  it("returns null orgDefaults when none exist", async () => {
    mockPrisma.organizationDefaults.findUnique.mockResolvedValue(null);

    const { req, res } = mkReq({ teamId: TEAM_ID });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().orgDefaults).toBeNull();
  });

  // --- Tier map ---

  it("builds tier map with correct source attribution", async () => {
    const sysSettings = { ndaGateEnabled: false, kycRequired: false };
    const orgSettings = { ndaGateEnabled: true, kycRequired: false };

    mockResolveSettings
      .mockResolvedValueOnce(sysSettings)  // system
      .mockResolvedValueOnce(orgSettings)  // org
      .mockResolvedValueOnce(orgSettings)  // team (same as org)
      .mockResolvedValueOnce(orgSettings); // fund (same)

    const { req, res } = mkReq({ teamId: TEAM_ID });
    await handler(req, res);

    const tierMap = res._getJSONData().tierMap;
    expect(tierMap.ndaGateEnabled.source).toBe("Organization");
    expect(tierMap.ndaGateEnabled.value).toBe(true);
    expect(tierMap.kycRequired.source).toBe("System");
    expect(tierMap.kycRequired.value).toBe(false);
  });

  // --- Error handling ---

  it("returns 500 on unexpected error", async () => {
    mockPrisma.team.findUnique.mockRejectedValue(new Error("DB down"));
    const { req, res } = mkReq({ teamId: TEAM_ID });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().error).toBe("Internal server error");
  });
});
