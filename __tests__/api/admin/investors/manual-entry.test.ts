/**
 * Tests for POST /api/admin/investors/manual-entry
 *
 * Manual Investor Entry: GP adds investor offline with payments, documents,
 * FundAggregate updates, and optional vault access email.
 */

import { createMocks, type RequestMethod } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { POST } from "@/app/api/admin/investors/manual-entry/route";
import { wrapAppRouteHandler } from "@/__tests__/helpers/app-router-adapter";
import { logAuditEvent } from "@/lib/audit/audit-logger";

const handler = wrapAppRouteHandler({ POST });

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/crypto/secure-storage", () => ({
  encryptTaxId: jest.fn((val: string) => `encrypted:${val}`),
}));

jest.mock("@/lib/storage/investor-storage", () => ({
  uploadInvestorDocument: jest.fn().mockResolvedValue({
    path: "investors/inv-1/documents/NDA/test.pdf",
    hash: "abc123",
  }),
}));

jest.mock("@/lib/emails/send-investor-welcome", () => ({
  sendInvestorWelcomeEmailWithFund: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/rbac", () => ({
  requireAdmin: jest.fn().mockResolvedValue({ userId: "gp-1" }),
  requireAdminAppRouter: jest.fn().mockResolvedValue({ userId: "gp-1" }),
}));

const mockFund = {
  id: "fund-1",
  teamId: "team-1",
  name: "Test Fund I",
};

const mockUser = {
  id: "user-lp-1",
  email: "investor@example.com",
  name: "John Smith",
  role: "LP",
};

const mockInvestor = {
  id: "inv-1",
  userId: "user-lp-1",
  entityType: "INDIVIDUAL",
  entityName: null,
  taxId: null,
  address: null,
  phone: null,
  leadSource: "MANUAL_ADD",
  ndaSigned: true,
  ndaSignedAt: new Date(),
  onboardingStep: 7,
  onboardingCompletedAt: new Date(),
  fundData: {},
};

const mockInvestment = {
  id: "investment-1",
  fundId: "fund-1",
  investorId: "inv-1",
  commitmentAmount: 100000,
  fundedAmount: 0,
  status: "COMMITTED",
};

const mockTransaction = {
  id: "tx-1",
};

function createReq(
  body: Record<string, unknown> = {},
  method: RequestMethod = "POST",
) {
  return createMocks<NextApiRequest, NextApiResponse>({
    method,
    body: {
      firstName: "John",
      lastName: "Smith",
      email: "investor@example.com",
      entityType: "INDIVIDUAL",
      fundId: "fund-1",
      commitmentAmount: 100000,
      commitmentDate: "2026-02-14",
      ...body,
    },
  });
}

