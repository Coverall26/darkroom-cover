// @ts-nocheck
/**
 * Document Search API Tests
 *
 * Tests for pages/api/teams/[teamId]/documents/search.ts
 * Covers the GET endpoint for searching documents by name.
 *
 * Validates:
 * - Method validation (GET only)
 * - Authentication
 * - Team access authorization
 * - Search results with aggregated counts
 * - Empty results handling
 * - Error handling
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock functions
const mockGetServerSession = jest.fn();

jest.mock("next-auth/next", () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    userTeam: {
      findUnique: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
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
  },
}));

import handler from "@/pages/api/teams/[teamId]/documents/search";
import prisma from "@/lib/prisma";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe("Document Search API - /api/teams/[teamId]/documents/search", () => {
  const teamId = "team-test-123";
  const userId = "user-test-456";

  const mockSession = {
    user: { id: userId, email: "admin@example.com", name: "Admin" },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(mockSession);
    (mockPrisma.link.groupBy as jest.Mock).mockResolvedValue([]);
    (mockPrisma.view.groupBy as jest.Mock).mockResolvedValue([]);
    (mockPrisma.documentVersion.groupBy as jest.Mock).mockResolvedValue([]);
  });

  // ─── Method Validation ───────────────────────────────────────────────

  describe("Method Validation", () => {
    it("should reject POST requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

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
  });

  // ─── Authentication ──────────────────────────────────────────────────

  describe("Authentication", () => {
    it("should return 401 when no session exists", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, query: "test" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should return 401 when user has no team access", async () => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, query: "test" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  // ─── Business Logic ──────────────────────────────────────────────────

  describe("Business Logic", () => {
    beforeEach(() => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockResolvedValue({
        userId,
        teamId,
      });
    });

    it("should return matching documents with counts", async () => {
      const mockDocs = [
        { id: "doc-1", name: "Pitch Deck Q1", teamId, createdAt: new Date() },
        { id: "doc-2", name: "Pitch Deck Q2", teamId, createdAt: new Date() },
      ];
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue(mockDocs);
      (mockPrisma.link.groupBy as jest.Mock).mockResolvedValue([
        { documentId: "doc-1", _count: { id: 2 } },
      ]);
      (mockPrisma.view.groupBy as jest.Mock).mockResolvedValue([
        { documentId: "doc-1", _count: { id: 10 } },
        { documentId: "doc-2", _count: { id: 3 } },
      ]);
      (mockPrisma.documentVersion.groupBy as jest.Mock).mockResolvedValue([
        { documentId: "doc-1", _count: { id: 1 } },
        { documentId: "doc-2", _count: { id: 2 } },
      ]);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, query: "Pitch" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data).toHaveLength(2);
      expect(data[0]._count).toEqual({ links: 2, views: 10, versions: 1 });
      expect(data[1]._count).toEqual({ links: 0, views: 3, versions: 2 });
    });

    it("should return empty array when no documents match", async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([]);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, query: "nonexistent" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data).toEqual([]);
    });

    it("should pass query to prisma with case-insensitive contains", async () => {
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([]);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, query: "Financial" },
      });

      await handler(req, res);

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teamId,
            name: { contains: "Financial", mode: "insensitive" },
          }),
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("should handle documents with zero counts", async () => {
      const mockDocs = [
        { id: "doc-1", name: "Empty Doc", teamId, createdAt: new Date() },
      ];
      (mockPrisma.document.findMany as jest.Mock).mockResolvedValue(mockDocs);
      // All groupBy calls return empty arrays (no links/views/versions)

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, query: "Empty" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data[0]._count).toEqual({ links: 0, views: 0, versions: 0 });
    });
  });

  // ─── Error Handling ──────────────────────────────────────────────────

  describe("Error Handling", () => {
    it("should handle database errors via errorhandler", async () => {
      (mockPrisma.userTeam.findUnique as jest.Mock).mockRejectedValue(
        new Error("DB connection lost"),
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, query: "test" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
    });
  });
});
