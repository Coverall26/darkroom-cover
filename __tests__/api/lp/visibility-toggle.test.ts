"use strict";

/**
 * Tests for P1-B: LP Visibility Toggle DOM Verification
 * - fund-context API returns lpVisibility flags
 * - fund-details API filters data based on visibility flags
 * - Hidden sections return empty arrays (not just hidden via CSS)
 */

// ── Mock setup ──────────────────────────────────────────────────────────────
const mockPrisma = {
  fund: { findUnique: jest.fn() },
  team: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: mockPrisma,
}));

const mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));
jest.mock("next-auth/next", () => ({
  getServerSession: mockGetServerSession,
}));

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

jest.mock("@/lib/auth/rbac", () => ({
  requireLPAuthAppRouter: jest.fn().mockResolvedValue({
    userId: "u1",
    email: "lp@test.com",
    investorId: "inv1",
    session: { user: { id: "u1", email: "lp@test.com" } },
  }),
  enforceRBAC: jest.fn(),
  requireAdmin: jest.fn(),
  enforceRBACAppRouter: jest.fn(),
  requireAdminAppRouter: jest.fn(),
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  apiRateLimiter: jest.fn().mockResolvedValue(true),
  appRouterRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/auth/paywall", () => ({
  requireFundroomActive: jest.fn().mockResolvedValue(true),
}));

jest.mock("@/lib/files/get-file", () => ({
  getFile: jest.fn().mockResolvedValue("https://example.com/signed.pdf"),
}));

jest.mock("@/lib/types", () => ({}));

// ── Helper: create mock req/res ─────────────────────────────────────────────
function createMockReqRes(method = "GET", query: Record<string, string> = {}) {
  const req = {
    method,
    query,
    headers: {
      "user-agent": "Mozilla/5.0",
      "x-forwarded-for": "192.168.1.100",
    },
    socket: { remoteAddress: "127.0.0.1" },
  } as any;

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  } as any;

  return { req, res };
}

// ── Fund Context API: lpVisibility Tests ────────────────────────────────────
describe("Fund Context API - lpVisibility flags", () => {
  let handler: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import("@/app/api/lp/fund-context/route");
    const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
    handler = wrapAppRouteHandler(mod);
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("returns lpVisibility with all flags true when featureFlags is empty", async () => {
    (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
      id: "fund1",
      name: "Test Fund",
      minimumInvestment: null,
      flatModeEnabled: false,
      stagedCommitmentsEnabled: false,
      targetRaise: null,
      regulationDExemption: null,
      featureFlags: {},
      team: {
        id: "team1",
        name: "Test Team",
        organization: { name: "Test Org" },
      },
    });

    const { req, res } = createMockReqRes("GET", { fundId: "fund1" });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.lpVisibility).toBeDefined();
    expect(data.lpVisibility.showCapitalCalls).toBe(true);
    expect(data.lpVisibility.showDistributions).toBe(true);
    expect(data.lpVisibility.showNAV).toBe(true);
    expect(data.lpVisibility.showDocuments).toBe(true);
    expect(data.lpVisibility.showTransactions).toBe(true);
    expect(data.lpVisibility.showReports).toBe(true);
  });

  it("returns lpVisibility with specific flags set to false", async () => {
    (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
      id: "fund1",
      name: "Test Fund",
      minimumInvestment: null,
      flatModeEnabled: false,
      stagedCommitmentsEnabled: false,
      targetRaise: null,
      regulationDExemption: null,
      featureFlags: {
        showCapitalCalls: false,
        showDistributions: false,
        showReports: false,
      },
      team: {
        id: "team1",
        name: "Test Team",
        organization: { name: "Test Org" },
      },
    });

    const { req, res } = createMockReqRes("GET", { fundId: "fund1" });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.lpVisibility.showCapitalCalls).toBe(false);
    expect(data.lpVisibility.showDistributions).toBe(false);
    expect(data.lpVisibility.showReports).toBe(false);
    // These should still be true (not explicitly set to false)
    expect(data.lpVisibility.showNAV).toBe(true);
    expect(data.lpVisibility.showDocuments).toBe(true);
    expect(data.lpVisibility.showTransactions).toBe(true);
  });

  it("returns lpVisibility via team-based lookup", async () => {
    (mockPrisma.team.findUnique as jest.Mock).mockResolvedValue({
      id: "team1",
      name: "Test Team",
      organization: { name: "Test Org" },
      funds: [
        {
          id: "fund1",
          name: "Test Fund",
          minimumInvestment: null,
          flatModeEnabled: false,
          stagedCommitmentsEnabled: false,
          targetRaise: null,
          regulationDExemption: null,
          featureFlags: { showDocuments: false, showTransactions: false },
        },
      ],
    });

    const { req, res } = createMockReqRes("GET", { teamId: "team1" });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.lpVisibility.showDocuments).toBe(false);
    expect(data.lpVisibility.showTransactions).toBe(false);
    expect(data.lpVisibility.showCapitalCalls).toBe(true);
  });

  it("returns all flags true when featureFlags is null", async () => {
    (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
      id: "fund1",
      name: "Test Fund",
      minimumInvestment: null,
      flatModeEnabled: false,
      stagedCommitmentsEnabled: false,
      targetRaise: null,
      regulationDExemption: null,
      featureFlags: null,
      team: {
        id: "team1",
        name: "Test Team",
        organization: { name: "Test Org" },
      },
    });

    const { req, res } = createMockReqRes("GET", { fundId: "fund1" });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.lpVisibility.showCapitalCalls).toBe(true);
    expect(data.lpVisibility.showDistributions).toBe(true);
    expect(data.lpVisibility.showNAV).toBe(true);
    expect(data.lpVisibility.showDocuments).toBe(true);
    expect(data.lpVisibility.showTransactions).toBe(true);
    expect(data.lpVisibility.showReports).toBe(true);
  });
});

