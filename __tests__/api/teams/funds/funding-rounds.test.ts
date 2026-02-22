// @ts-nocheck
/**
 * Funding Rounds API Tests
 *
 * Tests for:
 *   GET  /api/teams/[teamId]/funds/[fundId]/funding-rounds — List rounds
 *   POST /api/teams/[teamId]/funds/[fundId]/funding-rounds — Create round
 *
 * Validates: auth, team membership, fund ownership, input validation,
 * duplicate name check, single-active enforcement, bounds validation,
 * auto round-order, happy paths.
 */

import { NextRequest } from "next/server";

const mockGetServerSession = jest.fn();
const mockAppRouterRateLimit = jest.fn().mockResolvedValue(null);
const mockLogAuditEvent = jest.fn().mockResolvedValue(undefined);

jest.mock("next-auth", () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  appRouterRateLimit: (...args: any[]) => mockAppRouterRateLimit(...args),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: (...args: any[]) => mockLogAuditEvent(...args),
}));

import { GET, POST } from "@/app/api/teams/[teamId]/funds/[fundId]/funding-rounds/route";
import prisma from "@/lib/prisma";

// --- Helpers ---

const TEAM_ID = "team-123";
const FUND_ID = "fund-456";
const USER_ID = "user-789";
const ORG_ID = "org-abc";

function makeGetRequest(): [NextRequest, { params: Promise<{ teamId: string; fundId: string }> }] {
  const req = new NextRequest(
    new URL(`http://localhost:3000/api/teams/${TEAM_ID}/funds/${FUND_ID}/funding-rounds`),
    { method: "GET" },
  );
  const ctx = { params: Promise.resolve({ teamId: TEAM_ID, fundId: FUND_ID }) };
  return [req, ctx];
}

function makePostRequest(body: Record<string, unknown>): [NextRequest, { params: Promise<{ teamId: string; fundId: string }> }] {
  const req = new NextRequest(
    new URL(`http://localhost:3000/api/teams/${TEAM_ID}/funds/${FUND_ID}/funding-rounds`),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const ctx = { params: Promise.resolve({ teamId: TEAM_ID, fundId: FUND_ID }) };
  return [req, ctx];
}

function mockAuthedSession() {
  mockGetServerSession.mockResolvedValue({
    user: { id: USER_ID, email: "gp@test.com" },
  });
}

function mockMembership(role = "ADMIN") {
  (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
    userId: USER_ID,
    teamId: TEAM_ID,
    role,
    team: { organizationId: ORG_ID },
  });
}

function mockFund(entityMode = "STARTUP") {
  (prisma.fund.findFirst as jest.Mock).mockResolvedValue({
    id: FUND_ID,
    teamId: TEAM_ID,
    entityMode,
  });
}

const MOCK_ROUND = {
  id: "round-1",
  fundId: FUND_ID,
  roundName: "Seed Round",
  roundOrder: 1,
  amountRaised: { toString: () => "500000" },
  targetAmount: { toString: () => "1000000" },
  preMoneyVal: { toString: () => "5000000" },
  postMoneyVal: null,
  leadInvestor: "Acme Ventures",
  investorCount: 3,
  roundDate: new Date("2026-01-15"),
  closeDate: null,
  status: "ACTIVE",
  isExternal: false,
  externalNotes: null,
  instrumentType: "SAFE",
  valuationCap: { toString: () => "10000000" },
  discount: { toString: () => "20" },
  createdAt: new Date("2026-01-01"),
};

// --- Tests ---

