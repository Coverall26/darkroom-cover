/**
 * Tests for POST /api/admin/wire/confirm
 *
 * GP wire confirmation: money-moving operation that updates Transaction status,
 * Investment.fundedAmount, and auto-advances to FUNDED when fully funded.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import { POST } from "@/app/api/admin/wire/confirm/route";
import { wrapAppRouteHandler } from "@/__tests__/helpers/app-router-adapter";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { Decimal } from "@prisma/client/runtime/library";

const handler = wrapAppRouteHandler({ POST });

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
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
}));

jest.mock("@/lib/emails/send-wire-confirmed", () => ({
  sendWireConfirmedNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/tracking/server-events", () => ({
  publishServerEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/sse/event-emitter", () => ({
  emitSSE: jest.fn(),
  SSE_EVENTS: {
    WIRE_CONFIRMED: "WIRE_CONFIRMED",
  },
}));

const mockSession = {
  user: { id: "user-1", email: "gp@fundroom.ai", name: "GP Admin" },
  expires: "2099-01-01",
};

const mockMembership = {
  id: "ut-1",
  userId: "user-1",
  teamId: "team-1",
  role: "ADMIN",
  status: "ACTIVE",
};

const mockTransaction = {
  id: "tx-1",
  fundId: "fund-1",
  investorId: "inv-1",
  amount: new Decimal(100000),
  status: "PENDING",
  investor: {
    id: "inv-1",
    userId: "lp-user-1",
    fundId: "fund-1",
    entityName: "Test LP",
    user: { email: "lp@example.com", name: "LP User" },
  },
};

const mockFund = { id: "fund-1", name: "Test Fund I" };

function createReq(body: Record<string, unknown> = {}) {
  return createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    body: {
      transactionId: "tx-1",
      teamId: "team-1",
      fundsReceivedDate: new Date().toISOString(),
      amountReceived: 100000,
      ...body,
    },
    headers: {
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "test-agent",
    },
  });
}

describe("POST /api/admin/wire/confirm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(mockMembership);
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(mockTransaction);
    (prisma.fund.findFirst as jest.Mock).mockResolvedValue(mockFund);

    // Set up $transaction mock for the atomic update (includes FundAggregate sync)
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        transaction: {
          findUnique: jest.fn().mockResolvedValue({ status: "PENDING" }),
          update: jest.fn().mockResolvedValue({
            id: "tx-1",
            status: "COMPLETED",
            confirmedAt: new Date(),
            fundsReceivedDate: new Date(),
          }),
        },
        investment: {
          findFirst: jest.fn().mockResolvedValue({
            id: "inv-rec-1",
            commitmentAmount: new Decimal(100000),
            fundedAmount: new Decimal(0),
            status: "COMMITTED",
          }),
          update: jest.fn().mockResolvedValue({}),
          aggregate: jest.fn().mockResolvedValue({
            _sum: { fundedAmount: new Decimal(100000), commitmentAmount: new Decimal(100000) },
          }),
        },
        fundAggregate: {
          upsert: jest.fn().mockResolvedValue({}),
        },
      };
      return callback(tx);
    });
  });

  // --- Method enforcement ---
  it("rejects non-POST methods with 405", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
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
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("returns 401 when session has no user id", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: {} });
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  // --- Input validation ---
  it("returns 400 when transactionId is missing", async () => {
    const { req, res } = createReq({ transactionId: undefined });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("transactionId");
  });

  it("returns 400 when teamId is missing", async () => {
    const { req, res } = createReq({ teamId: undefined });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("teamId");
  });

  it("returns 400 when fundsReceivedDate is missing", async () => {
    const { req, res } = createReq({ fundsReceivedDate: undefined });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 when amountReceived is zero", async () => {
    const { req, res } = createReq({ amountReceived: 0 });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("positive");
  });

  it("returns 400 when amountReceived is negative", async () => {
    const { req, res } = createReq({ amountReceived: -1000 });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 when amountReceived exceeds $100B", async () => {
    const { req, res } = createReq({ amountReceived: 100_000_000_001 });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("$100B");
  });

  it("returns 400 when amountReceived is NaN", async () => {
    const { req, res } = createReq({ amountReceived: NaN });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 when amountReceived is Infinity", async () => {
    const { req, res } = createReq({ amountReceived: Infinity });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 when bankReference exceeds 100 characters", async () => {
    const { req, res } = createReq({ bankReference: "x".repeat(101) });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("bankReference");
  });

  it("returns 400 when confirmationNotes exceeds 1000 characters", async () => {
    const { req, res } = createReq({ confirmationNotes: "x".repeat(1001) });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("confirmationNotes");
  });

  it("returns 400 when fundsReceivedDate is invalid", async () => {
    const { req, res } = createReq({ fundsReceivedDate: "not-a-date" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("Invalid");
  });

  it("returns 400 when fundsReceivedDate is more than 7 days in the future", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 8);
    const { req, res } = createReq({ fundsReceivedDate: futureDate.toISOString() });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("7 days");
  });

  it("accepts fundsReceivedDate within 7 days in the future", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 6);
    const { req, res } = createReq({ fundsReceivedDate: futureDate.toISOString() });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  // --- Authorization ---
  it("returns 403 when user is not an admin of the team", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain("Forbidden");
  });

  // --- Transaction lookup ---
  it("returns 404 when transaction not found", async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 403 when transaction has no fundId and investor has no fundId", async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue({
      ...mockTransaction,
      fundId: null,
      investor: { ...mockTransaction.investor, fundId: null },
    });
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain("cannot be verified");
  });

  it("returns 403 when fund does not belong to the team", async () => {
    (prisma.fund.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain("does not belong");
  });

  it("returns 400 when transaction is already COMPLETED", async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue({
      ...mockTransaction,
      status: "COMPLETED",
    });
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("already been confirmed");
  });

  it("returns 400 when transaction is CANCELLED", async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue({
      ...mockTransaction,
      status: "CANCELLED",
    });
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("cancelled");
  });

  // --- Successful confirmation ---
  it("completes wire confirmation with correct response structure", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.transaction).toBeDefined();
    expect(data.transaction.status).toBe("COMPLETED");
    expect(data.investmentUpdated).toBe(true);
  });

  it("performs atomic update via $transaction", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof (prisma.$transaction as jest.Mock).mock.calls[0][0]).toBe("function");
  });

  it("logs audit event with correct metadata", async () => {
    const { req, res } = createReq({ bankReference: "WF-12345" });
    await handler(req, res);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ADMIN_ACTION",
        userId: "user-1",
        teamId: "team-1",
        resourceType: "Transaction",
        resourceId: "tx-1",
        metadata: expect.objectContaining({
          action: "WIRE_TRANSFER_CONFIRMED",
          amountReceived: 100000,
          bankReference: "WF-12345",
          confirmationMethod: "MANUAL",
        }),
        ipAddress: "1.2.3.4",
        userAgent: "test-agent",
      }),
    );
  });

  // --- Amount variance ---
  it("calculates variance when received differs from expected", async () => {
    const { req, res } = createReq({ amountReceived: 95000 });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    // 95000 - 100000 = -5000
    expect(data.transaction.amountVariance).toBe("-5000");
  });

  it("reports zero variance when amounts match", async () => {
    const { req, res } = createReq({ amountReceived: 100000 });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.transaction.amountVariance).toBe("0");
  });

  // --- Investment status advancement ---
  it("advances investment to FUNDED when fully funded", async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const investmentUpdate = jest.fn().mockResolvedValue({});
      const tx = {
        transaction: {
          findUnique: jest.fn().mockResolvedValue({ status: "PENDING" }),
          update: jest.fn().mockResolvedValue({
            id: "tx-1",
            status: "COMPLETED",
            confirmedAt: new Date(),
            fundsReceivedDate: new Date(),
          }),
        },
        investment: {
          findFirst: jest.fn().mockResolvedValue({
            id: "inv-rec-1",
            commitmentAmount: new Decimal(100000),
            fundedAmount: new Decimal(0),
            status: "COMMITTED",
          }),
          update: investmentUpdate,
          aggregate: jest.fn().mockResolvedValue({
            _sum: { fundedAmount: new Decimal(100000), commitmentAmount: new Decimal(100000) },
          }),
        },
        fundAggregate: { upsert: jest.fn().mockResolvedValue({}) },
      };
      const result = await callback(tx);
      // Verify the investment update was called with FUNDED status
      expect(investmentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FUNDED",
          }),
        }),
      );
      return result;
    });

    const { req, res } = createReq({ amountReceived: 100000 });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData()).investmentUpdated).toBe(true);
  });

  it("does not advance investment when partially funded", async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const investmentUpdate = jest.fn().mockResolvedValue({});
      const tx = {
        transaction: {
          findUnique: jest.fn().mockResolvedValue({ status: "PENDING" }),
          update: jest.fn().mockResolvedValue({
            id: "tx-1",
            status: "COMPLETED",
            confirmedAt: new Date(),
            fundsReceivedDate: new Date(),
          }),
        },
        investment: {
          findFirst: jest.fn().mockResolvedValue({
            id: "inv-rec-1",
            commitmentAmount: new Decimal(200000),
            fundedAmount: new Decimal(0),
            status: "COMMITTED",
          }),
          update: investmentUpdate,
          aggregate: jest.fn().mockResolvedValue({
            _sum: { fundedAmount: new Decimal(50000), commitmentAmount: new Decimal(200000) },
          }),
        },
        fundAggregate: { upsert: jest.fn().mockResolvedValue({}) },
      };
      const result = await callback(tx);
      // Verify COMMITTED status is preserved (partial funding)
      expect(investmentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "COMMITTED",
          }),
        }),
      );
      return result;
    });

    const { req, res } = createReq({ amountReceived: 50000 });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  it("advances DOCS_APPROVED investment to FUNDED when fully funded", async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const investmentUpdate = jest.fn().mockResolvedValue({});
      const tx = {
        transaction: {
          findUnique: jest.fn().mockResolvedValue({ status: "PENDING" }),
          update: jest.fn().mockResolvedValue({
            id: "tx-1",
            status: "COMPLETED",
            confirmedAt: new Date(),
            fundsReceivedDate: new Date(),
          }),
        },
        investment: {
          findFirst: jest.fn().mockResolvedValue({
            id: "inv-rec-1",
            commitmentAmount: new Decimal(100000),
            fundedAmount: new Decimal(50000),
            status: "DOCS_APPROVED",
          }),
          update: investmentUpdate,
          aggregate: jest.fn().mockResolvedValue({
            _sum: { fundedAmount: new Decimal(100000), commitmentAmount: new Decimal(100000) },
          }),
        },
        fundAggregate: { upsert: jest.fn().mockResolvedValue({}) },
      };
      const result = await callback(tx);
      expect(investmentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FUNDED",
          }),
        }),
      );
      return result;
    });

    const { req, res } = createReq({ amountReceived: 50000 });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  // --- Race condition protection ---
  it("returns 400 when transaction is confirmed by another admin during $transaction", async () => {
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const tx = {
        transaction: {
          findUnique: jest.fn().mockResolvedValue({ status: "COMPLETED" }),
          update: jest.fn(),
        },
        investment: {
          findFirst: jest.fn(),
          update: jest.fn(),
          aggregate: jest.fn(),
        },
        fundAggregate: { upsert: jest.fn() },
      };
      return callback(tx);
    });

    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("already been confirmed");
  });

  // --- Fund ownership fallback ---
  it("falls back to investor.fundId when transaction has no fundId", async () => {
    (prisma.transaction.findUnique as jest.Mock).mockResolvedValue({
      ...mockTransaction,
      fundId: null,
    });
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    // fund.findFirst should have been called with investor's fundId
    expect(prisma.fund.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "fund-1" }),
      }),
    );
  });

  // --- Error handling ---
  it("returns 500 on unexpected errors", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockRejectedValue(new Error("DB crash"));
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe("Internal server error");
  });

  // --- Optional fields ---
  it("accepts optional bankReference and confirmationNotes", async () => {
    const { req, res } = createReq({
      bankReference: "WF-REF-12345",
      confirmationNotes: "Received same-day wire",
      confirmationProofDocumentId: "doc-proof-1",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });
});
