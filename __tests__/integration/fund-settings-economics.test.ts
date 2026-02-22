// @ts-nocheck
/**
 * Integration tests for Fund Settings API — Economics Fields (App Router)
 *
 * Tests for app/api/funds/[fundId]/settings/route.ts
 * Tests the GET/PATCH round-trip of all fund economics fields
 * added in the Settings Center sprint (Prompt 15).
 */

import { NextRequest } from "next/server";

// Mock functions
const mockGetServerSession = jest.fn();
const mockAppRouterRateLimit = jest.fn();
const mockReportError = jest.fn();

// Mock dependencies
jest.mock("next-auth", () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: { providers: [], session: { strategy: "jwt" } },
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  appRouterRateLimit: (...args: any[]) => mockAppRouterRateLimit(...args),
}));

jest.mock("@/lib/error", () => ({
  reportError: (...args: any[]) => mockReportError(...args),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    fund: { findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
}));

import { GET, PATCH } from "@/app/api/funds/[fundId]/settings/route";
import prisma from "@/lib/prisma";

const MOCK_FUND_ID = "fund-001";
const MOCK_TEAM_ID = "team-001";
const MOCK_USER_ID = "user-001";

const baseFund = {
  id: MOCK_FUND_ID,
  teamId: MOCK_TEAM_ID,
  name: "Test Fund I, L.P.",
  ndaGateEnabled: true,
  stagedCommitmentsEnabled: false,
  callFrequency: "QUARTERLY",
  minimumInvestment: 90000,
  capitalCallThresholdEnabled: false,
  capitalCallThreshold: null,
  managementFeePct: 0.025,  // stored as decimal
  carryPct: 0.20,
  hurdleRate: 0.08,
  waterfallType: "EUROPEAN",
  currency: "USD",
  termYears: 8,
  extensionYears: 2,
  highWaterMark: true,
  gpCommitmentAmount: 500000,
  gpCommitmentPct: 0.0524,
  investmentPeriodYears: 3,
  preferredReturnMethod: "COMPOUND",
  recyclingEnabled: true,
  clawbackProvision: true,
  wireInstructions: null,
  wireInstructionsUpdatedAt: null,
  featureFlags: {},
  currentRaise: 2500000,
  targetRaise: 9550000,
  status: "RAISING",
  regulationDExemption: "506C",
};

const mockUser = {
  id: MOCK_USER_ID,
  email: "admin@test.com",
  teams: [
    {
      teamId: MOCK_TEAM_ID,
      role: "ADMIN",
      team: { id: MOCK_TEAM_ID },
    },
  ],
};

function makeGetRequest(fundId: string = MOCK_FUND_ID): [NextRequest, { params: Promise<{ fundId: string }> }] {
  const req = new NextRequest(`http://localhost:3000/api/funds/${fundId}/settings`, {
    method: "GET",
    headers: { "x-forwarded-for": "1.2.3.4", "user-agent": "test-agent" },
  });
  return [req, { params: Promise.resolve({ fundId }) }];
}

function makePatchRequest(fundId: string = MOCK_FUND_ID, body: Record<string, unknown> = {}): [NextRequest, { params: Promise<{ fundId: string }> }] {
  const req = new NextRequest(`http://localhost:3000/api/funds/${fundId}/settings`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "test-agent",
    },
  });
  return [req, { params: Promise.resolve({ fundId }) }];
}

function setupAuth() {
  mockGetServerSession.mockResolvedValue({
    user: { email: "admin@test.com" },
  });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
  (prisma.fund.findUnique as jest.Mock).mockResolvedValue({ ...baseFund });
}

