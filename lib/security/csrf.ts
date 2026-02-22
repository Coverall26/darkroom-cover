import { NextApiRequest, NextApiResponse } from "next";

/**
 * CSRF protection for Pages Router API routes.
 *
 * Validates the Origin (or Referer) header against known platform domains.
 * Should be called at the top of mutation handlers (POST, PUT, PATCH, DELETE).
 *
 * Exempt: GET/HEAD/OPTIONS requests, webhook endpoints, and requests
 * with no Origin header from same-site navigation (SameSite cookies cover this).
 *
 * Returns true if the request is allowed, false if rejected (response already sent).
 */

const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "fundroom.ai";

function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();

  // Platform domains
  origins.add(`https://${PLATFORM_DOMAIN}`);
  origins.add(`https://www.${PLATFORM_DOMAIN}`);
  origins.add(`https://app.${PLATFORM_DOMAIN}`);
  origins.add(`https://app.login.${PLATFORM_DOMAIN}`);
  origins.add(`https://app.admin.${PLATFORM_DOMAIN}`);

  // NEXTAUTH_URL
  if (process.env.NEXTAUTH_URL) {
    try {
      const url = new URL(process.env.NEXTAUTH_URL);
      origins.add(url.origin);
    } catch {
      // Invalid URL, skip
    }
  }

  // Development
  if (process.env.NODE_ENV === "development") {
    origins.add("http://localhost:3000");
    origins.add("http://localhost:5000");
    origins.add("http://127.0.0.1:3000");
    origins.add("http://127.0.0.1:5000");
  }

  return origins;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function validateCSRF(
  req: NextApiRequest,
  res: NextApiResponse,
): boolean {
  // Safe methods don't need CSRF protection
  if (SAFE_METHODS.has(req.method || "GET")) {
    return true;
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  // If no Origin and no Referer, this is likely a same-site request.
  // NextAuth's session cookies use SameSite=Lax which prevents
  // cross-site POST from external sites.
  if (!origin && !referer) {
    return true;
  }

  const allowed = getAllowedOrigins();

  // Check Origin header first (most reliable)
  if (origin) {
    if (allowed.has(origin)) {
      return true;
    }
    // Allow Replit dev origins
    if (
      process.env.NODE_ENV === "development" &&
      (origin.endsWith(".replit.dev") || origin.endsWith(".replit.app"))
    ) {
      return true;
    }
    res.status(403).json({ error: "Forbidden: invalid origin" });
    return false;
  }

  // Fall back to Referer header
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (allowed.has(refererOrigin)) {
        return true;
      }
      if (
        process.env.NODE_ENV === "development" &&
        (refererOrigin.endsWith(".replit.dev") ||
          refererOrigin.endsWith(".replit.app"))
      ) {
        return true;
      }
    } catch {
      // Invalid referer URL
    }
    res.status(403).json({ error: "Forbidden: invalid referer" });
    return false;
  }

  return true;
}
