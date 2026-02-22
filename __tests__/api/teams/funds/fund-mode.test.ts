// @ts-nocheck
/**
 * Fund Mode Toggle API Tests
 *
 * Tests for:
 *   PATCH /api/teams/[teamId]/funds/[fundId]/fund-mode
 *
 * Validates: auth, team membership, fund ownership, invalid mode,
 * no-op same mode, investor block, transaction block, successful switch,
 * audit logging.
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

import { PATCH } from "@/app/api/teams/[teamId]/funds/[fundId]/fund-mode/route";
import prisma from "@/lib/prisma";

// --- Helpers ---

const TEAM_ID = "team-123";
const FUND_ID = "fund-456";
const USER_ID = "user-789";

type ModeCtx = { params: Promise<{ teamId: string; fundId: string }> };

function makeReq(body?: Record<string, unknown>): [NextRequest, ModeCtx] {
  const init: RequestInit = {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  };
  const req = new NextRequest(
    new URL(`http://localhost:3000/api/teams/${TEAM_ID}/funds/${FUND_ID}/fund-mode`),
    init,
  );
  const ctx: ModeCtx = { params: Promise.resolve({ teamId: TEAM_ID, fundId: FUND_ID }) };
  return [req, ctx];
}

function mockAuth(role = "ADMIN") {
  mockGetServerSession.mockResolvedValue({ user: { id: USER_ID, email: "gp@test.com" } });
  (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({ userId: USER_ID, teamId: TEAM_ID, role });
}

function mockFund(entityMode = "FUND") {
  (prisma.fund.findFirst as jest.Mock).mockResolvedValue({
    id: FUND_ID,
    entityMode,
    name: "Test Fund I",
  });
}

function mockNoInvestorsOrTransactions() {
  (prisma.investment.count as jest.Mock).mockResolvedValue(0);
  (prisma.transaction.count as jest.Mock).mockResolvedValue(0);
}

// --- Tests ---

describe("Fund Mode Toggle API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppRouterRateLimit.mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const [req, ctx] = makeReq({ mode: "STARTUP" });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin/owner", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: USER_ID } });
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const [req, ctx] = makeReq({ mode: "STARTUP" });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
  });

  it("returns 404 when fund not found in team", async () => {
    mockAuth();
    (prisma.fund.findFirst as jest.Mock).mockResolvedValue(null);
    const [req, ctx] = makeReq({ mode: "STARTUP" });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Fund not found");
  });

  it("returns 400 for invalid mode", async () => {
    mockAuth();
    mockFund("FUND");
    const [req, ctx] = makeReq({ mode: "INVALID" });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid mode");
  });

  it("returns 400 when mode is missing", async () => {
    mockAuth();
    mockFund("FUND");
    const [req, ctx] = makeReq({});
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 200 no-op when mode is same", async () => {
    mockAuth();
    mockFund("FUND");
    const [req, ctx] = makeReq({ mode: "FUND" });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entityMode).toBe("FUND");
    expect(body.changed).toBe(false);
    // Should NOT call investment.count or fund.update
    expect(prisma.investment.count).not.toHaveBeenCalled();
    expect(prisma.fund.update).not.toHaveBeenCalled();
  });

  it("returns 409 when fund has active investors", async () => {
    mockAuth();
    mockFund("FUND");
    (prisma.investment.count as jest.Mock).mockResolvedValue(3);
    (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

    const [req, ctx] = makeReq({ mode: "STARTUP" });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("3 active investor(s)");
  });

  it("returns 409 when fund has completed transactions", async () => {
    mockAuth();
    mockFund("STARTUP");
    (prisma.investment.count as jest.Mock).mockResolvedValue(0);
    (prisma.transaction.count as jest.Mock).mockResolvedValue(2);

    const [req, ctx] = makeReq({ mode: "FUND" });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("2 completed transaction(s)");
  });

  it("switches mode from FUND to STARTUP successfully", async () => {
    mockAuth();
    mockFund("FUND");
    mockNoInvestorsOrTransactions();
    (prisma.fund.update as jest.Mock).mockResolvedValue({ id: FUND_ID, entityMode: "STARTUP" });

    const [req, ctx] = makeReq({ mode: "STARTUP" });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entityMode).toBe("STARTUP");
    expect(body.changed).toBe(true);
    expect(body.previousMode).toBe("FUND");

    expect(prisma.fund.update).toHaveBeenCalledWith({
      where: { id: FUND_ID },
      data: { entityMode: "STARTUP" },
    });
  });

  it("switches mode from STARTUP to FUND successfully", async () => {
    mockAuth();
    mockFund("STARTUP");
    mockNoInvestorsOrTransactions();
    (prisma.fund.update as jest.Mock).mockResolvedValue({ id: FUND_ID, entityMode: "FUND" });

    const [req, ctx] = makeReq({ mode: "FUND" });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entityMode).toBe("FUND");
    expect(body.changed).toBe(true);
    expect(body.previousMode).toBe("STARTUP");
  });

  it("fires audit log on mode change", async () => {
    mockAuth();
    mockFund("FUND");
    mockNoInvestorsOrTransactions();
    (prisma.fund.update as jest.Mock).mockResolvedValue({ id: FUND_ID, entityMode: "STARTUP" });

    const [req, ctx] = makeReq({ mode: "STARTUP" });
    await PATCH(req, ctx);

    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "SETTINGS_UPDATED",
        userId: USER_ID,
        teamId: TEAM_ID,
        resourceId: FUND_ID,
        metadata: expect.objectContaining({
          action: "fund_mode_changed",
          previousMode: "FUND",
          newMode: "STARTUP",
        }),
      }),
    );
  });

  it("does not fire audit log on no-op", async () => {
    mockAuth();
    mockFund("FUND");
    const [req, ctx] = makeReq({ mode: "FUND" });
    await PATCH(req, ctx);
    expect(mockLogAuditEvent).not.toHaveBeenCalled();
  });
});
