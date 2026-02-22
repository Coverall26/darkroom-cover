import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import { SESSION_COOKIE_NAME } from "@/lib/constants/auth-cookies";

const AUTH_DEBUG = process.env.AUTH_DEBUG === "true";

function debugLog(requestId: string, ...args: unknown[]) {
  if (AUTH_DEBUG) {
    console.log(`[MIDDLEWARE][${requestId}]`, ...args);
  }
}

export default async function AppMiddleware(req: NextRequest) {
  const url = req.nextUrl;
  const path = url.pathname;
  const requestId = AUTH_DEBUG ? Math.random().toString(36).substring(7) : "";

  if (AUTH_DEBUG) {
    const timestamp = new Date().toISOString();
    const sessionCookie = req.cookies.get("next-auth.session-token");
    const secureCookie = req.cookies.get("__Secure-next-auth.session-token");
    const allCookies = req.cookies.getAll();
    const allCookieNames = allCookies.map(c => c.name);

    debugLog(requestId, "========== REQUEST ==========");
    debugLog(requestId, `Timestamp: ${timestamp}`);
    debugLog(requestId, `Path: ${path}`);
    debugLog(requestId, `Host: ${req.headers.get("host")}`);
    debugLog(requestId, "Cookies:", {
      count: allCookies.length,
      names: allCookieNames,
      'next-auth.session-token': sessionCookie ? `present (${sessionCookie.value.length} chars)` : 'MISSING',
      '__Secure-next-auth.session-token': secureCookie ? 'present' : 'MISSING',
    });
  }

  // Fast path for root - immediately redirect to login without token check
  if (path === "/") {
    debugLog(requestId, "Root path - redirecting to /login");
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const isInvited = url.searchParams.has("invitation");
  // Use the cookie name that matches auth-options.ts configuration.
  // Production uses __Secure- prefix; development uses the unprefixed name.
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: SESSION_COOKIE_NAME,
  });

  const userEmail = token?.email;
  const userRole = (token?.role as string) || "LP";
  const userCreatedAt = (token as any)?.createdAt as string | undefined;

  debugLog(requestId, "Token check:", {
    hasToken: !!token,
    userEmail: userEmail ? userEmail.substring(0, 3) + "***" : "none",
    userRole,
    tokenKeys: token ? Object.keys(token) : [],
  });

  // Public pages accessible without auth
  if (path === "/lp/onboard" || path === "/lp/login" || path === "/signup" || path.startsWith("/coming-soon/")) {
    debugLog(requestId, "Public page - allowing through");
    return NextResponse.next();
  }

  // View pages are public - they have their own access control via visitor tokens
  if (path.startsWith("/view/")) {
    debugLog(requestId, "View page - allowing through");
    return NextResponse.next();
  }

  // viewer-redirect has its own session handling and redirects appropriately
  // Let it through so it can check session server-side and redirect
  if (path === "/viewer-redirect") {
    debugLog(requestId, "Viewer-redirect - allowing through for server-side session check");
    return NextResponse.next();
  }

  // LP authenticated routes (require login and LP/GP role)
  if (path.startsWith("/lp/")) {
    if (!userEmail) {
      const loginUrl = new URL("/lp/login", req.url);
      const nextPath = url.search ? `${path}${url.search}` : path;
      loginUrl.searchParams.set("next", nextPath);
      return NextResponse.redirect(loginUrl);
    }
    if (userRole !== "LP" && userRole !== "GP") {
      return NextResponse.redirect(new URL("/viewer-redirect", req.url));
    }
    return NextResponse.next();
  }

  // GP/Admin routes - require GP role or team membership
  const gpRoutes = ["/dashboard", "/settings", "/documents", "/datarooms", "/admin", "/hub"];
  const isAdminLoginPage = path === "/admin/login";
  if (!isAdminLoginPage && gpRoutes.some((r) => path.startsWith(r))) {
    debugLog(requestId, `GP route detected: ${path}`);
    if (!userEmail) {
      debugLog(requestId, "No user email - redirecting to admin login");
      const loginUrl = new URL("/admin/login", req.url);
      const nextPath = url.search ? `${path}${url.search}` : path;
      loginUrl.searchParams.set("next", nextPath);
      return NextResponse.redirect(loginUrl);
    }
    // Check user role - LP users should be redirected to LP portal
    if (userRole === "LP") {
      debugLog(requestId, "LP user on GP route - redirecting to viewer-portal");
      return NextResponse.redirect(new URL("/viewer-portal", req.url));
    }
    debugLog(requestId, "GP route authorized - allowing through");
    return NextResponse.next();
  }

  // UNAUTHENTICATED if there's no token and the path isn't a login page
  const isLoginPage = path === "/login" || path === "/admin/login" || path === "/lp/login";
  const isAdminRoute = path.startsWith("/dashboard") || path.startsWith("/settings") || path.startsWith("/documents") || path.startsWith("/datarooms");

  if (!userEmail && !isLoginPage) {
    let loginPath = "/login";
    if (isAdminRoute) {
      loginPath = "/admin/login";
    }

    const loginUrl = new URL(loginPath, req.url);
    if (path !== "/") {
      const nextPath = url.search ? `${path}${url.search}` : path;
      loginUrl.searchParams.set("next", nextPath);
    }
    return NextResponse.redirect(loginUrl);
  }

  // AUTHENTICATED if the user was created recently, redirect to welcome
  if (
    userEmail &&
    userCreatedAt &&
    new Date(userCreatedAt).getTime() > Date.now() - 10000 &&
    path !== "/welcome" &&
    !isInvited
  ) {
    return NextResponse.redirect(new URL("/welcome", req.url));
  }

  // AUTHENTICATED if the path is a login page, redirect appropriately
  if (userEmail && isLoginPage) {
    const nextParam = url.searchParams.get("next");
    let nextPath: string | null = null;
    if (nextParam) {
      try {
        nextPath = decodeURIComponent(nextParam);
      } catch {
        nextPath = null;
      }
    }

    // Prevent redirect loops
    if (nextPath && (nextPath.includes("/login") || nextPath.includes("/admin/login") || nextPath.includes("/lp/login"))) {
      nextPath = null;
    }

    // Admin login always goes to hub, investor login goes to viewer-redirect
    const defaultRedirect = path === "/admin/login" ? "/hub" : "/viewer-redirect";
    const finalPath = nextPath || defaultRedirect;
    debugLog(requestId, `Authenticated user on login page - redirecting to: ${finalPath}`);
    return NextResponse.redirect(
      new URL(finalPath, req.url),
    );
  }

  // Allow viewer-portal access for all authenticated users
  if (userEmail && path === "/viewer-portal") {
    return NextResponse.next();
  }
}
