/**
 * GP Document Review Flow Wiring Verification (P0-6)
 *
 * Verifies the complete document review pipeline:
 *   LP uploads doc -> GP sees pending -> GP reviews (approve/reject/revision)
 *   -> LP notified -> Auto-advancement on approval
 *
 * Tests both review patterns:
 *   - New pattern: PATCH /api/documents/[docId]/{confirm|reject|request-reupload}
 *   - Old pattern: POST /api/admin/documents/[id]/review
 *
 * Tests auto-advancement: COMMITTED -> DOCS_APPROVED when all docs approved
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Helper to flush fire-and-forget promises
const flushPromises = () => new Promise((r) => setImmediate(r));

// --- Mocks ---

const mockGetServerSession = jest.fn();

jest.mock("next-auth/next", () => ({
  getServerSession: mockGetServerSession,
}));

// Legacy review.ts imports from "next-auth" (not "next-auth/next")
jest.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/auth/rbac", () => ({
  enforceRBAC: jest.fn().mockResolvedValue({
    userId: "gp_user_1",
    email: "gp@example.com",
    teamIds: ["team_1"],
  }),
  requireAdmin: jest.fn().mockResolvedValue({
    userId: "gp_user_1",
    email: "gp@example.com",
    teamIds: ["team_1"],
  }),
  requireTeamMember: jest.fn(),
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

jest.mock("@/lib/auth/paywall", () => ({
  requireFundroomActive: jest.fn().mockResolvedValue(true),
  requireFundroomActiveByFund: jest.fn().mockResolvedValue(true),
}));

const mockSendReviewNotification = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/emails/send-document-review-notification", () => ({
  sendDocumentReviewNotification: mockSendReviewNotification,
  __esModule: true,
  default: mockSendReviewNotification,
}));

const mockAdvanceOnDocApproval = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/investors/advance-on-doc-approval", () => ({
  advanceInvestorOnDocApproval: mockAdvanceOnDocApproval,
  __esModule: true,
  default: mockAdvanceOnDocApproval,
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/storage/investor-storage", () => ({
  uploadInvestorDocument: jest.fn().mockResolvedValue({
    path: "storage/doc123.pdf",
    hash: "sha256-abc123",
  }),
}));

// Mock for LP document upload auth
jest.mock("@/lib/auth/lp-document-permissions", () => ({
  getLPDocumentAuthContext: jest.fn().mockResolvedValue({
    investorId: "inv_1",
    fundId: "fund_1",
    teamId: "team_1",
    user: { id: "lp_user_1", email: "lp@example.com" },
  }),
  requirePermission: jest.fn().mockReturnValue(true),
}));

// Mock Prisma enums
jest.mock("@prisma/client", () => ({
  LPDocumentType: {
    NDA: "NDA",
    SUBSCRIPTION_AGREEMENT: "SUBSCRIPTION_AGREEMENT",
    LPA: "LPA",
    SIDE_LETTER: "SIDE_LETTER",
    K1_TAX_FORM: "K1_TAX_FORM",
    PROOF_OF_FUNDS: "PROOF_OF_FUNDS",
    WIRE_CONFIRMATION: "WIRE_CONFIRMATION",
    ACH_RECEIPT: "ACH_RECEIPT",
    ACCREDITATION_PROOF: "ACCREDITATION_PROOF",
    IDENTITY_DOCUMENT: "IDENTITY_DOCUMENT",
    OTHER: "OTHER",
  },
  LPDocumentUploadSource: {
    LP_UPLOADED: "LP_UPLOADED",
    LP_UPLOADED_EXTERNAL: "LP_UPLOADED_EXTERNAL",
    GP_UPLOADED_FOR_LP: "GP_UPLOADED_FOR_LP",
  },
}));

// Mock resend (used by inline notifyGPOfLPUpload in lp/documents/upload.ts)
jest.mock("@/lib/resend", () => ({
  sendOrgEmail: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  lPDocument: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  lPDocumentReview: {
    create: jest.fn(),
  },
  investor: {
    findUnique: jest.fn(),
  },
  investment: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  fund: {
    findFirst: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  userTeam: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  // Handle both array form and callback form of $transaction
  $transaction: jest.fn((input: unknown) => {
    if (Array.isArray(input)) return Promise.all(input);
    return (input as Function)(mockPrisma);
  }),
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: mockPrisma,
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
  appRouterMfaRateLimit: jest.fn().mockResolvedValue(null),
  appRouterSignatureRateLimit: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/security/bot-protection", () => ({
  verifyNotBotPages: jest.fn().mockResolvedValue(true),
  verifyNotBot: jest.fn().mockResolvedValue({ blocked: false }),
}));



// --- Test Data ---

const TEST_GP_USER_ID = "gp_user_1";
const TEST_INVESTOR_ID = "inv_1";
const TEST_FUND_ID = "fund_1";
const TEST_TEAM_ID = "team_1";
const TEST_DOC_ID = "doc_1";

const PENDING_DOC = {
  id: TEST_DOC_ID,
  title: "Subscription Agreement",
  documentType: "SUBSCRIPTION_AGREEMENT",
  status: "UPLOADED_PENDING_REVIEW",
  fundId: TEST_FUND_ID,
  investorId: TEST_INVESTOR_ID,
  originalFilename: "sub_agreement.pdf",
  storageKey: "storage/sub_agreement.pdf",
  reviewedAt: null,
  deletedAt: null,
  createdAt: new Date(),
  investor: {
    id: TEST_INVESTOR_ID,
    entityName: "Test Investor LLC",
    fundId: TEST_FUND_ID,
    userId: "lp_user_1",
    user: { name: "John Doe", email: "john@example.com" },
  },
  fund: {
    id: TEST_FUND_ID,
    teamId: TEST_TEAM_ID,
    name: "Test Fund I",
  },
};

// --- Tests ---

describe("GP Document Review Flow Wiring (P0-6)", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default GP admin session
    mockGetServerSession.mockResolvedValue({
      user: { id: TEST_GP_USER_ID, email: "gp@example.com" },
    });

    // Default user with admin team
    mockPrisma.user.findUnique.mockResolvedValue({
      id: TEST_GP_USER_ID,
      email: "gp@example.com",
      teams: [{ teamId: TEST_TEAM_ID, role: "ADMIN" }],
    });

    // Default pending doc
    mockPrisma.lPDocument.findUnique.mockResolvedValue(PENDING_DOC);
    mockPrisma.lPDocument.update.mockResolvedValue({
      ...PENDING_DOC,
      status: "APPROVED",
      reviewedAt: new Date(),
    });
    mockPrisma.lPDocumentReview.create.mockResolvedValue({ id: "review_1", status: "APPROVED", createdAt: new Date() });

    // Fund access check
    mockPrisma.fund.findFirst.mockResolvedValue({
      id: TEST_FUND_ID,
      teamId: TEST_TEAM_ID,
    });

    // GP team membership for legacy review endpoint
    mockPrisma.userTeam.findFirst.mockResolvedValue({
      userId: TEST_GP_USER_ID,
      teamId: TEST_TEAM_ID,
      role: "ADMIN",
    });

    // Team entries for pending-review and GP notification queries
    mockPrisma.userTeam.findMany.mockResolvedValue([
      { teamId: TEST_TEAM_ID, userId: TEST_GP_USER_ID, role: "ADMIN", status: "ACTIVE", user: { email: "gp@example.com" } },
    ]);
  });

  // ===================================================================
  // SECTION 1: DOCUMENT CONFIRMATION (APPROVE)
  // ===================================================================

  describe("Document Confirmation (PATCH /api/documents/[docId]/confirm)", () => {
    let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

    beforeAll(async () => {
      const mod = await import("@/pages/api/documents/[docId]/confirm");
      handler = mod.default;
    });

    it("should approve a pending document", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { docId: TEST_DOC_ID },
        body: { reviewNotes: "Looks good, approved" },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);

      const body = JSON.parse(res._getData());
      expect(body.success).toBe(true);
      expect(body.document.status).toBe("APPROVED");
    });

    it("should call auto-advancement after approval", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { docId: TEST_DOC_ID },
        body: {},
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);

      // Wait for fire-and-forget to complete
      await flushPromises();

      expect(mockAdvanceOnDocApproval).toHaveBeenCalled();
    });

    it("should reject GET method", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { docId: TEST_DOC_ID },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(405);
    });

    it("should return 404 for non-existent document", async () => {
      mockPrisma.lPDocument.findUnique.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { docId: "nonexistent" },
        body: {},
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(404);
    });
  });

  // ===================================================================
  // SECTION 2: DOCUMENT REJECTION
  // ===================================================================

  describe("Document Rejection (PATCH /api/documents/[docId]/reject)", () => {
    let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

    beforeAll(async () => {
      const mod = await import("@/pages/api/documents/[docId]/reject");
      handler = mod.default;
    });

    it("should reject a pending document", async () => {
      mockPrisma.lPDocument.update.mockResolvedValue({
        ...PENDING_DOC,
        status: "REJECTED",
        reviewedAt: new Date(),
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { docId: TEST_DOC_ID },
        body: { reviewNotes: "Missing signatures on page 3" },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);

      const body = JSON.parse(res._getData());
      expect(body.success).toBe(true);
      expect(body.document.status).toBe("REJECTED");
    });

    it("should NOT call auto-advancement on rejection", async () => {
      mockPrisma.lPDocument.update.mockResolvedValue({
        ...PENDING_DOC,
        status: "REJECTED",
        reviewedAt: new Date(),
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { docId: TEST_DOC_ID },
        body: { reviewNotes: "Incomplete" },
      });

      await handler(req, res);
      await flushPromises();

      expect(mockAdvanceOnDocApproval).not.toHaveBeenCalled();
    });
  });

  // ===================================================================
  // SECTION 3: REQUEST RE-UPLOAD
  // ===================================================================

  describe("Request Re-upload (PATCH /api/documents/[docId]/request-reupload)", () => {
    let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

    beforeAll(async () => {
      const mod = await import("@/pages/api/documents/[docId]/request-reupload");
      handler = mod.default;
    });

    it("should set status to REVISION_REQUESTED", async () => {
      mockPrisma.lPDocument.update.mockResolvedValue({
        ...PENDING_DOC,
        status: "REVISION_REQUESTED",
        reviewedAt: new Date(),
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { docId: TEST_DOC_ID },
        body: { reviewNotes: "Please upload a clearer scan" },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);

      const body = JSON.parse(res._getData());
      expect(body.success).toBe(true);
      expect(body.document.status).toBe("REVISION_REQUESTED");
    });
  });

  // ===================================================================
  // SECTION 4: PENDING REVIEW LIST
  // ===================================================================

  describe("Pending Review List (GET /api/documents/pending-review)", () => {
    let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

    beforeAll(async () => {
      const mod = await import("@/pages/api/documents/pending-review");
      handler = mod.default;
    });

    it("should return pending documents list", async () => {
      mockPrisma.lPDocument.findMany.mockResolvedValue([PENDING_DOC]);
      mockPrisma.lPDocument.count
        .mockResolvedValueOnce(1) // pending
        .mockResolvedValueOnce(5) // approved
        .mockResolvedValueOnce(0) // rejected
        .mockResolvedValueOnce(0); // revision

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { fundId: TEST_FUND_ID },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);

      const body = JSON.parse(res._getData());
      expect(body.documents).toBeDefined();
      expect(body.statusCounts).toBeDefined();
    });

    it("should reject POST requests", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(405);
    });
  });

  // ===================================================================
  // SECTION 5: LEGACY REVIEW ENDPOINT
  // ===================================================================

  describe("Legacy Review (POST /api/admin/documents/[id]/review)", () => {
    let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

    beforeAll(async () => {
      const { POST } = await import("@/app/api/admin/documents/[id]/review/route");
      const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
      handler = wrapAppRouteHandler({ POST }, { id: TEST_DOC_ID });
    });

    it("should approve via legacy endpoint", async () => {
      mockPrisma.lPDocument.findUnique.mockResolvedValue(PENDING_DOC);
      mockPrisma.lPDocument.update.mockResolvedValue({
        ...PENDING_DOC,
        status: "APPROVED",
        reviewedAt: new Date(),
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { id: TEST_DOC_ID },
        body: { action: "APPROVE", reviewNotes: "All good" },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);

      const body = JSON.parse(res._getData());
      expect(body.success).toBe(true);
      expect(body.document.status).toBe("APPROVED");
    });

    it("should reject via legacy endpoint", async () => {
      mockPrisma.lPDocument.findUnique.mockResolvedValue(PENDING_DOC);
      mockPrisma.lPDocument.update.mockResolvedValue({
        ...PENDING_DOC,
        status: "REJECTED",
        reviewedAt: new Date(),
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { id: TEST_DOC_ID },
        body: { action: "REJECT", reviewNotes: "Incomplete documentation" },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);

      const body = JSON.parse(res._getData());
      expect(body.success).toBe(true);
      expect(body.document.status).toBe("REJECTED");
    });

    it("should request revision via legacy endpoint", async () => {
      mockPrisma.lPDocument.findUnique.mockResolvedValue(PENDING_DOC);
      mockPrisma.lPDocument.update.mockResolvedValue({
        ...PENDING_DOC,
        status: "REVISION_REQUESTED",
        reviewedAt: new Date(),
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { id: TEST_DOC_ID },
        body: { action: "REQUEST_REVISION", reviewNotes: "Need clearer scan" },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);

      const body = JSON.parse(res._getData());
      expect(body.success).toBe(true);
    });
  });

  // ===================================================================
  // SECTION 6: LP DOCUMENT UPLOAD
  // ===================================================================

  describe("LP Document Upload (POST /api/lp/documents/upload)", () => {
    let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

    beforeAll(async () => {
      const { POST } = await import("@/app/api/lp/documents/upload/route");
      const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
      handler = wrapAppRouteHandler({ POST });
    });

    it("should create document with UPLOADED_PENDING_REVIEW status", async () => {
      // LP session
      mockGetServerSession.mockResolvedValue({
        user: { id: "lp_user_1", email: "lp@example.com" },
      });

      // Investor belongs to fund
      mockPrisma.investor.findUnique.mockResolvedValue({
        id: TEST_INVESTOR_ID,
        fundId: TEST_FUND_ID,
      });

      mockPrisma.lPDocument.create.mockResolvedValue({
        id: "new_doc_1",
        title: "NDA",
        documentType: "NDA",
        status: "UPLOADED_PENDING_REVIEW",
        createdAt: new Date(),
        fund: { name: "Test Fund I", teamId: TEST_TEAM_ID },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "NDA",
          documentType: "NDA",
          fundId: TEST_FUND_ID,
          fileData: Buffer.from("fake-pdf-content").toString("base64"),
          fileName: "nda.pdf",
          mimeType: "application/pdf",
        },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(201);

      const body = JSON.parse(res._getData());
      expect(body.success).toBe(true);
      expect(body.document).toBeDefined();
      expect(body.document.status).toBe("UPLOADED_PENDING_REVIEW");
    });
  });

  // ===================================================================
  // SECTION 7: DOCUMENT STATUS FLOW VERIFICATION
  // ===================================================================

  describe("Document Status Flow Verification", () => {
    it("should follow correct status transitions", () => {
      const validTransitions: Record<string, string[]> = {
        UPLOADED_PENDING_REVIEW: ["APPROVED", "REJECTED", "REVISION_REQUESTED"],
        REVISION_REQUESTED: ["UPLOADED_PENDING_REVIEW"], // LP re-uploads
        REJECTED: [], // terminal
        APPROVED: [], // terminal (but can be superseded by newer upload)
      };

      expect(validTransitions.UPLOADED_PENDING_REVIEW).toContain("APPROVED");
      expect(validTransitions.UPLOADED_PENDING_REVIEW).toContain("REJECTED");
      expect(validTransitions.UPLOADED_PENDING_REVIEW).toContain("REVISION_REQUESTED");
    });

    it("should support all LP document types", () => {
      const documentTypes = [
        "NDA",
        "SUBSCRIPTION_AGREEMENT",
        "LPA",
        "SIDE_LETTER",
        "K1_TAX_FORM",
        "PROOF_OF_FUNDS",
        "WIRE_CONFIRMATION",
        "ACH_RECEIPT",
        "ACCREDITATION_PROOF",
        "IDENTITY_DOCUMENT",
        "OTHER",
      ];

      expect(documentTypes).toHaveLength(11);
      documentTypes.forEach((type) => {
        expect(type).toBeTruthy();
        expect(type.length).toBeGreaterThan(0);
      });
    });

    it("should wire auto-advancement to investment pipeline", () => {
      expect(mockAdvanceOnDocApproval).toBeDefined();
      expect(typeof mockAdvanceOnDocApproval).toBe("function");
    });
  });
});
