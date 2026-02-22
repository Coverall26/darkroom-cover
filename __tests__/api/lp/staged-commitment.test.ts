/**
 * Tests for GET/POST /api/lp/staged-commitment
 *
 * Tranche persistence: creates InvestmentTranche records atomically,
 * validates dates and amounts, enforces fund settings and NDA/accreditation.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { GET, POST } from "@/app/api/lp/staged-commitment/route";
import { wrapAppRouteHandler } from "@/__tests__/helpers/app-router-adapter";

const handler = wrapAppRouteHandler({ GET, POST });

jest.mock("@/lib/audit/audit-logger", () => ({
  logSubscriptionEvent: jest.fn().mockResolvedValue(undefined),
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/auth/paywall", () => ({
  requireFundroomActive: jest.fn().mockResolvedValue(true),
  requireFundroomActiveByFund: jest.fn().mockResolvedValue(true),
  PAYWALL_ERROR: { error: "This feature requires a FundRoom subscription." },
}));

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

const mockRequireLPAuthAppRouter = jest.fn();
jest.mock("@/lib/auth/rbac", () => ({
  requireLPAuthAppRouter: (...args: any[]) => mockRequireLPAuthAppRouter(...args),
  enforceRBAC: jest.fn(),
  requireAdmin: jest.fn(),
  enforceRBACAppRouter: jest.fn(),
  requireAdminAppRouter: jest.fn(),
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  appRouterRateLimit: jest.fn().mockResolvedValue(null),
  apiRateLimiter: jest.fn().mockResolvedValue(undefined),
  strictRateLimiter: jest.fn().mockResolvedValue(undefined),
}));

const mockSession = {
  user: { id: "lp-1", email: "lp@example.com", name: "LP User" },
  expires: "2099-01-01",
};

const mockInvestorWithFund = {
  id: "inv-1",
  userId: "lp-1",
  ndaSigned: true,
  accreditationStatus: "SELF_CERTIFIED",
  fund: {
    id: "fund-1",
    name: "Test Fund I",
    teamId: "team-1",
    minimumInvestment: { toString: () => "25000" },
  },
  investments: [],
};

const futureDate = (daysFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
};

function createPostReq(body: Record<string, unknown> = {}) {
  return createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    body: {
      totalCommitment: 100000,
      confirmTerms: true,
      schedule: "QUARTERLY",
      tranches: [
        {
          amount: 50000,
          scheduledDate: futureDate(30),
          label: "Tranche 1",
        },
        {
          amount: 50000,
          scheduledDate: futureDate(120),
          label: "Tranche 2",
        },
      ],
      ...body,
    },
    headers: {
      "x-forwarded-for": "1.2.3.4",
    },
  });
}

function createGetReq() {
  return createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
  });
}

describe("POST /api/lp/staged-commitment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);

    // Delegate rbac to existing mockGetServerSession
    mockRequireLPAuthAppRouter.mockImplementation(async () => {
      const session = await (getServerSession as jest.Mock)();
      if (!session?.user?.email && !session?.user?.id) {
        const { NextResponse } = require("next/server");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return {
        userId: session.user.id || "lp-1",
        email: session.user.email || "",
        investorId: "",
        teamId: "",
        role: "MEMBER",
        session: { user: session.user },
      };
    });

    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "lp-1",
      email: "lp@example.com",
      investorProfile: mockInvestorWithFund,
    });
    (prisma.$queryRaw as jest.Mock || prisma.$queryRaw)?.mockResolvedValue?.([{ stagedCommitmentsEnabled: true }]);

    // Mock $queryRaw for fund settings check
    if (!prisma.$queryRaw) {
      prisma.$queryRaw = jest.fn().mockResolvedValue([{ stagedCommitmentsEnabled: true }]);
    } else {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ stagedCommitmentsEnabled: true }]);
    }

    // Set up $transaction mock
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const mockInvestment = {
        id: "invest-1",
        commitmentAmount: 100000,
        fundedAmount: 0,
        status: "COMMITTED",
        isStaged: true,
      };

      let trancheCounter = 0;
      const tx = {
        investment: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue(mockInvestment),
          update: jest.fn().mockResolvedValue(mockInvestment),
          aggregate: jest.fn().mockResolvedValue({
            _sum: { commitmentAmount: 100000 },
          }),
        },
        investmentTranche: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockImplementation((args) => {
            trancheCounter++;
            return Promise.resolve({
              id: `tr-${trancheCounter}`,
              trancheNumber: args.data?.trancheNumber ?? trancheCounter,
              label: args.data?.label ?? `Tranche ${trancheCounter}`,
              amount: args.data?.amount ?? 50000,
              fundedAmount: 0,
              scheduledDate: args.data?.scheduledDate ?? new Date(),
              status: args.data?.status ?? (trancheCounter === 1 ? "PENDING" : "SCHEDULED"),
            });
          }),
        },
        investor: {
          update: jest.fn().mockResolvedValue({}),
        },
        fundAggregate: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      };
      return callback(tx);
    });
  });

  // --- Method enforcement ---
  it("rejects unsupported methods with 405", async () => {
    for (const method of ["PUT", "DELETE", "PATCH"]) {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: method as any,
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(405);
    }
  });

  // --- Authentication ---
  it("returns 401 when not authenticated", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const { req, res } = createPostReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  // --- Input validation ---
  it("returns 400 when totalCommitment is missing", async () => {
    const { req, res } = createPostReq({ totalCommitment: undefined });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 when tranches is missing", async () => {
    const { req, res } = createPostReq({ tranches: undefined });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 when totalCommitment is zero", async () => {
    const { req, res } = createPostReq({ totalCommitment: 0 });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 when totalCommitment is negative", async () => {
    const { req, res } = createPostReq({ totalCommitment: -50000 });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 when totalCommitment exceeds $100B", async () => {
    const { req, res } = createPostReq({ totalCommitment: 100_000_000_001 });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("$100B");
  });

  it("returns 400 when confirmTerms is false", async () => {
    const { req, res } = createPostReq({ confirmTerms: false });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("confirm");
  });

  // --- Tranche count validation ---
  it("returns 400 when fewer than 2 tranches", async () => {
    const { req, res } = createPostReq({
      totalCommitment: 50000,
      tranches: [
        { amount: 50000, scheduledDate: futureDate(30), label: "Single" },
      ],
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("2 and 12");
  });

  it("returns 400 when more than 12 tranches", async () => {
    const tranches = Array.from({ length: 13 }, (_, i) => ({
      amount: 10000 / 13,
      scheduledDate: futureDate(30 * (i + 1)),
      label: `Tranche ${i + 1}`,
    }));
    const { req, res } = createPostReq({
      totalCommitment: 10000,
      tranches,
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  // --- Tranche sum validation ---
  it("returns 400 when tranche amounts do not sum to total commitment", async () => {
    const { req, res } = createPostReq({
      totalCommitment: 100000,
      tranches: [
        { amount: 40000, scheduledDate: futureDate(30), label: "T1" },
        { amount: 40000, scheduledDate: futureDate(120), label: "T2" },
      ],
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("equal total");
  });

  it("allows small float rounding differences (within 0.01)", async () => {
    // 33333.33 + 33333.33 + 33333.34 = 100000.00
    const { req, res } = createPostReq({
      totalCommitment: 100000,
      tranches: [
        { amount: 33333.33, scheduledDate: futureDate(30), label: "T1" },
        { amount: 33333.33, scheduledDate: futureDate(90), label: "T2" },
        { amount: 33333.34, scheduledDate: futureDate(150), label: "T3" },
      ],
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(201);
  });

  // --- Investor profile checks ---
  it("returns 404 when investor profile not found", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "lp-1",
      investorProfile: null,
    });
    const { req, res } = createPostReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 403 when NDA not signed", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "lp-1",
      investorProfile: { ...mockInvestorWithFund, ndaSigned: false },
    });
    const { req, res } = createPostReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain("NDA");
  });

  it("returns 403 when accreditation is not SELF_CERTIFIED or KYC_VERIFIED", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "lp-1",
      investorProfile: {
        ...mockInvestorWithFund,
        accreditationStatus: "NOT_STARTED",
      },
    });
    const { req, res } = createPostReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain("Accreditation");
  });

  it("allows KYC_VERIFIED accreditation", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "lp-1",
      investorProfile: {
        ...mockInvestorWithFund,
        accreditationStatus: "KYC_VERIFIED",
      },
    });
    const { req, res } = createPostReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(201);
  });

  it("returns 400 when no fund associated", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "lp-1",
      investorProfile: { ...mockInvestorWithFund, fund: null },
    });
    const { req, res } = createPostReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("No fund");
  });

  // --- Fund settings ---
  it("returns 400 when staged commitments not enabled for fund", async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { stagedCommitmentsEnabled: false },
    ]);
    const { req, res } = createPostReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("not enabled");
  });

  // --- Minimum investment ---
  it("returns 400 when commitment is below fund minimum", async () => {
    const { req, res } = createPostReq({
      totalCommitment: 10000,
      tranches: [
        { amount: 5000, scheduledDate: futureDate(30), label: "T1" },
        { amount: 5000, scheduledDate: futureDate(120), label: "T2" },
      ],
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("Minimum");
  });

  // --- Tranche date validation ---
  it("returns 400 for invalid tranche date", async () => {
    const { req, res } = createPostReq({
      tranches: [
        { amount: 50000, scheduledDate: "invalid-date", label: "T1" },
        { amount: 50000, scheduledDate: futureDate(120), label: "T2" },
      ],
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("Invalid date");
  });

  it("returns 400 when tranche date exceeds 10 years", async () => {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 11);
    const { req, res } = createPostReq({
      tranches: [
        { amount: 50000, scheduledDate: futureDate(30), label: "T1" },
        {
          amount: 50000,
          scheduledDate: farFuture.toISOString().split("T")[0],
          label: "T2",
        },
      ],
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("10 years");
  });

  it("returns 400 when tranche dates are not in chronological order", async () => {
    const { req, res } = createPostReq({
      tranches: [
        { amount: 50000, scheduledDate: futureDate(120), label: "T1" },
        { amount: 50000, scheduledDate: futureDate(30), label: "T2" },
      ],
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("chronological");
  });

  // --- Successful creation ---
  it("creates staged commitment with correct response structure", async () => {
    const { req, res } = createPostReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(201);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.investment).toBeDefined();
    expect(data.investment.isStaged).toBe(true);
    expect(data.investment.status).toBe("COMMITTED");
    expect(data.investment.trancheCount).toBe(2);
    expect(data.investment.tranches).toHaveLength(2);
  });

  it("performs atomic creation via $transaction", async () => {
    const { req, res } = createPostReq();
    await handler(req, res);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("sets first tranche as PENDING and subsequent as SCHEDULED", async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const createCalls: any[] = [];
      const tx = {
        investment: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: "invest-1",
            commitmentAmount: 100000,
          }),
          aggregate: jest.fn().mockResolvedValue({
            _sum: { commitmentAmount: 100000 },
          }),
        },
        investmentTranche: {
          deleteMany: jest.fn(),
          create: jest.fn().mockImplementation((args) => {
            createCalls.push(args.data);
            return {
              id: `tr-${createCalls.length}`,
              trancheNumber: args.data.trancheNumber,
              label: args.data.label,
              amount: args.data.amount,
              fundedAmount: 0,
              scheduledDate: args.data.scheduledDate,
              status: args.data.status,
            };
          }),
        },
        investor: {
          update: jest.fn().mockResolvedValue({}),
        },
        fundAggregate: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      };
      const result = await callback(tx);
      // Verify first tranche is CALLED, second is SCHEDULED
      expect(createCalls[0].status).toBe("CALLED");
      expect(createCalls[1].status).toBe("SCHEDULED");
      return result;
    });

    const { req, res } = createPostReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(201);
  });

  // --- Restructuring existing commitment ---
  it("deletes old tranches when restructuring an existing commitment", async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        investment: {
          findUnique: jest.fn().mockResolvedValue({
            id: "invest-existing",
            tranches: [{ id: "old-1" }, { id: "old-2" }, { id: "old-3" }],
          }),
          update: jest.fn().mockResolvedValue({
            id: "invest-existing",
            commitmentAmount: 100000,
          }),
          aggregate: jest.fn().mockResolvedValue({
            _sum: { commitmentAmount: 100000 },
          }),
        },
        investmentTranche: {
          deleteMany,
          create: jest.fn().mockResolvedValue({
            id: "tr-new",
            trancheNumber: 1,
            label: "T1",
            amount: 50000,
            fundedAmount: 0,
            scheduledDate: new Date(),
            status: "PENDING",
          }),
        },
        investor: {
          update: jest.fn().mockResolvedValue({}),
        },
        fundAggregate: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      };
      return callback(tx);
    });

    const { req, res } = createPostReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(201);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { investmentId: "invest-existing" },
    });
  });

  // --- Error handling ---
  it("returns 500 on unexpected errors", async () => {
    (prisma.user.findUnique as jest.Mock).mockRejectedValue(
      new Error("DB crash"),
    );
    const { req, res } = createPostReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe("Internal server error");
  });
});

describe("GET /api/lp/staged-commitment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);

    // Delegate rbac to existing mockGetServerSession
    mockRequireLPAuthAppRouter.mockImplementation(async () => {
      const session = await (getServerSession as jest.Mock)();
      if (!session?.user?.email && !session?.user?.id) {
        const { NextResponse } = require("next/server");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return {
        userId: session.user.id || "lp-1",
        email: session.user.email || "",
        investorId: "",
        teamId: "",
        role: "MEMBER",
        session: { user: session.user },
      };
    });

    if (!prisma.$queryRaw) {
      prisma.$queryRaw = jest.fn();
    }
  });

  it("returns 401 when not authenticated", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const { req, res } = createGetReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("returns 404 when investor profile not found", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "lp-1",
      investorProfile: null,
    });
    const { req, res } = createGetReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  it("returns staged commitment data with fund info", async () => {
    const investorWithInvestments = {
      ...mockInvestorWithFund,
      investments: [
        {
          id: "invest-1",
          commitmentAmount: 100000,
          fundedAmount: 50000,
          status: "COMMITTED",
          isStaged: true,
          schedule: "QUARTERLY",
          trancheCount: 2,
        },
      ],
    };

    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "lp-1",
      email: "lp@example.com",
      investorProfile: investorWithInvestments,
    });

    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { stagedCommitmentsEnabled: true },
    ]);

    (prisma.investment.findMany as jest.Mock).mockResolvedValue([
      {
        id: "invest-1",
        commitmentAmount: { toString: () => "100000" },
        fundedAmount: { toString: () => "50000" },
        status: "COMMITTED",
        isStaged: true,
        schedule: "QUARTERLY",
        trancheCount: 2,
        subscriptionDate: new Date(),
        tranches: [
          {
            id: "tr-1",
            trancheNumber: 1,
            label: "Tranche 1",
            amount: { toString: () => "50000" },
            fundedAmount: { toString: () => "50000" },
            scheduledDate: new Date("2026-04-01"),
            status: "FUNDED",
            calledDate: new Date("2026-03-15"),
            fundedDate: new Date("2026-03-20"),
          },
          {
            id: "tr-2",
            trancheNumber: 2,
            label: "Tranche 2",
            amount: { toString: () => "50000" },
            fundedAmount: { toString: () => "0" },
            scheduledDate: new Date("2026-07-01"),
            status: "SCHEDULED",
            calledDate: null,
            fundedDate: null,
          },
        ],
      },
    ]);

    const { req, res } = createGetReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.stagedCommitmentsEnabled).toBe(true);
    expect(data.fundId).toBe("fund-1");
    expect(data.fundName).toBe("Test Fund I");
    expect(data.investments).toHaveLength(1);
    expect(data.investments[0].tranches).toHaveLength(2);
    expect(data.totalCommitted).toBe(100000);
    expect(data.totalFunded).toBe(50000);
  });

  it("returns 500 on unexpected errors", async () => {
    (prisma.user.findUnique as jest.Mock).mockRejectedValue(
      new Error("DB crash"),
    );
    const { req, res } = createGetReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
  });
});
