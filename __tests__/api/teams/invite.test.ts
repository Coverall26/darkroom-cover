// @ts-nocheck
/**
 * Team Invite API Tests
 *
 * Tests for pages/api/teams/[teamId]/invite.ts - Send team invitations.
 *
 * These tests validate:
 * - Method validation (POST only)
 * - Authentication checks
 * - Authorization (only admins can invite)
 * - Email required validation
 * - Duplicate member and invitation checks
 * - User limit enforcement
 * - Invitation creation and email sending
 * - Error handling
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock functions
const mockGetServerSession = jest.fn();
const mockTeamFindUnique = jest.fn();
const mockInvitationFindUnique = jest.fn();
const mockInvitationCreate = jest.fn();
const mockVerificationTokenCreate = jest.fn();
const mockGetLimits = jest.fn();
const mockSendTeammateInviteEmail = jest.fn();
const mockHashToken = jest.fn();
const mockNewId = jest.fn();
const mockGenerateChecksum = jest.fn();
const mockGenerateJWT = jest.fn();

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
    invitation: {
      findUnique: (...args: any[]) => mockInvitationFindUnique(...args),
      create: (...args: any[]) => mockInvitationCreate(...args),
    },
    verificationToken: {
      create: (...args: any[]) => mockVerificationTokenCreate(...args),
    },
  },
}));

jest.mock("@/ee/limits/server", () => ({
  getLimits: (...args: any[]) => mockGetLimits(...args),
}));

jest.mock("@/lib/emails/send-teammate-invite", () => ({
  sendTeammateInviteEmail: (...args: any[]) =>
    mockSendTeammateInviteEmail(...args),
}));

jest.mock("@/lib/api/auth/token", () => ({
  hashToken: (...args: any[]) => mockHashToken(...args),
}));

jest.mock("@/lib/id-helper", () => ({
  newId: (...args: any[]) => mockNewId(...args),
}));

jest.mock("@/lib/team/roles", () => ({
  isAdminRole: (role: string) =>
    role === "OWNER" || role === "SUPER_ADMIN" || role === "ADMIN",
}));

jest.mock("@/lib/utils/generate-checksum", () => ({
  generateChecksum: (...args: any[]) => mockGenerateChecksum(...args),
}));

jest.mock("@/lib/utils/generate-jwt", () => ({
  generateJWT: (...args: any[]) => mockGenerateJWT(...args),
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

import handler from "@/pages/api/teams/[teamId]/invite";

describe("Team Invite API", () => {
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
    name: "Fund Alpha",
    users: [
      {
        userId: "user-admin-1",
        role: "ADMIN",
        user: { email: "admin@example.com" },
      },
      {
        userId: "user-member-1",
        role: "MEMBER",
        user: { email: "member@example.com" },
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
    mockTeamFindUnique.mockResolvedValue(mockTeam);
    mockInvitationFindUnique.mockResolvedValue(null);
    mockInvitationCreate.mockResolvedValue({ id: "inv-1" });
    mockVerificationTokenCreate.mockResolvedValue({ id: "vt-1" });
    mockGetLimits.mockResolvedValue({ users: null }); // unlimited by default
    mockNewId.mockReturnValue("inv_abc123");
    mockHashToken.mockReturnValue("hashed-token");
    mockGenerateChecksum.mockReturnValue("checksum-abc");
    mockGenerateJWT.mockReturnValue("jwt-token-abc");
    mockSendTeammateInviteEmail.mockResolvedValue({ success: true });

    process.env.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";
  });

  // ---------- Method Validation ----------
  describe("Method Validation", () => {
    it("should not handle GET requests (no method match, implicit 200)", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
        query: { teamId: "team-123" },
      });

      await handler(req, res);

      // The handler only handles POST; GET falls through with no response set
      expect(res._getStatusCode()).toBe(200);
    });

    it("should accept POST requests", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { email: "newuser@example.com" },
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
        method: "POST",
        query: { teamId: "team-123" },
        body: { email: "newuser@example.com" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  // ---------- Validation ----------
  describe("Validation", () => {
    it("should return 400 when email is missing from body", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toBe("Email is missing in request body");
    });

    it("should return 404 when team is not found", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockTeamFindUnique.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "nonexistent-team" },
        body: { email: "newuser@example.com" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toBe("Team not found");
    });
  });

  // ---------- Authorization ----------
  describe("Authorization", () => {
    it("should return 403 when non-admin user tries to invite", async () => {
      const memberSession = {
        user: { id: "user-member-1", email: "member@example.com", name: "Member" },
        expires: new Date(Date.now() + 86400000).toISOString(),
      };
      mockGetServerSession.mockResolvedValue(memberSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { email: "newuser@example.com" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData()).toBe("Only admins can send the invitation!");
    });

    it("should return 403 when user is not part of team", async () => {
      const outsiderSession = {
        user: { id: "user-outsider", email: "outsider@example.com", name: "Outsider" },
        expires: new Date(Date.now() + 86400000).toISOString(),
      };
      mockGetServerSession.mockResolvedValue(outsiderSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { email: "newuser@example.com" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
    });
  });

  // ---------- Business Logic ----------
  describe("Business Logic", () => {
    it("should return 400 when user is already a team member", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { email: "member@example.com" }, // already in team
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toBe("User is already a member of this team");
    });

    it("should return 400 when invitation already exists", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockInvitationFindUnique.mockResolvedValue({
        id: "inv-existing",
        email: "newuser@example.com",
        teamId: "team-123",
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { email: "newuser@example.com" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toBe("Invitation already sent to this email");
    });

    it("should return 403 when team user limit is reached", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockGetLimits.mockResolvedValue({ users: 2 }); // limit of 2, team already has 2

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { email: "newuser@example.com" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData()).toBe(
        "You have reached the limit of users in your team",
      );
    });

    it("should allow invitations when user limit is null (unlimited)", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockGetLimits.mockResolvedValue({ users: null });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { email: "newuser@example.com" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockInvitationCreate).toHaveBeenCalled();
    });

    it("should create invitation and verification token on success", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { email: "newuser@example.com" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockInvitationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "newuser@example.com",
            token: "inv_abc123",
            teamId: "team-123",
          }),
        }),
      );
      expect(mockVerificationTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            token: "hashed-token",
            identifier: "newuser@example.com",
          }),
        }),
      );
    });

    it("should send invite email with correct parameters", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { email: "newuser@example.com" },
      });

      await handler(req, res);

      expect(mockSendTeammateInviteEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          senderName: "Admin User",
          senderEmail: "admin@example.com",
          teamName: "Fund Alpha",
          to: "newuser@example.com",
          url: expect.stringContaining("http://localhost:3000"),
        }),
      );
    });
  });

  // ---------- Error Handling ----------
  describe("Error Handling", () => {
    it("should still return 200 when email sending fails (invitation was created)", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockSendTeammateInviteEmail.mockRejectedValue(
        new Error("Email service down"),
      );

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { email: "newuser@example.com" },
      });

      await handler(req, res);

      // Even if email fails, invitation was created so it returns 200
      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toContain("Invitation created");
    });

    it("should handle database errors gracefully", async () => {
      mockGetServerSession.mockResolvedValue(mockSession);
      mockTeamFindUnique.mockRejectedValue(new Error("Database error"));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        query: { teamId: "team-123" },
        body: { email: "newuser@example.com" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
    });
  });
});
