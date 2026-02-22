// @ts-nocheck
/**
 * Fund Settings API Tests (App Router)
 *
 * Tests for app/api/funds/[fundId]/settings/route.ts
 * Covers: auth, RBAC, GET/PATCH fund settings, rate limiting, audit logging
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

const mockFund = {
  id: "fund-1",
  name: "Test Fund I",
  teamId: "team-1",
  ndaGateEnabled: false,
  capitalCallThresholdEnabled: false,
  capitalCallThreshold: null,
  callFrequency: "AS_NEEDED",
  stagedCommitmentsEnabled: false,
  minimumInvestment: null,
  managementFeePct: null,
  carryPct: null,
  hurdleRate: null,
  waterfallType: null,
  currency: "USD",
  termYears: null,
  extensionYears: null,
  highWaterMark: false,
  gpCommitmentAmount: null,
  gpCommitmentPct: null,
  investmentPeriodYears: null,
  preferredReturnMethod: null,
  recyclingEnabled: false,
  clawbackProvision: false,
  wireInstructions: null,
  wireInstructionsUpdatedAt: null,
  featureFlags: {},
  currentRaise: 1000000,
  targetRaise: 5000000,
  status: "RAISING",
  regulationDExemption: null,
};

const mockUserWithAccess = {
  id: "user-1",
  email: "admin@test.com",
  teams: [{ teamId: "team-1", role: "ADMIN", team: { id: "team-1" } }],
};

const mockUserOwner = {
  id: "user-2",
  email: "owner@test.com",
  teams: [{ teamId: "team-1", role: "OWNER", team: { id: "team-1" } }],
};

const mockUserMember = {
  id: "user-3",
  email: "member@test.com",
  teams: [{ teamId: "team-1", role: "MEMBER", team: { id: "team-1" } }],
};

const mockUserOtherTeam = {
  id: "user-4",
  email: "other@test.com",
  teams: [{ teamId: "team-other", role: "ADMIN", team: { id: "team-other" } }],
};

function makeGetRequest(fundId: string = "fund-1"): [NextRequest, { params: Promise<{ fundId: string }> }] {
  const req = new NextRequest(`http://localhost:3000/api/funds/${fundId}/settings`, {
    method: "GET",
    headers: { "x-forwarded-for": "1.2.3.4", "user-agent": "test-agent" },
  });
  return [req, { params: Promise.resolve({ fundId }) }];
}

function makePatchRequest(fundId: string = "fund-1", body: Record<string, unknown> = {}): [NextRequest, { params: Promise<{ fundId: string }> }] {
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

beforeEach(() => {
  jest.clearAllMocks();
  mockAppRouterRateLimit.mockResolvedValue(null); // not blocked
});

describe("Authentication", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 401 when session has no email", async () => {
    mockGetServerSession.mockResolvedValue({ user: {} });
    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 401 when user not found in DB", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "ghost@test.com" } });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });
});

describe("Authorization", () => {
  it("returns 403 when user is MEMBER (not ADMIN/OWNER)", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "member@test.com" } });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserMember);
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue(mockFund);

    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
  });

  it("returns 403 when user is ADMIN of a different team", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "other@test.com" } });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserOtherTeam);
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue(mockFund);

    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
  });

  it("allows ADMIN of the fund's team", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "admin@test.com" } });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserWithAccess);
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue(mockFund);

    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
  });

  it("allows OWNER of the fund's team", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "owner@test.com" } });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserOwner);
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue(mockFund);

    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
  });
});

describe("Validation", () => {
  it("returns 404 when fund not found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { email: "admin@test.com" } });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserWithAccess);
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue(null);

    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });
});

describe("Rate Limiting", () => {
  it("returns rate limit response when blocked", async () => {
    const { NextResponse } = require("next/server");
    const blockedResponse = NextResponse.json({ error: "Too many requests" }, { status: 429 });
    mockAppRouterRateLimit.mockResolvedValue(blockedResponse);

    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);
    expect(res.status).toBe(429);
  });
});

describe("GET /api/funds/[fundId]/settings", () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue({ user: { email: "admin@test.com" } });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserWithAccess);
  });

  it("returns fund settings correctly", async () => {
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue(mockFund);

    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.fund.id).toBe("fund-1");
    expect(data.fund.name).toBe("Test Fund I");
    expect(data.fund.ndaGateEnabled).toBe(false);
    expect(data.fund.capitalCallThresholdEnabled).toBe(false);
    expect(data.fund.capitalCallThreshold).toBeNull();
    expect(data.fund.callFrequency).toBe("AS_NEEDED");
    expect(data.fund.stagedCommitmentsEnabled).toBe(false);
    expect(data.fund.currentRaise).toBe(1000000);
    expect(data.fund.targetRaise).toBe(5000000);
  });

  it("converts Decimal capitalCallThreshold to number", async () => {
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue({
      ...mockFund,
      capitalCallThreshold: 500000.50,
      capitalCallThresholdEnabled: true,
    });

    const [req, ctx] = makeGetRequest();
    const res = await GET(req, ctx);

    const data = await res.json();
    expect(data.fund.capitalCallThreshold).toBe(500000.5);
    expect(typeof data.fund.capitalCallThreshold).toBe("number");
  });
});

describe("PATCH /api/funds/[fundId]/settings", () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue({ user: { email: "admin@test.com" } });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserWithAccess);
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue(mockFund);
  });

  it("updates ndaGateEnabled", async () => {
    (prisma.fund.update as jest.Mock).mockResolvedValue({
      ...mockFund,
      ndaGateEnabled: true,
    });

    const [req, ctx] = makePatchRequest("fund-1", { ndaGateEnabled: true });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.fund.ndaGateEnabled).toBe(true);

    const updateCall = (prisma.fund.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.ndaGateEnabled).toBe(true);
  });

  it("updates capitalCallThreshold with parseFloat", async () => {
    (prisma.fund.update as jest.Mock).mockResolvedValue({
      ...mockFund,
      capitalCallThresholdEnabled: true,
      capitalCallThreshold: 250000,
    });

    const [req, ctx] = makePatchRequest("fund-1", {
      capitalCallThresholdEnabled: true,
      capitalCallThreshold: "250000",
    });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    const updateCall = (prisma.fund.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.capitalCallThreshold).toBe(250000);
  });

  it("sets capitalCallThreshold to null when falsy value provided", async () => {
    (prisma.fund.update as jest.Mock).mockResolvedValue({
      ...mockFund,
      capitalCallThreshold: null,
    });

    const [req, ctx] = makePatchRequest("fund-1", { capitalCallThreshold: "" });
    const res = await PATCH(req, ctx);

    const updateCall = (prisma.fund.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.capitalCallThreshold).toBeNull();
  });

  it("validates callFrequency enum", async () => {
    (prisma.fund.update as jest.Mock).mockResolvedValue({
      ...mockFund,
      callFrequency: "QUARTERLY",
    });

    const [req, ctx] = makePatchRequest("fund-1", { callFrequency: "QUARTERLY" });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    const updateCall = (prisma.fund.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.callFrequency).toBe("QUARTERLY");
  });

  it("rejects invalid callFrequency values", async () => {
    const [req, ctx] = makePatchRequest("fund-1", { callFrequency: "WEEKLY" });
    const res = await PATCH(req, ctx);

    // WEEKLY is not in the allowed list, so it's not added to updateData
    // With no valid fields, should return 400
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toMatchObject({ error: "No valid fields to update" });
  });

  it("returns 400 when no valid fields provided", async () => {
    const [req, ctx] = makePatchRequest("fund-1", { unknownField: "value" });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("No valid fields to update");
  });

  it("creates audit log with previous and new settings", async () => {
    (prisma.fund.update as jest.Mock).mockResolvedValue({
      ...mockFund,
      ndaGateEnabled: true,
    });

    const [req, ctx] = makePatchRequest("fund-1", { ndaGateEnabled: true });
    const res = await PATCH(req, ctx);

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "FUND_SETTINGS_UPDATE",
          resourceType: "FUND",
          resourceId: "fund-1",
          metadata: expect.objectContaining({
            previousValues: expect.objectContaining({
              ndaGateEnabled: false,
            }),
            updatedFields: expect.arrayContaining(["ndaGateEnabled"]),
          }),
        }),
      }),
    );
  });

  it("records IP address in audit log", async () => {
    (prisma.fund.update as jest.Mock).mockResolvedValue({ ...mockFund, ndaGateEnabled: true });

    const [req, ctx] = makePatchRequest("fund-1", { ndaGateEnabled: true });
    const res = await PATCH(req, ctx);

    const auditCall = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(auditCall.data.ipAddress).toBe("1.2.3.4");
    expect(auditCall.data.userAgent).toBe("test-agent");
  });

  it("updates multiple fields at once", async () => {
    (prisma.fund.update as jest.Mock).mockResolvedValue({
      ...mockFund,
      ndaGateEnabled: true,
      stagedCommitmentsEnabled: true,
      callFrequency: "ANNUAL",
    });

    const [req, ctx] = makePatchRequest("fund-1", {
      ndaGateEnabled: true,
      stagedCommitmentsEnabled: true,
      callFrequency: "ANNUAL",
    });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    const updateCall = (prisma.fund.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.ndaGateEnabled).toBe(true);
    expect(updateCall.data.stagedCommitmentsEnabled).toBe(true);
    expect(updateCall.data.callFrequency).toBe("ANNUAL");
  });
});
