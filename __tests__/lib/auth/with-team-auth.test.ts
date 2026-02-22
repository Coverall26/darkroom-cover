/**
 * Tests for withTeamAuth — org-scoped RBAC helper for App Router.
 */
import { NextResponse } from "next/server";

// Mock dependencies
jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    userTeam: {
      findFirst: jest.fn(),
    },
  },
}));
jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import {
  withTeamAuth,
  withAdminAuth,
  withOwnerAuth,
} from "@/lib/auth/with-team-auth";

const mockGetSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockFindFirst = prisma.userTeam.findFirst as jest.MockedFunction<
  typeof prisma.userTeam.findFirst
>;

describe("withTeamAuth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await withTeamAuth("team-1");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      const body = await result.error.json();
      expect(result.error.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
    }
  });

  it("returns 403 when user is not a team member", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "gp@test.com" },
    } as any);
    mockFindFirst.mockResolvedValue(null);

    const result = await withTeamAuth("team-1");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      const body = await result.error.json();
      expect(result.error.status).toBe(403);
      expect(body.error).toContain("not a member");
    }
  });

  it("returns 403 when role is insufficient", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "member@test.com" },
    } as any);
    mockFindFirst.mockResolvedValue({
      role: "MEMBER",
      team: { id: "team-1", name: "Test Team", organizationId: "org-1" },
    } as any);

    const result = await withTeamAuth("team-1", { minRole: "ADMIN" });
    expect("error" in result).toBe(true);
    if ("error" in result) {
      const body = await result.error.json();
      expect(result.error.status).toBe(403);
      expect(body.error).toContain("requires ADMIN");
    }
  });

  it("returns auth result when MEMBER accesses with default minRole", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "member@test.com" },
    } as any);
    mockFindFirst.mockResolvedValue({
      role: "MEMBER",
      team: { id: "team-1", name: "Test Team", organizationId: "org-1" },
    } as any);

    const result = await withTeamAuth("team-1");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.userId).toBe("user-1");
      expect(result.teamId).toBe("team-1");
      expect(result.orgId).toBe("org-1");
      expect(result.role).toBe("MEMBER");
    }
  });

  it("returns auth result when OWNER accesses ADMIN-required route", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "owner@test.com" },
    } as any);
    mockFindFirst.mockResolvedValue({
      role: "OWNER",
      team: { id: "team-1", name: "Test Team", organizationId: "org-1" },
    } as any);

    const result = await withTeamAuth("team-1", { minRole: "ADMIN" });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.role).toBe("OWNER");
    }
  });

  it("handles null organizationId for teams without org", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "gp@test.com" },
    } as any);
    mockFindFirst.mockResolvedValue({
      role: "ADMIN",
      team: { id: "team-1", name: "Test Team", organizationId: null },
    } as any);

    const result = await withTeamAuth("team-1");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.orgId).toBeNull();
    }
  });

  it("queries correct teamId in Prisma", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-abc", email: "gp@test.com" },
    } as any);
    mockFindFirst.mockResolvedValue({
      role: "ADMIN",
      team: { id: "team-xyz", name: "My Team", organizationId: "org-1" },
    } as any);

    await withTeamAuth("team-xyz");

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { userId: "user-abc", teamId: "team-xyz" },
      include: {
        team: {
          select: { id: true, name: true, organizationId: true },
        },
      },
    });
  });
});

describe("withAdminAuth", () => {
  it("requires ADMIN role", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "member@test.com" },
    } as any);
    mockFindFirst.mockResolvedValue({
      role: "MEMBER",
      team: { id: "team-1", name: "Test", organizationId: null },
    } as any);

    const result = await withAdminAuth("team-1");
    expect("error" in result).toBe(true);
  });

  it("allows ADMIN role", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "admin@test.com" },
    } as any);
    mockFindFirst.mockResolvedValue({
      role: "ADMIN",
      team: { id: "team-1", name: "Test", organizationId: "org-1" },
    } as any);

    const result = await withAdminAuth("team-1");
    expect("error" in result).toBe(false);
  });
});

describe("withOwnerAuth", () => {
  it("rejects ADMIN for OWNER-required", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "admin@test.com" },
    } as any);
    mockFindFirst.mockResolvedValue({
      role: "ADMIN",
      team: { id: "team-1", name: "Test", organizationId: null },
    } as any);

    const result = await withOwnerAuth("team-1");
    expect("error" in result).toBe(true);
  });

  it("allows OWNER role", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "owner@test.com" },
    } as any);
    mockFindFirst.mockResolvedValue({
      role: "OWNER",
      team: { id: "team-1", name: "Test", organizationId: "org-1" },
    } as any);

    const result = await withOwnerAuth("team-1");
    expect("error" in result).toBe(false);
  });
});
