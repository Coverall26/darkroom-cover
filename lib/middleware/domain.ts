import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import { BLOCKED_PATHNAMES } from "@/lib/constants";
import { SESSION_COOKIE_NAME } from "@/lib/constants/auth-cookies";
import { TENANT_ROOT_REDIRECTS } from "@/lib/constants/domain-redirects";
import {
  PLATFORM_HEADERS,
  PLATFORM_URL,
  isAdminPortalDomain,
  isAppSignupDomain,
  isInfrastructureDomain,
  isLoginPortalDomain,
} from "@/lib/constants/saas-config";

export default async function DomainMiddleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const host = req.headers.get("host");

  // -----------------------------------------------------------------------
  // Platform sub-domain routing
  // app.fundroom.ai        → Main app (signup/setup, visitor entrance)
  // app.login.fundroom.ai  → Standard org login (front-end only)
  // app.admin.fundroom.ai  → Admin-only login portal
  // -----------------------------------------------------------------------

  // --- app.fundroom.ai ---
  // Main application: org signup + setup wizard.
  // If user is already authenticated, redirect to visitor entrance.
  if (host && isAppSignupDomain(host)) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: SESSION_COOKIE_NAME,
    });

    if (token?.email && (path === "/" || path === "/signup")) {
      return NextResponse.redirect(new URL("/viewer-redirect", req.url));
    }

    if (path === "/") {
      return NextResponse.redirect(new URL("/signup", req.url));
    }

    return NextResponse.next();
  }

  // --- app.login.fundroom.ai ---
  // Standard org login: front-end only access.
  // Even admins land on the user-facing side when using this domain.
  // The /coming-soon/login path remains accessible for the marketing site buttons.
  if (host && isLoginPortalDomain(host)) {
    if (path === "/") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (path === "/admin/login") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    return NextResponse.next();
  }

  // --- app.admin.fundroom.ai ---
  // Admin-only login portal. Must be admin to access.
  // Non-admins and unauthenticated users stay on admin login — no redirect to front-end.
  if (host && isAdminPortalDomain(host)) {
    const isAdminLoginPage = path === "/admin/login";

    if (path === "/") {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }

    if (isAdminLoginPage) {
      return NextResponse.next();
    }

    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: SESSION_COOKIE_NAME,
    });

    if (!token?.email) {
      const loginUrl = new URL("/admin/login", req.url);
      if (path !== "/") {
        loginUrl.searchParams.set("next", path);
      }
      return NextResponse.redirect(loginUrl);
    }

    // Check both role and loginPortal claims for defense-in-depth.
    // loginPortal is set at login time and indicates which portal the user authenticated through.
    // Note: Both claims are JWT-based and could be stale if the user is demoted between sessions.
    const userRole = (token?.role as string) || "LP";
    const loginPortal = token?.loginPortal as string | undefined;
    if (userRole === "LP" || (loginPortal && loginPortal !== "ADMIN")) {
      return NextResponse.redirect(new URL("/admin/login?error=unauthorized", req.url));
    }

    return NextResponse.next();
  }

  // -----------------------------------------------------------------------
  // Safety: if fundroom.ai, www.fundroom.ai, *.vercel.app, or any other
  // infrastructure domain reaches here (shouldn't normally happen via
  // proxy.ts), pass through — never rewrite platform/infra hosts.
  // -----------------------------------------------------------------------

  if (host && isInfrastructureDomain(host)) {
    return NextResponse.next();
  }

  // -----------------------------------------------------------------------
  // Tenant custom domain handling
  // -----------------------------------------------------------------------

  const PASSTHROUGH_EXACT = [
    "/login",
    "/register",
    "/signup",
    "/verify",
    "/welcome",
    "/viewer-redirect",
    "/admin/login",
    "/favicon.ico",
  ];

  const PASSTHROUGH_PREFIXES = [
    "/api/",
    "/_next/",
    "/_static/",
    "/icons/",
    "/coming-soon/",
    "/lp/",
  ];

  // If it's the root path, redirect to the tenant's login or a default page
  if (path === "/") {
    const redirectUrl = host ? TENANT_ROOT_REDIRECTS[host] : null;
    if (redirectUrl) {
      return NextResponse.redirect(new URL(redirectUrl, req.url));
    }

    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (
    PASSTHROUGH_EXACT.includes(path) ||
    PASSTHROUGH_PREFIXES.some((p) => path.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();

  if (BLOCKED_PATHNAMES.includes(path) || path.includes(".")) {
    url.pathname = "/404";
    return NextResponse.rewrite(url, { status: 404 });
  }

  url.pathname = `/view/domains/${host}${path}`;

  return NextResponse.rewrite(url, {
    headers: {
      "X-Robots-Tag": "noindex",
      ...PLATFORM_HEADERS.headers,
    },
  });
}

