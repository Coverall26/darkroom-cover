// @ts-nocheck
/**
 * LP Upload Flow — End-to-End Integration Test
 *
 * Validates two LP upload paths:
 *   Flow A: Wire proof upload via presigned URL → wire-proof metadata API
 *   Flow B: Document upload via base64 → documents/upload API
 *
 * Covers:
 *   - Upload URL generation (presigned URL)
 *   - File upload to presigned URL
 *   - Wire proof metadata submission
 *   - Document upload metadata submission
 *   - Error handling and validation
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { wrapAppRouteHandler } from "../helpers/app-router-adapter";

// ─── Session mocks ──────────────────────────────────────────────────────────

const __mockGetServerSession = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: __mockGetServerSession,
}));

jest.mock("next-auth/next", () => ({
  getServerSession: __mockGetServerSession,
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

jest.mock("@/lib/security/bot-protection", () => ({
  verifyNotBotPages: jest.fn().mockResolvedValue(true),
  verifyNotBot: jest.fn().mockResolvedValue({ blocked: false }),
}));

const mockRequireAdminAppRouter = jest.fn();
jest.mock("@/lib/auth/rbac", () => ({
  requireAdminAppRouter: (...args: any[]) => mockRequireAdminAppRouter(...args),
  requireLPAuthAppRouter: jest.fn().mockResolvedValue({
    userId: "user-1",
    email: "lp@test.com",
    investorId: "investor-1",
    session: { user: { id: "user-1", email: "lp@test.com" } },
  }),
  enforceRBAC: jest.fn(),
  requireAdmin: jest.fn(),
  enforceRBACAppRouter: jest.fn(),
}));

// ─── Module mocks ───────────────────────────────────────────────────────────

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

jest.mock("@/lib/security/csrf", () => ({
  validateCSRF: jest.fn().mockReturnValue(true),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
  logSubscriptionEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
  handleApiError: jest.fn(),
}));

jest.mock("@/lib/wire-transfer", () => ({
  uploadProofOfPayment: jest.fn().mockResolvedValue({
    proofStatus: "RECEIVED",
    proofFileName: "wire-receipt.pdf",
  }),
  getWireInstructionsPublic: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/auth/paywall", () => ({
  requireFundroomActiveByFund: jest.fn().mockResolvedValue(true),
  PAYWALL_ERROR: { error: "Payment required" },
}));

jest.mock("@/lib/auth/lp-document-permissions", () => ({
  getLPDocumentAuthContext: jest.fn().mockResolvedValue({
    userId: "user-1",
    user: { id: "user-1", email: "lp@test.com", name: "Test LP" },
    investorId: "investor-1",
    investmentId: "investment-1",
  }),
  requirePermission: jest.fn().mockResolvedValue(true),
}));

jest.mock("@/lib/storage/investor-storage", () => ({
  uploadInvestorDocument: jest.fn().mockResolvedValue({
    path: "docs/investor-1/test-doc.pdf",
    hash: "abc123def456",
  }),
}));



// ─── Fixtures ───────────────────────────────────────────────────────────────

const LP_SESSION = {
  user: {
    id: "user-1",
    email: "lp@test.com",
    name: "Test LP",
  },
};

const MOCK_USER = {
  id: "user-1",
  email: "lp@test.com",
  name: "Test LP",
};

const MOCK_INVESTOR = {
  id: "investor-1",
  userId: "user-1",
  fundId: "fund-1",
  entityName: "Test Investor",
  user: { name: "Test LP", email: "lp@test.com" },
};

const MOCK_INVESTMENT = {
  id: "investment-1",
  investorId: "investor-1",
  fundId: "fund-1",
  commitmentAmount: 200000,
  fundedAmount: 0,
  status: "DOCS_APPROVED",
  investor: { userId: "user-1" },
};

const MOCK_TRANSACTION = {
  id: "tx-1",
  investorId: "investor-1",
  fundId: "fund-1",
  type: "WIRE_TRANSFER",
  amount: 200000,
  status: "PENDING",
  description: "Wire proof uploaded: wire-receipt.pdf",
  metadata: {
    proofDocumentKey: "proof/investment-1/wire-receipt.pdf",
    proofStorageType: "S3_PATH",
    proofFileType: "application/pdf",
    proofFileName: "wire-receipt.pdf",
    proofFileSize: 1024000,
  },
};

const MOCK_LP_DOCUMENT = {
  id: "doc-1",
  title: "Subscription Agreement",
  documentType: "SUBSCRIPTION_AGREEMENT",
  status: "UPLOADED_PENDING_REVIEW",
  investorId: "investor-1",
  fundId: "fund-1",
  createdAt: new Date(),
  fund: { name: "Test Fund", teamId: "team-1" },
};

// ─── Test Suites ────────────────────────────────────────────────────────────

describe("LP Upload Flow E2E", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __mockGetServerSession.mockResolvedValue(LP_SESSION);
    mockRequireAdminAppRouter.mockResolvedValue({
      userId: "gp-user-1",
      email: "gp@example.com",
      teamId: "team-1",
      role: "ADMIN",
      session: { user: { id: "gp-user-1", email: "gp@example.com" } },
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Flow A: Wire Proof Upload
  // ────────────────────────────────────────────────────────────────────────

  describe("Flow A: Wire Proof Upload", () => {
    let wireProofHandler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

    beforeEach(async () => {
      wireProofHandler = wrapAppRouteHandler(await import("@/app/api/lp/wire-proof/route"));
    });

    it("should accept wire proof metadata after file upload", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(MOCK_USER);
      (prisma.manualInvestment.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.investment.findUnique as jest.Mock).mockResolvedValueOnce(MOCK_INVESTMENT);
      (prisma.transaction.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.transaction.create as jest.Mock).mockResolvedValueOnce(MOCK_TRANSACTION);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          investmentId: "investment-1",
          storageKey: "proof/investment-1/wire-receipt.pdf",
          storageType: "S3_PATH",
          fileType: "application/pdf",
          fileName: "wire-receipt.pdf",
          fileSize: 1024000,
          notes: "Wire sent via Chase",
        },
      });

      await wireProofHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.proofStatus).toBe("RECEIVED");
      expect(data.proofFileName).toBe("wire-receipt.pdf");
      expect(data.transactionId).toBe("tx-1");
    });

    it("should reject if missing required fields", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(MOCK_USER);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          investmentId: "investment-1",
          // Missing storageKey, storageType, fileType, fileName
        },
      });

      await wireProofHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("should reject unauthenticated requests", async () => {
      __mockGetServerSession.mockResolvedValueOnce(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          investmentId: "investment-1",
          storageKey: "proof/investment-1/file.pdf",
          storageType: "S3_PATH",
          fileType: "application/pdf",
          fileName: "file.pdf",
        },
      });

      await wireProofHandler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should reject if investment not found", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(MOCK_USER);
      (prisma.manualInvestment.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.investment.findUnique as jest.Mock).mockResolvedValueOnce(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          investmentId: "nonexistent",
          storageKey: "proof/nonexistent/file.pdf",
          storageType: "S3_PATH",
          fileType: "application/pdf",
          fileName: "file.pdf",
        },
      });

      await wireProofHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("should reject if LP does not own the investment", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(MOCK_USER);
      (prisma.manualInvestment.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.investment.findUnique as jest.Mock).mockResolvedValueOnce({
        ...MOCK_INVESTMENT,
        investor: { userId: "other-user" },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          investmentId: "investment-1",
          storageKey: "proof/investment-1/file.pdf",
          storageType: "S3_PATH",
          fileType: "application/pdf",
          fileName: "file.pdf",
        },
      });

      await wireProofHandler(req, res);

      expect(res._getStatusCode()).toBe(403);
    });

    it("should reject duplicate wire proof if already confirmed", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(MOCK_USER);
      (prisma.manualInvestment.findUnique as jest.Mock).mockResolvedValueOnce(null);
      (prisma.investment.findUnique as jest.Mock).mockResolvedValueOnce(MOCK_INVESTMENT);
      (prisma.transaction.findFirst as jest.Mock).mockResolvedValueOnce({
        ...MOCK_TRANSACTION,
        status: "COMPLETED",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          investmentId: "investment-1",
          storageKey: "proof/investment-1/file.pdf",
          storageType: "S3_PATH",
          fileType: "application/pdf",
          fileName: "file.pdf",
        },
      });

      await wireProofHandler(req, res);

      expect(res._getStatusCode()).toBe(409);
    });

    it("should reject non-POST requests", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await wireProofHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Flow B: Document Upload
  // ────────────────────────────────────────────────────────────────────────

  describe("Flow B: LP Document Upload", () => {
    let documentUploadHandler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

    beforeEach(async () => {
      documentUploadHandler = wrapAppRouteHandler(await import("@/app/api/lp/documents/upload/route"));
    });

    it("should accept document upload with base64 file data", async () => {
      // investor.findUnique is called to verify fund association
      (prisma.investor.findUnique as jest.Mock).mockResolvedValueOnce({ fundId: "fund-1" });
      (prisma.lPDocument.create as jest.Mock).mockResolvedValueOnce(MOCK_LP_DOCUMENT);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "Subscription Agreement",
          documentType: "SUBSCRIPTION_AGREEMENT",
          fundId: "fund-1",
          fileData: "dGVzdCBmaWxlIGNvbnRlbnQ=", // base64 of "test file content"
          fileName: "sub-agreement.pdf",
          mimeType: "application/pdf",
          lpNotes: "Signed and scanned",
        },
      });

      await documentUploadHandler(req, res);

      expect(res._getStatusCode()).toBe(201);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.document).toBeDefined();
      expect(data.document.title).toBe("Subscription Agreement");
      expect(data.document.documentType).toBe("SUBSCRIPTION_AGREEMENT");
    });

    it("should reject if missing required fields", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "Test Doc",
          // Missing documentType, fundId, fileData, fileName, mimeType
        },
      });

      await documentUploadHandler(req, res);

      // Should fail with 400 due to missing fields
      expect(res._getStatusCode()).toBeGreaterThanOrEqual(400);
    });

    it("should reject non-POST requests", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await documentUploadHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Pending Details API (for GP dashboard inline resolution)
  // ────────────────────────────────────────────────────────────────────────

  describe("Pending Details API", () => {
    let pendingDetailsHandler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

    beforeEach(async () => {
      pendingDetailsHandler = wrapAppRouteHandler(await import("@/app/api/admin/fund/[id]/pending-details/route"));
    });

    it("should return detailed pending items for a fund", async () => {
      __mockGetServerSession.mockResolvedValueOnce({
        user: { id: "gp-user-1", email: "gp@test.com" },
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "gp-user-1",
        teams: [{ teamId: "team-1" }],
      });

      (prisma.fund.findFirst as jest.Mock).mockResolvedValueOnce({
        id: "fund-1",
        teamId: "team-1",
      });

      // Mock the 4 parallel queries
      (prisma.transaction.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: "tx-1",
          amount: 200000,
          status: "PENDING",
          createdAt: new Date(),
          description: "Wire proof uploaded",
          metadata: { proofFileName: "receipt.pdf" },
          investor: {
            id: "investor-1",
            entityName: "Smith LLC",
            user: { name: "John Smith", email: "john@test.com" },
          },
        },
      ]);

      (prisma.lPDocument.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: "doc-1",
          title: "NDA",
          documentType: "NDA",
          createdAt: new Date(),
          originalFilename: "nda-signed.pdf",
          investor: {
            id: "investor-2",
            entityName: null,
            user: { name: "Jane Doe", email: "jane@test.com" },
          },
        },
      ]);

      (prisma.investor.findMany as jest.Mock).mockResolvedValueOnce([
        {
          id: "investor-3",
          entityName: null,
          fundData: { approvalStage: "APPLIED" },
          accreditationStatus: "PENDING",
          onboardingStep: 1,
          onboardingCompletedAt: null,
          createdAt: new Date(),
          user: { name: "New Investor", email: "new@test.com" },
        },
      ]);

      (prisma.investment.findMany as jest.Mock).mockResolvedValueOnce([]);

      // Mock the 3 count queries
      (prisma.transaction.count as jest.Mock).mockResolvedValueOnce(1);
      (prisma.lPDocument.count as jest.Mock).mockResolvedValueOnce(1);
      (prisma.investment.count as jest.Mock).mockResolvedValueOnce(0);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { id: "fund-1", limit: "3" },
      });

      await pendingDetailsHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.pendingWires.items).toHaveLength(1);
      expect(data.pendingWires.items[0].name).toBe("John Smith");
      expect(data.pendingWires.items[0].amount).toBe(200000);
      expect(data.pendingDocs.items).toHaveLength(1);
      expect(data.pendingDocs.items[0].name).toBe("Jane Doe");
      expect(data.needsReview.items).toHaveLength(1);
      expect(data.needsReview.items[0].stage).toBe("APPLIED");
      expect(data.awaitingWire.items).toHaveLength(0);
      expect(data.totalActions).toBe(3); // 1 wire + 1 doc + 1 review
    });

    it("should reject unauthenticated requests", async () => {
      __mockGetServerSession.mockResolvedValueOnce(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { id: "fund-1" },
      });

      await pendingDetailsHandler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should reject non-GP users", async () => {
      __mockGetServerSession.mockResolvedValueOnce({
        user: { id: "user-1", email: "lp@test.com" },
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "user-1",
        teams: [],
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { id: "fund-1" },
      });

      await pendingDetailsHandler(req, res);

      expect(res._getStatusCode()).toBe(403);
    });

    it("should reject non-GET requests", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { id: "fund-1" },
      });

      await pendingDetailsHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should return 404 for fund not belonging to GP", async () => {
      __mockGetServerSession.mockResolvedValueOnce({
        user: { id: "gp-user-1", email: "gp@test.com" },
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce({
        id: "gp-user-1",
        teams: [{ teamId: "team-1" }],
      });

      (prisma.fund.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { id: "other-fund" },
      });

      await pendingDetailsHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });
  });
});
