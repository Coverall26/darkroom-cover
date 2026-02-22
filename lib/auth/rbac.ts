/**
 * RBAC (Role-Based Access Control) Enforcement
 *
 * Fine-grained role enforcement for API routes.
 * Implements the Master Plan's OWNER / GP_ADMIN / GP_VIEWER / LP role system.
 *
 * Usage:
 *   const auth = await enforceRBAC(req, res, { roles: ["OWNER", "ADMIN"], teamId: "..." });
 *   if (!auth) return; // Response already sent (401/403)
 *   // auth.userId, auth.teamId, auth.role available
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";

export type RBACRole =
  | "OWNER"
  | "SUPER_ADMIN"
  | "ADMIN"
  | "MANAGER"
  | "MEMBER";

export interface RBACResult {
  userId: string;
  email: string;
  teamId: string;
  role: RBACRole;
  session: { user: CustomUser };
}

interface EnforceRBACOptions {
  /** Allowed roles for this endpoint */
  roles: RBACRole[];
  /** Team ID — if not provided, extracted from req.query.teamId */
  teamId?: string;
  /** If true, the teamId query parameter is required */
  requireTeamId?: boolean;
}

/**
 * Enforce RBAC on an API route.
 *
 * Returns the authenticated user context if authorized, or null if
 * a 401/403 response has already been sent.
 */
export async function enforceRBAC(
  req: NextApiRequest,
  res: NextApiResponse,
  options: EnforceRBACOptions,
): Promise<RBACResult | null> {
  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const user = session.user as CustomUser;
  const teamId =
    options.teamId ||
    (req.query.teamId as string) ||
    (req.body?.teamId as string);

  if (!teamId && options.requireTeamId !== false) {
    res.status(400).json({ error: "teamId is required" });
    return null;
  }

  if (!teamId) {
    // No team scoping — just verify session
    return {
      userId: user.id,
      email: user.email || "",
      teamId: "",
      role: "MEMBER",
      session: { user },
    };
  }

  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: user.id,
      teamId,
      role: { in: options.roles },
      status: "ACTIVE",
    },
  });

  if (!userTeam) {
    res.status(403).json({ error: "Forbidden: insufficient permissions" });
    return null;
  }

  return {
    userId: user.id,
    email: user.email || "",
    teamId,
    role: userTeam.role as RBACRole,
    session: { user },
  };
}

/** Shortcut: require OWNER or ADMIN roles */
export async function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId?: string,
): Promise<RBACResult | null> {
  return enforceRBAC(req, res, {
    roles: ["OWNER", "SUPER_ADMIN", "ADMIN"],
    teamId,
  });
}

/** Shortcut: require any team member role */
export async function requireTeamMember(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId?: string,
): Promise<RBACResult | null> {
  return enforceRBAC(req, res, {
    roles: ["OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER", "MEMBER"],
    teamId,
  });
}

/** Shortcut: require GP-level access (owner, admin, or manager) */
export async function requireGPAccess(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId?: string,
): Promise<RBACResult | null> {
  return enforceRBAC(req, res, {
    roles: ["OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER"],
    teamId,
  });
}

/** Check if a user has a specific role in a team (no response sent) */
export async function hasRole(
  userId: string,
  teamId: string,
  roles: RBACRole[],
): Promise<boolean> {
  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId,
      teamId,
      role: { in: roles },
      status: "ACTIVE",
    },
  });
  return !!userTeam;
}

// ── App Router Variants ──

import { NextResponse } from "next/server";

interface AppRouterRBACOptions {
  /** Allowed roles for this endpoint */
  roles: RBACRole[];
  /** Team ID — must be passed explicitly (no req.query in App Router) */
  teamId?: string;
  /** If true, teamId is required (default: true) */
  requireTeamId?: boolean;
}

/**
 * Enforce RBAC on an App Router API route.
 *
 * Returns the RBACResult if authorized, or a NextResponse error if not.
 *
 * Usage:
 *   const auth = await enforceRBACAppRouter({ roles: ["OWNER", "ADMIN"], teamId });
 *   if (auth instanceof NextResponse) return auth;
 *   // auth is now RBACResult
 */
export async function enforceRBACAppRouter(
  options: AppRouterRBACOptions,
): Promise<RBACResult | NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as CustomUser;
  const teamId = options.teamId;

  if (!teamId && options.requireTeamId !== false) {
    return NextResponse.json(
      { error: "teamId is required" },
      { status: 400 },
    );
  }

  if (!teamId) {
    // No team scoping — just verify session
    return {
      userId: user.id,
      email: user.email || "",
      teamId: "",
      role: "MEMBER" as RBACRole,
      session: { user },
    };
  }

  const userTeam = await prisma.userTeam.findFirst({
    where: {
      userId: user.id,
      teamId,
      role: { in: options.roles },
      status: "ACTIVE",
    },
  });

  if (!userTeam) {
    return NextResponse.json(
      { error: "Forbidden: insufficient permissions" },
      { status: 403 },
    );
  }

  return {
    userId: user.id,
    email: user.email || "",
    teamId,
    role: userTeam.role as RBACRole,
    session: { user },
  };
}

