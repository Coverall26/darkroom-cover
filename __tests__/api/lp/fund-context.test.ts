/**
 * Tests for GET /api/lp/fund-context
 *
 * Public endpoint that returns limited fund/org context for LP onboarding.
 * Used by the LP onboarding wizard when accessed from a dataroom link.
 *
 * Critical P0-4 endpoint: validates the Dataroom → InvestButton → LP Onboarding parameter chain.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/auth/paywall", () => ({
  requireFundroomActive: jest.fn().mockResolvedValue(true),
}));

// @/lib/redis is globally mocked in jest.setup.ts with a shared __mockRateLimitFn.
// appRouterRateLimit (from @/lib/security/rate-limiter) internally calls ratelimit()
// from @/lib/redis, which is globally mocked — so rate limiting behavior is still
// controlled via mockRateLimitFn.

import { GET } from "@/app/api/lp/fund-context/route";
import { wrapAppRouteHandler } from "@/__tests__/helpers/app-router-adapter";

const handler = wrapAppRouteHandler({ GET });

const mockRequireFundroomActive = jest.requireMock("@/lib/auth/paywall").requireFundroomActive;
const mockRateLimitFn = jest.requireMock("@/lib/redis").__mockRateLimitFn;

const mockFund = {
  id: "fund-1",
  name: "Test Fund I",
  minimumInvestment: 50000,
  flatModeEnabled: false,
  stagedCommitmentsEnabled: true,
  targetRaise: 10000000,
  team: {
    id: "team-1",
    name: "Test Team",
    organization: { name: "Test Org" },
  },
};

const mockTeamWithSingleFund = {
  id: "team-1",
  name: "Test Team",
  organization: { name: "Test Org" },
  funds: [
    {
      id: "fund-1",
      name: "Test Fund I",
      minimumInvestment: 50000,
      flatModeEnabled: false,
      stagedCommitmentsEnabled: true,
      targetRaise: 10000000,
    },
  ],
};

const mockTeamWithMultipleFunds = {
  id: "team-2",
  name: "Multi Fund Team",
  organization: { name: "Multi Org" },
  funds: [
    { id: "fund-a", name: "Fund Alpha", minimumInvestment: 25000, flatModeEnabled: true, stagedCommitmentsEnabled: false, targetRaise: 5000000 },
    { id: "fund-b", name: "Fund Beta", minimumInvestment: 100000, flatModeEnabled: false, stagedCommitmentsEnabled: true, targetRaise: 20000000 },
  ],
};

const mockTeamWithNoFunds = {
  id: "team-3",
  name: "Empty Team",
  organization: { name: "Empty Org" },
  funds: [],
};

function createReq(query: Record<string, string> = {}) {
  return createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    query,
    headers: { "x-forwarded-for": "1.2.3.4" },
  });
}

describe("GET /api/lp/fund-context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRateLimitFn.mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60000,
    });
  });

  // --- Method enforcement ---
  it("rejects non-GET methods", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({ error: "Method not allowed" });
  });

  // --- Rate limiting ---
  it("rate-limits requests", async () => {
    mockRateLimitFn.mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 60000,
    });
    const { req, res } = createReq({ teamId: "team-1" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(429);
  });

  // --- Input validation ---
  it("returns 400 when neither teamId nor fundId provided", async () => {
    const { req, res } = createReq({});
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: "teamId or fundId is required" });
  });

  // --- Fund ID path ---
  describe("with fundId", () => {
    it("returns fund context when fundId provided", async () => {
      (prisma.fund.findUnique as jest.Mock).mockResolvedValue(mockFund);
      mockRequireFundroomActive.mockResolvedValue(true);

      const { req, res } = createReq({ fundId: "fund-1" });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.teamId).toBe("team-1");
      expect(data.fundId).toBe("fund-1");
      expect(data.fundName).toBe("Test Fund I");
      expect(data.orgName).toBe("Test Org");
      expect(data.minimumInvestment).toBe(50000);
      expect(data.maximumInvestment).toBe(10000000);
      expect(data.flatModeEnabled).toBe(false);
      expect(data.stagedCommitmentsEnabled).toBe(true);
      expect(data.fundroomActive).toBe(true);
    });

    it("returns 404 when fund not found", async () => {
      (prisma.fund.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createReq({ fundId: "fund-nonexistent" });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({ error: "Fund not found" });
    });

    it("validates fund belongs to team when both provided", async () => {
      (prisma.fund.findUnique as jest.Mock).mockResolvedValue(mockFund);

      const { req, res } = createReq({ fundId: "fund-1", teamId: "wrong-team" });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({ error: "Fund does not belong to specified team" });
    });

    it("accepts matching fund and team", async () => {
      (prisma.fund.findUnique as jest.Mock).mockResolvedValue(mockFund);
      mockRequireFundroomActive.mockResolvedValue(true);

      const { req, res } = createReq({ fundId: "fund-1", teamId: "team-1" });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().fundId).toBe("fund-1");
      expect(res._getJSONData().teamId).toBe("team-1");
    });
  });

  // --- Team ID path ---
  describe("with teamId only", () => {
    it("returns fund context for single-fund team", async () => {
      (prisma.team.findUnique as jest.Mock).mockResolvedValue(mockTeamWithSingleFund);
      mockRequireFundroomActive.mockResolvedValue(true);

      const { req, res } = createReq({ teamId: "team-1" });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.teamId).toBe("team-1");
      expect(data.fundId).toBe("fund-1");
      expect(data.fundName).toBe("Test Fund I");
      expect(data.orgName).toBe("Test Org");
    });

    it("returns 400 with fund list for multi-fund team", async () => {
      (prisma.team.findUnique as jest.Mock).mockResolvedValue(mockTeamWithMultipleFunds);

      const { req, res } = createReq({ teamId: "team-2" });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = res._getJSONData();
      expect(data.error).toBe("Multiple active funds found. Please specify a fundId.");
      expect(data.funds).toHaveLength(2);
      expect(data.funds[0].id).toBe("fund-a");
      expect(data.funds[1].id).toBe("fund-b");
    });

    it("returns null fundId for team with no active funds", async () => {
      (prisma.team.findUnique as jest.Mock).mockResolvedValue(mockTeamWithNoFunds);
      mockRequireFundroomActive.mockResolvedValue(false);

      const { req, res } = createReq({ teamId: "team-3" });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.fundId).toBeNull();
      expect(data.fundName).toBeNull();
      expect(data.fundroomActive).toBe(false);
    });

    it("returns 404 when team not found", async () => {
      (prisma.team.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createReq({ teamId: "nonexistent" });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({ error: "Team not found" });
    });
  });

  // --- Paywall integration ---
  it("returns fundroomActive: false when paywall not active", async () => {
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue(mockFund);
    mockRequireFundroomActive.mockResolvedValue(false);

    const { req, res } = createReq({ fundId: "fund-1" });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().fundroomActive).toBe(false);
  });

  // --- Error handling ---
  it("returns 500 on unexpected errors", async () => {
    (prisma.fund.findUnique as jest.Mock).mockRejectedValue(new Error("DB connection failed"));

    const { req, res } = createReq({ fundId: "fund-1" });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData()).toEqual({ error: "Internal server error" });
  });
});
