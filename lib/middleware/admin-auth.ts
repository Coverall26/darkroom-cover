/**
 * Admin Auth Middleware — Edge-Compatible Session Enforcement
 *
 * Validates JWT session at the edge for /admin/* and /api/admin/* routes.
 * This is a defense-in-depth layer: individual route handlers still perform
 * their own RBAC checks with Prisma for team-specific authorization.
 *
 * What this middleware does:
 *   1. Validates JWT session token exists and is not expired
 *   2. Blocks LP-role users from admin routes (role check from JWT claim)
 *   3. Passes user context headers (x-user-id, x-user-email) downstream
 *   4. Returns 401 for unauthenticated requests, 403 for LP users
 *
 * What this middleware does NOT do:
 *   - Team membership checks (requires Prisma, done in route handlers)
 *   - org_id scoping (requires Prisma, done in route handlers via RBAC)
 *   - Rate limiting (handled separately in proxy.ts blanket limiter)
 *
 * Edge Compatibility:
 *   Uses next-auth/jwt `getToken()` which works in Edge Runtime.
 *   Does NOT import Prisma or any Node.js-only modules.
 */

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import { SESSION_COOKIE_NAME } from "@/lib/constants/auth-cookies";

// ---------------------------------------------------------------------------
// Paths exempt from admin auth enforcement
// ---------------------------------------------------------------------------

/** Admin pages that must be accessible without auth (login, public pages) */
const ADMIN_PAGE_EXEMPT_PATHS = [
  "/admin/login",
];

/** Admin API paths that are exempt from standard admin auth.
 *  These use their own auth mechanisms (webhooks, platform admin, etc.) */
const ADMIN_API_EXEMPT_PATHS = [
  "/api/admin/rollbar-errors",     // Webhook endpoint (signature-verified)
  "/api/admin/deployment-readiness", // Health check endpoint
  "/api/admin/db-health",           // Health check endpoint
  "/api/admin/launch-health",       // Health check endpoint
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isExemptAdminPage(path: string): boolean {
  return ADMIN_PAGE_EXEMPT_PATHS.some(
    (exempt) => path === exempt || path.startsWith(`${exempt}/`)
  );
}

function isExemptAdminApi(path: string): boolean {
  return ADMIN_API_EXEMPT_PATHS.some(
    (exempt) => path === exempt || path.startsWith(`${exempt}/`)
  );
}

// ---------------------------------------------------------------------------
// Main middleware function
// ---------------------------------------------------------------------------

export interface AdminAuthResult {
  /** Whether the request should be blocked (response is set) */
  blocked: boolean;
  /** The blocking response (only set if blocked=true) */
  response?: NextResponse;
  /** User ID from JWT (only set if authenticated) */
  userId?: string;
  /** User email from JWT (only set if authenticated) */
  userEmail?: string;
  /** User role from JWT (only set if authenticated) */
  userRole?: string;
}

/**
 * Enforce admin authentication at the edge middleware level.
 *
 * Call this for requests to /admin/* (pages) and /api/admin/* (APIs).
 * Returns an AdminAuthResult indicating whether the request should proceed.
 *
 * Usage in proxy.ts:
 *   const authResult = await enforceAdminAuth(req);
 *   if (authResult.blocked) return authResult.response;
 *   // Request proceeds to route handler
 */
export async function enforceAdminAuth(
  req: NextRequest
): Promise<AdminAuthResult> {
  const path = req.nextUrl.pathname;

  // Check exemptions
  if (path.startsWith("/api/admin/") && isExemptAdminApi(path)) {
    return { blocked: false };
  }
  if (path.startsWith("/admin/") && isExemptAdminPage(path)) {
    return { blocked: false };
  }
  if (path === "/admin" && !path.startsWith("/admin/")) {
    // Bare /admin — let AppMiddleware handle redirect
    return { blocked: false };
  }

  // Validate JWT token
  let token;
  try {
    token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: SESSION_COOKIE_NAME,
    });
  } catch {
    // Token decode failure — treat as unauthenticated
    token = null;
  }

  // No valid token → 401 for API, redirect for pages
  if (!token?.email) {
    if (path.startsWith("/api/admin/")) {
      return {
        blocked: true,
        response: NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ),
      };
    }

    // For admin pages, redirect to login with return URL
    const loginUrl = new URL("/admin/login", req.url);
    const nextPath = req.nextUrl.search
      ? `${path}${req.nextUrl.search}`
      : path;
    loginUrl.searchParams.set("next", nextPath);
    return {
      blocked: true,
      response: NextResponse.redirect(loginUrl),
    };
  }

  // Check role — LP users cannot access admin routes
  const userRole = (token.role as string) || "LP";
  if (userRole === "LP") {
    if (path.startsWith("/api/admin/")) {
      return {
        blocked: true,
        response: NextResponse.json(
          { error: "Forbidden: admin access required" },
          { status: 403 }
        ),
      };
    }

    // For admin pages, redirect LP users to their portal
    return {
      blocked: true,
      response: NextResponse.redirect(new URL("/lp/dashboard", req.url)),
    };
  }

  // Authenticated with non-LP role — allow through with user context
  return {
    blocked: false,
    userId: token.sub || (token.id as string) || "",
    userEmail: token.email as string,
    userRole,
  };
}

/**
 * Apply user context headers to a NextResponse.
 *
 * These headers are consumed by downstream route handlers for
 * defense-in-depth identity verification. They supplement (not replace)
 * the route-level getServerSession() calls.
 */
export function applyAdminAuthHeaders(
  response: NextResponse,
  authResult: AdminAuthResult
): NextResponse {
  if (authResult.userId) {
    response.headers.set("x-middleware-user-id", authResult.userId);
  }
  if (authResult.userEmail) {
    response.headers.set("x-middleware-user-email", authResult.userEmail);
  }
  if (authResult.userRole) {
    response.headers.set("x-middleware-user-role", authResult.userRole);
  }
  return response;
}
