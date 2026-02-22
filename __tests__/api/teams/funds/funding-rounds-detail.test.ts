// @ts-nocheck
/**
 * Funding Round Detail API Tests
 *
 * Tests for:
 *   GET    /api/teams/[teamId]/funds/[fundId]/funding-rounds/[roundId]
 *   PUT    /api/teams/[teamId]/funds/[fundId]/funding-rounds/[roundId]
 *   DELETE /api/teams/[teamId]/funds/[fundId]/funding-rounds/[roundId]
 *
 * Validates: auth, fund ownership, round lookup, name uniqueness,
 * status transitions, active round enforcement, delete protection,
 * partial update, happy paths.
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

import { GET, PUT, DELETE } from "@/app/api/teams/[teamId]/funds/[fundId]/funding-rounds/[roundId]/route";
import prisma from "@/lib/prisma";

// --- Helpers ---

const TEAM_ID = "team-123";
const FUND_ID = "fund-456";
const ROUND_ID = "round-789";
const USER_ID = "user-aaa";

type DetailCtx = { params: Promise<{ teamId: string; fundId: string; roundId: string }> };

function makeReq(method: string, body?: Record<string, unknown>): [NextRequest, DetailCtx] {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const req = new NextRequest(
    new URL(`http://localhost:3000/api/teams/${TEAM_ID}/funds/${FUND_ID}/funding-rounds/${ROUND_ID}`),
    init,
  );
  const ctx: DetailCtx = { params: Promise.resolve({ teamId: TEAM_ID, fundId: FUND_ID, roundId: ROUND_ID }) };
  return [req, ctx];
}

function mockAuth(role = "ADMIN") {
  mockGetServerSession.mockResolvedValue({ user: { id: USER_ID, email: "gp@test.com" } });
  (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({ userId: USER_ID, teamId: TEAM_ID, role });
}

function mockFundExists() {
  (prisma.fund.findFirst as jest.Mock).mockResolvedValue({ id: FUND_ID });
}

const MOCK_ROUND = {
  id: ROUND_ID,
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
  status: "PLANNED",
  isExternal: false,
  externalNotes: null,
  instrumentType: "SAFE",
  valuationCap: { toString: () => "10000000" },
  discount: { toString: () => "20" },
  createdAt: new Date("2026-01-01"),
};

// --- Tests ---

describe("Funding Round Detail API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppRouterRateLimit.mockResolvedValue(null);
  });

  // ===================== GET =====================

  describe("GET /funding-rounds/[roundId]", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValue(null);
      const [req, ctx] = makeReq("GET");
      const res = await GET(req, ctx);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user lacks GP role", async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: USER_ID } });
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
      const [req, ctx] = makeReq("GET");
      const res = await GET(req, ctx);
      expect(res.status).toBe(403);
    });

    it("returns 404 when fund not in team", async () => {
      mockAuth();
      (prisma.fund.findFirst as jest.Mock).mockResolvedValue(null);
      const [req, ctx] = makeReq("GET");
      const res = await GET(req, ctx);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Fund not found");
    });

    it("returns 404 when round not found", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(null);
      const [req, ctx] = makeReq("GET");
      const res = await GET(req, ctx);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Funding round not found");
    });

    it("returns round detail on success", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(MOCK_ROUND);

      const [req, ctx] = makeReq("GET");
      const res = await GET(req, ctx);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.round.id).toBe(ROUND_ID);
      expect(body.round.roundName).toBe("Seed Round");
      expect(body.round.amountRaised).toBe("500000");
      expect(body.round.instrumentType).toBe("SAFE");
    });
  });

  // ===================== PUT =====================

  describe("PUT /funding-rounds/[roundId]", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValue(null);
      const [req, ctx] = makeReq("PUT", { roundName: "Updated" });
      const res = await PUT(req, ctx);
      expect(res.status).toBe(401);
    });

    it("returns 404 when round not found", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(null);
      const [req, ctx] = makeReq("PUT", { roundName: "Updated" });
      const res = await PUT(req, ctx);
      expect(res.status).toBe(404);
    });

    it("returns 400 for empty roundName", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(MOCK_ROUND);

      const [req, ctx] = makeReq("PUT", { roundName: "" });
      const res = await PUT(req, ctx);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Round name is required");
    });

    it("returns 400 for roundName > 100 chars", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(MOCK_ROUND);

      const [req, ctx] = makeReq("PUT", { roundName: "a".repeat(101) });
      const res = await PUT(req, ctx);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("under 100 characters");
    });

    it("returns 409 for duplicate roundName in same fund", async () => {
      mockAuth();
      mockFundExists();
      // First findFirst: existing round (the one we're editing)
      (prisma.fundingRound.findFirst as jest.Mock)
        .mockResolvedValueOnce(MOCK_ROUND) // existing check
        .mockResolvedValueOnce({ id: "other-round" }); // duplicate name check

      const [req, ctx] = makeReq("PUT", { roundName: "Series A" });
      const res = await PUT(req, ctx);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("already exists");
    });

    it("returns 400 for invalid status", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(MOCK_ROUND);

      const [req, ctx] = makeReq("PUT", { status: "BOGUS" });
      const res = await PUT(req, ctx);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid status");
    });

    it("returns 409 when setting ACTIVE and another active round exists", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock)
        .mockResolvedValueOnce({ ...MOCK_ROUND, status: "PLANNED" }) // existing round
        .mockResolvedValueOnce({ id: "other", roundName: "Pre-Seed" }); // other active

      const [req, ctx] = makeReq("PUT", { status: "ACTIVE" });
      const res = await PUT(req, ctx);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("active round already exists");
    });

    it("updates round with partial fields", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(MOCK_ROUND);
      const updatedRound = { ...MOCK_ROUND, leadInvestor: "New Lead", status: "COMPLETED" };
      (prisma.fundingRound.update as jest.Mock).mockResolvedValue(updatedRound);

      const [req, ctx] = makeReq("PUT", { leadInvestor: "New Lead", status: "COMPLETED" });
      const res = await PUT(req, ctx);
      expect(res.status).toBe(200);

      expect(prisma.fundingRound.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ROUND_ID },
          data: expect.objectContaining({
            leadInvestor: "New Lead",
            status: "COMPLETED",
          }),
        }),
      );
    });

    it("parses decimal fields correctly", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(MOCK_ROUND);
      (prisma.fundingRound.update as jest.Mock).mockResolvedValue(MOCK_ROUND);

      const [req, ctx] = makeReq("PUT", {
        amountRaised: "$1,500,000",
        targetAmount: "3000000",
        preMoneyVal: null,
      });
      const res = await PUT(req, ctx);
      expect(res.status).toBe(200);

      expect(prisma.fundingRound.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amountRaised: 1500000,
            targetAmount: 3000000,
            preMoneyVal: null, // null → parseDecimal returns 0 → 0 || null → null (0 is falsy)
          }),
        }),
      );
    });

    it("fires audit log on update", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(MOCK_ROUND);
      (prisma.fundingRound.update as jest.Mock).mockResolvedValue(MOCK_ROUND);

      const [req, ctx] = makeReq("PUT", { status: "COMPLETED" });
      await PUT(req, ctx);

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "SETTINGS_UPDATED",
          metadata: expect.objectContaining({
            action: "funding_round_updated",
            roundId: ROUND_ID,
          }),
        }),
      );
    });
  });

  // ===================== DELETE =====================

  describe("DELETE /funding-rounds/[roundId]", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetServerSession.mockResolvedValue(null);
      const [req, ctx] = makeReq("DELETE");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(401);
    });

    it("returns 404 when fund not in team", async () => {
      mockAuth();
      (prisma.fund.findFirst as jest.Mock).mockResolvedValue(null);
      const [req, ctx] = makeReq("DELETE");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(404);
    });

    it("returns 404 when round not found", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue(null);
      const [req, ctx] = makeReq("DELETE");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(404);
    });

    it("returns 400 when deleting ACTIVE round", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue({ ...MOCK_ROUND, status: "ACTIVE" });

      const [req, ctx] = makeReq("DELETE");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Cannot delete the active round");
    });

    it("deletes PLANNED round successfully", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue({ ...MOCK_ROUND, status: "PLANNED" });
      (prisma.fundingRound.delete as jest.Mock).mockResolvedValue({ id: ROUND_ID });

      const [req, ctx] = makeReq("DELETE");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      expect(prisma.fundingRound.delete).toHaveBeenCalledWith({ where: { id: ROUND_ID } });
    });

    it("deletes COMPLETED round successfully", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue({ ...MOCK_ROUND, status: "COMPLETED" });
      (prisma.fundingRound.delete as jest.Mock).mockResolvedValue({ id: ROUND_ID });

      const [req, ctx] = makeReq("DELETE");
      const res = await DELETE(req, ctx);
      expect(res.status).toBe(200);
    });

    it("fires audit log on delete", async () => {
      mockAuth();
      mockFundExists();
      (prisma.fundingRound.findFirst as jest.Mock).mockResolvedValue({ ...MOCK_ROUND, status: "COMPLETED" });
      (prisma.fundingRound.delete as jest.Mock).mockResolvedValue({ id: ROUND_ID });

      const [req, ctx] = makeReq("DELETE");
      await DELETE(req, ctx);

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "SETTINGS_UPDATED",
          metadata: expect.objectContaining({
            action: "funding_round_deleted",
            roundId: ROUND_ID,
          }),
        }),
      );
    });
  });
});