describe("Fund Settings API — Economics Fields", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppRouterRateLimit.mockResolvedValue(null);
    setupAuth();
  });

  describe("GET /api/funds/[fundId]/settings", () => {
    it("returns all economics fields with correct display values", async () => {
      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);

      expect(res.status).toBe(200);
      const data = await res.json();
      const fund = data.fund;

      // Percentage fields returned as display values (×100)
      expect(fund.managementFeePct).toBe(2.5);
      expect(fund.carryPct).toBe(20);
      expect(fund.hurdleRate).toBe(8);
      expect(fund.gpCommitmentPct).toBe(5.24);

      // Non-percentage economics fields
      expect(fund.highWaterMark).toBe(true);
      expect(fund.gpCommitmentAmount).toBe(500000);
      expect(fund.investmentPeriodYears).toBe(3);
      expect(fund.preferredReturnMethod).toBe("COMPOUND");
      expect(fund.recyclingEnabled).toBe(true);
      expect(fund.clawbackProvision).toBe(true);

      // Other fields still present
      expect(fund.waterfallType).toBe("EUROPEAN");
      expect(fund.currency).toBe("USD");
      expect(fund.termYears).toBe(8);
      expect(fund.extensionYears).toBe(2);
      expect(fund.regulationDExemption).toBe("506C");
    });

    it("returns null for unset percentage fields", async () => {
      (prisma.fund.findUnique as jest.Mock).mockResolvedValue({
        ...baseFund,
        managementFeePct: null,
        carryPct: null,
        hurdleRate: null,
        gpCommitmentPct: null,
        gpCommitmentAmount: null,
      });

      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);

      expect(res.status).toBe(200);
      const fund = (await res.json()).fund;
      expect(fund.managementFeePct).toBeNull();
      expect(fund.carryPct).toBeNull();
      expect(fund.hurdleRate).toBeNull();
      expect(fund.gpCommitmentPct).toBeNull();
      expect(fund.gpCommitmentAmount).toBeNull();
    });
  });

  describe("PATCH /api/funds/[fundId]/settings — Boolean Economics", () => {
    it("updates highWaterMark toggle", async () => {
      (prisma.fund.update as jest.Mock).mockResolvedValue({ ...baseFund, highWaterMark: false });

      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, { highWaterMark: false });
      const res = await PATCH(req, ctx);

      expect(res.status).toBe(200);
      expect(prisma.fund.update).toHaveBeenCalledWith({
        where: { id: MOCK_FUND_ID },
        data: expect.objectContaining({ highWaterMark: false }),
      });
    });

    it("updates recyclingEnabled toggle", async () => {
      (prisma.fund.update as jest.Mock).mockResolvedValue({ ...baseFund, recyclingEnabled: false });

      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, { recyclingEnabled: false });
      const res = await PATCH(req, ctx);

      expect(res.status).toBe(200);
      expect(prisma.fund.update).toHaveBeenCalledWith({
        where: { id: MOCK_FUND_ID },
        data: expect.objectContaining({ recyclingEnabled: false }),
      });
    });

    it("updates clawbackProvision toggle", async () => {
      (prisma.fund.update as jest.Mock).mockResolvedValue({ ...baseFund, clawbackProvision: false });

      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, { clawbackProvision: false });
      const res = await PATCH(req, ctx);

      expect(res.status).toBe(200);
      expect(prisma.fund.update).toHaveBeenCalledWith({
        where: { id: MOCK_FUND_ID },
        data: expect.objectContaining({ clawbackProvision: false }),
      });
    });
  });

  describe("PATCH /api/funds/[fundId]/settings — Numeric Economics", () => {
    it("updates investmentPeriodYears within range (0-30)", async () => {
      (prisma.fund.update as jest.Mock).mockResolvedValue({ ...baseFund, investmentPeriodYears: 5 });

      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, { investmentPeriodYears: "5" });
      const res = await PATCH(req, ctx);

      expect(res.status).toBe(200);
      expect(prisma.fund.update).toHaveBeenCalledWith({
        where: { id: MOCK_FUND_ID },
        data: expect.objectContaining({ investmentPeriodYears: 5 }),
      });
    });

    it("rejects investmentPeriodYears above 30", async () => {
      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, { investmentPeriodYears: "31" });
      const res = await PATCH(req, ctx);

      // Should return 400 since no valid field found
      expect(res.status).toBe(400);
    });

    it("updates gpCommitmentAmount", async () => {
      (prisma.fund.update as jest.Mock).mockResolvedValue({ ...baseFund, gpCommitmentAmount: 1000000 });

      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, { gpCommitmentAmount: "1000000" });
      const res = await PATCH(req, ctx);

      expect(res.status).toBe(200);
      expect(prisma.fund.update).toHaveBeenCalledWith({
        where: { id: MOCK_FUND_ID },
        data: expect.objectContaining({ gpCommitmentAmount: 1000000 }),
      });
    });

    it("rejects negative gpCommitmentAmount", async () => {
      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, { gpCommitmentAmount: "-500" });
      const res = await PATCH(req, ctx);

      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/funds/[fundId]/settings — String Economics", () => {
    it("updates preferredReturnMethod to SIMPLE", async () => {
      (prisma.fund.update as jest.Mock).mockResolvedValue({ ...baseFund, preferredReturnMethod: "SIMPLE" });

      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, { preferredReturnMethod: "SIMPLE" });
      const res = await PATCH(req, ctx);

      expect(res.status).toBe(200);
      expect(prisma.fund.update).toHaveBeenCalledWith({
        where: { id: MOCK_FUND_ID },
        data: expect.objectContaining({ preferredReturnMethod: "SIMPLE" }),
      });
    });

    it("updates preferredReturnMethod to NONE", async () => {
      (prisma.fund.update as jest.Mock).mockResolvedValue({ ...baseFund, preferredReturnMethod: "NONE" });

      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, { preferredReturnMethod: "NONE" });
      const res = await PATCH(req, ctx);

      expect(res.status).toBe(200);
      expect(prisma.fund.update).toHaveBeenCalledWith({
        where: { id: MOCK_FUND_ID },
        data: expect.objectContaining({ preferredReturnMethod: "NONE" }),
      });
    });

    it("rejects invalid preferredReturnMethod", async () => {
      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, { preferredReturnMethod: "INVALID" });
      const res = await PATCH(req, ctx);

      // No valid field → 400
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/funds/[fundId]/settings — Percentage Economics", () => {
    it("converts gpCommitmentPct from display (10) to decimal (0.10)", async () => {
      (prisma.fund.update as jest.Mock).mockResolvedValue({ ...baseFund, gpCommitmentPct: 0.10 });

      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, { gpCommitmentPct: "10" });
      const res = await PATCH(req, ctx);

      expect(res.status).toBe(200);
      expect(prisma.fund.update).toHaveBeenCalledWith({
        where: { id: MOCK_FUND_ID },
        data: expect.objectContaining({ gpCommitmentPct: 0.10 }),
      });
    });

    it("rejects gpCommitmentPct above 100", async () => {
      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, { gpCommitmentPct: "101" });
      const res = await PATCH(req, ctx);

      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/funds/[fundId]/settings — Multi-field Update", () => {
    it("updates multiple economics fields at once", async () => {
      const updatedFund = {
        ...baseFund,
        highWaterMark: false,
        investmentPeriodYears: 5,
        preferredReturnMethod: "SIMPLE",
        recyclingEnabled: false,
        gpCommitmentAmount: 750000,
        managementFeePct: 0.03,
      };
      (prisma.fund.update as jest.Mock).mockResolvedValue(updatedFund);

      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, {
        highWaterMark: false,
        investmentPeriodYears: "5",
        preferredReturnMethod: "SIMPLE",
        recyclingEnabled: false,
        gpCommitmentAmount: "750000",
        managementFeePct: "3",
      });
      const res = await PATCH(req, ctx);

      expect(res.status).toBe(200);
      expect(prisma.fund.update).toHaveBeenCalledWith({
        where: { id: MOCK_FUND_ID },
        data: expect.objectContaining({
          highWaterMark: false,
          investmentPeriodYears: 5,
          preferredReturnMethod: "SIMPLE",
          recyclingEnabled: false,
          gpCommitmentAmount: 750000,
          managementFeePct: 0.03,
        }),
      });

      // Response should return display values
      const fund = (await res.json()).fund;
      expect(fund.managementFeePct).toBe(3); // 0.03 × 100
    });

    it("creates audit log with all updated fields", async () => {
      (prisma.fund.update as jest.Mock).mockResolvedValue({
        ...baseFund,
        highWaterMark: false,
        recyclingEnabled: false,
      });

      const [req, ctx] = makePatchRequest(MOCK_FUND_ID, {
        highWaterMark: false,
        recyclingEnabled: false,
      });
      await PATCH(req, ctx);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: "FUND_SETTINGS_UPDATE",
          userId: MOCK_USER_ID,
          teamId: MOCK_TEAM_ID,
          resourceType: "FUND",
          resourceId: MOCK_FUND_ID,
          metadata: expect.objectContaining({
            updatedFields: expect.arrayContaining(["highWaterMark", "recyclingEnabled"]),
            previousValues: expect.objectContaining({
              highWaterMark: true,
              recyclingEnabled: true,
            }),
          }),
        }),
      });
    });
  });

  describe("Auth enforcement", () => {
    it("rejects unauthenticated requests", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);

      expect(res.status).toBe(401);
    });

    it("rejects non-admin users", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        teams: [{ teamId: MOCK_TEAM_ID, role: "MEMBER", team: { id: MOCK_TEAM_ID } }],
      });

      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);

      expect(res.status).toBe(403);
    });

    it("returns 404 for unknown fund", async () => {
      (prisma.fund.findUnique as jest.Mock).mockResolvedValue(null);

      const [req, ctx] = makeGetRequest("nonexistent");
      const res = await GET(req, ctx);

      expect(res.status).toBe(404);
    });
  });
});
