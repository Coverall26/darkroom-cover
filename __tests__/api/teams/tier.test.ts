import { createMocks } from "node-mocks-http";

import handler from "@/pages/api/teams/[teamId]/tier";
import { clearTierCache } from "@/lib/tier";

// Mock next-auth
jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";

const mockGetServerSession = getServerSession as jest.Mock;

const prismaMock = prisma as unknown as {
  userTeam: { findFirst: jest.Mock };
  team: { findUnique: jest.Mock };
  fundroomActivation: { findFirst: jest.Mock };
  signatureDocument: { count: jest.Mock };
};

const TEAM_ID = "team-tier-test";

function mockTeam(overrides: Record<string, unknown> = {}) {
  return {
    plan: "business",
    limits: null,
    stripeId: "cus_test",
    subscriptionId: "sub_test",
    startsAt: new Date("2026-01-01"),
    endsAt: new Date("2027-01-01"),
    pausedAt: null,
    cancelledAt: null,
    featureFlags: null,
    _count: {
      documents: 10,
      links: 5,
      users: 2,
      invitations: 1,
      datarooms: 1,
      domains: 0,
      signatureDocuments: 3,
    },
    ...overrides,
  };
}

describe("GET /api/teams/[teamId]/tier", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearTierCache(); // Clear the in-memory tier cache between tests
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { req, res } = createMocks({ method: "GET", query: { teamId: TEAM_ID } });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(401);
  });

  it("returns 405 for non-GET methods", async () => {
    const { req, res } = createMocks({ method: "POST", query: { teamId: TEAM_ID } });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  it("returns 403 when user is not a team member", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    prismaMock.userTeam.findFirst.mockResolvedValue(null);
    const { req, res } = createMocks({ method: "GET", query: { teamId: TEAM_ID } });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(403);
  });

  it("returns full resolved tier for a valid team member", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    prismaMock.userTeam.findFirst.mockResolvedValue({ role: "ADMIN" });
    prismaMock.team.findUnique.mockResolvedValue(mockTeam());
    prismaMock.fundroomActivation.findFirst.mockResolvedValue({ status: "ACTIVE" });
    prismaMock.signatureDocument.count.mockResolvedValue(3);

    const { req, res } = createMocks({ method: "GET", query: { teamId: TEAM_ID } });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());

    // Verify tier structure
    expect(body.planSlug).toBe("business");
    expect(body.isPaidPlan).toBe(true);
    expect(body.isFreePlan).toBe(false);
    expect(body.subscriptionStatus).toBe("active");
    expect(body.fundroomActive).toBe(true);

    // Verify capabilities exist
    expect(body.capabilities).toBeDefined();
    expect(body.capabilities.canSign).toBe(true);
    expect(body.capabilities.canUseBranding).toBe(true);
    expect(body.capabilities.canUseWebhooks).toBe(true);

    // Verify limits exist
    expect(body.limits).toBeDefined();
    expect(body.limits.esignatures).toBeNull(); // unlimited for business

    // Verify usage exists
    expect(body.usage).toBeDefined();
    expect(body.usage.documents).toBe(10);
    expect(body.usage.esignatures).toBe(3);
  });

  it("returns free plan tier for free team", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1", email: "a@b.com" } });
    prismaMock.userTeam.findFirst.mockResolvedValue({ role: "MEMBER" });
    prismaMock.team.findUnique.mockResolvedValue(
      mockTeam({ plan: "free", stripeId: null, subscriptionId: null, startsAt: null, endsAt: null }),
    );
    prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
    prismaMock.signatureDocument.count.mockResolvedValue(0);

    const { req, res } = createMocks({ method: "GET", query: { teamId: TEAM_ID } });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());

    expect(body.planSlug).toBe("free");
    expect(body.isFreePlan).toBe(true);
    expect(body.isPaidPlan).toBe(false);
    expect(body.subscriptionStatus).toBe("none");
    expect(body.fundroomActive).toBe(false);
    expect(body.capabilities.canSign).toBe(false);
    expect(body.capabilities.canUseBranding).toBe(false);
  });
});
