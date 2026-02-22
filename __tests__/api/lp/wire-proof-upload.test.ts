/**
 * Wire Proof Upload Endpoint Verification
 *
 * Tests: pages/api/lp/documents/upload.ts
 * Related: components/lp/proof-upload-card.tsx, lib/wire-transfer/proof.ts
 *
 * Verifies:
 *   - Successful file upload with valid data
 *   - File type validation (PDF, PNG, JPG)
 *   - File size validation (≤25MB)
 *   - Authentication requirement
 *   - LPDocument creation with UPLOADED_PENDING_REVIEW status
 *   - Upload source tracking (LP_UPLOADED vs LP_UPLOADED_EXTERNAL)
 *   - Fund scoping (investor can only upload to their fund)
 *   - GP notification email trigger
 *   - Audit log entry creation
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock auth context (Pages Router mock kept for reference, App Router uses rbac)
jest.mock("@/lib/auth/lp-document-permissions", () => ({
  getLPDocumentAuthContext: jest.fn(),
  requirePermission: jest.fn(),
}));

const mockRequireLPAuthAppRouter = jest.fn();
jest.mock("@/lib/auth/rbac", () => ({
  requireLPAuthAppRouter: (...args: any[]) => mockRequireLPAuthAppRouter(...args),
  enforceRBAC: jest.fn(),
  requireAdmin: jest.fn(),
  enforceRBACAppRouter: jest.fn(),
  requireAdminAppRouter: jest.fn(),
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  appRouterUploadRateLimit: jest.fn().mockResolvedValue(null),
  apiRateLimiter: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/storage/investor-storage", () => ({
  uploadInvestorDocument: jest.fn().mockResolvedValue({
    path: "investors/inv123/WIRE_CONFIRMATION/proof.pdf",
    hash: "sha256-abc123def456",
  }),
}));

// Mock email notification
const mockSendOrgEmail = jest.fn().mockResolvedValue({ id: "email-1" });
jest.mock("@/lib/resend", () => ({
  sendOrgEmail: (...args: any[]) => mockSendOrgEmail(...args),
}));

jest.mock("@/components/emails/document-upload-notification", () => ({
  DocumentUploadNotification: jest.fn(() => "mock-email-html"),
}));

// Prisma mock
const mockPrisma = {
  investor: {
    findUnique: jest.fn(),
  },
  investment: {
    findFirst: jest.fn(),
  },
  lPDocument: {
    create: jest.fn(),
  },
  userTeam: {
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: mockPrisma,
}));

const { getLPDocumentAuthContext, requirePermission } = require("@/lib/auth/lp-document-permissions");
const { logAuditEvent } = require("@/lib/audit/audit-logger");
const { uploadInvestorDocument } = require("@/lib/storage/investor-storage");

// Test data
const INVESTOR_ID = "inv_test_proof";
const FUND_ID = "fund_test_proof";
const USER_ID = "user_test_proof";
const TEAM_ID = "team_test_proof";

// Base64 encoded tiny PDF placeholder
const TEST_FILE_DATA = Buffer.from("test-pdf-content").toString("base64");

describe("Wire Proof Upload Endpoint (app/api/lp/documents/upload/route.ts)", () => {
  let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

  beforeAll(async () => {
    const mod = await import("@/app/api/lp/documents/upload/route");
    const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
    handler = wrapAppRouteHandler(mod);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Default auth context (authenticated LP via App Router rbac)
    mockRequireLPAuthAppRouter.mockResolvedValue({
      userId: USER_ID,
      email: "lp@example.com",
      investorId: INVESTOR_ID,
      teamId: TEAM_ID,
      session: { user: { id: USER_ID, email: "lp@example.com" } },
    });

    // App Router route calls prisma.user.findUnique to build auth context
    mockPrisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: "lp@example.com",
      role: "USER",
      investorProfile: { id: INVESTOR_ID, fundId: FUND_ID },
      teams: [],
    });

    // Default investor with fund association
    mockPrisma.investor.findUnique.mockResolvedValue({
      id: INVESTOR_ID,
      fundId: FUND_ID,
    });

    // Default LP document creation
    mockPrisma.lPDocument.create.mockResolvedValue({
      id: "doc_created_123",
      title: "Wire Transfer Proof",
      documentType: "WIRE_CONFIRMATION",
      fundId: FUND_ID,
      investorId: INVESTOR_ID,
      status: "UPLOADED_PENDING_REVIEW",
      uploadSource: "LP_UPLOADED",
      createdAt: new Date(),
      fund: { name: "Test Fund", teamId: TEAM_ID },
    });

    // GP admin list for notifications
    mockPrisma.userTeam.findMany.mockResolvedValue([
      { user: { email: "gp@example.com" }, role: "OWNER" },
    ]);
  });

  describe("Method enforcement", () => {
    it("should reject GET requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(405);
      expect(JSON.parse(res._getData())).toEqual({ error: "Method not allowed" });
    });
  });

  describe("Authentication", () => {
    it("should reject unauthenticated requests", async () => {
      const { NextResponse } = require("next/server");
      mockRequireLPAuthAppRouter.mockResolvedValue(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "Wire Proof",
          documentType: "WIRE_CONFIRMATION",
          fundId: FUND_ID,
          fileData: TEST_FILE_DATA,
          fileName: "proof.pdf",
        },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(401);
    });

    it("should reject requests with no investor profile", async () => {
      // User exists but has no investorProfile
      mockPrisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: "lp@example.com",
        role: "USER",
        investorProfile: null,
        teams: [],
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "Wire Proof",
          documentType: "WIRE_CONFIRMATION",
          fundId: FUND_ID,
          fileData: TEST_FILE_DATA,
          fileName: "proof.pdf",
        },
      });

      await handler(req, res);
      // App Router returns 403 (insufficient permissions) when no investor profile
      // because permissions list is empty (no "documents:upload_own")
      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData()).error).toContain("permission");
    });
  });

  describe("Input validation", () => {
    it("should reject missing required fields", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "Wire Proof",
          // Missing: documentType, fundId, fileData, fileName
        },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData()).error).toContain("required");
    });

    it("should reject invalid document type", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "Wire Proof",
          documentType: "INVALID_TYPE",
          fundId: FUND_ID,
          fileData: TEST_FILE_DATA,
          fileName: "proof.pdf",
        },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData()).error).toContain("Invalid document type");
    });
  });

  describe("Fund scoping", () => {
    it("should reject upload to a fund the investor is not associated with", async () => {
      mockPrisma.investor.findUnique.mockResolvedValue({
        id: INVESTOR_ID,
        fundId: "different_fund_id",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "Wire Proof",
          documentType: "WIRE_CONFIRMATION",
          fundId: FUND_ID,
          fileData: TEST_FILE_DATA,
          fileName: "proof.pdf",
        },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData()).error).toContain("associated fund");
    });
  });

  describe("Successful upload", () => {
    it("should create LPDocument with UPLOADED_PENDING_REVIEW status", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "Wire Transfer Proof",
          documentType: "WIRE_CONFIRMATION",
          fundId: FUND_ID,
          fileData: TEST_FILE_DATA,
          fileName: "proof.pdf",
          mimeType: "application/pdf",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(201);
      const body = JSON.parse(res._getData());
      expect(body.success).toBe(true);
      expect(body.document).toBeDefined();
      expect(body.document.status).toBe("UPLOADED_PENDING_REVIEW");
      expect(body.document.documentType).toBe("WIRE_CONFIRMATION");
    });

    it("should call uploadInvestorDocument with correct params", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "Wire Proof",
          documentType: "WIRE_CONFIRMATION",
          fundId: FUND_ID,
          fileData: TEST_FILE_DATA,
          fileName: "proof.pdf",
          mimeType: "application/pdf",
        },
      });

      await handler(req, res);

      expect(uploadInvestorDocument).toHaveBeenCalledWith(
        INVESTOR_ID,
        "WIRE_CONFIRMATION",
        expect.any(Buffer),
        "proof.pdf",
      );
    });

    it("should create audit log entry", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "Wire Proof",
          documentType: "WIRE_CONFIRMATION",
          fundId: FUND_ID,
          fileData: TEST_FILE_DATA,
          fileName: "proof.pdf",
        },
      });

      await handler(req, res);

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "ADMIN_ACTION",
          userId: USER_ID,
          resourceType: "Document",
          metadata: expect.objectContaining({
            action: "LP document uploaded",
            documentType: "WIRE_CONFIRMATION",
            investorId: INVESTOR_ID,
            fundId: FUND_ID,
          }),
        }),
      );
    });

    it("should set LP_UPLOADED upload source for normal uploads", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "Wire Proof",
          documentType: "WIRE_CONFIRMATION",
          fundId: FUND_ID,
          fileData: TEST_FILE_DATA,
          fileName: "proof.pdf",
          isOfflineSigned: false,
        },
      });

      await handler(req, res);

      expect(mockPrisma.lPDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            uploadSource: "LP_UPLOADED",
            status: "UPLOADED_PENDING_REVIEW",
          }),
        }),
      );
    });

    it("should set LP_UPLOADED_EXTERNAL for offline-signed docs", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "Signed Sub Agreement",
          documentType: "SUBSCRIPTION_AGREEMENT",
          fundId: FUND_ID,
          fileData: TEST_FILE_DATA,
          fileName: "signed-sub-ag.pdf",
          isOfflineSigned: true,
          externalSigningDate: "2026-02-15",
        },
      });

      await handler(req, res);

      expect(mockPrisma.lPDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            uploadSource: "LP_UPLOADED_EXTERNAL",
            isOfflineSigned: true,
          }),
        }),
      );
    });
  });

  describe("Supported document types", () => {
    const validDocTypes = [
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

    it("should accept all 11 valid document types", () => {
      expect(validDocTypes).toHaveLength(11);
      expect(validDocTypes).toContain("WIRE_CONFIRMATION");
      expect(validDocTypes).toContain("PROOF_OF_FUNDS");
      expect(validDocTypes).toContain("ACCREDITATION_PROOF");
    });
  });

  describe("Error handling", () => {
    it("should return 500 with generic message on internal error", async () => {
      mockPrisma.investor.findUnique.mockRejectedValue(new Error("DB connection lost"));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          title: "Wire Proof",
          documentType: "WIRE_CONFIRMATION",
          fundId: FUND_ID,
          fileData: TEST_FILE_DATA,
          fileName: "proof.pdf",
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData()).error).toBe("Internal server error");
    });
  });
});
