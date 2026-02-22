/**
 * Tests for GET /api/approvals/pending
 *
 * Prompt 11: GP Approval Gates — returns pending and recent approvals
 * for the GP's team with investor profiles and change requests.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import handler from "@/pages/api/approvals/pending";

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

const mockSession = {
  user: { id: "gp-1", email: "gp@fundroom.ai", name: "GP Admin" },
  expires: "2099-01-01",
};

const mockMembership = {
  id: "ut-1",
  userId: "gp-1",
  teamId: "team-1",
  role: "ADMIN",
  status: "ACTIVE",
};

const mockFunds = [
  { id: "fund-1", name: "Test Fund I" },
  { id: "fund-2", name: "Test Fund II" },
];

const mockInvestors = [
  {
    id: "inv-1",
    entityType: "INDIVIDUAL",
    entityName: "John Smith",
    taxId: null,
    accreditationStatus: "SELF_CERTIFIED",
    fundData: { stage: "COMMITTED" },
    createdAt: new Date("2026-02-01"),
    user: { name: "John Smith", email: "john@example.com" },
    investments: [
      {
        id: "invest-1",
        fundId: "fund-1",
        status: "COMMITTED",
        commitmentAmount: { toNumber: () => 250000 },
        fundedAmount: { toNumber: () => 0 },
      },
    ],
  },
  {
    id: "inv-2",
    entityType: "LLC",
    entityName: "Acme LLC",
    taxId: "encrypted:...",
    accreditationStatus: "PENDING",
    fundData: { stage: "APPLIED" },
    createdAt: new Date("2026-02-10"),
    user: { name: "Jane Doe", email: "jane@acme.com" },
    investments: [
      {
        id: "invest-2",
        fundId: "fund-1",
        status: "LEAD",
        commitmentAmount: { toNumber: () => 500000 },
        fundedAmount: { toNumber: () => 0 },
      },
    ],
  },
  {
    id: "inv-3",
    entityType: "INDIVIDUAL",
    entityName: "Funded Investor",
    taxId: null,
    accreditationStatus: "SELF_CERTIFIED",
    fundData: { stage: "FUNDED" },
    createdAt: new Date("2026-01-15"),
    user: { name: "Funded Investor", email: "funded@example.com" },
    investments: [
      {
        id: "invest-3",
        fundId: "fund-1",
        status: "FUNDED",
        commitmentAmount: { toNumber: () => 100000 },
        fundedAmount: { toNumber: () => 100000 },
      },
    ],
  },
];

const mockChangeRequests = [
  {
    id: "cr-1",
    investorId: "inv-1",
    fundId: "fund-1",
    status: "PENDING",
    fieldName: "entityName",
    currentValue: "John Smith",
    requestedValue: "John A. Smith",
    reason: "Name correction",
    requestedAt: new Date("2026-02-12"),
    investor: {
      user: { name: "John Smith", email: "john@example.com" },
    },
  },
];

function createReq(query: Record<string, string> = {}) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    query: { teamId: "team-1", ...query },
  });
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(mockMembership);
  (prisma.fund.findMany as jest.Mock).mockResolvedValue(mockFunds);
  (prisma.investor.findMany as jest.Mock).mockResolvedValue(mockInvestors);
  (prisma.profileChangeRequest.findMany as jest.Mock).mockResolvedValue(
    mockChangeRequests,
  );
});

describe("GET /api/approvals/pending", () => {
  it("rejects non-GET methods", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { teamId: "team-1" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("requires authentication", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("requires teamId parameter", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: {},
    });
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe("teamId is required");
  });

  it("returns 403 for non-admin users", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  it("returns approval items with counts", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const data = JSON.parse(res._getData());
    expect(data.items).toBeDefined();
    expect(data.counts).toBeDefined();
    expect(data.counts.total).toBeGreaterThan(0);
  });

  it("includes investor profile items", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());

    const profileItems = data.items.filter(
      (i: Record<string, unknown>) => i.submissionType === "PROFILE",
    );
    expect(profileItems.length).toBeGreaterThan(0);

    const item = profileItems[0];
    expect(item.investorId).toBeDefined();
    expect(item.investorName).toBeDefined();
    expect(item.investorEmail).toBeDefined();
    expect(item.fundId).toBeDefined();
    expect(item.fundName).toBeDefined();
    expect(item.teamId).toBe("team-1");
  });

  it("includes change request items", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());

    const crItems = data.items.filter(
      (i: Record<string, unknown>) => i.submissionType === "CHANGE_REQUEST",
    );
    expect(crItems.length).toBe(1);
    expect(crItems[0].changeRequest).toBeDefined();
    expect(crItems[0].changeRequest.fieldName).toBe("entityName");
    expect(crItems[0].changeRequest.currentValue).toBe("John Smith");
    expect(crItems[0].changeRequest.requestedValue).toBe("John A. Smith");
  });

  it("correctly categorizes approval statuses", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());

    // FUNDED investor should be APPROVED status
    const fundedItem = data.items.find(
      (i: Record<string, unknown>) =>
        i.investorId === "inv-3" && i.submissionType === "PROFILE",
    );
    if (fundedItem) {
      expect(fundedItem.status).toBe("APPROVED");
    }

    // APPLIED investor should be PENDING status
    const appliedItem = data.items.find(
      (i: Record<string, unknown>) =>
        i.investorId === "inv-2" && i.submissionType === "PROFILE",
    );
    if (appliedItem) {
      expect(appliedItem.status).toBe("PENDING");
    }
  });

  it("filters by fundId when provided", async () => {
    const { req, res } = createReq({ fundId: "fund-1" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(prisma.fund.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { teamId: "team-1", id: "fund-1" },
      }),
    );
  });

  it("filters by status when provided", async () => {
    const { req, res } = createReq({ status: "PENDING" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const data = JSON.parse(res._getData());
    const nonPending = data.items.filter(
      (i: Record<string, unknown>) => i.status !== "PENDING",
    );
    expect(nonPending.length).toBe(0);
  });

  it("returns editable fields for profile items", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());

    const profileItem = data.items.find(
      (i: Record<string, unknown>) => i.submissionType === "PROFILE",
    );
    expect(profileItem?.fields).toBeDefined();
    expect(profileItem?.fields?.length).toBeGreaterThan(0);

    const fieldNames = profileItem.fields.map(
      (f: Record<string, unknown>) => f.name,
    );
    expect(fieldNames).toContain("entityName");
    expect(fieldNames).toContain("entityType");
    expect(fieldNames).toContain("accreditationStatus");
  });

  it("sorts items by date (newest first)", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());

    for (let i = 1; i < data.items.length; i++) {
      const prev = new Date(data.items[i - 1].submittedAt).getTime();
      const curr = new Date(data.items[i].submittedAt).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it("includes counts for all statuses", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());

    expect(data.counts).toHaveProperty("total");
    expect(data.counts).toHaveProperty("pending");
    expect(data.counts).toHaveProperty("approved");
    expect(data.counts).toHaveProperty("rejected");
    expect(data.counts).toHaveProperty("changesRequested");
    expect(data.counts.total).toBe(data.items.length);
  });

  it("returns 500 on database error", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockRejectedValue(
      new Error("DB error"),
    );
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe("Internal server error");
  });

  it("verifies admin role check includes OWNER, ADMIN, SUPER_ADMIN", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    expect(prisma.userTeam.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
          status: "ACTIVE",
        }),
      }),
    );
  });
});
