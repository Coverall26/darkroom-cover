/**
 * Tests for GET /api/admin/reports/operational
 *
 * Covers: wire reconciliation, document completion metrics,
 * signature tracking, conversion timing, SLA dashboard.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { getServerSession as getServerSessionAuth } from "next-auth";
import prisma from "@/lib/prisma";
import { GET } from "@/app/api/admin/reports/operational/route";
import { wrapAppRouteHandler } from "@/__tests__/helpers/app-router-adapter";

const handler = wrapAppRouteHandler({ GET });

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/auth/rbac", () => ({
  enforceRBAC: jest.fn().mockResolvedValue(true),
  enforceRBACAppRouter: jest.fn().mockResolvedValue({
    userId: "gp-1",
    email: "gp@example.com",
    teamId: "team-1",
    role: "ADMIN",
  }),
}));

const mockSession = {
  user: { id: "gp-1", email: "gp@example.com", name: "GP Admin" },
  expires: "2099-01-01",
};

const mockFund = {
  id: "fund-1",
  name: "Test Fund I",
  targetRaise: 5000000,
  teamId: "team-1",
};

// Helpers
function createReq(query: Record<string, string> = {}) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    query: { fundId: "fund-1", ...query },
  });
  return { req, res };
}

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const hoursAgo = (n: number) => new Date(now.getTime() - n * 60 * 60 * 1000);

beforeEach(() => {
  jest.clearAllMocks();
  (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  (getServerSessionAuth as jest.Mock).mockResolvedValue(mockSession);
  (prisma.fund.findUnique as jest.Mock).mockResolvedValue(mockFund);

  // Default: empty arrays
  (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.lPDocument.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.signatureDocument.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.investor.findMany as jest.Mock).mockResolvedValue([]);
});

describe("GET /api/admin/reports/operational", () => {
  it("rejects non-GET methods", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { fundId: "fund-1" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("requires authentication", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    (getServerSessionAuth as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("requires fundId parameter", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {},
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe("fundId is required");
  });

  it("returns 404 for non-existent fund", async () => {
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 200 with empty data when no transactions/docs", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const data = JSON.parse(res._getData());
    expect(data.fundId).toBe("fund-1");
    expect(data.wireReconciliation.totalTransactions).toBe(0);
    expect(data.documentMetrics).toHaveLength(0);
    expect(data.signatureMetrics.totalRequired).toBe(0);
    expect(data.conversionTiming.totalInvestors).toBe(0);
  });

  describe("Wire Reconciliation", () => {
    it("calculates expected vs received totals", async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tx-1",
          status: "COMPLETED",
          amount: 100000,
          expectedAmount: 100000,
          amountVariance: 0,
          initiatedAt: daysAgo(10),
          completedAt: daysAgo(7),
          confirmedAt: daysAgo(7),
          createdAt: daysAgo(10),
        },
        {
          id: "tx-2",
          status: "COMPLETED",
          amount: 48000,
          expectedAmount: 50000,
          amountVariance: -2000,
          initiatedAt: daysAgo(5),
          completedAt: daysAgo(3),
          confirmedAt: daysAgo(3),
          createdAt: daysAgo(5),
        },
        {
          id: "tx-3",
          status: "PENDING",
          amount: 75000,
          expectedAmount: 75000,
          amountVariance: null,
          initiatedAt: daysAgo(2),
          completedAt: null,
          confirmedAt: null,
          createdAt: daysAgo(2),
        },
      ]);

      const { req, res } = createReq();
      await handler(req, res);
      const data = JSON.parse(res._getData());
      const wire = data.wireReconciliation;

      expect(wire.totalTransactions).toBe(3);
      expect(wire.completed).toBe(2);
      expect(wire.pending).toBe(1);
      expect(wire.totalReceived).toBe(148000);
      expect(wire.totalExpected).toBe(225000);
    });

    it("calculates avg confirmation days", async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tx-1",
          status: "COMPLETED",
          amount: 100000,
          expectedAmount: 100000,
          amountVariance: 0,
          initiatedAt: daysAgo(10),
          completedAt: daysAgo(7),
          confirmedAt: daysAgo(7),
          createdAt: daysAgo(10),
        },
      ]);

      const { req, res } = createReq();
      await handler(req, res);
      const data = JSON.parse(res._getData());
      expect(data.wireReconciliation.avgConfirmationDays).toBe(3);
    });

    it("identifies overdue wires beyond SLA", async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tx-overdue",
          status: "PENDING",
          amount: 50000,
          expectedAmount: 50000,
          amountVariance: null,
          initiatedAt: daysAgo(10), // 10 days > 5-day SLA
          completedAt: null,
          confirmedAt: null,
          createdAt: daysAgo(10),
        },
        {
          id: "tx-ok",
          status: "PROOF_UPLOADED",
          amount: 30000,
          expectedAmount: 30000,
          amountVariance: null,
          initiatedAt: daysAgo(2), // 2 days < 5-day SLA
          completedAt: null,
          confirmedAt: null,
          createdAt: daysAgo(2),
        },
      ]);

      const { req, res } = createReq();
      await handler(req, res);
      const data = JSON.parse(res._getData());
      expect(data.wireReconciliation.overdueCount).toBe(1);
      expect(data.wireReconciliation.pending).toBe(2);
    });

    it("counts failed transactions", async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tx-fail",
          status: "FAILED",
          amount: 25000,
          expectedAmount: 25000,
          amountVariance: null,
          initiatedAt: daysAgo(3),
          completedAt: null,
          confirmedAt: null,
          createdAt: daysAgo(3),
        },
      ]);

      const { req, res } = createReq();
      await handler(req, res);
      const data = JSON.parse(res._getData());
      expect(data.wireReconciliation.failed).toBe(1);
    });
  });

  describe("Document Completion Metrics", () => {
    it("groups documents by type with rates", async () => {
      (prisma.lPDocument.findMany as jest.Mock).mockResolvedValue([
        { id: "d1", documentType: "SUBSCRIPTION_AGREEMENT", status: "APPROVED", createdAt: hoursAgo(72), reviewedAt: hoursAgo(48), uploadSource: "LP_UPLOADED" },
        { id: "d2", documentType: "SUBSCRIPTION_AGREEMENT", status: "APPROVED", createdAt: hoursAgo(48), reviewedAt: hoursAgo(24), uploadSource: "LP_UPLOADED" },
        { id: "d3", documentType: "SUBSCRIPTION_AGREEMENT", status: "REJECTED", createdAt: hoursAgo(24), reviewedAt: hoursAgo(12), uploadSource: "LP_UPLOADED" },
        { id: "d4", documentType: "PROOF_OF_IDENTITY", status: "UPLOADED_PENDING_REVIEW", createdAt: hoursAgo(6), reviewedAt: null, uploadSource: "LP_UPLOADED" },
      ]);

      const { req, res } = createReq();
      await handler(req, res);
      const data = JSON.parse(res._getData());
      const metrics = data.documentMetrics;

      expect(metrics).toHaveLength(2);

      const subAg = metrics.find((m: { type: string }) => m.type === "SUBSCRIPTION_AGREEMENT");
      expect(subAg.total).toBe(3);
      expect(subAg.approved).toBe(2);
      expect(subAg.rejected).toBe(1);
      expect(subAg.completionRate).toBe(67); // 2/3 = 66.67 → 67
      expect(subAg.rejectionRate).toBe(33); // 1/3 = 33.33 → 33

      const poi = metrics.find((m: { type: string }) => m.type === "PROOF_OF_IDENTITY");
      expect(poi.total).toBe(1);
      expect(poi.pending).toBe(1);
    });

    it("calculates average review hours", async () => {
      (prisma.lPDocument.findMany as jest.Mock).mockResolvedValue([
        { id: "d1", documentType: "NDA", status: "APPROVED", createdAt: hoursAgo(48), reviewedAt: hoursAgo(24), uploadSource: "LP_UPLOADED" },
        { id: "d2", documentType: "NDA", status: "APPROVED", createdAt: hoursAgo(36), reviewedAt: hoursAgo(12), uploadSource: "LP_UPLOADED" },
      ]);

      const { req, res } = createReq();
      await handler(req, res);
      const data = JSON.parse(res._getData());
      const nda = data.documentMetrics.find((m: { type: string }) => m.type === "NDA");
      expect(nda.avgReviewHours).toBe(24); // (24 + 24) / 2 = 24
    });
  });

  describe("Signature Metrics", () => {
    it("calculates signature completion rate", async () => {
      (prisma.signatureDocument.findMany as jest.Mock).mockResolvedValue([
        {
          id: "sig-1",
          status: "COMPLETED",
          documentType: "NDA",
          sentAt: daysAgo(7),
          completedAt: daysAgo(5),
          requiredForOnboarding: true,
          recipients: [
            { id: "r1", status: "COMPLETED", signedAt: daysAgo(5) },
          ],
        },
        {
          id: "sig-2",
          status: "SENT",
          documentType: "SUBSCRIPTION",
          sentAt: daysAgo(3),
          completedAt: null,
          requiredForOnboarding: true,
          recipients: [
            { id: "r2", status: "PENDING", signedAt: null },
          ],
        },
      ]);

      const { req, res } = createReq();
      await handler(req, res);
      const data = JSON.parse(res._getData());
      const sig = data.signatureMetrics;

      expect(sig.totalRequired).toBe(2);
      expect(sig.completed).toBe(1);
      expect(sig.completionRate).toBe(50);
      expect(sig.totalRecipients).toBe(2);
      expect(sig.signedRecipients).toBe(1);
      expect(sig.avgSigningDays).toBe(2); // 7 - 5 = 2 days
    });
  });

  describe("Conversion Timing", () => {
    it("calculates average days per stage", async () => {
      (prisma.investor.findMany as jest.Mock).mockResolvedValue([
        {
          id: "inv-1",
          fundData: { stage: "FUNDED" },
          createdAt: daysAgo(30),
          onboardingCompletedAt: daysAgo(25),
          ndaSigned: true,
          accreditationStatus: "SELF_CERTIFIED",
          investments: [{
            status: "FUNDED",
            createdAt: daysAgo(20),
            updatedAt: daysAgo(10),
          }],
        },
        {
          id: "inv-2",
          fundData: { stage: "COMMITTED" },
          createdAt: daysAgo(15),
          onboardingCompletedAt: daysAgo(12),
          ndaSigned: true,
          accreditationStatus: "SELF_CERTIFIED",
          investments: [{
            status: "COMMITTED",
            createdAt: daysAgo(8),
            updatedAt: daysAgo(8),
          }],
        },
      ]);

      const { req, res } = createReq();
      await handler(req, res);
      const data = JSON.parse(res._getData());
      const timing = data.conversionTiming;

      expect(timing.totalInvestors).toBe(2);
      expect(timing.onboardingCompleted).toBe(2);
      expect(timing.committed).toBe(2);
      expect(timing.funded).toBe(1);
      // avgDaysToOnboarding: (5 + 3) / 2 = 4
      expect(timing.avgDaysToOnboarding).toBe(4);
    });
  });

  describe("SLA Dashboard", () => {
    it("returns SLA status for wires and docs", async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([
        {
          id: "tx-1",
          status: "PENDING",
          amount: 50000,
          expectedAmount: 50000,
          amountVariance: null,
          initiatedAt: daysAgo(2),
          completedAt: null,
          confirmedAt: null,
          createdAt: daysAgo(2),
        },
      ]);
      (prisma.lPDocument.findMany as jest.Mock).mockResolvedValue([
        { id: "d1", documentType: "NDA", status: "UPLOADED_PENDING_REVIEW", createdAt: hoursAgo(72), reviewedAt: null, uploadSource: "LP_UPLOADED" },
      ]);

      const { req, res } = createReq();
      await handler(req, res);
      const data = JSON.parse(res._getData());

      expect(data.sla.wireConfirmation.onTrack).toBe(1);
      expect(data.sla.wireConfirmation.overdue).toBe(0);
      expect(data.sla.wireConfirmation.slaDays).toBe(5);

      expect(data.sla.documentReview.onTrack).toBe(0);
      expect(data.sla.documentReview.overdue).toBe(1); // 72h > 48h SLA
      expect(data.sla.documentReview.slaHours).toBe(48);
    });
  });

  it("returns 500 on database error", async () => {
    (prisma.fund.findUnique as jest.Mock).mockRejectedValue(new Error("DB error"));
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe("Internal server error");
  });
});
