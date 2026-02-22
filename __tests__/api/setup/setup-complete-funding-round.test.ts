// @ts-nocheck
/**
 * Setup Complete — FundingRound Creation Tests
 *
 * Tests for:
 *   POST /api/setup/complete
 *
 * Validates: FundingRound is created for STARTUP mode,
 * not created for GP_FUND or DATAROOM_ONLY modes,
 * correct fields (roundName, instrumentType, valuationCap, etc.).
 */

import { NextRequest } from "next/server";

const mockRequireAuthAppRouter = jest.fn();
const mockLogAuditEvent = jest.fn().mockResolvedValue(undefined);
const mockPublishServerEvent = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/auth/rbac", () => ({
  requireAuthAppRouter: (...args: any[]) => mockRequireAuthAppRouter(...args),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: (...args: any[]) => mockLogAuditEvent(...args),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/tracking/server-events", () => ({
  publishServerEvent: (...args: any[]) => mockPublishServerEvent(...args),
}));

jest.mock("@/lib/crypto/secure-storage", () => ({
  encryptTaxId: jest.fn((val: string) => `encrypted_${val}`),
}));

import { POST } from "@/app/api/setup/complete/route";
import prisma from "@/lib/prisma";

// --- Helpers ---

const USER_ID = "user-gp-001";

/**
 * Create a mock $transaction that provides a tx proxy with jest.fn()
 * methods for all models used in setup/complete.
 */
function setupTransactionMock() {
  const txFundingRound = {
    create: jest.fn().mockResolvedValue({ id: "round-new" }),
  };

  const mockFund = {
    id: "fund-new-001",
    name: "Test Startup Raise",
    teamId: "team-new-001",
    entityMode: "STARTUP",
  };

  const tx = {
    organization: {
      create: jest.fn().mockResolvedValue({ id: "org-new-001", name: "Test Org" }),
    },
    organizationDefaults: {
      create: jest.fn().mockResolvedValue({}),
    },
    team: {
      create: jest.fn().mockResolvedValue({ id: "team-new-001", name: "Test Org" }),
    },
    userTeam: {
      create: jest.fn().mockResolvedValue({}),
    },
    fund: {
      create: jest.fn().mockResolvedValue(mockFund),
      update: jest.fn().mockResolvedValue(mockFund),
    },
    fundAggregate: {
      create: jest.fn().mockResolvedValue({}),
    },
    fundingRound: txFundingRound,
    dataroom: {
      create: jest.fn().mockResolvedValue({ id: "dr-new-001", name: "Test Dataroom" }),
    },
    fundroomActivation: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  (prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
    const result = await callback(tx);
    return result;
  });

  return { tx, txFundingRound };
}

function mockAuth() {
  mockRequireAuthAppRouter.mockResolvedValue({
    userId: USER_ID,
    email: "gp@test.com",
    teamId: "",
    role: "MEMBER",
    session: { user: { id: USER_ID, email: "gp@test.com" } },
  });
}

