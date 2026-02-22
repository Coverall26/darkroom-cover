/**
 * Tests for lib/auth/crm-roles.ts
 *
 * CRM role resolution, permission checks, and enforcement middleware
 * for both Pages Router and App Router.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import {
  resolveCrmRole,
  hasCrmPermission,
  enforceCrmRole,
  enforceCrmRoleAppRouter,
  type CrmRoleLevel,
} from "@/lib/auth/crm-roles";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const mockSession = {
  user: { id: "user-1", email: "gp@fundroom.ai", name: "GP User" },
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

// ---------------------------------------------------------------------------
// resolveCrmRole
// ---------------------------------------------------------------------------

describe("resolveCrmRole", () => {
  describe("explicit CRM role takes priority", () => {
    it("returns VIEWER when explicitly set, even for OWNER", () => {
      expect(resolveCrmRole("OWNER", "VIEWER")).toBe("VIEWER");
    });

    it("returns CONTRIBUTOR when explicitly set", () => {
      expect(resolveCrmRole("MEMBER", "CONTRIBUTOR")).toBe("CONTRIBUTOR");
    });

    it("returns MANAGER when explicitly set for MEMBER", () => {
      expect(resolveCrmRole("MEMBER", "MANAGER")).toBe("MANAGER");
    });
  });

  describe("defaults from team role when no explicit CRM role", () => {
    it("OWNER defaults to MANAGER", () => {
      expect(resolveCrmRole("OWNER", null)).toBe("MANAGER");
    });

    it("SUPER_ADMIN defaults to MANAGER", () => {
      expect(resolveCrmRole("SUPER_ADMIN", null)).toBe("MANAGER");
    });

    it("ADMIN defaults to MANAGER", () => {
      expect(resolveCrmRole("ADMIN", null)).toBe("MANAGER");
    });

    it("MANAGER defaults to CONTRIBUTOR", () => {
      expect(resolveCrmRole("MANAGER", null)).toBe("CONTRIBUTOR");
    });

    it("MEMBER defaults to VIEWER", () => {
      expect(resolveCrmRole("MEMBER", null)).toBe("VIEWER");
    });

    it("unknown role defaults to VIEWER", () => {
      expect(resolveCrmRole("SOME_FUTURE_ROLE", null)).toBe("VIEWER");
    });
  });

  describe("handles null/undefined explicit CRM role", () => {
    it("treats undefined as no explicit role", () => {
      expect(resolveCrmRole("ADMIN", undefined)).toBe("MANAGER");
    });

    it("treats null as no explicit role", () => {
      expect(resolveCrmRole("ADMIN", null)).toBe("MANAGER");
    });

    it("treats empty string as no explicit role", () => {
      expect(resolveCrmRole("ADMIN", "")).toBe("MANAGER");
    });

    it("ignores invalid explicit CRM role value", () => {
      expect(resolveCrmRole("ADMIN", "SUPERADMIN")).toBe("MANAGER");
    });
  });
});

// ---------------------------------------------------------------------------
// hasCrmPermission
// ---------------------------------------------------------------------------

describe("hasCrmPermission", () => {
  describe("VIEWER effective role", () => {
    it("allows VIEWER minimum", () => {
      expect(hasCrmPermission("VIEWER", "VIEWER")).toBe(true);
    });

    it("denies CONTRIBUTOR minimum", () => {
      expect(hasCrmPermission("VIEWER", "CONTRIBUTOR")).toBe(false);
    });

    it("denies MANAGER minimum", () => {
      expect(hasCrmPermission("VIEWER", "MANAGER")).toBe(false);
    });
  });

  describe("CONTRIBUTOR effective role", () => {
    it("allows VIEWER minimum", () => {
      expect(hasCrmPermission("CONTRIBUTOR", "VIEWER")).toBe(true);
    });

    it("allows CONTRIBUTOR minimum", () => {
      expect(hasCrmPermission("CONTRIBUTOR", "CONTRIBUTOR")).toBe(true);
    });

    it("denies MANAGER minimum", () => {
      expect(hasCrmPermission("CONTRIBUTOR", "MANAGER")).toBe(false);
    });
  });

  describe("MANAGER effective role", () => {
    it("allows VIEWER minimum", () => {
      expect(hasCrmPermission("MANAGER", "VIEWER")).toBe(true);
    });

    it("allows CONTRIBUTOR minimum", () => {
      expect(hasCrmPermission("MANAGER", "CONTRIBUTOR")).toBe(true);
    });

    it("allows MANAGER minimum", () => {
      expect(hasCrmPermission("MANAGER", "MANAGER")).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// enforceCrmRole (Pages Router)
// ---------------------------------------------------------------------------

describe("enforceCrmRole (Pages Router)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  });

  it("returns null and 401 when no session", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReqRes({ teamId: "team-1" });

    const result = await enforceCrmRole(req, res, "CONTRIBUTOR");
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({ error: "Unauthorized" });
  });

  it("returns null and 401 when session has no user id", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { email: "test@example.com" },
    });
    const { req, res } = createReqRes({ teamId: "team-1" });

    const result = await enforceCrmRole(req, res, "VIEWER");
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(401);
  });

  it("returns null and 400 when no teamId available", async () => {
    const { req, res } = createReqRes();

    const result = await enforceCrmRole(req, res, "VIEWER");
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: "teamId is required" });
  });

  it("extracts teamId from query parameter", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "ADMIN",
      crmRole: null,
    });
    const { req, res } = createReqRes({ teamId: "team-from-query" });

    const result = await enforceCrmRole(req, res, "VIEWER");
    expect(result).not.toBeNull();
    expect(result!.teamId).toBe("team-from-query");
  });

  it("extracts teamId from body when not in query", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "OWNER",
      crmRole: null,
    });
    const { req, res } = createReqRes({}, { teamId: "team-from-body" });

    const result = await enforceCrmRole(req, res, "VIEWER");
    expect(result).not.toBeNull();
    expect(result!.teamId).toBe("team-from-body");
  });

  it("uses explicit teamId parameter over query/body", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "ADMIN",
      crmRole: null,
    });
    const { req, res } = createReqRes(
      { teamId: "team-from-query" },
      { teamId: "team-from-body" },
    );

    const result = await enforceCrmRole(req, res, "VIEWER", "team-explicit");
    expect(result).not.toBeNull();
    expect(result!.teamId).toBe("team-explicit");
  });

  it("returns null and 403 when user is not a team member", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReqRes({ teamId: "team-1" });

    const result = await enforceCrmRole(req, res, "VIEWER");
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error).toContain("not a team member");
  });

  it("returns null and 403 when CRM role insufficient", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "MEMBER",
      crmRole: null, // resolves to VIEWER
    });
    const { req, res } = createReqRes({ teamId: "team-1" });

    const result = await enforceCrmRole(req, res, "MANAGER");
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(403);
    const data = res._getJSONData();
    expect(data.error).toContain("CRM MANAGER role required");
    expect(data.requiredRole).toBe("MANAGER");
    expect(data.currentRole).toBe("VIEWER");
  });

  it("returns CrmRoleResult when authorized with default role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "ADMIN",
      crmRole: null, // resolves to MANAGER
    });
    const { req, res } = createReqRes({ teamId: "team-1" });

    const result = await enforceCrmRole(req, res, "CONTRIBUTOR");
    expect(result).not.toBeNull();
    expect(result).toEqual({
      userId: "user-1",
      email: "gp@fundroom.ai",
      teamId: "team-1",
      teamRole: "ADMIN",
      crmRole: "MANAGER",
    });
  });

  it("returns CrmRoleResult when authorized with explicit CRM role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "MEMBER",
      crmRole: "CONTRIBUTOR",
    });
    const { req, res } = createReqRes({ teamId: "team-1" });

    const result = await enforceCrmRole(req, res, "CONTRIBUTOR");
    expect(result).not.toBeNull();
    expect(result!.crmRole).toBe("CONTRIBUTOR");
    expect(result!.teamRole).toBe("MEMBER");
  });

  it("queries userTeam with ACTIVE status filter", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "OWNER",
      crmRole: null,
    });
    const { req, res } = createReqRes({ teamId: "team-1" });

    await enforceCrmRole(req, res, "VIEWER");
    expect(prisma.userTeam.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          teamId: "team-1",
          status: "ACTIVE",
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// enforceCrmRoleAppRouter
// ---------------------------------------------------------------------------

describe("enforceCrmRoleAppRouter (App Router)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  });

  it("returns 401 NextResponse when no session", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const result = await enforceCrmRoleAppRouter("VIEWER", "team-1");
    expect(result).toBeInstanceOf(NextResponse);
    const resp = result as NextResponse;
    expect(resp.status).toBe(401);
  });

  it("returns 401 NextResponse when session has no user id", async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { email: "test@example.com" },
    });

    const result = await enforceCrmRoleAppRouter("VIEWER", "team-1");
    expect(result).toBeInstanceOf(NextResponse);
    const resp = result as NextResponse;
    expect(resp.status).toBe(401);
  });

  describe("with explicit teamId", () => {
    it("returns 403 when user is not a team member", async () => {
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await enforceCrmRoleAppRouter("VIEWER", "team-1");
      expect(result).toBeInstanceOf(NextResponse);
      const resp = result as NextResponse;
      expect(resp.status).toBe(403);
    });

    it("returns 403 when CRM role insufficient", async () => {
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
        role: "MEMBER",
        crmRole: "VIEWER",
      });

      const result = await enforceCrmRoleAppRouter("MANAGER", "team-1");
      expect(result).toBeInstanceOf(NextResponse);
      const resp = result as NextResponse;
      expect(resp.status).toBe(403);
      const body = await resp.json();
      expect(body.requiredRole).toBe("MANAGER");
      expect(body.currentRole).toBe("VIEWER");
    });

    it("returns CrmRoleResult when authorized", async () => {
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
        role: "OWNER",
        crmRole: null,
      });

      const result = await enforceCrmRoleAppRouter("MANAGER", "team-1");
      expect(result).not.toBeInstanceOf(NextResponse);
      const crm = result as { userId: string; crmRole: string; teamId: string };
      expect(crm.userId).toBe("user-1");
      expect(crm.crmRole).toBe("MANAGER");
      expect(crm.teamId).toBe("team-1");
    });
  });

  describe("without teamId (auto-resolve from user teams)", () => {
    it("returns 403 when user has no team membership", async () => {
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await enforceCrmRoleAppRouter("VIEWER");
      expect(result).toBeInstanceOf(NextResponse);
      const resp = result as NextResponse;
      expect(resp.status).toBe(403);
      const body = await resp.json();
      expect(body.error).toContain("no team membership");
    });

    it("returns 403 when resolved role is insufficient", async () => {
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
        teamId: "auto-team",
        role: "MEMBER",
        crmRole: null, // VIEWER
      });

      const result = await enforceCrmRoleAppRouter("CONTRIBUTOR");
      expect(result).toBeInstanceOf(NextResponse);
      const resp = result as NextResponse;
      expect(resp.status).toBe(403);
    });

    it("returns CrmRoleResult with auto-resolved teamId", async () => {
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
        teamId: "auto-team",
        role: "ADMIN",
        crmRole: null, // MANAGER
      });

      const result = await enforceCrmRoleAppRouter("CONTRIBUTOR");
      expect(result).not.toBeInstanceOf(NextResponse);
      const crm = result as { userId: string; teamId: string; crmRole: string };
      expect(crm.teamId).toBe("auto-team");
      expect(crm.crmRole).toBe("MANAGER");
    });

    it("queries with ACTIVE status filter", async () => {
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
        teamId: "auto-team",
        role: "OWNER",
        crmRole: null,
      });

      await enforceCrmRoleAppRouter("VIEWER");
      expect(prisma.userTeam.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "user-1",
            status: "ACTIVE",
          }),
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Integration-style: role resolution + permission in enforcement flow
// ---------------------------------------------------------------------------

describe("CRM role enforcement integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  });

  it("MEMBER with explicit MANAGER CRM role can access MANAGER routes", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "MEMBER",
      crmRole: "MANAGER",
    });
    const { req, res } = createReqRes({ teamId: "team-1" });

    const result = await enforceCrmRole(req, res, "MANAGER");
    expect(result).not.toBeNull();
    expect(result!.teamRole).toBe("MEMBER");
    expect(result!.crmRole).toBe("MANAGER");
  });

  it("OWNER with explicit VIEWER CRM role is blocked from CONTRIBUTOR routes", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "OWNER",
      crmRole: "VIEWER",
    });
    const { req, res } = createReqRes({ teamId: "team-1" });

    const result = await enforceCrmRole(req, res, "CONTRIBUTOR");
    expect(result).toBeNull();
    expect(res._getStatusCode()).toBe(403);
  });

  it("ADMIN (default MANAGER) passes all CRM role checks", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "ADMIN",
      crmRole: null,
    });

    for (const role of ["VIEWER", "CONTRIBUTOR", "MANAGER"] as CrmRoleLevel[]) {
      const { req, res } = createReqRes({ teamId: "team-1" });
      const result = await enforceCrmRole(req, res, role);
      expect(result).not.toBeNull();
    }
  });

  it("MEMBER (default VIEWER) only passes VIEWER check", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
      role: "MEMBER",
      crmRole: null,
    });

    // VIEWER should pass
    const { req: r1, res: s1 } = createReqRes({ teamId: "team-1" });
    expect(await enforceCrmRole(r1, s1, "VIEWER")).not.toBeNull();

    // CONTRIBUTOR should fail
    const { req: r2, res: s2 } = createReqRes({ teamId: "team-1" });
    expect(await enforceCrmRole(r2, s2, "CONTRIBUTOR")).toBeNull();
    expect(s2._getStatusCode()).toBe(403);

    // MANAGER should fail
    const { req: r3, res: s3 } = createReqRes({ teamId: "team-1" });
    expect(await enforceCrmRole(r3, s3, "MANAGER")).toBeNull();
    expect(s3._getStatusCode()).toBe(403);
  });
});