describe("Funding Rounds List & Create API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppRouterRateLimit.mockResolvedValue(null);
  });

  // ===================== GET /funding-rounds =====================

  describe("GET /api/teams/[teamId]/funds/[fundId]/funding-rounds", () => {
    it("returns 401 when no session", async () => {
      mockGetServerSession.mockResolvedValue(null);
      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 403 when user is not a GP team member", async () => {
      mockAuthedSession();
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);
      expect(res.status).toBe(403);
    });

    it("returns 404 when fund not found or not in team", async () => {
      mockAuthedSession();
      mockMembership();
      (prisma.fund.findFirst as jest.Mock).mockResolvedValue(null);
      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Fund not found");
    });

    it("returns empty rounds array when no rounds exist", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      (prisma.fundingRound.findMany as jest.Mock).mockResolvedValue([]);

      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rounds).toEqual([]);
      expect(body.entityMode).toBe("STARTUP");
    });

    it("returns rounds ordered by roundOrder", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      (prisma.fundingRound.findMany as jest.Mock).mockResolvedValue([MOCK_ROUND]);

      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.rounds).toHaveLength(1);
      expect(body.rounds[0].roundName).toBe("Seed Round");
      expect(body.rounds[0].amountRaised).toBe("500000");
      expect(body.rounds[0].status).toBe("ACTIVE");
      expect(body.rounds[0].instrumentType).toBe("SAFE");
    });

    it("serializes Decimal fields as strings", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      (prisma.fundingRound.findMany as jest.Mock).mockResolvedValue([MOCK_ROUND]);

      const [req, ctx] = makeGetRequest();
      const res = await GET(req, ctx);
      const body = await res.json();
      const round = body.rounds[0];
      expect(typeof round.amountRaised).toBe("string");
      expect(typeof round.targetAmount).toBe("string");
      expect(typeof round.valuationCap).toBe("string");
      expect(typeof round.discount).toBe("string");
    });
  });

  // ===================== POST /funding-rounds =====================

  describe("POST /api/teams/[teamId]/funds/[fundId]/funding-rounds", () => {
    it("returns 401 when no session", async () => {
      mockGetServerSession.mockResolvedValue(null);
      const [req, ctx] = makePostRequest({ roundName: "Seed" });
      const res = await POST(req, ctx);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user lacks GP role", async () => {
      mockAuthedSession();
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
      const [req, ctx] = makePostRequest({ roundName: "Seed" });
      const res = await POST(req, ctx);
      expect(res.status).toBe(403);
    });

    it("returns 404 when fund not in team", async () => {
      mockAuthedSession();
      mockMembership();
      (prisma.fund.findFirst as jest.Mock).mockResolvedValue(null);
      const [req, ctx] = makePostRequest({ roundName: "Seed" });
      const res = await POST(req, ctx);
      expect(res.status).toBe(404);
    });

    it("returns 400 when roundName is missing", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      const [req, ctx] = makePostRequest({});
      const res = await POST(req, ctx);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Round name is required");
    });

    it("returns 400 when roundName exceeds 100 characters", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      const [req, ctx] = makePostRequest({ roundName: "x".repeat(101) });
      const res = await POST(req, ctx);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Round name must be under 100 characters");
    });

    it("returns 400 for invalid status", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      const [req, ctx] = makePostRequest({ roundName: "Seed", status: "INVALID" });
      const res = await POST(req, ctx);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid status");
    });

    it("returns 409 when duplicate round name exists", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue({ id: "existing" });

      const [req, ctx] = makePostRequest({ roundName: "Seed Round" });
      const res = await POST(req, ctx);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("already exists");
    });

    it("returns 409 when setting ACTIVE and another active round exists", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      // First findFirst (duplicate name check) returns null
      // Second findFirst (active round check) returns existing active
      (prisma.fundingRound.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // no duplicate name
        .mockResolvedValueOnce({ id: "other", roundName: "Pre-Seed" }); // existing active

      const [req, ctx] = makePostRequest({ roundName: "Seed", status: "ACTIVE" });
      const res = await POST(req, ctx);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("active round already exists");
    });

    it("returns 400 for negative amountRaised", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(null);

      const [req, ctx] = makePostRequest({ roundName: "Seed", amountRaised: -100 });
      const res = await POST(req, ctx);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Amount raised");
    });

    it("returns 400 for discount > 100", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(null);

      const [req, ctx] = makePostRequest({
        roundName: "Seed",
        discount: 150,
      });
      const res = await POST(req, ctx);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Discount");
    });

    it("returns 400 for invalid instrument type", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(null);

      const [req, ctx] = makePostRequest({
        roundName: "Seed",
        instrumentType: "INVALID_TYPE",
      });
      const res = await POST(req, ctx);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid instrument type");
    });

    it("creates round with auto-calculated roundOrder", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      // Duplicate name check
      (prisma.fundingRound.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // no duplicate
        .mockResolvedValueOnce({ roundOrder: 2 }); // last round for auto-order

      (prisma.fundingRound.create as jest.Mock).mockResolvedValue({
        ...MOCK_ROUND,
        roundOrder: 3,
      });

      const [req, ctx] = makePostRequest({
        roundName: "Seed Round",
        amountRaised: 500000,
        targetAmount: 1000000,
        instrumentType: "SAFE",
        status: "PLANNED",
      });

      const res = await POST(req, ctx);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.round).toBeDefined();
      expect(body.round.roundName).toBe("Seed Round");

      // Verify create was called
      expect(prisma.fundingRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fundId: FUND_ID,
            roundName: "Seed Round",
            roundOrder: 3,
            status: "PLANNED",
            instrumentType: "SAFE",
            orgId: ORG_ID,
          }),
        }),
      );
    });

    it("creates round with explicit roundOrder when provided", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.fundingRound.create as jest.Mock).mockResolvedValue({
        ...MOCK_ROUND,
        roundOrder: 5,
      });

      const [req, ctx] = makePostRequest({
        roundName: "Series A",
        roundOrder: 5,
      });
      const res = await POST(req, ctx);
      expect(res.status).toBe(201);
      expect(prisma.fundingRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ roundOrder: 5 }),
        }),
      );
    });

    it("defaults status to PLANNED when not specified", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.fundingRound.create as jest.Mock).mockResolvedValue(MOCK_ROUND);

      const [req, ctx] = makePostRequest({ roundName: "Pre-Seed" });
      const res = await POST(req, ctx);
      expect(res.status).toBe(201);
      expect(prisma.fundingRound.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "PLANNED" }),
        }),
      );
    });

    it("fires audit log on successful creation", async () => {
      mockAuthedSession();
      mockMembership();
      mockFund();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.fundingRound.create as jest.Mock).mockResolvedValue(MOCK_ROUND);

      const [req, ctx] = makePostRequest({ roundName: "Seed Round" });
      await POST(req, ctx);

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "FUND_CREATED",
          userId: USER_ID,
          teamId: TEAM_ID,
          resourceId: FUND_ID,
          metadata: expect.objectContaining({
            action: "funding_round_created",
            roundId: "round-1",
          }),
        }),
      );
    });
  });
});
