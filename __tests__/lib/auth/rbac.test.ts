/**
 * Tests for lib/auth/rbac.ts
 *
 * RBAC middleware: enforceRBAC, requireAdmin, requireTeamMember,
 * requireGPAccess, and hasRole.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import {
  enforceRBAC,
  requireAdmin,
  requireTeamMember,
  requireGPAccess,
  hasRole,
  RBACRole,
} from "@/lib/auth/rbac";

const mockSession = {
  user: { id: "user-1", email: "admin@fundroom.ai", name: "Admin User" },
  expires: "2099-01-01",
};

function createReqRes(
  query: Record<string, string> = {},
  body: Record<string, unknown> = {},
) {
  return createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    query,
    body,
  });
}

describe("enforceRBAC", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  });

  // --- Authentication ---
  it("returns null and 401 when no session", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReqRes({ teamId: "team-1" });
    const result = await enforceRBAC(req, res, {
      roles: ["ADMIN"],
    });
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(401);
  });

  it("returns null and 401 when session has no user id", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { email: "test@example.com" },
    });
    const { req, res } = createReqRes({ teamId: "team-1" });
    const result = await enforceRBAC(req, res, { roles: ["ADMIN"] });
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(401);
  });

  // --- teamId extraction ---
  it("extracts teamId from query parameter", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "ADMIN",
    });
    const { req, res } = createReqRes({ teamId: "team-from-query" });
    const result = await enforceRBAC(req, res, { roles: ["ADMIN"] });
    expect(result).not.toBeNull();
    expect(result!.teamId).toBe("team-from-query");
    expect(prisma.userTeam.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teamId: "team-from-query" }),
      }),
    );
  });

  it("extracts teamId from body when not in query", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "OWNER",
    });
    const { req, res } = createReqRes({}, { teamId: "team-from-body" });
    const result = await enforceRBAC(req, res, { roles: ["OWNER"] });
    expect(result).not.toBeNull();
    expect(result!.teamId).toBe("team-from-body");
  });

  it("uses provided teamId option over query/body", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "ADMIN",
    });
    const { req, res } = createReqRes(
      { teamId: "team-from-query" },
      { teamId: "team-from-body" },
    );
    const result = await enforceRBAC(req, res, {
      roles: ["ADMIN"],
      teamId: "team-explicit",
    });
    expect(result).not.toBeNull();
    expect(result!.teamId).toBe("team-explicit");
  });

  it("returns 400 when teamId is missing and requireTeamId is not false", async () => {
    const { req, res } = createReqRes();
    const result = await enforceRBAC(req, res, { roles: ["ADMIN"] });
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain("teamId");
  });

  it("allows missing teamId when requireTeamId is false", async () => {
    const { req, res } = createReqRes();
    const result = await enforceRBAC(req, res, {
      roles: ["ADMIN"],
      requireTeamId: false,
    });
    expect(result).not.toBeNull();
    expect(result!.teamId).toBe("");
    expect(result!.role).toBe("MEMBER");
    // Should NOT query userTeam when no teamId
    expect(prisma.userTeam.findFirst).not.toHaveBeenCalled();
  });

  // --- Role enforcement ---
  it("returns result when user has required role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "ADMIN",
    });
    const { req, res } = createReqRes({ teamId: "team-1" });
    const result = await enforceRBAC(req, res, {
      roles: ["ADMIN", "OWNER"],
    });
    expect(result).not.toBeNull();
    expect(result!.userId).toBe("user-1");
    expect(result!.email).toBe("admin@fundroom.ai");
    expect(result!.teamId).toBe("team-1");
    expect(result!.role).toBe("ADMIN");
    expect(result!.session.user).toEqual(mockSession.user);
  });

  it("returns null and 403 when user lacks required role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReqRes({ teamId: "team-1" });
    const result = await enforceRBAC(req, res, { roles: ["OWNER"] });
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData()).error).toContain("Forbidden");
  });

  it("passes correct role filter to Prisma", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "OWNER",
    });
    const { req, res } = createReqRes({ teamId: "team-1" });
    await enforceRBAC(req, res, {
      roles: ["OWNER", "SUPER_ADMIN", "ADMIN"],
    });
    expect(prisma.userTeam.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        teamId: "team-1",
        role: { in: ["OWNER", "SUPER_ADMIN", "ADMIN"] },
        status: "ACTIVE",
      },
    });
  });

  it("only matches ACTIVE team memberships", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReqRes({ teamId: "team-1" });
    await enforceRBAC(req, res, { roles: ["ADMIN"] });
    expect(prisma.userTeam.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });

  // --- Each role works ---
  const allRoles: RBACRole[] = [
    "OWNER",
    "SUPER_ADMIN",
    "ADMIN",
    "MANAGER",
    "MEMBER",
  ];
  for (const role of allRoles) {
    it(`allows ${role} when it is in the required roles list`, async () => {
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({ role });
      const { req, res } = createReqRes({ teamId: "team-1" });
      const result = await enforceRBAC(req, res, { roles: [role] });
      expect(result).not.toBeNull();
      expect(result!.role).toBe(role);
    });
  }
});

describe("requireAdmin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  });

  it("allows OWNER role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "OWNER",
    });
    const { req, res } = createReqRes({ teamId: "team-1" });
    const result = await requireAdmin(req, res, "team-1");
    expect(result).not.toBeNull();
  });

  it("allows SUPER_ADMIN role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "SUPER_ADMIN",
    });
    const { req, res } = createReqRes({ teamId: "team-1" });
    const result = await requireAdmin(req, res, "team-1");
    expect(result).not.toBeNull();
  });

  it("allows ADMIN role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "ADMIN",
    });
    const { req, res } = createReqRes({ teamId: "team-1" });
    const result = await requireAdmin(req, res, "team-1");
    expect(result).not.toBeNull();
  });

  it("rejects MANAGER role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReqRes({ teamId: "team-1" });
    const result = await requireAdmin(req, res, "team-1");
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(403);
  });

  it("rejects MEMBER role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReqRes({ teamId: "team-1" });
    const result = await requireAdmin(req, res, "team-1");
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(403);
  });

  it("passes the roles [OWNER, SUPER_ADMIN, ADMIN] to enforceRBAC", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "ADMIN",
    });
    const { req, res } = createReqRes({ teamId: "team-1" });
    await requireAdmin(req, res, "team-1");
    expect(prisma.userTeam.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { in: ["OWNER", "SUPER_ADMIN", "ADMIN"] },
        }),
      }),
    );
  });
});

describe("requireTeamMember", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  });

  it("allows all 5 roles", async () => {
    for (const role of [
      "OWNER",
      "SUPER_ADMIN",
      "ADMIN",
      "MANAGER",
      "MEMBER",
    ]) {
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({ role });
      const { req, res } = createReqRes({ teamId: "team-1" });
      const result = await requireTeamMember(req, res, "team-1");
      expect(result).not.toBeNull();
    }
  });

  it("rejects non-members", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReqRes({ teamId: "team-1" });
    const result = await requireTeamMember(req, res, "team-1");
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(403);
  });
});

describe("requireGPAccess", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  });

  it("allows OWNER, SUPER_ADMIN, ADMIN, MANAGER", async () => {
    for (const role of ["OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER"]) {
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({ role });
      const { req, res } = createReqRes({ teamId: "team-1" });
      const result = await requireGPAccess(req, res, "team-1");
      expect(result).not.toBeNull();
    }
  });

  it("rejects MEMBER role (LP-only)", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReqRes({ teamId: "team-1" });
    const result = await requireGPAccess(req, res, "team-1");
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(403);
  });
});

describe("hasRole", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns true when user has the role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "ADMIN",
    });
    const result = await hasRole("user-1", "team-1", ["ADMIN"]);
    expect(result).toBe(true);
  });

  it("returns false when user does not have the role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const result = await hasRole("user-1", "team-1", ["OWNER"]);
    expect(result).toBe(false);
  });

  it("queries with ACTIVE status", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    await hasRole("user-1", "team-1", ["ADMIN"]);
    expect(prisma.userTeam.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        teamId: "team-1",
        role: { in: ["ADMIN"] },
        status: "ACTIVE",
      },
    });
  });

  it("does not send any HTTP response", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    // hasRole doesn't take req/res, so it can't send responses
    const result = await hasRole("user-1", "team-1", ["OWNER"]);
    expect(result).toBe(false);
  });

  it("checks multiple roles at once", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "SUPER_ADMIN",
    });
    const result = await hasRole("user-1", "team-1", [
      "OWNER",
      "SUPER_ADMIN",
      "ADMIN",
    ]);
    expect(result).toBe(true);
    expect(prisma.userTeam.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: { in: ["OWNER", "SUPER_ADMIN", "ADMIN"] },
        }),
      }),
    );
  });
});
