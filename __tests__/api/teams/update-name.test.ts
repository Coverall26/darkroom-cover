// @ts-nocheck
/**
 * Team Update Name API Tests
 *
 * Tests for pages/api/teams/[teamId]/update-name.ts - Rename a team.
 *
 * These tests validate:
 * - Method validation (PATCH only)
 * - Authentication checks
 * - Authorization (admin only)
 * - Name validation and sanitization
 * - Name length limit (32 chars)
 * - Successful name update
 * - Error handling
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock functions
const mockGetServerSession = jest.fn();
const mockTeamFindUnique = jest.fn();
const mockTeamUpdate = jest.fn();
const mockValidateContent = jest.fn();

// Mock dependencies BEFORE importing the handler
jest.mock("next-auth", () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    team: {
      findUnique: (...args: any[]) => mockTeamFindUnique(...args),
      update: (...args: any[]) => mockTeamUpdate(...args),
    },
  },
}));

jest.mock("@/lib/utils/sanitize-html", () => ({
  validateContent: (...args: any[]) => mockValidateContent(...args),
}));

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {
    providers: [],
    session: { strategy: "jwt" },
  },
}));

import handler from "@/pages/api/teams/[teamId]/update-name";

describe("Team Update Name API", () => {
  const mockSession = {
    user: {
      id: "user-admin-1",
      email: "admin@example.com",
      name: "Admin User",
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  };

  const mockTeam = {
    id: "team-123",
    name: "Old Team Name",
    users: [
      { userId: "user-admin-1", role: "ADMIN" },
      { userId: "user-member-1", role: "MEMBER" },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockTeamFindUnique.mockResolvedValue(mockTeam);
    mockTeamUpdate.mockResolvedValue({ ...mockTeam, name: "New Team Name" });
    mockValidateContent.mockImplementation((input: string) => input);
  });

  // ---------- Method Validation ----------
  describe("Method Validation", () => {
    it("should reject GET requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId: "team-123" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should reject POST requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should reject PUT requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PUT",
        query: { teamId: "team-123" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should reject DELETE requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
        query: { teamId: "team-123" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should accept PATCH requests", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId: "team-123" },
        body: { name: "New Team Name" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).not.toBe(405);
    });
  });

  // ---------- Authentication ----------
  describe("Authentication", () => {
    it("should return 401 for unauthenticated requests", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId: "team-123" },
        body: { name: "New Name" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  // ---------- Authorization ----------
  describe("Authorization", () => {
    it("should return 403 when non-admin user tries to rename", async () => {
      const memberSession = {
        user: { id: "user-member-1", email: "member@example.com" },
        expires: new Date(Date.now() + 86400000).toISOString(),
      };
      mockGetServerSession.mockResolvedValue(memberSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId: "team-123" },
        body: { name: "Hijacked Name" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData()).toEqual({ error: "Access denied" });
    });

    it("should allow ADMIN role to rename team", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId: "team-123" },
        body: { name: "Renamed Team" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });

    it("should allow SUPER_ADMIN role to rename team", async () => {
      const superAdminTeam = {
        ...mockTeam,
        users: [
          { userId: "user-super", role: "SUPER_ADMIN" },
          ...mockTeam.users,
        ],
      };
      mockTeamFindUnique.mockResolvedValue(superAdminTeam);

      const superSession = {
        user: { id: "user-super", email: "super@example.com" },
        expires: new Date(Date.now() + 86400000).toISOString(),
      };
      mockGetServerSession.mockResolvedValue(superSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId: "team-123" },
        body: { name: "Super Renamed" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });
  });

  // ---------- Business Logic ----------
  describe("Business Logic", () => {
    it("should return 400 when team does not exist", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockTeamFindUnique.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId: "nonexistent" },
        body: { name: "Any Name" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({ error: "Access denied" });
    });

    it("should update team name successfully", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockValidateContent.mockReturnValue("New Valid Name");

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId: "team-123" },
        body: { name: "New Valid Name" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toBe("Team name updated!");
      expect(mockTeamUpdate).toHaveBeenCalledWith({
        where: { id: "team-123" },
        data: { name: "New Valid Name" },
      });
    });

    it("should return 400 when name exceeds 32 characters", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      const longName = "A".repeat(33);
      mockValidateContent.mockReturnValue(longName);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId: "team-123" },
        body: { name: longName },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: { message: "Team name cannot exceed 32 characters" },
      });
    });

    it("should accept name at exactly 32 characters", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      const exactName = "A".repeat(32);
      mockValidateContent.mockReturnValue(exactName);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId: "team-123" },
        body: { name: exactName },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });

    it("should return 400 when validateContent throws (empty content)", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockValidateContent.mockImplementation(() => {
        throw new Error("Content cannot be empty");
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId: "team-123" },
        body: { name: "" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: { message: "Invalid team name" },
      });
    });

    it("should sanitize name via validateContent before saving", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockValidateContent.mockReturnValue("Sanitized Name");

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId: "team-123" },
        body: { name: "<script>alert('xss')</script>Sanitized Name" },
      });

      await handler(req, res);

      expect(mockValidateContent).toHaveBeenCalledWith(
        "<script>alert('xss')</script>Sanitized Name",
      );
      expect(mockTeamUpdate).toHaveBeenCalledWith({
        where: { id: "team-123" },
        data: { name: "Sanitized Name" },
      });
    });
  });

  // ---------- Error Handling ----------
  describe("Error Handling", () => {
    it("should return 500 when database update fails", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockValidateContent.mockReturnValue("Valid Name");
      mockTeamUpdate.mockRejectedValue(new Error("Database write failed"));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
        query: { teamId: "team-123" },
        body: { name: "Valid Name" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
    });
  });
});
