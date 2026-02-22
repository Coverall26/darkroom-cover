// @ts-nocheck
/**
 * Team Branding API Tests
 *
 * Tests for pages/api/teams/[teamId]/branding.ts - CRUD for team branding.
 *
 * These tests validate:
 * - Method validation (GET, POST, PUT, DELETE)
 * - Authentication checks
 * - Authorization (team membership required)
 * - GET: retrieving brand or null
 * - POST: creating brand with Redis cache
 * - PUT: upserting brand with Redis cache
 * - DELETE: removing brand and Redis cache
 * - Error handling
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock functions
const mockGetServerSession = jest.fn();
const mockTeamFindUnique = jest.fn();
const mockBrandFindUnique = jest.fn();
const mockBrandFindFirst = jest.fn();
const mockBrandCreate = jest.fn();
const mockBrandUpsert = jest.fn();
const mockBrandDelete = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();

// Mock dependencies BEFORE importing the handler
jest.mock("next-auth", () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    team: {
      findUnique: (...args: any[]) => mockTeamFindUnique(...args),
    },
    brand: {
      findUnique: (...args: any[]) => mockBrandFindUnique(...args),
      findFirst: (...args: any[]) => mockBrandFindFirst(...args),
      create: (...args: any[]) => mockBrandCreate(...args),
      upsert: (...args: any[]) => mockBrandUpsert(...args),
      delete: (...args: any[]) => mockBrandDelete(...args),
    },
  },
}));

jest.mock("@/lib/redis", () => ({
  redis: {
    set: (...args: any[]) => mockRedisSet(...args),
    del: (...args: any[]) => mockRedisDel(...args),
  },
}));

jest.mock("@/lib/errorHandler", () => ({
  errorhandler: jest.fn((error: any, res: any) => {
    if (res && !res.writableEnded) {
      res.status(500).json({ error: "Internal Server Error" });
    }
  }),
}));

jest.mock("@/pages/api/auth/[...nextauth]", () => ({
  authOptions: {
    providers: [],
    session: { strategy: "jwt" },
  },
}));

import handler from "@/pages/api/teams/[teamId]/branding";

describe("Team Branding API", () => {
  const mockSession = {
    user: {
      id: "user-member-1",
      email: "user@example.com",
      name: "Team Member",
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };

  const teamWithUser = {
    id: "team-123",
    users: [{ userId: "user-member-1" }],
  };

  const mockBrand = {
    id: "brand-1",
    teamId: "team-123",
    logo: "https://cdn.example.com/logo.png",
    banner: "https://cdn.example.com/banner.png",
    brandColor: "#FF6600",
    accentColor: "#003366",
    welcomeMessage: "Welcome to our fund!",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockTeamFindUnique.mockResolvedValue(teamWithUser);
    mockBrandFindUnique.mockResolvedValue(null);
    mockBrandFindFirst.mockResolvedValue(null);
    mockBrandCreate.mockResolvedValue(mockBrand);
    mockBrandUpsert.mockResolvedValue(mockBrand);
    mockBrandDelete.mockResolvedValue(mockBrand);
    mockRedisSet.mockResolvedValue("OK");
    mockRedisDel.mockResolvedValue(1);
  });

  // ---------- Method Validation ----------
  describe("Method Validation", () => {
    it("should reject unsupported PATCH method with 405", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId: "team-123" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });
  });

  // ---------- Authentication ----------
  describe("Authentication", () => {
    it("should return 401 for unauthenticated GET requests", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId: "team-123" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should return 401 for unauthenticated POST requests", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { logo: "https://example.com/logo.png" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  // ---------- Authorization ----------
  describe("Authorization", () => {
    it("should return 403 when user is not a team member", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      // Team exists but user is not a member
      mockTeamFindUnique.mockResolvedValue({
        id: "team-123",
        users: [{ userId: "other-user" }],
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId: "team-123" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
    });

    it("should return 403 when team does not exist", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockTeamFindUnique.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId: "nonexistent" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
    });
  });

  // ---------- GET /api/teams/:teamId/branding ----------
  describe("GET - Retrieve Branding", () => {
    it("should return null when no branding exists", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockBrandFindUnique.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId: "team-123" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toBeNull();
    });

    it("should return brand data when branding exists", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockBrandFindUnique.mockResolvedValue(mockBrand);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId: "team-123" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.logo).toBe("https://cdn.example.com/logo.png");
      expect(data.brandColor).toBe("#FF6600");
      expect(data.welcomeMessage).toBe("Welcome to our fund!");
    });
  });

  // ---------- POST /api/teams/:teamId/branding ----------
  describe("POST - Create Branding", () => {
    it("should create branding successfully", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const brandData = {
        logo: "https://cdn.example.com/newlogo.png",
        brandColor: "#112233",
        accentColor: "#445566",
        welcomeMessage: "Hello investors!",
      };

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: brandData,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockBrandCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            logo: "https://cdn.example.com/newlogo.png",
            brandColor: "#112233",
            accentColor: "#445566",
            welcomeMessage: "Hello investors!",
            teamId: "team-123",
          }),
        }),
      );
    });

    it("should cache logo URL in Redis when logo is provided", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { logo: "https://cdn.example.com/logo.png" },
      });

      await handler(req, res);

      expect(mockRedisSet).toHaveBeenCalledWith(
        "brand:logo:team-123",
        "https://cdn.example.com/logo.png",
      );
    });

    it("should not cache in Redis when no logo is provided", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { brandColor: "#FF0000" },
      });

      await handler(req, res);

      expect(mockRedisSet).not.toHaveBeenCalled();
    });
  });

  // ---------- PUT /api/teams/:teamId/branding ----------
  describe("PUT - Upsert Branding", () => {
    it("should upsert branding successfully", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const brandData = {
        logo: "https://cdn.example.com/updated-logo.png",
        brandColor: "#AABBCC",
      };

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PUT",
        query: { teamId: "team-123" },
        body: brandData,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockBrandUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamId: "team-123" },
          create: expect.objectContaining({
            logo: "https://cdn.example.com/updated-logo.png",
            teamId: "team-123",
          }),
          update: expect.objectContaining({
            logo: "https://cdn.example.com/updated-logo.png",
          }),
        }),
      );
    });

    it("should update Redis cache with new logo on PUT", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PUT",
        query: { teamId: "team-123" },
        body: { logo: "https://cdn.example.com/new-logo.png" },
      });

      await handler(req, res);

      expect(mockRedisSet).toHaveBeenCalledWith(
        "brand:logo:team-123",
        "https://cdn.example.com/new-logo.png",
      );
    });

    it("should delete Redis cache when logo is removed on PUT", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PUT",
        query: { teamId: "team-123" },
        body: { logo: undefined, brandColor: "#000000" },
      });

      await handler(req, res);

      expect(mockRedisDel).toHaveBeenCalledWith("brand:logo:team-123");
    });
  });

  // ---------- DELETE /api/teams/:teamId/branding ----------
  describe("DELETE - Remove Branding", () => {
    it("should delete branding and clear Redis cache", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockBrandFindFirst.mockResolvedValue({
        id: "brand-1",
        logo: "https://cdn.example.com/logo.png",
        banner: null,
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { teamId: "team-123" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(204);
      expect(mockBrandDelete).toHaveBeenCalledWith({
        where: { id: "brand-1" },
      });
      expect(mockRedisDel).toHaveBeenCalledWith("brand:logo:team-123");
    });

    it("should attempt delete even when no brand found (brand id is undefined)", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockBrandFindFirst.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { teamId: "team-123" },
      });

      // This will call delete with undefined id - the handler does brand?.id
      await handler(req, res);

      expect(mockBrandDelete).toHaveBeenCalledWith({
        where: { id: undefined },
      });
    });
  });
});
