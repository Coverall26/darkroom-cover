// @ts-nocheck
/**
 * Documents Index API Tests
 *
 * Tests for pages/api/teams/[teamId]/documents/index.ts
 * Covers GET (list documents) and POST (create document) endpoints.
 *
 * Validates:
 * - Method validation (GET/POST only)
 * - Authentication (session and API token)
 * - Team access authorization
 * - Document listing with counts
 * - Document creation with Zod validation
 * - Error handling
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock functions
const mockGetServerSession = jest.fn();
const mockHashToken = jest.fn();
const mockProcessDocument = jest.fn();
const mockDocumentUploadSafeParseAsync = jest.fn();
const mockSupportsAdvancedExcelMode = jest.fn();

// Mock dependencies BEFORE importing handler
jest.mock("next-auth/next", () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/api/auth/token", () => ({
  hashToken: (...args: any[]) => mockHashToken(...args),
}));

jest.mock("@/lib/api/documents/process-document", () => ({
  processDocument: (...args: any[]) => mockProcessDocument(...args),
}));

jest.mock("@/lib/zod/url-validation", () => ({
  documentUploadSchema: {
    safeParseAsync: (...args: any[]) => mockDocumentUploadSafeParseAsync(...args),
  },
}));

jest.mock("@/lib/utils/get-content-type", () => ({
  supportsAdvancedExcelMode: (...args: any[]) => mockSupportsAdvancedExcelMode(...args),
}));

jest.mock("@/lib/utils", () => ({
  log: jest.fn(),
  serializeFileSize: jest.fn((obj) => obj),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    userTeam: {
      findUnique: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    team: {
      findUnique: jest.fn(),
    },
    restrictedToken: {
      findUnique: jest.fn(),
    },
    link: {
      groupBy: jest.fn(),
    },
    view: {
      groupBy: jest.fn(),
    },
    documentVersion: {
      groupBy: jest.fn(),
    },
    dataroomDocument: {
      groupBy: jest.fn(),
    },
    folder: {
      findMany: jest.fn(),
    },
  },
}));

import handler from "@/pages/api/teams/[teamId]/documents/index";
import prisma from "@/lib/prisma";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe("Documents Index API - /api/teams/[teamId]/documents", () => {
  const teamId = "team-test-123";
  const userId = "user-test-456";

  const mockSession = {
    user: { id: userId, email: "admin@example.com", name: "Admin User" },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(mockSession);
    // Default: empty counts for groupBy queries
    (mockPrisma.link.groupBy as jest.Mock).mockResolvedValue([]);
    (mockPrisma.view.groupBy as jest.Mock).mockResolvedValue([]);
    (mockPrisma.documentVersion.groupBy as jest.Mock).mockResolvedValue([]);
    (mockPrisma.dataroomDocument.groupBy as jest.Mock).mockResolvedValue([]);
  });

  // ─── Method Validation ───────────────────────────────────────────────

  describe("Method Validation", () => {
    it("should reject PUT requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PUT",
        query: { teamId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should reject DELETE requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { teamId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should reject PATCH requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });
  });

  // ─── GET /api/teams/:teamId/documents ─────────────────────────────────

  describe("GET - Authentication", () => {
    it("should return 401 when no session exists", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should return 401 when user has no team access", async () => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  describe("GET - List Documents (Happy Path)", () => {
    const mockDocuments = [
      {
        id: "doc-1",
        name: "Pitch Deck.pdf",
        teamId,
        createdAt: new Date("2024-01-15"),
        folderId: null,
        folder: null,
      },
      {
        id: "doc-2",
        name: "Financial Model.xlsx",
        teamId,
        createdAt: new Date("2024-01-10"),
        folderId: null,
        folder: null,
      },
    ];

    beforeEach(() => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
        userId,
        teamId,
      });
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue(mockDocuments);
    });

    it("should return documents with counts for the team", async () => {
      (mockPrisma.link.groupBy as jest.Mock).mockResolvedValue([
        { documentId: "doc-1", _count: { id: 3 } },
      ]);
      (mockPrisma.view.groupBy as jest.Mock).mockResolvedValue([
        { documentId: "doc-1", _count: { id: 15 } },
        { documentId: "doc-2", _count: { id: 5 } },
      ]);
      (mockPrisma.documentVersion.groupBy as jest.Mock).mockResolvedValue([
        { documentId: "doc-1", _count: { id: 2 } },
      ]);
      (mockPrisma.dataroomDocument.groupBy as jest.Mock).mockResolvedValue([]);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.documents).toHaveLength(2);
      expect(data.documents[0]._count).toEqual({
        links: 3,
        views: 15,
        versions: 2,
        datarooms: 0,
      });
      expect(data.documents[1]._count).toEqual({
        links: 0,
        views: 5,
        versions: 0,
        datarooms: 0,
      });
    });

    it("should return documents without pagination when no query/sort params", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.documents).toBeDefined();
      expect(data.pagination).toBeUndefined();
    });

    it("should return pagination info when query param is present", async () => {
      (mockPrisma.document.count as jest.Mock).mockResolvedValue(25);
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([mockDocuments[0]]);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, query: "Pitch", page: "1", limit: "10" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.pagination).toBeDefined();
      expect(data.pagination.total).toBe(25);
      expect(data.pagination.currentPage).toBe(1);
      expect(data.pagination.pageSize).toBe(10);
    });
  });

  describe("GET - Error Handling", () => {
    it("should handle database errors via errorhandler", async () => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockRejectedValue(
        new Error("Database connection failed"),
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
    });
  });

  // ─── POST /api/teams/:teamId/documents ────────────────────────────────

  describe("POST - Authentication", () => {
    it("should return 401 when no session and no Bearer token", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId },
        body: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should authenticate via Bearer token", async () => {
      mockGetServerSession.mockResolvedValue(null);
      mockHashToken.mockReturnValue("hashed-token");
      (mockPrisma.restrictedToken.findUnique as jest.Mock).mockResolvedValue({
        userId,
        teamId,
      });
      (mockPrisma.team.findUnique as jest.Mock).mockResolvedValue({
        plan: "pro",
        enableExcelAdvancedMode: false,
      });
      mockDocumentUploadSafeParseAsync.mockResolvedValue({
        success: true,
        data: {
          name: "Test Doc",
          url: "https://storage.example.com/test.pdf",
          storageType: "S3_PATH",
          numPages: 10,
          type: "pdf",
          contentType: "application/pdf",
        },
      });
      mockProcessDocument.mockResolvedValue({
        id: "doc-new",
        name: "Test Doc",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId },
        headers: { authorization: "Bearer test-api-token" },
        body: {},
      });

      await handler(req, res);

      expect(mockHashToken).toHaveBeenCalledWith("test-api-token");
      expect(res._getStatusCode()).toBe(201);
    });

    it("should reject invalid Bearer token", async () => {
      mockHashToken.mockReturnValue("hashed-invalid");
      (mockPrisma.restrictedToken.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId },
        headers: { authorization: "Bearer invalid-token" },
        body: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should reject Bearer token for wrong team", async () => {
      mockHashToken.mockReturnValue("hashed-token");
      (mockPrisma.restrictedToken.findUnique as jest.Mock).mockResolvedValue({
        userId,
        teamId: "other-team-id",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId },
        headers: { authorization: "Bearer test-api-token" },
        body: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  describe("POST - Validation", () => {
    it("should return 400 when body fails Zod validation", async () => {
      mockDocumentUploadSafeParseAsync.mockResolvedValue({
        success: false,
        error: {
          errors: [{ message: "Name is required", path: ["name"] }],
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId },
        body: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = res._getJSONData();
      expect(data.error).toBe("Invalid document upload data");
      expect(data.details).toBeDefined();
    });
  });

  describe("POST - Business Logic", () => {
    beforeEach(() => {
      mockDocumentUploadSafeParseAsync.mockResolvedValue({
        success: true,
        data: {
          name: "Investor Deck.pdf",
          url: "https://storage.example.com/deck.pdf",
          storageType: "S3_PATH",
          numPages: 20,
          type: "pdf",
          contentType: "application/pdf",
        },
      });
    });

    it("should return 404 when team not found", async () => {
      (mockPrisma.team.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId },
        body: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("should create a document and return 201", async () => {
      (mockPrisma.team.findUnique as jest.Mock).mockResolvedValue({
        plan: "pro",
        enableExcelAdvancedMode: false,
      });
      const createdDoc = {
        id: "doc-new-123",
        name: "Investor Deck.pdf",
        teamId,
      };
      mockProcessDocument.mockResolvedValue(createdDoc);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId },
        body: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(201);
      expect(mockProcessDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId,
          userId,
        }),
      );
    });
  });
});
