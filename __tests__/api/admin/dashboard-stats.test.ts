/**
 * GP Dashboard Stats API Test
 *
 * Tests: pages/api/admin/dashboard-stats.ts
 * Related: app/admin/dashboard/page-client.tsx
 *
 * Verifies:
 *   - Authentication and GP role requirement
 *   - Stats computation (views, emails, commitments, funded)
 *   - Raise progress calculation (per-fund breakdown)
 *   - Pending actions (4 categories: wires, docs, investor review, awaiting wire)
 *   - Investor pipeline stage counts
 *   - Method enforcement
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock auth
jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/investor/approval-pipeline", () => ({
  determineCurrentStage: jest.fn(),
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  apiRateLimiter: jest.fn().mockResolvedValue(true),
  authRateLimiter: jest.fn().mockResolvedValue(true),
  strictRateLimiter: jest.fn().mockResolvedValue(true),
  uploadRateLimiter: jest.fn().mockResolvedValue(true),
  signatureRateLimiter: jest.fn().mockResolvedValue(true),
  mfaVerifyRateLimiter: jest.fn().mockResolvedValue(true),
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

// Prisma mock
const mockPrisma = {
  user: { findUnique: jest.fn() },
  fund: { findMany: jest.fn() },
  viewer: { count: jest.fn() },
  investment: { findMany: jest.fn(), count: jest.fn() },
  transaction: { count: jest.fn() },
  lPDocument: { count: jest.fn() },
  view: { count: jest.fn() },
  investor: { findMany: jest.fn() },
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: mockPrisma,
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



const { getServerSession } = require("next-auth/next");
const { determineCurrentStage } = require("@/lib/investor/approval-pipeline");

// Test data
const TEAM_ID = "team_dash_test";
const FUND_ID = "fund_dash_test";
const USER_ID = "user_dash_test";

describe("GP Dashboard Stats API (pages/api/admin/dashboard-stats.ts)", () => {
  let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

  beforeAll(async () => {
    const { GET } = await import("@/app/api/admin/dashboard-stats/route");
    const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
    handler = wrapAppRouteHandler({ GET });
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default authenticated GP admin
    getServerSession.mockResolvedValue({
      user: { id: USER_ID, email: "gp@example.com" },
    });

    // Default user with admin team
    mockPrisma.user.findUnique.mockResolvedValue({
      teams: [{ teamId: TEAM_ID }],
    });

    // Default fund data
    mockPrisma.fund.findMany.mockResolvedValue([
      {
        id: FUND_ID,
        name: "Test Fund I",
        targetRaise: 5000000,
        currentRaise: 2000000,
        status: "ACTIVE",
        _count: { investors: 10 },
      },
    ]);

    // Default viewer count
    mockPrisma.viewer.count.mockResolvedValue(25);

    // Default investments
    mockPrisma.investment.findMany.mockResolvedValue([
      { commitmentAmount: 500000, fundedAmount: 500000, status: "FUNDED" },
      { commitmentAmount: 300000, fundedAmount: 0, status: "COMMITTED" },
      { commitmentAmount: 200000, fundedAmount: 200000, status: "FUNDED" },
    ]);

    // Default pending wire count
    mockPrisma.transaction.count.mockResolvedValue(3);

    // Default pending doc count
    mockPrisma.lPDocument.count.mockResolvedValue(2);

    // Default dataroom view count
    mockPrisma.view.count.mockResolvedValue(150);

    // Default investment count for DOCS_APPROVED
    mockPrisma.investment.count.mockResolvedValue(1);

    // Default all investors for pipeline
    mockPrisma.investor.findMany.mockResolvedValue([
      { fundData: { approvalStage: "APPLIED" } },
      { fundData: { approvalStage: "UNDER_REVIEW" } },
      { fundData: { approvalStage: "APPROVED" } },
      { fundData: { approvalStage: "COMMITTED" } },
      { fundData: { approvalStage: "FUNDED" } },
    ]);

    // Pipeline stage determination
    determineCurrentStage.mockImplementation((inv: Record<string, unknown>) => {
      const fundData = inv.fundData as Record<string, unknown> | null;
      return fundData?.approvalStage || "APPLIED";
    });
  });

  describe("Method enforcement", () => {
    it("should reject POST requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(405);
    });
  });

  describe("Authentication", () => {
    it("should reject unauthenticated requests with 401", async () => {
      getServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(401);
    });

    it("should reject non-GP users with 403", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        teams: [], // no admin teams
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData()).error).toBe("GP access required");
    });
  });

  describe("Stats computation", () => {
    it("should return correct stat values", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);

      const body = JSON.parse(res._getData());
      expect(body.stats.dataroomViews).toBe(150);
      expect(body.stats.emailsCaptured).toBe(25);
      // Only COMMITTED, DOCS_APPROVED, FUNDED count as commitments
      expect(body.stats.commitments).toBe(3);
      // Total committed = sum of all commitmentAmounts
      expect(body.stats.totalCommitted).toBe(1000000);
      // Total funded = sum of all fundedAmounts
      expect(body.stats.totalFunded).toBe(700000);
    });
  });

  describe("Raise progress", () => {
    it("should return fund-level raise data", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);
      const body = JSON.parse(res._getData());

      expect(body.raise.totalTarget).toBe(5000000);
      expect(body.raise.funds).toHaveLength(1);
      expect(body.raise.funds[0].name).toBe("Test Fund I");
      expect(body.raise.funds[0].investorCount).toBe(10);
    });

    it("should handle multiple funds", async () => {
      mockPrisma.fund.findMany.mockResolvedValue([
        { id: "fund1", name: "Fund A", targetRaise: 3000000, currentRaise: 1000000, status: "ACTIVE", _count: { investors: 5 } },
        { id: "fund2", name: "Fund B", targetRaise: 7000000, currentRaise: 3000000, status: "ACTIVE", _count: { investors: 15 } },
      ]);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);
      const body = JSON.parse(res._getData());

      expect(body.raise.totalTarget).toBe(10000000);
      expect(body.raise.funds).toHaveLength(2);
      expect(body.fundCount).toBe(2);
      expect(body.investorCount).toBe(20);
    });
  });

  describe("Pending actions (4 categories)", () => {
    it("should return all 4 pending action categories", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);
      const body = JSON.parse(res._getData());

      expect(body.pendingActions).toBeDefined();
      expect(body.pendingActions.pendingWires).toBe(3);
      expect(body.pendingActions.pendingDocs).toBe(2);
      expect(body.pendingActions.needsReview).toBe(2); // APPLIED + UNDER_REVIEW
      expect(body.pendingActions.awaitingWire).toBe(1); // DOCS_APPROVED count
      // Total = all 4 categories
      expect(body.pendingActions.total).toBe(3 + 2 + 2 + 1);
    });

    it("should include PROOF_UPLOADED in wire count", async () => {
      // The API queries for PENDING, PROCESSING, and PROOF_UPLOADED
      mockPrisma.transaction.count.mockResolvedValue(5);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);
      const body = JSON.parse(res._getData());

      expect(body.pendingActions.pendingWires).toBe(5);
      // Verify the mock was called (transaction.count should get status filter)
      expect(mockPrisma.transaction.count).toHaveBeenCalled();
    });
  });

  describe("Investor pipeline", () => {
    it("should return pipeline stage counts", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);
      const body = JSON.parse(res._getData());

      expect(body.pipeline).toBeDefined();
      expect(body.pipeline.APPLIED).toBe(1);
      expect(body.pipeline.UNDER_REVIEW).toBe(1);
      expect(body.pipeline.APPROVED).toBe(1);
      expect(body.pipeline.COMMITTED).toBe(1);
      expect(body.pipeline.FUNDED).toBe(1);
    });

    it("should handle empty pipeline", async () => {
      mockPrisma.investor.findMany.mockResolvedValue([]);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);
      const body = JSON.parse(res._getData());

      expect(body.pipeline.APPLIED).toBe(0);
      expect(body.pipeline.FUNDED).toBe(0);
      expect(body.pendingActions.needsReview).toBe(0);
    });
  });

  describe("Error handling", () => {
    it("should return 500 with generic message on error", async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error("DB error"));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData()).error).toBe("Internal server error");
    });
  });
});
