// @ts-nocheck
/**
 * Teams Index API Tests
 *
 * Tests for pages/api/teams/index.ts - List and create teams.
 *
 * These tests validate:
 * - Method validation (GET/POST only)
 * - Authentication checks
 * - GET: listing user teams, auto-creating default team for non-viewer users
 * - POST: creating new teams
 * - Error handling
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock functions
const mockGetServerSession = jest.fn();
const mockTeamFindUnique = jest.fn();
const mockTeamFindMany = jest.fn();
const mockTeamCreate = jest.fn();
const mockUserTeamFindMany = jest.fn();
const mockViewerFindFirst = jest.fn();
const mockLinkFindFirst = jest.fn();

// Mock dependencies BEFORE importing the handler
jest.mock("next-auth", () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    userTeam: {
      findMany: (...args: any[]) => mockUserTeamFindMany(...args),
    },
    team: {
      findUnique: (...args: any[]) => mockTeamFindUnique(...args),
      findMany: (...args: any[]) => mockTeamFindMany(...args),
      create: (...args: any[]) => mockTeamCreate(...args),
    },
    viewer: {
      findFirst: (...args: any[]) => mockViewerFindFirst(...args),
    },
    link: {
      findFirst: (...args: any[]) => mockLinkFindFirst(...args),
    },
  },
}));

jest.mock("@/lib/utils", () => ({
  log: jest.fn(),
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

import handler from "@/pages/api/teams/index";

describe("Teams Index API", () => {
  const mockSession = {
    user: {
      id: "user-123",
      email: "admin@example.com",
      name: "Test Admin",
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockUserTeamFindMany.mockResolvedValue([]);
    mockViewerFindFirst.mockResolvedValue(null);
    mockLinkFindFirst.mockResolvedValue(null);
    mockTeamCreate.mockResolvedValue({
      id: "team-new",
      name: "New Team",
      plan: "free",
      createdAt: new Date(),
      enableExcelAdvancedMode: false,
      replicateDataroomFolders: false,
    });
  });

  // ---------- Method Validation ----------
  describe("Method Validation", () => {
    it("should reject PUT requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PUT",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should reject DELETE requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should reject PATCH requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PATCH",
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
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("should return 401 for unauthenticated POST requests", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { team: "My Team" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  // ---------- GET /api/teams (List Teams) ----------
  describe("GET /api/teams - List Teams", () => {
    it("should return user teams when teams exist", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const mockTeams = [
        {
          team: {
            id: "team-1",
            name: "Alpha Fund",
            plan: "pro",
            createdAt: new Date("2024-01-01"),
            enableExcelAdvancedMode: false,
            replicateDataroomFolders: false,
          },
        },
        {
          team: {
            id: "team-2",
            name: "Beta Fund",
            plan: "free",
            createdAt: new Date("2024-02-01"),
            enableExcelAdvancedMode: true,
            replicateDataroomFolders: true,
          },
        },
      ];
      mockUserTeamFindMany.mockResolvedValue(mockTeams);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data).toHaveLength(2);
      expect(data[0].id).toBe("team-1");
      expect(data[1].id).toBe("team-2");
    });

    it("should auto-create default team for admin user with no teams", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockUserTeamFindMany.mockResolvedValue([]);
      mockViewerFindFirst.mockResolvedValue(null);
      mockLinkFindFirst.mockResolvedValue(null);

      const createdTeam = {
        id: "team-auto",
        name: "Test Admin's Team",
        plan: "free",
        createdAt: new Date(),
        enableExcelAdvancedMode: false,
        replicateDataroomFolders: false,
      };
      mockTeamCreate.mockResolvedValue(createdTeam);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockTeamCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Test Admin's Team",
            users: {
              create: {
                userId: "user-123",
                role: "ADMIN",
              },
            },
          }),
        }),
      );
      const data = res._getJSONData();
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe("team-auto");
    });

    it("should NOT auto-create team for viewer-only users", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockUserTeamFindMany.mockResolvedValue([]);
      // User is a viewer (has group memberships)
      mockViewerFindFirst.mockResolvedValue({ id: "viewer-1" });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockTeamCreate).not.toHaveBeenCalled();
      expect(res._getJSONData()).toEqual([]);
    });

    it("should NOT auto-create team for users in an allowList", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockUserTeamFindMany.mockResolvedValue([]);
      mockViewerFindFirst.mockResolvedValue(null);
      // User is in a link allowList
      mockLinkFindFirst.mockResolvedValue({ id: "link-1" });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockTeamCreate).not.toHaveBeenCalled();
      expect(res._getJSONData()).toEqual([]);
    });

    it("should use 'Personal Team' when user has no name", async () => {
      const sessionNoName = {
        user: { id: "user-123", email: "admin@example.com", name: null },
        expires: new Date(Date.now() + 86400000).toISOString(),
      };
      mockGetServerSession.mockResolvedValue(sessionNoName);
      mockUserTeamFindMany.mockResolvedValue([]);
      mockViewerFindFirst.mockResolvedValue(null);
      mockLinkFindFirst.mockResolvedValue(null);

      const createdTeam = {
        id: "team-personal",
        name: "Personal Team",
        plan: "free",
        createdAt: new Date(),
        enableExcelAdvancedMode: false,
        replicateDataroomFolders: false,
      };
      mockTeamCreate.mockResolvedValue(createdTeam);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);

      expect(mockTeamCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Personal Team",
          }),
        }),
      );
    });
  });

  // ---------- POST /api/teams (Create Team) ----------
  describe("POST /api/teams - Create Team", () => {
    it("should create a new team successfully", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const newTeam = {
        id: "team-new",
        name: "Franchise Fund I",
        users: [{ userId: "user-123", role: "ADMIN" }],
      };
      mockTeamCreate.mockResolvedValue(newTeam);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { team: "Franchise Fund I" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(201);
      expect(mockTeamCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Franchise Fund I",
            users: {
              create: {
                userId: "user-123",
                role: "ADMIN",
              },
            },
          }),
        }),
      );
      expect(res._getJSONData().id).toBe("team-new");
    });

    it("should assign the creating user as ADMIN", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockTeamCreate.mockResolvedValue({
        id: "team-new",
        name: "Test",
        users: [{ userId: "user-123", role: "ADMIN" }],
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { team: "Test" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(201);
      const createCall = mockTeamCreate.mock.calls[0][0];
      expect(createCall.data.users.create.role).toBe("ADMIN");
    });
  });

  // ---------- Error Handling ----------
  describe("Error Handling", () => {
    it("should handle database errors on GET gracefully", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockUserTeamFindMany.mockRejectedValue(new Error("DB connection failed"));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
    });

    it("should handle database errors on POST gracefully", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockTeamCreate.mockRejectedValue(new Error("Unique constraint violated"));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { team: "Duplicate Team" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
    });
  });
});
