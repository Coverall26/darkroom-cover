// @ts-nocheck
/**
 * LP Process Payment API Tests
 *
 * Tests for pages/api/lp/subscription/process-payment.ts - Payment processing.
 *
 * These tests validate:
 * - Authentication requirements
 * - Subscription ownership validation
 * - Bank account requirement
 * - Signature requirement before payment
 * - Duplicate payment prevention
 * - Manual processing fallback when Plaid not configured
 * - ACH transfer authorization and creation
 * - Payment failure handling
 * - Audit logging
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock functions - defined at module level for hoisting
const mockGetServerSession = jest.fn();
const mockUserFindUnique = jest.fn();
const mockSubscriptionFindFirst = jest.fn();
const mockSubscriptionUpdate = jest.fn();
const mockSignatureDocumentFindUnique = jest.fn();
const mockTransactionFindMany = jest.fn();
const mockTransactionCreate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: (...args: any[]) => mockUserFindUnique(...args),
    },
    subscription: {
      findFirst: (...args: any[]) => mockSubscriptionFindFirst(...args),
      update: (...args: any[]) => mockSubscriptionUpdate(...args),
    },
    signatureDocument: {
      findUnique: (...args: any[]) => mockSignatureDocumentFindUnique(...args),
    },
    transaction: {
      findMany: (...args: any[]) => mockTransactionFindMany(...args),
      create: (...args: any[]) => mockTransactionCreate(...args),
    },
  },
}));

// Convenience aliases
const mockPrismaUser = { findUnique: mockUserFindUnique };
const mockPrismaSubscription = {
  findFirst: mockSubscriptionFindFirst,
  update: mockSubscriptionUpdate,
};
const mockPrismaSignatureDocument = { findUnique: mockSignatureDocumentFindUnique };
const mockPrismaTransaction = {
  findMany: mockTransactionFindMany,
  create: mockTransactionCreate,
};

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  apiRateLimiter: jest.fn().mockResolvedValue(true),
  authRateLimiter: jest.fn().mockResolvedValue(true),
  strictRateLimiter: jest.fn().mockResolvedValue(true),
  uploadRateLimiter: jest.fn().mockResolvedValue(true),
  signatureRateLimiter: jest.fn().mockResolvedValue(true),
  mfaVerifyRateLimiter: jest.fn().mockResolvedValue(true),
  appRouterRateLimit: jest.fn().mockResolvedValue(null),
  appRouterStrictRateLimit: jest.fn().mockResolvedValue(null),
  appRouterUploadRateLimit: jest.fn().mockResolvedValue(null),
  appRouterAuthRateLimit: jest.fn().mockResolvedValue(null),
  appRouterMfaRateLimit: jest.fn().mockResolvedValue(null),
  appRouterSignatureRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/auth/rbac", () => ({
  requireLPAuthAppRouter: jest.fn().mockResolvedValue({
    userId: "user-1",
    email: "investor@example.com",
    investorId: "investor-1",
    session: { user: { id: "user-1", email: "investor@example.com" } },
  }),
}));

// Mock Plaid functions
const mockIsPlaidConfigured = jest.fn();
const mockDecryptToken = jest.fn();
const mockCreateTransferAuthorization = jest.fn();
const mockCreateTransfer = jest.fn();

jest.mock("@/lib/plaid", () => ({
  isPlaidConfigured: () => mockIsPlaidConfigured(),
  decryptToken: (token: string) => mockDecryptToken(token),
  createTransferAuthorization: (...args: any[]) =>
    mockCreateTransferAuthorization(...args),
  createTransfer: (...args: any[]) => mockCreateTransfer(...args),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logPaymentEvent: jest.fn().mockResolvedValue("audit-log-id"),
}));
jest.mock("@/lib/security/bot-protection", () => ({
  verifyNotBotPages: jest.fn().mockResolvedValue(true),
  verifyNotBot: jest.fn().mockResolvedValue({ blocked: false }),
}));


import { POST } from "@/app/api/lp/subscription/process-payment/route";
import { wrapAppRouteHandler } from "@/__tests__/helpers/app-router-adapter";
import { logPaymentEvent } from "@/lib/audit/audit-logger";

const handler = wrapAppRouteHandler({ POST });

describe("LP Process Payment API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("HTTP Method Validation", () => {
    it("should reject non-POST requests", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData().error).toBe("Method not allowed");
    });
  });

  describe("Authentication", () => {
    it("should reject unauthenticated requests", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { subscriptionId: "sub-1" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(res._getJSONData().error).toBe("Unauthorized");
    });
  });

  describe("Input Validation", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });
    });

    it("should require subscriptionId", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error).toBe("Subscription ID is required");
    });
  });

  describe("Investor Profile Validation", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });
    });

    it("should reject user without investor profile", async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        investorProfile: null,
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { subscriptionId: "sub-1" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error).toBe("Investor profile not found");
    });
  });

  describe("Bank Account Validation", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });
    });

    it("should reject when no bank account linked", async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        investorProfile: {
          id: "investor-1",
          bankLinks: [], // No bank accounts
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { subscriptionId: "sub-1" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().code).toBe("NO_BANK_ACCOUNT");
      expect(res._getJSONData().error).toContain("No bank account connected");
    });
  });

  describe("Subscription Validation", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });

      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        name: "John Investor",
        investorProfile: {
          id: "investor-1",
          entityName: "John LLC",
          bankLinks: [
            {
              id: "bank-1",
              status: "ACTIVE",
              plaidAccessToken: "encrypted-token",
              plaidAccountId: "acc-123",
            },
          ],
        },
      });
    });

    it("should reject when subscription not found", async () => {
      mockPrismaSubscription.findFirst.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { subscriptionId: "nonexistent-sub" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData().error).toBe("Subscription not found");
    });

    it("should reject subscription with invalid status", async () => {
      mockPrismaSubscription.findFirst.mockResolvedValue({
        id: "sub-1",
        status: "CANCELLED",
        amount: 100000,
        fundId: "fund-1",
        signatureDocumentId: "doc-1",
        fund: { name: "Test Fund", teamId: "team-1" },
      });

      mockPrismaSignatureDocument.findUnique.mockResolvedValue({
        id: "doc-1",
        recipients: [{ status: "SIGNED" }],
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { subscriptionId: "sub-1" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error).toContain("cannot be processed");
    });
  });

  describe("Signature Validation", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });

      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        name: "John Investor",
        investorProfile: {
          id: "investor-1",
          entityName: "John LLC",
          bankLinks: [
            {
              id: "bank-1",
              status: "ACTIVE",
              plaidAccessToken: "encrypted-token",
              plaidAccountId: "acc-123",
            },
          ],
        },
      });
    });

    it("should reject payment when document not signed", async () => {
      mockPrismaSubscription.findFirst.mockResolvedValue({
        id: "sub-1",
        status: "PENDING",
        amount: 100000,
        fundId: "fund-1",
        signatureDocumentId: "doc-1",
        fund: { name: "Test Fund" },
      });

      mockPrismaSignatureDocument.findUnique.mockResolvedValue({
        id: "doc-1",
        recipients: [{ status: "PENDING" }], // Not signed
      });

      mockPrismaTransaction.findMany.mockResolvedValue([]);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { subscriptionId: "sub-1" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().code).toBe("NOT_SIGNED");
    });
  });

  describe("Duplicate Payment Prevention", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });

      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        name: "John Investor",
        investorProfile: {
          id: "investor-1",
          entityName: "John LLC",
          bankLinks: [
            {
              id: "bank-1",
              status: "ACTIVE",
              plaidAccessToken: "encrypted-token",
              plaidAccountId: "acc-123",
            },
          ],
        },
      });
    });

    it("should reject duplicate payment for same subscription", async () => {
      mockPrismaSubscription.findFirst.mockResolvedValue({
        id: "sub-1",
        status: "SIGNED",
        amount: 100000,
        fundId: "fund-1",
        signatureDocumentId: "doc-1",
        createdAt: new Date("2024-01-01"),
        fund: { name: "Test Fund", teamId: "team-1" },
      });

      mockPrismaSignatureDocument.findUnique.mockResolvedValue({
        id: "doc-1",
        recipients: [{ status: "SIGNED" }],
      });

      // Existing transaction with same subscriptionId
      mockPrismaTransaction.findMany.mockResolvedValue([
        {
          id: "txn-existing",
          amount: 100000,
          fundId: "fund-1",
          status: "PENDING",
          createdAt: new Date("2024-01-02"),
          metadata: { subscriptionId: "sub-1" },
        },
      ]);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { subscriptionId: "sub-1" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error).toContain("payment is already pending");
      expect(res._getJSONData().transactionId).toBe("txn-existing");
    });
  });

  describe("Manual Processing (Plaid Not Configured)", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });

      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        name: "John Investor",
        investorProfile: {
          id: "investor-1",
          entityName: "John LLC",
          bankLinks: [
            {
              id: "bank-1",
              status: "ACTIVE",
              plaidAccessToken: "encrypted-token",
              plaidAccountId: "acc-123",
            },
          ],
        },
      });

      mockPrismaSubscription.findFirst.mockResolvedValue({
        id: "sub-1",
        status: "SIGNED",
        amount: 100000,
        fundId: "fund-1",
        signatureDocumentId: "doc-1",
        fund: { name: "Test Fund", teamId: "team-1" },
      });

      mockPrismaSignatureDocument.findUnique.mockResolvedValue({
        id: "doc-1",
        recipients: [{ status: "SIGNED" }],
      });

      mockPrismaTransaction.findMany.mockResolvedValue([]);
      mockIsPlaidConfigured.mockReturnValue(false);
    });

    it("should create pending transaction for manual processing", async () => {
      mockPrismaTransaction.create.mockResolvedValue({
        id: "txn-manual",
        status: "PENDING",
        amount: 100000,
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { subscriptionId: "sub-1" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.success).toBe(true);
      expect(data.message).toContain("Manual processing required");
      expect(data.transaction.status).toBe("PENDING");
    });

    it("should log PAYMENT_RECORDED event for manual processing", async () => {
      mockPrismaTransaction.create.mockResolvedValue({
        id: "txn-manual",
        status: "PENDING",
        amount: 100000,
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { subscriptionId: "sub-1" },
      });

      await handler(req, res);

      expect(logPaymentEvent).toHaveBeenCalledWith(
        req,
        expect.objectContaining({
          eventType: "SUBSCRIPTION_PAYMENT_RECORDED",
        })
      );
    });
  });

  describe("Manual Payment Processing (Plaid Disabled - Phase 2)", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });

      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        name: "John Investor",
        investorProfile: {
          id: "investor-1",
          entityName: "John LLC",
          bankLinks: [
            {
              id: "bank-1",
              status: "ACTIVE",
              plaidAccessToken: "encrypted-token",
              plaidAccountId: "acc-123",
            },
          ],
        },
      });

      mockPrismaSubscription.findFirst.mockResolvedValue({
        id: "sub-1",
        status: "SIGNED",
        amount: 100000,
        fundId: "fund-1",
        signatureDocumentId: "doc-1",
        fund: { name: "Test Fund", teamId: "team-1" },
      });

      mockPrismaSignatureDocument.findUnique.mockResolvedValue({
        id: "doc-1",
        recipients: [{ status: "SIGNED" }],
      });

      mockPrismaTransaction.findMany.mockResolvedValue([]);
    });

    it("should record payment for manual processing", async () => {
      mockPrismaTransaction.create.mockResolvedValue({
        id: "txn-123",
        status: "PENDING",
        amount: 100000,
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { subscriptionId: "sub-1" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.success).toBe(true);
      expect(data.message).toContain("Manual processing required");
    });

    it("should log PAYMENT_RECORDED event", async () => {
      mockPrismaTransaction.create.mockResolvedValue({
        id: "txn-123",
        status: "PENDING",
        amount: 100000,
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { subscriptionId: "sub-1" },
      });

      await handler(req, res);

      expect(logPaymentEvent).toHaveBeenCalledWith(
        req,
        expect.objectContaining({
          eventType: "SUBSCRIPTION_PAYMENT_RECORDED",
        })
      );
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });
    });

    it("should handle database errors gracefully", async () => {
      mockPrismaUser.findUnique.mockRejectedValue(
        new Error("Database connection failed")
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { subscriptionId: "sub-1" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData().error).toBe("Internal server error");
    });

    it("should handle transaction creation errors gracefully", async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        name: "John",
        investorProfile: {
          id: "investor-1",
          entityName: "John LLC",
          bankLinks: [
            {
              id: "bank-1",
              status: "ACTIVE",
            },
          ],
        },
      });

      mockPrismaSubscription.findFirst.mockResolvedValue({
        id: "sub-1",
        status: "SIGNED",
        amount: 100000,
        fundId: "fund-1",
        signatureDocumentId: "doc-1",
        fund: { name: "Test Fund", teamId: "team-1" },
      });

      mockPrismaSignatureDocument.findUnique.mockResolvedValue({
        id: "doc-1",
        recipients: [{ status: "SIGNED" }],
      });

      mockPrismaTransaction.findMany.mockResolvedValue([]);
      mockPrismaTransaction.create.mockRejectedValue(
        new Error("Transaction creation failed")
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { subscriptionId: "sub-1" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData().error).toBe("Internal server error");
    });
  });
});
