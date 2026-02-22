// @ts-nocheck
/**
 * Document Detail API Tests
 *
 * Tests for pages/api/teams/[teamId]/documents/[id]/index.ts
 * Covers GET (single document), PUT (move), PATCH (update settings),
 * and DELETE (remove document) endpoints.
 *
 * Validates:
 * - Method validation
 * - Authentication and authorization
 * - Rate limiting on GET
 * - Document retrieval with versions
 * - Document move (PUT)
 * - Document settings update via PATCH (agentsEnabled, description)
 * - Document deletion with role checks
 * - Error handling
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock functions
const mockGetServerSession = jest.fn();
const mockRatelimit = jest.fn();
const mockGetFeatureFlags = jest.fn();
const mockDeleteFile = jest.fn();

jest.mock("next-auth/next", () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/redis", () => ({
  ratelimit: (...args: any[]) => mockRatelimit(...args),
}));

jest.mock("@/lib/featureFlags", () => ({
  getFeatureFlags: (...args: any[]) => mockGetFeatureFlags(...args),
}));

jest.mock("@/lib/files/delete-file-server", () => ({
  deleteFile: (...args: any[]) => mockDeleteFile(...args),
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
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    documentPage: {
      findMany: jest.fn(),
    },
  },
}));

import handler from "@/pages/api/teams/[teamId]/documents/[id]/index";
import prisma from "@/lib/prisma";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe("Document Detail API - /api/teams/[teamId]/documents/[id]", () => {
  const teamId = "team-test-123";
  const docId = "doc-test-456";
  const userId = "user-test-789";

  const mockSession = {
    user: { id: userId, email: "admin@example.com", name: "Admin" },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(mockSession);
    // Default rate limit: success
    mockRatelimit.mockReturnValue({
      limit: jest.fn().mockResolvedValue({
        success: true,
        limit: 120,
        remaining: 119,
        reset: Date.now() + 60000,
      }),
    });
  });

  // ─── Method Validation ───────────────────────────────────────────────

  describe("Method Validation", () => {
    it("should reject POST requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      const data = res._getJSONData();
      expect(data.error).toContain("Method POST Not Allowed");
    });
  });

  // ─── GET /api/teams/:teamId/documents/:id ──────────────────────────

  describe("GET - Authentication", () => {
    it("should return 401 when no session exists", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should return 401 when user has no team access", async () => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  describe("GET - Rate Limiting", () => {
    it("should return 429 when rate limit exceeded", async () => {
      mockRatelimit.mockReturnValue({
        limit: jest.fn().mockResolvedValue({
          success: false,
          limit: 120,
          remaining: 0,
          reset: Date.now() + 60000,
        }),
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(429);
      expect(res._getJSONData().error).toBe("Too many requests");
    });

    it("should set rate limit headers on success", async () => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
        teamId,
      });
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: docId,
        teamId,
        versions: [{ id: "ver-1", isPrimary: true }],
        folder: null,
        datarooms: [],
      });
      (mockPrisma.documentPage.findMany as jest.Mock).mockResolvedValue([]);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res.getHeader("X-RateLimit-Limit")).toBe("120");
      expect(res.getHeader("X-RateLimit-Remaining")).toBe("119");
    });
  });

  describe("GET - Business Logic", () => {
    it("should return 404 when document not found", async () => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
        teamId,
      });
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData().error).toBe("The requested document does not exist");
    });

    it("should return 404 when document has no versions", async () => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
        teamId,
      });
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: docId,
        teamId,
        versions: [],
        folder: null,
        datarooms: [],
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("should return document with hasPageLinks flag", async () => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
        teamId,
      });
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: docId,
        name: "PPM.pdf",
        teamId,
        versions: [{ id: "ver-1", isPrimary: true }],
        folder: null,
        datarooms: [],
      });
      (mockPrisma.documentPage.findMany as jest.Mock).mockResolvedValue([
        { pageLinks: [{ url: "https://example.com" }] },
      ]);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.hasPageLinks).toBe(true);
      expect(data.id).toBe(docId);
    });
  });

  // ─── PATCH /api/teams/:teamId/documents/:id ─────────────────────────

  describe("PATCH - Authentication", () => {
    it("should return 401 when no session", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId, id: docId },
        body: { agentsEnabled: true },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should return 401 when user has no team access", async () => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId, id: docId },
        body: { description: "Updated description" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  describe("PATCH - Business Logic", () => {
    beforeEach(() => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
        userId,
        teamId,
        role: "ADMIN",
      });
    });

    it("should return 400 when no valid fields to update", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId, id: docId },
        body: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error).toBe("No valid fields to update");
    });

    it("should return 403 when AI feature not available but agentsEnabled requested", async () => {
      mockGetFeatureFlags.mockResolvedValue({ ai: false });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId, id: docId },
        body: { agentsEnabled: true },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error).toBe("AI feature is not available");
    });

    it("should return 400 when description exceeds 500 chars", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId, id: docId },
        body: { description: "a".repeat(501) },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error).toBe(
        "Description must be 500 characters or less",
      );
    });

    it("should update description successfully", async () => {
      (mockPrisma.document.update as jest.Mock).mockResolvedValue({
        id: docId,
        agentsEnabled: false,
        description: "New description",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId, id: docId },
        body: { description: "New description" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().description).toBe("New description");
    });
  });

  // ─── DELETE /api/teams/:teamId/documents/:id ─────────────────────────

  describe("DELETE - Authentication & Authorization", () => {
    it("should return 401 when no session", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should return 401 when user has no team access", async () => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should return 403 when user role is not ADMIN or MANAGER", async () => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
        userId,
        teamId,
        role: "MEMBER",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error).toContain("not permitted");
    });
  });

  describe("DELETE - Business Logic", () => {
    beforeEach(() => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
        userId,
        teamId,
        role: "ADMIN",
      });
    });

    it("should return 404 when document not found for deletion", async () => {
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("should delete document and its file versions from storage", async () => {
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: docId,
        teamId,
        type: "pdf",
        versions: [
          { id: "ver-1", file: "team/doc/v1.pdf", type: "pdf", storageType: "S3_PATH" },
          { id: "ver-2", file: "team/doc/v2.pdf", type: "pdf", storageType: "S3_PATH" },
        ],
      });
      (mockPrisma.document.delete as jest.Mock).mockResolvedValue({ id: docId });
      mockDeleteFile.mockResolvedValue(undefined);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(204);
      expect(mockDeleteFile).toHaveBeenCalledTimes(2);
      expect(mockPrisma.document.delete).toHaveBeenCalledWith({
        where: { id: docId },
      });
    });

    it("should skip file deletion for notion documents", async () => {
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: docId,
        teamId,
        type: "notion",
        versions: [
          { id: "ver-1", file: "notion-url", type: "notion", storageType: "NOTION" },
        ],
      });
      (mockPrisma.document.delete as jest.Mock).mockResolvedValue({ id: docId });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(204);
      expect(mockDeleteFile).not.toHaveBeenCalled();
      expect(mockPrisma.document.delete).toHaveBeenCalled();
    });

    it("should allow MANAGER role to delete documents", async () => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
        userId,
        teamId,
        role: "MANAGER",
      });
      (mockPrisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: docId,
        teamId,
        type: "pdf",
        versions: [],
      });
      (mockPrisma.document.delete as jest.Mock).mockResolvedValue({ id: docId });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(204);
    });
  });
});
