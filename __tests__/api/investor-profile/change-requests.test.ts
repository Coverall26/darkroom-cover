/**
 * Tests for GET /api/investor-profile/[profileId]/change-requests
 *
 * Returns change requests for an investor profile.
 * LP sees their own, GP admin sees for their team's investors.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import handler from "@/pages/api/investor-profile/[profileId]/change-requests";

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

const mockLPSession = {
  user: { id: "lp-1", email: "lp@example.com", name: "LP User" },
  expires: "2099-01-01",
};

const mockGPSession = {
  user: { id: "gp-1", email: "gp@fundroom.ai", name: "GP Admin" },
  expires: "2099-01-01",
};

const mockInvestor = {
  id: "inv-1",
  userId: "lp-1",
  user: { id: "lp-1", email: "lp@example.com" },
  investments: [
    {
      fundId: "fund-1",
      fund: { teamId: "team-1" },
    },
  ],
};

const mockChangeRequests = [
  {
    id: "cr-1",
    investorId: "inv-1",
    fundId: "fund-1",
    requestedBy: "gp-1",
    reviewedBy: null,
    status: "PENDING",
    changeType: "ENTITY_INFO",
    fieldName: "entityName",
    reason: "Name does not match legal docs",
    currentValue: "Test LP",
    requestedValue: "Test LP LLC",
    newValue: null,
    lpNote: null,
    gpNote: "Please update to match your formation docs",
    requestedAt: new Date("2026-02-14T10:00:00Z"),
    respondedAt: null,
    expiresAt: null,
    fund: { id: "fund-1", name: "Test Fund" },
  },
  {
    id: "cr-2",
    investorId: "inv-1",
    fundId: "fund-1",
    requestedBy: "gp-1",
    reviewedBy: "lp-1",
    status: "ACCEPTED",
    changeType: "ADDRESS",
    fieldName: "addressLine1",
    reason: "PO Box detected",
    currentValue: "PO Box 123",
    requestedValue: null,
    newValue: "456 Real Street",
    lpNote: "Updated to physical address",
    gpNote: null,
    requestedAt: new Date("2026-02-13T10:00:00Z"),
    respondedAt: new Date("2026-02-14T08:00:00Z"),
    expiresAt: null,
    fund: { id: "fund-1", name: "Test Fund" },
  },
];

function createReq(
  query: Record<string, string> = {},
  method = "GET",
) {
  return createMocks<NextApiRequest, NextApiResponse>({
    method: method as "GET",
    query: {
      profileId: "inv-1",
      ...query,
    },
  });
}

describe("GET /api/investor-profile/[profileId]/change-requests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockLPSession);
    (prisma.investor.findUnique as jest.Mock).mockResolvedValue(mockInvestor);
    (prisma.profileChangeRequest.findMany as jest.Mock).mockResolvedValue(
      mockChangeRequests,
    );
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { id: "gp-1", name: "GP Admin" },
    ]);
  });

  // --- Method enforcement ---
  it("rejects non-GET methods with 405", async () => {
    const { req, res } = createReq({}, "POST");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  // --- Authentication ---
  it("returns 401 when not authenticated", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  // --- Investor lookup ---
  it("returns 404 when investor not found", async () => {
    (prisma.investor.findUnique as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  // --- LP sees own change requests ---
  it("returns change requests for LP who owns the profile", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.items).toHaveLength(2);
    expect(data.counts.total).toBe(2);
    expect(data.counts.pending).toBe(1);
    expect(data.counts.accepted).toBe(1);
  });

  it("includes GP name in requestedByName field", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());
    expect(data.items[0].requestedByName).toBe("GP Admin");
  });

  it("includes fund name when available", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());
    expect(data.items[0].fundName).toBe("Test Fund");
  });

  // --- Status filter ---
  it("filters by status when provided", async () => {
    (prisma.profileChangeRequest.findMany as jest.Mock).mockResolvedValue([
      mockChangeRequests[0],
    ]);
    const { req, res } = createReq({ status: "PENDING" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(prisma.profileChangeRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { investorId: "inv-1", status: "PENDING" },
      }),
    );
  });

  it("ignores invalid status values", async () => {
    const { req, res } = createReq({ status: "INVALID" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(prisma.profileChangeRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { investorId: "inv-1" },
      }),
    );
  });

  // --- GP access ---
  it("allows GP admin to see change requests for their team's investor", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(mockGPSession);
    // GP is not the investor owner
    const gpInvestor = {
      ...mockInvestor,
      user: { id: "lp-1", email: "lp@example.com" },
    };
    (prisma.investor.findUnique as jest.Mock).mockResolvedValue(gpInvestor);
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      id: "ut-1",
      userId: "gp-1",
      teamId: "team-1",
      role: "ADMIN",
      status: "ACTIVE",
    });
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  it("returns 403 for GP who is not admin on investor's team", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(mockGPSession);
    const gpInvestor = {
      ...mockInvestor,
      user: { id: "lp-1", email: "lp@example.com" },
    };
    (prisma.investor.findUnique as jest.Mock).mockResolvedValue(gpInvestor);
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  // --- Data format ---
  it("returns ISO date strings for all timestamps", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());
    expect(data.items[0].requestedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.items[1].respondedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.items[0].respondedAt).toBeNull();
  });

  // --- Error handling ---
  it("returns 500 on unexpected errors", async () => {
    (prisma.investor.findUnique as jest.Mock).mockRejectedValue(
      new Error("DB error"),
    );
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe("Internal server error");
  });
});