function mockAuthFail() {
  const { NextResponse } = require("next/server");
  mockRequireAuthAppRouter.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    new URL("http://localhost:3000/api/setup/complete"),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

// --- Tests ---

describe("Setup Complete — FundingRound Creation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuthFail();
    const req = makeReq({ companyName: "Test", raiseMode: "STARTUP" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates FundingRound for STARTUP mode", async () => {
    mockAuth();
    const { tx, txFundingRound } = setupTransactionMock();

    const req = makeReq({
      companyName: "Acme Startup",
      raiseMode: "STARTUP",
      roundName: "Pre-Seed Round",
      instrumentType: "SAFE",
      targetRaise: 1500000,
      valCap: "10000000",
      discount: "20",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.fundId).toBeDefined();

    // Verify fundingRound.create was called
    expect(txFundingRound.create).toHaveBeenCalledTimes(1);
    const createCall = txFundingRound.create.mock.calls[0][0];
    expect(createCall.data.fundId).toBe("fund-new-001");
    expect(createCall.data.roundOrder).toBe(1);
    expect(createCall.data.amountRaised).toBe(0);
    expect(createCall.data.status).toBe("ACTIVE");
    expect(createCall.data.instrumentType).toBe("SAFE");
    expect(createCall.data.valuationCap).toBe(10000000);
    expect(createCall.data.discount).toBe(20);
  });

  it("uses roundName from request for STARTUP mode", async () => {
    mockAuth();
    const { txFundingRound } = setupTransactionMock();

    const req = makeReq({
      companyName: "Acme Startup",
      raiseMode: "STARTUP",
      roundName: "Series A",
      instrumentType: "PRICED_ROUND",
      targetRaise: 5000000,
      preMoneyVal: "20000000",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(txFundingRound.create).toHaveBeenCalledTimes(1);
    const createCall = txFundingRound.create.mock.calls[0][0];
    // roundName should be truthy (from data.roundName)
    expect(createCall.data.roundName).toBeTruthy();
    expect(createCall.data.preMoneyVal).toBe(20000000);
  });

  it("sets targetAmount from targetRaise for STARTUP mode", async () => {
    mockAuth();
    const { txFundingRound } = setupTransactionMock();

    const req = makeReq({
      companyName: "Acme",
      raiseMode: "STARTUP",
      targetRaise: 2000000,
      instrumentType: "CONVERTIBLE_NOTE",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(txFundingRound.create).toHaveBeenCalledTimes(1);
    const createCall = txFundingRound.create.mock.calls[0][0];
    expect(createCall.data.targetAmount).toBe(2000000);
    expect(createCall.data.instrumentType).toBe("CONVERTIBLE_NOTE");
  });

  it("does NOT create FundingRound for GP_FUND mode", async () => {
    mockAuth();
    const { txFundingRound } = setupTransactionMock();

    const req = makeReq({
      companyName: "Acme Capital",
      raiseMode: "GP_FUND",
      fundName: "Acme Fund I",
      targetRaise: 50000000,
      fundStrategy: "VENTURE_CAPITAL",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    // FundingRound should NOT be created for GP_FUND
    expect(txFundingRound.create).not.toHaveBeenCalled();
  });

  it("does NOT create FundingRound for DATAROOM_ONLY mode", async () => {
    mockAuth();
    const { tx, txFundingRound } = setupTransactionMock();

    const req = makeReq({
      companyName: "DataRoom Co",
      raiseMode: "DATAROOM_ONLY",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    // Neither fund nor FundingRound should be created
    expect(tx.fund.create).not.toHaveBeenCalled();
    expect(txFundingRound.create).not.toHaveBeenCalled();
  });

  it("sets orgId on FundingRound for STARTUP mode", async () => {
    mockAuth();
    const { txFundingRound } = setupTransactionMock();

    const req = makeReq({
      companyName: "OrgId Test",
      raiseMode: "STARTUP",
      instrumentType: "SAFE",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(txFundingRound.create).toHaveBeenCalledTimes(1);
    const createCall = txFundingRound.create.mock.calls[0][0];
    // orgId is generated inside the route handler — just check it's a string
    expect(typeof createCall.data.orgId).toBe("string");
    expect(createCall.data.orgId).toContain("org_");
  });

  it("sets investorCount to 0 and amountRaised to 0 for new round", async () => {
    mockAuth();
    const { txFundingRound } = setupTransactionMock();

    const req = makeReq({
      companyName: "Fresh Start",
      raiseMode: "STARTUP",
      instrumentType: "SAFE",
      targetRaise: 1000000,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const createCall = txFundingRound.create.mock.calls[0][0];
    expect(createCall.data.investorCount).toBe(0);
    expect(createCall.data.amountRaised).toBe(0);
    expect(createCall.data.leadInvestor).toBeNull();
    expect(createCall.data.postMoneyVal).toBeNull();
  });

  it("fires FUND_CREATED audit event for STARTUP mode", async () => {
    mockAuth();
    setupTransactionMock();

    const req = makeReq({
      companyName: "Audit Test",
      raiseMode: "STARTUP",
      instrumentType: "SAFE",
      targetRaise: 1000000,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    // Should have at least: org created + fund created audit events
    const fundCreatedCall = mockLogAuditEvent.mock.calls.find(
      (call: any[]) => call[0]?.eventType === "FUND_CREATED",
    );
    expect(fundCreatedCall).toBeDefined();
    expect(fundCreatedCall[0].metadata.instrumentType).toBe("SAFE");
  });

  it("fires funnel_org_setup_completed server event", async () => {
    mockAuth();
    setupTransactionMock();

    const req = makeReq({
      companyName: "Event Test",
      raiseMode: "STARTUP",
      instrumentType: "SAFE",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockPublishServerEvent).toHaveBeenCalledWith(
      "funnel_org_setup_completed",
      expect.objectContaining({
        userId: USER_ID,
        method: "STARTUP",
      }),
    );
  });

  it("returns fundId, orgId, teamId, dataroomId for STARTUP mode", async () => {
    mockAuth();
    setupTransactionMock();

    const req = makeReq({
      companyName: "Response Shape",
      raiseMode: "STARTUP",
      instrumentType: "SAFE",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.fundId).toBe("fund-new-001");
    expect(body.orgId).toContain("org_");
    expect(body.teamId).toContain("team_");
    expect(body.dataroomId).toBe("dr-new-001");
    expect(body.redirectUrl).toBe("/admin/dashboard");
  });
});
