// @ts-nocheck
/**
 * Links CRUD API Tests
 *
 * Tests for:
 * - pages/api/links/index.ts (POST create link)
 * - pages/api/links/[id]/index.ts (GET, PUT, DELETE link)
 *
 * Validates:
 * - Method validation
 * - Authentication checks
 * - Link creation with various options
 * - Link retrieval (public GET)
 * - Link update with auth
 * - Link soft-delete with auth and authorization
 * - Error handling
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock functions
const mockGetServerSession = jest.fn();
const mockGenerateEncrpytedPassword = jest.fn();
const mockDecryptEncrpytedPassword = jest.fn();
const mockSendLinkCreatedWebhook = jest.fn();
const mockFetchDocumentLinkData = jest.fn();
const mockFetchDataroomLinkData = jest.fn();
const mockCheckGlobalBlockList = jest.fn();

// Mock dependencies before importing handlers
jest.mock("next-auth/next", () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/utils", () => ({
  generateEncrpytedPassword: (...args: any[]) =>
    mockGenerateEncrpytedPassword(...args),
  decryptEncrpytedPassword: (...args: any[]) =>
    mockDecryptEncrpytedPassword(...args),
  log: jest.fn(),
}));

jest.mock("@/lib/webhook/triggers/link-created", () => ({
  sendLinkCreatedWebhook: (...args: any[]) =>
    mockSendLinkCreatedWebhook(...args),
}));

jest.mock("@vercel/functions", () => ({
  waitUntil: jest.fn((promise) => promise?.catch?.(() => {})),
}));

jest.mock("@/lib/api/links/link-data", () => ({
  fetchDocumentLinkData: (...args: any[]) =>
    mockFetchDocumentLinkData(...args),
  fetchDataroomLinkData: (...args: any[]) =>
    mockFetchDataroomLinkData(...args),
}));

jest.mock("@/lib/utils/global-block-list", () => ({
  checkGlobalBlockList: (...args: any[]) =>
    mockCheckGlobalBlockList(...args),
}));

import prisma from "@/lib/prisma";
import createHandler from "@/pages/api/links/index";
import linkDetailHandler from "@/pages/api/links/[id]/index";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Helper to create a valid session
const mockSession = {
  user: {
    id: "user-123",
    email: "admin@example.com",
    name: "Admin User",
  },
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

describe("Links CRUD API - POST /api/links", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockGenerateEncrpytedPassword.mockResolvedValue("hashed-password");
    mockDecryptEncrpytedPassword.mockReturnValue("decrypted-password");
    mockSendLinkCreatedWebhook.mockResolvedValue(undefined);
    mockCheckGlobalBlockList.mockReturnValue({
      error: null,
      isBlocked: false,
    });
  });

  describe("Method Validation", () => {
    it("should reject GET requests", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await createHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({ error: "Method not allowed" });
    });

    it("should reject PUT requests", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PUT",
      });

      await createHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should reject DELETE requests", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
      });

      await createHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });
  });

  describe("Authentication", () => {
    it("should return 401 when no session exists", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          targetId: "doc-1",
          linkType: "DOCUMENT_LINK",
          teamId: "team-1",
        },
      });

      await createHandler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should proceed when session is valid", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      (mockPrisma.team.findUnique as jest.Mock).mockResolvedValue({
        id: "team-1",
        name: "Test Team",
      });
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
        const tx = {
          link: {
            create: jest.fn().mockResolvedValue({
              id: "link-new",
              documentId: "doc-1",
              dataroomId: null,
              teamId: "team-1",
              password: null,
              customFields: [],
            }),
          },
          tagItem: { createMany: jest.fn() },
          tag: { findMany: jest.fn().mockResolvedValue([]) },
        };
        return cb(tx);
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          targetId: "doc-1",
          linkType: "DOCUMENT_LINK",
          teamId: "team-1",
        },
      });

      await createHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });
  });

  describe("Business Logic - Link Creation", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue(mockSession);
    });

    it("should return 400 when team not found", async () => {
      (mockPrisma.team.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          targetId: "doc-1",
          linkType: "DOCUMENT_LINK",
          teamId: "nonexistent-team",
        },
      });

      await createHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({ error: "Team not found." });
    });

    it("should create a document link successfully", async () => {
      (mockPrisma.team.findUnique as jest.Mock).mockResolvedValue({
        id: "team-1",
      });

      const createdLink = {
        id: "link-abc",
        documentId: "doc-1",
        dataroomId: null,
        teamId: "team-1",
        password: null,
        name: "My Link",
        customFields: [],
      };

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
        const tx = {
          link: { create: jest.fn().mockResolvedValue(createdLink) },
          tagItem: { createMany: jest.fn() },
          tag: { findMany: jest.fn().mockResolvedValue([]) },
        };
        return cb(tx);
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          targetId: "doc-1",
          linkType: "DOCUMENT_LINK",
          teamId: "team-1",
          name: "My Link",
          allowDownload: true,
        },
      });

      await createHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.id).toBe("link-abc");
      expect(data._count).toEqual({ views: 0 });
    });

    it("should hash password when provided", async () => {
      (mockPrisma.team.findUnique as jest.Mock).mockResolvedValue({
        id: "team-1",
      });

      const createdLink = {
        id: "link-pwd",
        documentId: "doc-1",
        dataroomId: null,
        teamId: "team-1",
        password: "hashed-password",
        customFields: [],
      };

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
        const tx = {
          link: { create: jest.fn().mockResolvedValue(createdLink) },
          tagItem: { createMany: jest.fn() },
          tag: { findMany: jest.fn().mockResolvedValue([]) },
        };
        return cb(tx);
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          targetId: "doc-1",
          linkType: "DOCUMENT_LINK",
          teamId: "team-1",
          password: "secret123",
        },
      });

      await createHandler(req, res);

      expect(mockGenerateEncrpytedPassword).toHaveBeenCalledWith("secret123");
      expect(res._getStatusCode()).toBe(200);
      // Password should be decrypted in response
      expect(mockDecryptEncrpytedPassword).toHaveBeenCalledWith(
        "hashed-password",
      );
    });

    it("should reject when enableAgreement is true but no agreementId provided", async () => {
      (mockPrisma.team.findUnique as jest.Mock).mockResolvedValue({
        id: "team-1",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          targetId: "doc-1",
          linkType: "DOCUMENT_LINK",
          teamId: "team-1",
          enableAgreement: true,
        },
      });

      await createHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({ error: "No agreement selected." });
    });

    it("should reject GROUP audience type without groupId", async () => {
      (mockPrisma.team.findUnique as jest.Mock).mockResolvedValue({
        id: "team-1",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          targetId: "doc-1",
          linkType: "DOCUMENT_LINK",
          teamId: "team-1",
          audienceType: "GROUP",
        },
      });

      await createHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({ error: "No group selected." });
    });

    it("should reject watermark enabled without config", async () => {
      (mockPrisma.team.findUnique as jest.Mock).mockResolvedValue({
        id: "team-1",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {
          targetId: "doc-1",
          linkType: "DOCUMENT_LINK",
          teamId: "team-1",
          enableWatermark: true,
        },
      });

      await createHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error).toContain("Watermark configuration");
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors gracefully", async () => {
      (mockPrisma.link.findUnique as jest.Mock).mockRejectedValue(
        new Error("DB connection failed"),
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { id: "link-1" },
      });

      await linkDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
    });
  });
});

describe("Links CRUD API - GET /api/links/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockCheckGlobalBlockList.mockReturnValue({
      error: null,
      isBlocked: false,
    });
  });

  describe("Method Validation", () => {
    it("should reject PATCH requests", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { id: "link-1" },
      });

      await linkDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });
  });

  describe("Link Retrieval (GET)", () => {
    it("should return 404 when link not found", async () => {
      (mockPrisma.link.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { id: "nonexistent-link" },
      });

      await linkDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({ error: "Link not found" });
    });

    it("should return 404 when link is soft-deleted", async () => {
      (mockPrisma.link.findUnique as jest.Mock).mockResolvedValue({
        id: "link-1",
        deletedAt: new Date(),
        isArchived: false,
        linkType: "DOCUMENT_LINK",
        team: { plan: "pro", globalBlockList: [] },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { id: "link-1" },
      });

      await linkDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({ error: "Link has been deleted" });
    });

    it("should return 404 when link is archived", async () => {
      (mockPrisma.link.findUnique as jest.Mock).mockResolvedValue({
        id: "link-1",
        deletedAt: null,
        isArchived: true,
        linkType: "DOCUMENT_LINK",
        team: { plan: "pro", globalBlockList: [] },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { id: "link-1" },
      });

      await linkDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({ error: "Link is archived" });
    });

    it("should return 403 when email is on the global block list", async () => {
      (mockPrisma.link.findUnique as jest.Mock).mockResolvedValue({
        id: "link-1",
        deletedAt: null,
        isArchived: false,
        linkType: "DOCUMENT_LINK",
        teamId: "team-1",
        team: { plan: "pro", globalBlockList: ["blocked@test.com"] },
      });
      mockCheckGlobalBlockList.mockReturnValue({
        error: null,
        isBlocked: true,
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { id: "link-1", email: "blocked@test.com" },
      });

      await linkDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData()).toEqual({ error: "Access denied" });
    });

    it("should return document link data for DOCUMENT_LINK type", async () => {
      (mockPrisma.link.findUnique as jest.Mock).mockResolvedValue({
        id: "link-1",
        deletedAt: null,
        isArchived: false,
        linkType: "DOCUMENT_LINK",
        teamId: "team-1",
        dataroomId: null,
        team: { plan: "pro", globalBlockList: [] },
        customFields: [],
      });

      mockFetchDocumentLinkData.mockResolvedValue({
        linkData: { documentId: "doc-1", name: "Test Doc" },
        brand: { logo: "logo.png" },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { id: "link-1" },
      });

      await linkDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.linkType).toBe("DOCUMENT_LINK");
      expect(data.brand).toEqual({ logo: "logo.png" });
    });

    it("should strip premium features for free plan", async () => {
      (mockPrisma.link.findUnique as jest.Mock).mockResolvedValue({
        id: "link-1",
        deletedAt: null,
        isArchived: false,
        linkType: "DOCUMENT_LINK",
        teamId: "team-1",
        dataroomId: null,
        enableAgreement: true,
        enableWatermark: true,
        customFields: [{ id: "cf-1" }],
        team: { plan: "free", globalBlockList: [] },
      });

      mockFetchDocumentLinkData.mockResolvedValue({
        linkData: {},
        brand: null,
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { id: "link-1" },
      });

      await linkDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.link.customFields).toEqual([]);
      expect(data.link.enableAgreement).toBe(false);
      expect(data.link.enableWatermark).toBe(false);
    });
  });

  describe("Link Update (PUT)", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue(mockSession);
    });

    it("should return 401 when not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PUT",
        query: { id: "link-1" },
        body: { teamId: "team-1", linkType: "DOCUMENT_LINK" },
      });

      await linkDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should return 404 when link not found or unauthorized", async () => {
      (mockPrisma.link.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PUT",
        query: { id: "link-1" },
        body: {
          teamId: "team-1",
          linkType: "DOCUMENT_LINK",
          targetId: "doc-1",
        },
      });

      await linkDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({
        error: "Link not found or unauthorized",
      });
    });
  });

  describe("Link Delete (DELETE)", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue(mockSession);
    });

    it("should return 401 when not authenticated", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { id: "link-1" },
      });

      await linkDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should return 404 when link to delete not found", async () => {
      (mockPrisma.link.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { id: "nonexistent-link" },
      });

      await linkDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({ error: "Link not found" });
    });

    it("should return 401 when user is not authorized to delete", async () => {
      (mockPrisma.link.findUnique as jest.Mock).mockResolvedValue({
        id: "link-1",
        documentId: "doc-1",
        dataroomId: null,
        document: { ownerId: "other-user" },
        dataroom: null,
        team: { plan: "pro", users: [] },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { id: "link-1" },
      });

      await linkDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should soft-delete the link when authorized", async () => {
      (mockPrisma.link.findUnique as jest.Mock).mockResolvedValue({
        id: "link-1",
        documentId: "doc-1",
        dataroomId: null,
        document: { ownerId: "user-123" },
        dataroom: null,
        team: { plan: "pro", users: [{ userId: "user-123", role: "ADMIN" }] },
      });
      (mockPrisma.link.update as jest.Mock).mockResolvedValue({
        id: "link-1",
        deletedAt: new Date(),
        isArchived: true,
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { id: "link-1" },
      });

      // Spy on res.status to capture the 204 call. In real Node.js,
      // res.end() finalizes the response; node-mocks-http allows
      // overwrites, so we verify status(204) was called.
      const statusSpy = jest.spyOn(res, "status");

      await linkDetailHandler(req, res);

      expect(statusSpy).toHaveBeenCalledWith(204);
      expect(mockPrisma.link.update).toHaveBeenCalledWith({
        where: { id: "link-1" },
        data: {
          deletedAt: expect.any(Date),
          isArchived: true,
        },
      });
    });
  });
});
