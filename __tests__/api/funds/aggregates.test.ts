// @ts-nocheck
/**
 * Fund Aggregates API Tests (App Router)
 *
 * Tests for app/api/funds/[fundId]/aggregates/route.ts
 * Covers: auth (inline GP check), rate limiting, financial aggregation, team scoping
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
    userTeam: { findMany: jest.fn() },
    fund: { findFirst: jest.fn() },
    transaction: { findMany: jest.fn() },
    manualInvestment: { findMany: jest.fn() },
  },
}));

import { GET } from "@/app/api/funds/[fundId]/aggregates/route";
import prisma from "@/lib/prisma";

function makeRequest(fundId: string = "fund-1"): [NextRequest, { params: Promise<{ fundId: string }> }] {
  const req = new NextRequest(`http://localhost:3000/api/funds/${fundId}/aggregates`, {
    method: "GET",
    headers: { "x-forwarded-for": "1.2.3.4", "user-agent": "test-agent" },
  });
  return [req, { params: Promise.resolve({ fundId }) }];
}

const mockSession = {
  user: { id: "user-1", email: "gp@test.com" },
};

const mockUserTeams = [
  { teamId: "team-1" },
];

const baseFund = {
  id: "fund-1",
  name: "Growth Fund I",
  status: "RAISING",
  targetRaise: { toString: () => "5000000" },
  currentRaise: { toString: () => "1200000" },
  closingDate: null,
  investments: [],
  capitalCalls: [],
  distributions: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAppRouterRateLimit.mockResolvedValue(null);
  mockGetServerSession.mockResolvedValue(mockSession);
  (prisma.userTeam.findMany as jest.Mock).mockResolvedValue(mockUserTeams);
});

describe("Rate Limiting", () => {
  it("returns rate limit response when blocked", async () => {
    const { NextResponse } = require("next/server");
    const blockedResponse = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    mockAppRouterRateLimit.mockResolvedValue(blockedResponse);

    const [req, ctx] = makeRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(429);
  });
});

describe("Authentication & Authorization", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const [req, ctx] = makeRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no GP teams", async () => {
    (prisma.userTeam.findMany as jest.Mock).mockResolvedValue([]);
    const [req, ctx] = makeRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("GP access required");
  });

  it("returns 404 when fund not in user's teams", async () => {
    (prisma.fund.findFirst as jest.Mock).mockResolvedValue(null);

    const [req, ctx] = makeRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it("scopes fund query to user's teamIds", async () => {
    (prisma.fund.findFirst as jest.Mock).mockResolvedValue(null);

    const [req, ctx] = makeRequest();
    await GET(req, ctx);

    const findFirstCall = (prisma.fund.findFirst as jest.Mock).mock.calls[0][0];
    expect(findFirstCall.where.id).toBe("fund-1");
    expect(findFirstCall.where.teamId).toEqual({ in: ["team-1"] });
  });
});

describe("Financial Aggregation", () => {
  beforeEach(() => {
    (prisma.fund.findFirst as jest.Mock).mockResolvedValue(baseFund);
    (prisma.manualInvestment.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
  });

  it("returns zero aggregates for fund with no activity", async () => {
    const [req, ctx] = makeRequest();
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.aggregates.totalCommitments).toBe("0.00");
    expect(data.aggregates.totalFunded).toBe("0.00");
    expect(data.aggregates.totalCapitalCalled).toBe("0.00");
    expect(data.aggregates.totalDistributed).toBe("0.00");
    expect(data.aggregates.netCashFlow).toBe("0.00");
    expect(data.investorCount).toBe(0);
    expect(data.manualInvestmentCount).toBe(0);
  });

  it("correctly aggregates platform + manual commitments and funded amounts", async () => {
    (prisma.fund.findFirst as jest.Mock).mockResolvedValue({
      ...baseFund,
      investments: [
        { investorId: "inv-1", commitmentAmount: 500000, fundedAmount: 250000, status: "COMMITTED", investor: { id: "inv-1", entityName: "Entity A", user: { name: "Alice", email: "alice@test.com" } } },
        { investorId: "inv-2", commitmentAmount: 300000, fundedAmount: 300000, status: "FUNDED", investor: { id: "inv-2", entityName: null, user: { name: "Bob", email: "bob@test.com" } } },
      ],
      capitalCalls: [
        { amount: 400000, responses: [] },
      ],
      distributions: [
        { totalAmount: 50000 },
      ],
    });

    (prisma.manualInvestment.findMany as jest.Mock).mockResolvedValue([
      { id: "mi-1", investorId: "inv-3", commitmentAmount: 200000, fundedAmount: 100000, documentType: "LPA", documentTitle: "Manual LP", signedDate: null, status: "ACTIVE" },
    ]);

    (prisma.transaction.findMany as jest.Mock).mockResolvedValue([
      { type: "CAPITAL_CALL", status: "COMPLETED", amount: 400000 },
      { type: "DISTRIBUTION", status: "COMPLETED", amount: 50000 },
      { type: "CAPITAL_CALL", status: "PENDING", amount: 100000 },
    ]);

    const [req, ctx] = makeRequest();
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    const data = await res.json();

    // Platform: 500k + 300k = 800k; Manual: 200k; Total: 1M
    expect(data.aggregates.totalCommitments).toBe("1000000.00");
    expect(data.aggregates.platformCommitments).toBe("800000.00");
    expect(data.aggregates.manualCommitments).toBe("200000.00");

    // Platform: 250k + 300k = 550k; Manual: 100k; Total: 650k
    expect(data.aggregates.totalFunded).toBe("650000.00");

    // Capital calls: 400k
    expect(data.aggregates.totalCapitalCalled).toBe("400000.00");

    // Distributions: 50k
    expect(data.aggregates.totalDistributed).toBe("50000.00");

    // Net: 400k inbound - 50k outbound = 350k
    expect(data.aggregates.totalInbound).toBe("400000.00");
    expect(data.aggregates.totalOutbound).toBe("50000.00");
    expect(data.aggregates.netCashFlow).toBe("350000.00");

    // Unique investors: inv-1, inv-2 (platform) + inv-3 (manual) = 3
    expect(data.investorCount).toBe(3);
    expect(data.manualInvestmentCount).toBe(1);

    // Pending transactions
    expect(data.pendingTransactionCount).toBe(1);
  });

  it("only counts COMPLETED transactions for inbound/outbound", async () => {
    (prisma.transaction.findMany as jest.Mock).mockResolvedValue([
      { type: "CAPITAL_CALL", status: "COMPLETED", amount: 100000 },
      { type: "CAPITAL_CALL", status: "PROCESSING", amount: 50000 },
      { type: "CAPITAL_CALL", status: "FAILED", amount: 25000 },
      { type: "CAPITAL_CALL", status: "PENDING", amount: 75000 },
    ]);

    const [req, ctx] = makeRequest();
    const res = await GET(req, ctx);

    const data = await res.json();
    // Only COMPLETED should count
    expect(data.aggregates.totalInbound).toBe("100000.00");
    // PROCESSING and PENDING are pending
    expect(data.pendingTransactionCount).toBe(2);
  });

  it("deduplicates investor count across platform and manual", async () => {
    (prisma.fund.findFirst as jest.Mock).mockResolvedValue({
      ...baseFund,
      investments: [
        { investorId: "inv-shared", commitmentAmount: 100000, fundedAmount: 50000, status: "COMMITTED", investor: { id: "inv-shared", entityName: null, user: { name: "Shared", email: "s@t.com" } } },
      ],
      capitalCalls: [],
      distributions: [],
    });
    (prisma.manualInvestment.findMany as jest.Mock).mockResolvedValue([
      { id: "mi-1", investorId: "inv-shared", commitmentAmount: 50000, fundedAmount: 25000, status: "ACTIVE" },
    ]);

    const [req, ctx] = makeRequest();
    const res = await GET(req, ctx);

    const data = await res.json();
    // Same investorId appears in both — should count as 1
    expect(data.investorCount).toBe(1);
    expect(data.aggregates.totalCommitments).toBe("150000.00");
  });

  it("uses entityName over user name when present in investor response", async () => {
    (prisma.fund.findFirst as jest.Mock).mockResolvedValue({
      ...baseFund,
      investments: [
        {
          investorId: "inv-1",
          commitmentAmount: 100000,
          fundedAmount: 50000,
          status: "COMMITTED",
          investor: { id: "inv-1", entityName: "My LLC", user: { name: "John Doe", email: "john@test.com" } },
        },
      ],
      capitalCalls: [],
      distributions: [],
    });

    const [req, ctx] = makeRequest();
    const res = await GET(req, ctx);

    const data = await res.json();
    expect(data.investors[0].name).toBe("My LLC");
    expect(data.investors[0].email).toBe("john@test.com");
  });

  it("falls back to user.name when entityName is null", async () => {
    (prisma.fund.findFirst as jest.Mock).mockResolvedValue({
      ...baseFund,
      investments: [
        {
          investorId: "inv-1",
          commitmentAmount: 100000,
          fundedAmount: 0,
          status: "COMMITTED",
          investor: { id: "inv-1", entityName: null, user: { name: "Jane Smith", email: "jane@test.com" } },
        },
      ],
      capitalCalls: [],
      distributions: [],
    });

    const [req, ctx] = makeRequest();
    const res = await GET(req, ctx);

    const data = await res.json();
    expect(data.investors[0].name).toBe("Jane Smith");
  });

  it("formats all currency values with 2 decimal places", async () => {
    (prisma.fund.findFirst as jest.Mock).mockResolvedValue({
      ...baseFund,
      investments: [
        { investorId: "inv-1", commitmentAmount: 99999.999, fundedAmount: 33333.333, status: "COMMITTED", investor: { id: "inv-1", entityName: null, user: { name: "A", email: "a@t.com" } } },
      ],
      capitalCalls: [],
      distributions: [],
    });

    const [req, ctx] = makeRequest();
    const res = await GET(req, ctx);

    const data = await res.json();
    expect(data.aggregates.totalCommitments).toMatch(/^\d+\.\d{2}$/);
    expect(data.aggregates.totalFunded).toMatch(/^\d+\.\d{2}$/);
  });

  it("handles DB error gracefully", async () => {
    (prisma.fund.findFirst as jest.Mock).mockRejectedValue(new Error("Connection timeout"));

    const [req, ctx] = makeRequest();
    const res = await GET(req, ctx);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Internal server error");
    expect(mockReportError).toHaveBeenCalled();
  });
});