describe("POST /api/admin/investors/manual-entry", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Fund lookup
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue(mockFund);

    // User lookup/create
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

    // Investor lookup/create
    (prisma.investor.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.investor.create as jest.Mock).mockResolvedValue(mockInvestor);

    // Investment create
    (prisma.investment.create as jest.Mock).mockResolvedValue(mockInvestment);

    // Transaction create
    (prisma.transaction.create as jest.Mock).mockResolvedValue(mockTransaction);

    // FundAggregate
    (prisma.investment.aggregate as jest.Mock).mockResolvedValue({
      _sum: { fundedAmount: 0, commitmentAmount: 100000 },
    });
    (prisma.fundAggregate.upsert as jest.Mock).mockResolvedValue({});

    // LPDocument create
    (prisma.lPDocument.create as jest.Mock).mockResolvedValue({
      id: "doc-1",
    });

    // Mock $transaction to execute the callback
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
  });

  it("rejects non-POST methods", async () => {
    const { req, res } = createReq({}, "GET");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("validates required fields", async () => {
    const { req, res } = createReq({
      firstName: "",
      lastName: "",
      email: "not-an-email",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  it("returns 404 when fund not found", async () => {
    (prisma.fund.findUnique as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  it("creates investor with minimum required fields", async () => {
    const { req, res } = createReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const data = JSON.parse(res._getData());
    expect(data.investorId).toBe("inv-1");
    expect(data.investmentId).toBe("investment-1");
    expect(data.userId).toBe("user-lp-1");
  });

  it("creates user with combined first+last name", async () => {
    const { req, res } = createReq({
      firstName: "Jane",
      lastName: "Doe",
    });
    await handler(req, res);

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Jane Doe",
        email: "investor@example.com",
        role: "LP",
      }),
    });
  });

  it("encrypts tax ID when provided", async () => {
    const { encryptTaxId } = require("@/lib/crypto/secure-storage");
    const { req, res } = createReq({ taxId: "123-45-6789" });
    await handler(req, res);

    expect(encryptTaxId).toHaveBeenCalledWith("123-45-6789");
    expect(prisma.investor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taxId: "encrypted:123-45-6789",
      }),
    });
  });

  it("creates transaction records for payments", async () => {
    const { req, res } = createReq({
      fundingStatus: "FUNDED",
      payments: [
        {
          amount: "50000",
          dateReceived: "2026-02-10",
          method: "wire",
          bankReference: "WIR-001",
          notes: "First payment",
        },
        {
          amount: "50000",
          dateReceived: "2026-02-14",
          method: "ach",
          bankReference: "ACH-001",
        },
      ],
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(prisma.transaction.create).toHaveBeenCalledTimes(2);

    // Verify first transaction
    expect(prisma.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 50000,
        status: "COMPLETED",
        confirmationMethod: "MANUAL",
        bankReference: "WIR-001",
      }),
    });
  });

  it("updates FundAggregate on investment creation", async () => {
    const { req, res } = createReq();
    await handler(req, res);

    expect(prisma.fundAggregate.upsert).toHaveBeenCalledWith({
      where: { fundId: "fund-1" },
      create: expect.objectContaining({
        fundId: "fund-1",
        totalCommitted: 100000,
      }),
      update: expect.objectContaining({
        totalCommitted: 100000,
      }),
    });
  });

  it("uploads documents and creates LPDocument records", async () => {
    const { uploadInvestorDocument } = require("@/lib/storage/investor-storage");
    const { req, res } = createReq({
      documents: [
        {
          type: "NDA",
          filename: "nda.pdf",
          dateSigned: "2026-02-01",
          fileData: "base64data",
          mimeType: "application/pdf",
          fileSize: 1024,
        },
      ],
    });
    await handler(req, res);

    expect(uploadInvestorDocument).toHaveBeenCalledWith(
      "inv-1",
      "NDA",
      "base64data",
      "nda.pdf",
    );
    expect(prisma.lPDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        investorId: "inv-1",
        documentType: "NDA",
        status: "APPROVED",
        uploadSource: "GP_UPLOADED_FOR_LP",
        isOfflineSigned: true,
      }),
    });
  });

  it("sends welcome email when sendVaultAccess is true", async () => {
    const { sendInvestorWelcomeEmailWithFund } = require("@/lib/emails/send-investor-welcome");
    const { req, res } = createReq({ sendVaultAccess: true });
    await handler(req, res);

    expect(sendInvestorWelcomeEmailWithFund).toHaveBeenCalledWith(
      "user-lp-1",
      "fund-1",
    );
  });

  it("does NOT send email when sendVaultAccess is false", async () => {
    const { sendInvestorWelcomeEmailWithFund } = require("@/lib/emails/send-investor-welcome");
    const { req, res } = createReq({ sendVaultAccess: false });
    await handler(req, res);

    expect(sendInvestorWelcomeEmailWithFund).not.toHaveBeenCalled();
  });

  it("logs audit event with correct metadata", async () => {
    const { req, res } = createReq({ leadSource: "REFERRAL" });
    await handler(req, res);

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "INVESTOR_MANUAL_ENTRY",
        resourceType: "Investor",
        metadata: expect.objectContaining({
          manualEntry: true,
          investorName: "John Smith",
          leadSource: "REFERRAL",
          fundName: "Test Fund I",
        }),
      }),
    );
  });

  it("handles PARTIALLY_FUNDED status with payments", async () => {
    const { req, res } = createReq({
      fundingStatus: "PARTIALLY_FUNDED",
      payments: [
        {
          amount: "25000",
          dateReceived: "2026-02-10",
          method: "wire",
        },
      ],
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(prisma.investment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fundedAmount: 25000,
        status: "PARTIALLY_FUNDED",
      }),
    });
  });

  it("sets FUNDED status with full commitment amount when no payments specified", async () => {
    const { req, res } = createReq({
      fundingStatus: "FUNDED",
      commitmentAmount: 200000,
      payments: [],
    });
    await handler(req, res);

    expect(prisma.investment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fundedAmount: 200000,
        status: "FUNDED",
      }),
    });
  });

  it("updates existing user and investor when email already exists", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.investor.findUnique as jest.Mock).mockResolvedValue(mockInvestor);
    (prisma.investor.update as jest.Mock).mockResolvedValue(mockInvestor);

    const { req, res } = createReq();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.investor.create).not.toHaveBeenCalled();
    expect(prisma.investor.update).toHaveBeenCalled();
  });

  it("returns transaction and document IDs in response", async () => {
    const { req, res } = createReq({
      fundingStatus: "FUNDED",
      payments: [
        { amount: "100000", dateReceived: "2026-02-14", method: "wire" },
      ],
      documents: [
        {
          type: "NDA",
          filename: "nda.pdf",
          fileData: "base64",
          mimeType: "application/pdf",
          fileSize: 1024,
        },
      ],
    });
    await handler(req, res);

    const data = JSON.parse(res._getData());
    expect(data.transactionIds).toHaveLength(1);
    expect(data.documentIds).toHaveLength(1);
  });

  it("maps document types correctly", async () => {
    const { req, res } = createReq({
      documents: [
        {
          type: "SUBSCRIPTION_AGREEMENT",
          filename: "sub.pdf",
          fileData: "base64",
        },
        {
          type: "FORMATION_DOCS",
          filename: "formation.pdf",
          fileData: "base64",
        },
      ],
    });
    await handler(req, res);

    const calls = (prisma.lPDocument.create as jest.Mock).mock.calls;
    expect(calls[0][0].data.documentType).toBe("SUBSCRIPTION_AGREEMENT");
    expect(calls[1][0].data.documentType).toBe("FORMATION_DOCS");
  });
});
