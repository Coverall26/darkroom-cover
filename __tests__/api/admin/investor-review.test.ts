/**
 * Tests for POST /api/admin/investors/[investorId]/review
 *
 * GP Approval Gates: 4 actions (approve, approve-with-changes, request-changes, reject)
 * with stage advancement and audit logging.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { POST } from "@/app/api/admin/investors/[investorId]/review/route";
import { wrapAppRouteHandler } from "@/__tests__/helpers/app-router-adapter";
import { logAuditEvent } from "@/lib/audit/audit-logger";

const handler = wrapAppRouteHandler({ POST }, { investorId: "inv-1" });

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/emails/send-investor-approved", () => ({
  sendInvestorApprovedEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/emails/send-investor-changes-requested", () => ({
  sendInvestorChangesRequestedEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/emails/send-investor-rejected", () => ({
  sendInvestorRejectedEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/tracking/server-events", () => ({
  publishServerEvent: jest.fn().mockResolvedValue(undefined),
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

const mockInvestor = {
  id: "inv-1",
  userId: "lp-1",
  entityName: "Test LP Entity",
  fundData: { stage: "COMMITTED" },
  user: { email: "lp@example.com", name: "LP User" },
  investments: [{ id: "invest-1", fundId: "fund-1" }],
};

function createReq(
  body: Record<string, unknown> = {},
  query: Record<string, string> = {},
) {
  return createMocks<NextApiRequest, NextApiResponse>({
    method: "POST",
    body: {
      action: "approve",
      fundId: "fund-1",
      teamId: "team-1",
      ...body,
    },
    query: {
      investorId: "inv-1",
      ...query,
    },
  });
}

describe("POST /api/admin/investors/[investorId]/review", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(mockMembership);
    // Fund-team validation: verify fundId belongs to teamId
    (prisma.fund.findFirst as jest.Mock).mockResolvedValue({ id: "fund-1" });
    (prisma.investor.findUnique as jest.Mock).mockResolvedValue(mockInvestor);
    (prisma.investor.update as jest.Mock).mockResolvedValue({
      ...mockInvestor,
      fundData: { stage: "APPROVED" },
    });
  });

  // --- Method enforcement ---
  it("rejects non-POST methods with 405", async () => {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: method as any,
        query: { investorId: "inv-1" },
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

  // --- Validation ---
  it("returns 400 when action is missing", async () => {
    const { req, res } = createReq({ action: undefined });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("Missing required");
  });

  it("returns 400 when fundId is missing", async () => {
    const { req, res } = createReq({ fundId: undefined });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 when teamId is missing", async () => {
    const { req, res } = createReq({ teamId: undefined });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 400 for invalid action", async () => {
    const { req, res } = createReq({ action: "invalid-action" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("Invalid action");
  });

  // --- Authorization ---
  it("returns 403 when user is not an admin of the team", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  // --- Fund-team validation ---
  it("returns 403 when fundId does not belong to the team", async () => {
    (prisma.fund.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain("Fund not found");
  });

  // --- Investor lookup ---
  it("returns 404 when investor not found", async () => {
    (prisma.investor.findUnique as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  // --- Action: approve ---
  describe("approve action", () => {
    it("approves investor and sets stage to APPROVED", async () => {
      const { req, res } = createReq({ action: "approve" });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.message).toBe("Investor approved");
      expect(data.stage).toBe("APPROVED");

      expect(prisma.investor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inv-1" },
          data: expect.objectContaining({
            fundData: expect.objectContaining({
              stage: "APPROVED",
              approvedBy: "gp-1",
            }),
          }),
        }),
      );
    });

    it("logs INVESTOR_APPROVED audit event", async () => {
      const { req, res } = createReq({
        action: "approve",
        notes: "All checks passed",
      });
      await handler(req, res);
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "INVESTOR_APPROVED",
          userId: "gp-1",
          teamId: "team-1",
          resourceType: "Investor",
          resourceId: "inv-1",
          metadata: expect.objectContaining({
            action: "approve",
            fundId: "fund-1",
            notes: "All checks passed",
          }),
        }),
      );
    });
  });

  // --- Action: approve-with-changes ---
  describe("approve-with-changes action", () => {
    const changes = [
      {
        field: "entityName",
        originalValue: "Old Corp",
        newValue: "New Corp LLC",
      },
      { field: "phone", originalValue: "555-0000", newValue: "555-1234" },
    ];

    it("applies changes and sets stage to APPROVED", async () => {
      const { req, res } = createReq({
        action: "approve-with-changes",
        changes,
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.message).toBe("Investor approved with changes");
      expect(data.stage).toBe("APPROVED");
      expect(data.changesApplied).toBe(2);

      expect(prisma.investor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityName: "New Corp LLC",
            phone: "555-1234",
            fundData: expect.objectContaining({
              stage: "APPROVED",
              approvedWithChanges: true,
            }),
          }),
        }),
      );
    });

    it("returns 400 when changes array is empty", async () => {
      const { req, res } = createReq({
        action: "approve-with-changes",
        changes: [],
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData()).error).toContain("No changes");
    });

    it("returns 400 when changes is not provided", async () => {
      const { req, res } = createReq({
        action: "approve-with-changes",
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
    });

    it("preserves original values in audit log", async () => {
      const { req, res } = createReq({
        action: "approve-with-changes",
        changes,
      });
      await handler(req, res);
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "INVESTOR_APPROVED_WITH_CHANGES",
          metadata: expect.objectContaining({
            originalValues: expect.arrayContaining([
              expect.objectContaining({
                field: "entityName",
                original: "Old Corp",
                new: "New Corp LLC",
              }),
            ]),
          }),
        }),
      );
    });
  });

  // --- Action: request-changes ---
  describe("request-changes action", () => {
    const requestedChanges = [
      {
        changeType: "CORRECTION",
        fieldName: "entityName",
        reason: "Name does not match legal docs",
        currentValue: "Test LP",
        requestedValue: "Test LP LLC",
      },
    ];

    beforeEach(() => {
      (prisma.profileChangeRequest as any) = {
        create: jest
          .fn()
          .mockResolvedValue({ id: "pcr-1", status: "PENDING" }),
      };
    });

    it("creates change request records and sets stage to UNDER_REVIEW", async () => {
      const { req, res } = createReq({
        action: "request-changes",
        requestedChanges,
        notes: "Please fix entity name",
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.message).toBe("Changes requested from investor");
      expect(data.stage).toBe("UNDER_REVIEW");
      expect(data.changeRequestCount).toBe(1);

      expect(prisma.profileChangeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            investorId: "inv-1",
            fundId: "fund-1",
            requestedBy: "gp-1",
            status: "PENDING",
            changeType: "CORRECTION",
            fieldName: "entityName",
            gpNote: "Please fix entity name",
          }),
        }),
      );
    });

    it("returns 400 when requestedChanges is empty", async () => {
      const { req, res } = createReq({
        action: "request-changes",
        requestedChanges: [],
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData()).error).toContain("No change requests");
    });

    it("updates investor stage to UNDER_REVIEW", async () => {
      const { req, res } = createReq({
        action: "request-changes",
        requestedChanges,
      });
      await handler(req, res);
      expect(prisma.investor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fundData: expect.objectContaining({
              stage: "UNDER_REVIEW",
              changesRequested: true,
              changesRequestedBy: "gp-1",
            }),
          }),
        }),
      );
    });

    it("logs INVESTOR_CHANGES_REQUESTED audit event", async () => {
      const { req, res } = createReq({
        action: "request-changes",
        requestedChanges,
      });
      await handler(req, res);
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "INVESTOR_CHANGES_REQUESTED",
          metadata: expect.objectContaining({
            action: "request-changes",
            fieldsRequested: ["entityName"],
          }),
        }),
      );
    });
  });

  // --- Action: reject ---
  describe("reject action", () => {
    it("rejects investor with provided reason", async () => {
      const { req, res } = createReq({
        action: "reject",
        rejectionReason: "Does not meet accreditation requirements",
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.message).toBe("Investor rejected");
      expect(data.stage).toBe("REJECTED");

      expect(prisma.investor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fundData: expect.objectContaining({
              stage: "REJECTED",
              rejectedBy: "gp-1",
              rejectionReason: "Does not meet accreditation requirements",
            }),
          }),
        }),
      );
    });

    it("uses default rejection reason when none provided", async () => {
      const { req, res } = createReq({ action: "reject" });
      await handler(req, res);
      expect(prisma.investor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fundData: expect.objectContaining({
              rejectionReason: "Did not meet fund requirements",
            }),
          }),
        }),
      );
    });

    it("falls back to notes as rejection reason", async () => {
      const { req, res } = createReq({
        action: "reject",
        notes: "Notes-based reason",
      });
      await handler(req, res);
      expect(prisma.investor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fundData: expect.objectContaining({
              rejectionReason: "Notes-based reason",
            }),
          }),
        }),
      );
    });

    it("logs INVESTOR_REJECTED audit event", async () => {
      const { req, res } = createReq({
        action: "reject",
        rejectionReason: "Non-compliant",
      });
      await handler(req, res);
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "INVESTOR_REJECTED",
          metadata: expect.objectContaining({
            action: "reject",
            rejectionReason: "Non-compliant",
          }),
        }),
      );
    });
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

  // --- Role variations ---
  it("allows OWNER role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      ...mockMembership,
      role: "OWNER",
    });
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  it("allows SUPER_ADMIN role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      ...mockMembership,
      role: "SUPER_ADMIN",
    });
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });
});
