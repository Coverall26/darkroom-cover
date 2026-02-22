// @ts-nocheck
/**
 * Document Update Name API Tests
 *
 * Tests for pages/api/teams/[teamId]/documents/[id]/update-name.ts
 * Covers the POST endpoint for renaming a document.
 *
 * Validates:
 * - Method validation (POST only)
 * - Authentication
 * - Team access authorization
 * - Zod input validation (name required, max 255 chars)
 * - Atomic transaction for document rename
 * - Document not found handling
 * - Error handling
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock functions
const mockGetServerSession = jest.fn();
const mockUserTeamFindUnique = jest.fn();
const mockTransactionDocumentFindUnique = jest.fn();
const mockTransactionDocumentUpdate = jest.fn();

jest.mock("next-auth/next", () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    userTeam: {
      findUnique: (...args: any[]) => mockUserTeamFindUnique(...args),
    },
    $transaction: jest.fn((callback) =>
      callback({
        document: {
          findUnique: (...args: any[]) =>
            mockTransactionDocumentFindUnique(...args),
          update: (...args: any[]) => mockTransactionDocumentUpdate(...args),
        },
      }),
    ),
  },
}));

import handler from "@/pages/api/teams/[teamId]/documents/[id]/update-name";

describe("Document Update Name API - /api/teams/[teamId]/documents/[id]/update-name", () => {
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
    mockUserTeamFindUnique.mockResolvedValue({ userId, teamId });
  });

  // ─── Method Validation ───────────────────────────────────────────────

  describe("Method Validation", () => {
    it("should reject GET requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should reject PUT requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PUT",
        query: { teamId, id: docId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should reject DELETE requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { teamId, id: docId },
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
        method: "POST",
        query: { teamId, id: docId },
        body: { name: "New Name" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should return 401 when user has no team access", async () => {
      mockUserTeamFindUnique.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId, id: docId },
        body: { name: "New Name" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  // ─── Input Validation ────────────────────────────────────────────────

  describe("Input Validation", () => {
    it("should return 400 when name is missing", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId, id: docId },
        body: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = res._getJSONData();
      expect(data.error).toBe("Invalid input");
    });

    it("should return 400 when name is empty string", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId, id: docId },
        body: { name: "" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = res._getJSONData();
      expect(data.error).toBe("Invalid input");
    });

    it("should return 400 when name exceeds 255 characters", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId, id: docId },
        body: { name: "a".repeat(256) },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = res._getJSONData();
      expect(data.error).toBe("Invalid input");
    });
  });

  // ─── Business Logic ──────────────────────────────────────────────────

  describe("Business Logic", () => {
    it("should successfully update document name", async () => {
      mockTransactionDocumentFindUnique.mockResolvedValue({ id: docId });
      mockTransactionDocumentUpdate.mockResolvedValue({
        id: docId,
        name: "Renamed Document.pdf",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId, id: docId },
        body: { name: "Renamed Document.pdf" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().message).toBe("Document name updated!");
      expect(mockTransactionDocumentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: docId, teamId },
          data: { name: "Renamed Document.pdf" },
        }),
      );
    });

    it("should return 404 when document not found in transaction", async () => {
      // Override $transaction to return null for this call only, simulating
      // no document found. The handler checks `if (!result)` after the
      // transaction and returns 404.
      const prisma = require("@/lib/prisma").default;
      prisma.$transaction.mockResolvedValueOnce(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId, id: docId },
        body: { name: "New Name" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData().error).toBe("Document not found");
    });

    it("should accept name with exactly 255 characters", async () => {
      const longName = "a".repeat(255);
      mockTransactionDocumentFindUnique.mockResolvedValue({ id: docId });
      mockTransactionDocumentUpdate.mockResolvedValue({
        id: docId,
        name: longName,
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId, id: docId },
        body: { name: longName },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });

    it("should verify team-scoped document lookup in transaction", async () => {
      mockTransactionDocumentFindUnique.mockResolvedValue({ id: docId });
      mockTransactionDocumentUpdate.mockResolvedValue({ id: docId, name: "Test" });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId, id: docId },
        body: { name: "Test" },
      });

      await handler(req, res);

      // Verify the transaction looks up by both docId and teamId
      expect(mockTransactionDocumentFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: docId,
            teamId: teamId,
          }),
        }),
      );
    });
  });
});