/** App Router shortcut: require OWNER or ADMIN roles */
export async function requireAdminAppRouter(
  teamId?: string,
): Promise<RBACResult | NextResponse> {
  return enforceRBACAppRouter({
    roles: ["OWNER", "SUPER_ADMIN", "ADMIN"],
    teamId,
  });
}

/** App Router shortcut: require any team member role */
export async function requireTeamMemberAppRouter(
  teamId?: string,
): Promise<RBACResult | NextResponse> {
  return enforceRBACAppRouter({
    roles: ["OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER", "MEMBER"],
    teamId,
  });
}

/** App Router shortcut: require GP-level access */
export async function requireGPAccessAppRouter(
  teamId?: string,
): Promise<RBACResult | NextResponse> {
  return enforceRBACAppRouter({
    roles: ["OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER"],
    teamId,
  });
}

// ── Higher-Order Function Wrappers ──

export type AuthLevel = "public" | "authenticated" | "admin" | "gp" | "member" | "owner";

interface WithAuthOptions {
  /** Authentication level required */
  level: AuthLevel;
  /** Allowed HTTP methods (e.g. ["GET", "POST"]). If omitted, all methods allowed */
  methods?: string[];
}

type PagesRouterHandler = (
  req: NextApiRequest,
  res: NextApiResponse,
  auth: RBACResult,
) => Promise<void>;

/**
 * Higher-order function that wraps a Pages Router API handler with auth + RBAC.
 *
 * Usage:
 *   export default withAuth({ level: "admin" }, async (req, res, auth) => {
 *     // auth.userId, auth.teamId, auth.role available
 *     res.json({ ok: true });
 *   });
 *
 * Levels:
 *   - "public": No auth required (pass-through)
 *   - "authenticated": Session required, no role check
 *   - "member": Any team member
 *   - "gp": OWNER / SUPER_ADMIN / ADMIN / MANAGER
 *   - "admin": OWNER / SUPER_ADMIN / ADMIN
 *   - "owner": OWNER only
 */
export function withAuth(
  options: WithAuthOptions,
  handler: PagesRouterHandler,
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Method check
    if (options.methods && !options.methods.includes(req.method || "GET")) {
      res.setHeader("Allow", options.methods.join(", "));
      res.status(405).json({ error: `Method ${req.method} not allowed` });
      return;
    }

    // Public routes — no auth needed
    if (options.level === "public") {
      const emptyAuth: RBACResult = {
        userId: "",
        email: "",
        teamId: "",
        role: "MEMBER",
        session: { user: {} as CustomUser },
      };
      return handler(req, res, emptyAuth);
    }

    // All other levels require a session
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = session.user as CustomUser;

    // "authenticated" — session only, no team/role check
    if (options.level === "authenticated") {
      const auth: RBACResult = {
        userId: user.id,
        email: user.email || "",
        teamId: "",
        role: "MEMBER",
        session: { user },
      };
      return handler(req, res, auth);
    }

    // Levels that require team membership
    const roleMap: Record<string, RBACRole[]> = {
      member: ["OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER", "MEMBER"],
      gp: ["OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER"],
      admin: ["OWNER", "SUPER_ADMIN", "ADMIN"],
      owner: ["OWNER"],
    };

    const roles = roleMap[options.level];
    if (!roles) {
      res.status(500).json({ error: "Invalid auth level configuration" });
      return;
    }

    const auth = await enforceRBAC(req, res, { roles });
    if (!auth) return; // Response already sent
    return handler(req, res, auth);
  };
}

// ── LP Authentication Helper ──

export interface LPAuthResult {
  userId: string;
  email: string;
  investorId: string | null;
  session: { user: CustomUser };
}

/**
 * Authenticate LP user and return investor profile context.
 *
 * Pages Router usage:
 *   const auth = await requireLPAuth(req, res);
 *   if (!auth) return; // 401 already sent
 *   // auth.userId, auth.investorId available
 *
 * @returns LPAuthResult or null (response already sent)
 */
export async function requireLPAuth(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<LPAuthResult | null> {
  const session = await getServerSession(req, res, authOptions);

  if (!session?.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const user = session.user as CustomUser;

  const investor = await prisma.investor.findFirst({
    where: {
      OR: [
        { userId: user.id },
        { user: { email: user.email || "" } },
      ],
    },
    select: { id: true },
  });

  return {
    userId: user.id,
    email: user.email || "",
    investorId: investor?.id || null,
    session: { user },
  };
}

/**
 * App Router LP auth helper.
 *
 * Usage:
 *   const auth = await requireLPAuthAppRouter();
 *   if (auth instanceof NextResponse) return auth;
 *   // auth.userId, auth.investorId available
 */
export async function requireLPAuthAppRouter(): Promise<
  LPAuthResult | NextResponse
> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as CustomUser;

  const investor = await prisma.investor.findFirst({
    where: {
      OR: [
        { userId: user.id },
        { user: { email: user.email || "" } },
      ],
    },
    select: { id: true },
  });

  return {
    userId: user.id,
    email: user.email || "",
    investorId: investor?.id || null,
    session: { user },
  };
}

/**
 * Authenticate session only — no team or role checks.
 * For App Router routes that just need a logged-in user.
 */
export async function requireAuthAppRouter(): Promise<
  RBACResult | NextResponse
> {
  return enforceRBACAppRouter({
    roles: ["OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER", "MEMBER"],
    requireTeamId: false,
  });
}