// ── Fund Details API: Data Filtering Tests ──────────────────────────────────
describe("Fund Details API - visibility-based data filtering", () => {
  let handler: any;

  const baseFund = {
    id: "fund1",
    name: "Test Fund",
    description: "Test",
    status: "RAISING",
    style: "GP_FUND",
    managementFeePct: { toString: () => "0.02" },
    carryPct: { toString: () => "0.20" },
    hurdleRate: { toString: () => "0.08" },
    waterfallType: "EUROPEAN",
    termYears: 10,
    extensionYears: 2,
    targetRaise: { toString: () => "10000000" },
    currentRaise: { toString: () => "5000000" },
    teamId: "team1",
    aggregate: {
      totalCommitted: { toString: () => "5000000" },
      initialThresholdAmount: { toString: () => "3000000" },
      initialThresholdMet: true,
    },
    distributions: [
      {
        id: "dist1",
        distributionNumber: 1,
        totalAmount: { toString: () => "50000" },
        distributionType: "RETURN_OF_CAPITAL",
        distributionDate: new Date("2026-01-15"),
        status: "COMPLETED",
      },
    ],
    capitalCalls: [
      {
        id: "cc1",
        callNumber: 1,
        amount: { toString: () => "100000" },
        purpose: "Initial draw",
        dueDate: new Date("2026-03-01"),
        status: "PENDING",
      },
    ],
    reports: [
      {
        id: "rpt1",
        reportType: "K1",
        reportPeriod: "2025",
        title: "2025 K-1",
        fileUrl: "https://example.com/k1.pdf",
        createdAt: new Date("2026-02-01"),
      },
    ],
  };

  const baseInvestment = {
    id: "inv1",
    commitmentAmount: { toString: () => "500000" },
    fundedAmount: { toString: () => "250000" },
    status: "COMMITTED",
    subscriptionDate: new Date("2026-01-10"),
    fund: baseFund,
  };

  function buildMockUser(featureFlags: Record<string, boolean> | null) {
    return {
      investorProfile: {
        investments: [
          {
            ...baseInvestment,
            fund: {
              ...baseFund,
              featureFlags: featureFlags,
            },
          },
        ],
        capitalCalls: [
          {
            id: "ccr1",
            status: "PENDING",
            amountDue: { toString: () => "100000" },
            amountPaid: { toString: () => "0" },
            capitalCall: {
              callNumber: 1,
              dueDate: new Date("2026-03-01"),
              fund: { id: "fund1", name: "Test Fund" },
            },
            createdAt: new Date(),
          },
        ],
        transactions: [
          {
            id: "tx1",
            type: "CAPITAL_CALL",
            amount: { toString: () => "100000" },
            status: "COMPLETED",
            description: "Capital call payment",
            initiatedAt: new Date("2026-02-01"),
            completedAt: new Date("2026-02-02"),
          },
          {
            id: "tx2",
            type: "DISTRIBUTION",
            amount: { toString: () => "50000" },
            status: "COMPLETED",
            description: "Q4 distribution",
            initiatedAt: new Date("2026-01-15"),
            completedAt: new Date("2026-01-16"),
          },
        ],
        documents: [
          {
            id: "doc1",
            title: "Subscription Agreement",
            documentType: "SUBSCRIPTION_AGREEMENT",
            storageKey: "s3://docs/sub-ag.pdf",
            storageType: "S3",
            signedAt: new Date("2026-01-10"),
            createdAt: new Date("2026-01-10"),
          },
        ],
        notes: [
          {
            id: "note1",
            content: "Hello",
            isFromInvestor: true,
            team: { name: "GP Team" },
            createdAt: new Date("2026-02-10"),
          },
        ],
      },
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import("@/app/api/lp/fund-details/route");
    const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
    handler = wrapAppRouteHandler(mod);
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("returns all data when all visibility flags are true", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: "lp@test.com" },
    });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(
      buildMockUser({ showCapitalCalls: true, showDistributions: true, showDocuments: true, showTransactions: true, showReports: true })
    );

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];

    // All data should be present
    expect(data.funds[0].recentCapitalCalls.length).toBe(1);
    expect(data.funds[0].recentDistributions.length).toBe(1);
    expect(data.funds[0].reports.length).toBe(1);
    expect(data.pendingCapitalCalls.length).toBe(1);
    expect(data.recentTransactions.length).toBe(2);
    expect(data.documents.length).toBe(1);
    expect(data.lpVisibility.showCapitalCalls).toBe(true);
    expect(data.lpVisibility.showDistributions).toBe(true);
  });

  it("returns empty arrays when capital calls are hidden", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: "lp@test.com" },
    });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(
      buildMockUser({ showCapitalCalls: false })
    );

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];

    // Capital calls should be empty arrays
    expect(data.funds[0].recentCapitalCalls).toEqual([]);
    expect(data.pendingCapitalCalls).toEqual([]);
    expect(data.lpVisibility.showCapitalCalls).toBe(false);
    // Other data should still be present
    expect(data.funds[0].recentDistributions.length).toBe(1);
    expect(data.recentTransactions.length).toBe(2);
  });

  it("returns empty arrays when distributions are hidden", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: "lp@test.com" },
    });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(
      buildMockUser({ showDistributions: false })
    );

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];

    expect(data.funds[0].recentDistributions).toEqual([]);
    expect(data.summary.totalDistributions).toBe(0);
    expect(data.lpVisibility.showDistributions).toBe(false);
  });

  it("returns empty arrays when documents are hidden", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: "lp@test.com" },
    });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(
      buildMockUser({ showDocuments: false })
    );

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];

    expect(data.documents).toEqual([]);
    expect(data.lpVisibility.showDocuments).toBe(false);
  });

  it("returns empty arrays when transactions are hidden", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: "lp@test.com" },
    });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(
      buildMockUser({ showTransactions: false })
    );

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];

    expect(data.recentTransactions).toEqual([]);
    expect(data.lpVisibility.showTransactions).toBe(false);
  });

  it("returns empty reports when reports are hidden", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: "lp@test.com" },
    });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(
      buildMockUser({ showReports: false })
    );

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];

    expect(data.funds[0].reports).toEqual([]);
    expect(data.lpVisibility.showReports).toBe(false);
  });

  it("defaults all flags to true when featureFlags is null", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: "lp@test.com" },
    });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(
      buildMockUser(null)
    );

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];

    // Everything should be visible by default
    expect(data.lpVisibility.showCapitalCalls).toBe(true);
    expect(data.lpVisibility.showDistributions).toBe(true);
    expect(data.lpVisibility.showNAV).toBe(true);
    expect(data.lpVisibility.showDocuments).toBe(true);
    expect(data.lpVisibility.showTransactions).toBe(true);
    expect(data.lpVisibility.showReports).toBe(true);
    expect(data.funds[0].recentCapitalCalls.length).toBe(1);
    expect(data.funds[0].recentDistributions.length).toBe(1);
    expect(data.recentTransactions.length).toBe(2);
    expect(data.documents.length).toBe(1);
  });

  it("hides multiple sections simultaneously", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { email: "lp@test.com" },
    });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(
      buildMockUser({
        showCapitalCalls: false,
        showDistributions: false,
        showDocuments: false,
        showTransactions: false,
        showReports: false,
      })
    );

    const { req, res } = createMockReqRes("GET");
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];

    // All toggleable sections should return empty
    expect(data.funds[0].recentCapitalCalls).toEqual([]);
    expect(data.funds[0].recentDistributions).toEqual([]);
    expect(data.funds[0].reports).toEqual([]);
    expect(data.pendingCapitalCalls).toEqual([]);
    expect(data.recentTransactions).toEqual([]);
    expect(data.documents).toEqual([]);
    expect(data.summary.totalDistributions).toBe(0);

    // Fund identity and investment data should always be present
    expect(data.funds[0].id).toBe("fund1");
    expect(data.funds[0].name).toBe("Test Fund");
    expect(data.funds[0].investment.commitmentAmount).toBe(500000);
    expect(data.summary.totalCommitment).toBe(500000);
    expect(data.summary.totalFunded).toBe(250000);
  });
});
