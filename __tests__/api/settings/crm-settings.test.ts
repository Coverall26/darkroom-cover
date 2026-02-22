/**
 * Tests for Settings Center: Billing Usage API + CRM Preferences Save
 *
 * Covers:
 *   - GET /api/billing/usage — usage meter data
 *   - GET /api/tier — tier data + billing fields
 *   - PATCH /api/admin/settings/update (section: crmPreferences)
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

jest.mock("@/lib/security/rate-limiter", () => ({
  appRouterRateLimit: jest.fn().mockResolvedValue(null),
}));

const mockRequireAuthAppRouter = jest.fn();

jest.mock("@/lib/auth/rbac", () => ({
  requireAuthAppRouter: (...args: unknown[]) => mockRequireAuthAppRouter(...args),
}));

jest.mock("@/lib/tier/crm-tier", () => ({
  resolveOrgTier: jest.fn(),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn(),
}));

const mockPrisma = {
  userTeam: { findFirst: jest.fn() },
  contact: { count: jest.fn() },
  esigUsage: { findUnique: jest.fn() },
  signatureRecipient: { count: jest.fn() },
  pendingContact: { count: jest.fn() },
  outreachSequence: { count: jest.fn() },
  organization: { findUnique: jest.fn() },
  organizationDefaults: {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  team: { findUnique: jest.fn() },
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: mockPrisma,
}));

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getServerSession as getServerSessionNext } from "next-auth/next";
import { resolveOrgTier } from "@/lib/tier/crm-tier";

const mockGetServerSession = getServerSession as jest.Mock;
const mockGetServerSessionNext = getServerSessionNext as jest.Mock;
const mockResolveOrgTier = resolveOrgTier as jest.Mock;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const SESSION = {
  user: { id: "user-1", email: "test@test.com", name: "Test" },
};

function mockUserTeam(orgId: string = "org-1", teamId: string = "team-1") {
  mockPrisma.userTeam.findFirst.mockResolvedValue({
    team: { id: teamId, organizationId: orgId },
  });
}

function mockTierDefaults() {
  mockResolveOrgTier.mockResolvedValue({
    tier: "FREE",
    aiCrmEnabled: false,
    maxContacts: 20,
    maxEsigsPerMonth: 10,
    emailTemplateLimit: 2,
    maxSignerStorage: 50,
    hasKanban: false,
    hasOutreachQueue: false,
    hasEmailTracking: false,
    hasLpOnboarding: false,
    hasAiFeatures: false,
  });
}

// ---------------------------------------------------------------------------
// GET /api/billing/usage
// ---------------------------------------------------------------------------

describe("GET /api/billing/usage", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let GET: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("@/app/api/billing/usage/route");
    GET = mod.GET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(SESSION);
    mockRequireAuthAppRouter.mockResolvedValue({
      userId: "user-1",
      email: "test@test.com",
      teamId: "",
      role: "MEMBER",
    });
    mockUserTeam();
    mockTierDefaults();
    mockPrisma.contact.count.mockResolvedValue(5);
    mockPrisma.esigUsage.findUnique.mockResolvedValue({ signaturesUsed: 3 });
    mockPrisma.outreachSequence.count.mockResolvedValue(1);
  });

  it("returns usage data in expected format", async () => {
    const res = await GET(new Request("http://localhost/api/billing/usage"));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.contacts).toEqual({ used: 5, limit: 20 });
    expect(data.esigs).toEqual({ used: 3, limit: 10 });
    expect(data.templates).toEqual({ used: 1, limit: 2 });
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthAppRouter.mockResolvedValueOnce(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await GET(new Request("http://localhost/api/billing/usage"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when no org found", async () => {
    mockPrisma.userTeam.findFirst.mockResolvedValue({
      team: { id: "team-1", organizationId: null },
    });
    const res = await GET(new Request("http://localhost/api/billing/usage"));
    expect(res.status).toBe(404);
  });

  it("handles null esig usage (no records this month)", async () => {
    mockPrisma.esigUsage.findUnique.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/billing/usage"));
    const data = await res.json();
    expect(data.esigs.used).toBe(0);
  });

  it("returns unlimited (null) limits for paid tiers", async () => {
    mockResolveOrgTier.mockResolvedValue({
      tier: "FUNDROOM",
      aiCrmEnabled: true,
      maxContacts: null,
      maxEsigsPerMonth: null,
      emailTemplateLimit: null,
      maxSignerStorage: null,
      hasKanban: true,
      hasOutreachQueue: true,
      hasEmailTracking: true,
      hasLpOnboarding: true,
      hasAiFeatures: true,
    });
    const res = await GET(new Request("http://localhost/api/billing/usage"));
    const data = await res.json();
    expect(data.contacts.limit).toBeNull();
    expect(data.esigs.limit).toBeNull();
    expect(data.templates.limit).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GET /api/tier (enhanced with billing fields)
// ---------------------------------------------------------------------------

describe("GET /api/tier", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let GET: () => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("@/app/api/tier/route");
    GET = mod.GET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(SESSION);
    mockRequireAuthAppRouter.mockResolvedValue({
      userId: "user-1",
      email: "test@test.com",
      teamId: "",
      role: "MEMBER",
    });
    mockUserTeam();
    mockTierDefaults();
    mockPrisma.contact.count.mockResolvedValue(10);
    mockPrisma.esigUsage.findUnique.mockResolvedValue({ signaturesUsed: 2 });
    mockPrisma.signatureRecipient.count.mockResolvedValue(50);
    mockPrisma.pendingContact.count.mockResolvedValue(3);
    mockPrisma.organization.findUnique.mockResolvedValue({
      aiCrmTrialEndsAt: null,
      subscriptionStatus: null,
    });
  });

  it("returns tier data with billing fields", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.tier).toBe("FREE");
    expect(data.aiCrmEnabled).toBe(false);
    expect(data.aiTrialEndsAt).toBeNull();
    expect(data.cancelAtPeriodEnd).toBe(false);
    expect(data.limits).toBeDefined();
    expect(data.usage).toBeDefined();
  });

  it("returns aiTrialEndsAt when trial is active", async () => {
    const trialEnd = new Date("2026-03-01T00:00:00Z");
    mockPrisma.organization.findUnique.mockResolvedValue({
      aiCrmTrialEndsAt: trialEnd,
      subscriptionStatus: "ACTIVE",
    });
    const res = await GET();
    const data = await res.json();
    expect(data.aiTrialEndsAt).toBe(trialEnd.toISOString());
  });

  it("returns cancelAtPeriodEnd when cancelling", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "CANCEL_AT_PERIOD_END",
    });
    const res = await GET();
    const data = await res.json();
    expect(data.cancelAtPeriodEnd).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuthAppRouter.mockResolvedValueOnce(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/settings/update (section: crmPreferences)
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/settings/update — crmPreferences", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let handler: (req: any, res: any) => Promise<void>;

  beforeAll(async () => {
    const { PATCH } = await import("@/app/api/admin/settings/update/route");
    const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
    handler = wrapAppRouteHandler({ PATCH });
  });

  function mockRes() {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };
    return res;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(SESSION);
    mockGetServerSessionNext.mockResolvedValue(SESSION);
    mockPrisma.userTeam.findFirst.mockResolvedValue({
      userId: "user-1",
      teamId: "team-1",
      role: "ADMIN",
      status: "ACTIVE",
    });
    mockPrisma.team.findUnique.mockResolvedValue({
      organizationId: "org-1",
      name: "Test Team",
    });
  });

  it("saves CRM preferences to OrganizationDefaults featureFlags", async () => {
    mockPrisma.organizationDefaults.findFirst.mockResolvedValue({
      id: "od-1",
      featureFlags: { existingKey: true },
    });
    mockPrisma.organizationDefaults.update.mockResolvedValue({});

    const req = {
      method: "PATCH",
      body: {
        teamId: "team-1",
        section: "crmPreferences",
        data: {
          crmPreferences: {
            digestEnabled: true,
            digestFrequency: "weekly",
            autoCaptureDateroom: false,
            engagementThresholdHot: 20,
          },
        },
      },
    };
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.organizationDefaults.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1" },
        data: {
          featureFlags: {
            existingKey: true,
            crmPreferences: expect.objectContaining({
              digestEnabled: true,
              digestFrequency: "weekly",
              autoCaptureDateroom: false,
              engagementThresholdHot: 20,
            }),
          },
        },
      }),
    );
  });

  it("creates OrganizationDefaults if none exists", async () => {
    mockPrisma.organizationDefaults.findFirst.mockResolvedValue(null);
    mockPrisma.organizationDefaults.create.mockResolvedValue({});

    const req = {
      method: "PATCH",
      body: {
        teamId: "team-1",
        section: "crmPreferences",
        data: {
          crmPreferences: {
            digestEnabled: false,
          },
        },
      },
    };
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.organizationDefaults.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          featureFlags: {
            crmPreferences: expect.objectContaining({
              digestEnabled: false,
            }),
          },
        }),
      }),
    );
  });

  it("rejects unauthenticated requests", async () => {
    mockGetServerSession.mockResolvedValue(null);
    mockGetServerSessionNext.mockResolvedValue(null);
    const req = {
      method: "PATCH",
      body: { teamId: "team-1", section: "crmPreferences", data: {} },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects non-admin users", async () => {
    mockPrisma.userTeam.findFirst.mockResolvedValue(null);
    const req = {
      method: "PATCH",
      body: {
        teamId: "team-1",
        section: "crmPreferences",
        data: { crmPreferences: {} },
      },
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("strips unknown keys from CRM preferences", async () => {
    mockPrisma.organizationDefaults.findFirst.mockResolvedValue({
      id: "od-1",
      featureFlags: {},
    });
    mockPrisma.organizationDefaults.update.mockResolvedValue({});

    const req = {
      method: "PATCH",
      body: {
        teamId: "team-1",
        section: "crmPreferences",
        data: {
          crmPreferences: {
            digestEnabled: true,
            maliciousKey: "DROP TABLE;",
            anotherBadKey: true,
          },
        },
      },
    };
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const savedFlags =
      mockPrisma.organizationDefaults.update.mock.calls[0][0].data
        .featureFlags;
    expect(savedFlags.crmPreferences).not.toHaveProperty("maliciousKey");
    expect(savedFlags.crmPreferences).not.toHaveProperty("anotherBadKey");
    expect(savedFlags.crmPreferences).toHaveProperty("digestEnabled", true);
  });

  it("rejects wrong HTTP method", async () => {
    const req = {
      method: "GET",
      body: {},
    };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
