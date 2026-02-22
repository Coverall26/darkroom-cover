import { NextRequest, NextResponse } from "next/server";
import {
  APP_DOMAIN,
  LOGIN_DOMAIN,
  ADMIN_DOMAIN,
  PLATFORM_DOMAIN,
} from "@/lib/constants/saas-config";

// ---------------------------------------------------------------------------
// CORS Configuration
//
// Dynamic origin validation for cross-origin API requests.
//
// SECURITY: This platform handles signed documents and sensitive investor data.
// CORS wildcards are DANGEROUS for document-serving endpoints because they allow
// any origin to read signed document URLs. The wildcard mode is ONLY appropriate
// for public, non-authenticated embed scenarios (e.g., dataroom preview widgets).
// For production document signing, always use explicit origin allowlists.
//
// Origin sources (checked in order):
//   1. Platform domains (always allowed): app, login, admin, marketing
//   2. CORS_ALLOWED_ORIGINS env var: comma-separated list of additional
//      allowed origins for embedding / white-label hosting scenarios
//   3. If CORS_ALLOWED_ORIGINS is "*", all origins are allowed WITHOUT
//      credentials (for public dataroom embed endpoints only)
//
// ENV: CORS_ALLOWED_ORIGINS — comma-separated list of allowed origins
//   Examples:
//     "https://portal.acme.com,https://ir.bigfund.com"
//     "*"  (wildcard — allows all origins, disables credentials)
//     ""   (empty — only platform domains allowed, default, RECOMMENDED)
// ---------------------------------------------------------------------------

/**
 * Platform domains — always allowed for credentialed cross-origin requests.
 */
const PLATFORM_ORIGINS = new Set([
  `https://${APP_DOMAIN}`,
  `https://${LOGIN_DOMAIN}`,
  `https://${ADMIN_DOMAIN}`,
  `https://${PLATFORM_DOMAIN}`,
  `https://www.${PLATFORM_DOMAIN}`,
]);

/**
 * Parse CORS_ALLOWED_ORIGINS env var into a Set of allowed origins.
 * Supports comma-separated list or "*" for wildcard.
 * Cached at module level (only parsed once per cold start).
 */
function parseExtraOrigins(): { origins: Set<string>; wildcard: boolean } {
  const envVal = (process.env.CORS_ALLOWED_ORIGINS || "").trim();
  if (!envVal) return { origins: new Set(), wildcard: false };
  if (envVal === "*") return { origins: new Set(), wildcard: true };

  const parsed = new Set<string>();
  for (const raw of envVal.split(",")) {
    const origin = raw.trim();
    if (origin && (origin.startsWith("https://") || origin.startsWith("http://"))) {
      // Strip trailing slash if present
      parsed.add(origin.replace(/\/+$/, ""));
    }
  }
  return { origins: parsed, wildcard: false };
}

const extraOrigins = parseExtraOrigins();

/**
 * Validate an Origin header against the combined allowlist.
 * Returns the origin if allowed, or null if not.
 */
export function getAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (PLATFORM_ORIGINS.has(origin)) return origin;
  if (extraOrigins.wildcard) return origin;
  if (extraOrigins.origins.has(origin)) return origin;
  return null;
}

/** Whether CORS is in wildcard mode (public embed endpoints, no credentials) */
export function isWildcardCors(): boolean {
  return extraOrigins.wildcard;
}

/**
 * Set CORS headers on a NextResponse for cross-origin requests.
 * Validates the request Origin against platform + extra allowed domains.
 *
 * When wildcard mode is active:
 *   - Access-Control-Allow-Origin: <requesting origin> (reflected)
 *   - Access-Control-Allow-Credentials: false
 * When specific origins are configured:
 *   - Access-Control-Allow-Origin: <matched origin>
 *   - Access-Control-Allow-Credentials: true
 */
export function setCorsHeaders(
  req: NextRequest,
  res: NextResponse,
): NextResponse {
  const origin = req.headers.get("origin");
  const allowedOrigin = getAllowedOrigin(origin);

  if (allowedOrigin) {
    res.headers.set("Access-Control-Allow-Origin", allowedOrigin);

    // Wildcard mode: no credentials (browser requirement for Access-Control-Allow-Credentials)
    // Specific origins: allow credentials (cookies, authorization headers)
    const allowCredentials = !extraOrigins.wildcard || PLATFORM_ORIGINS.has(allowedOrigin);
    res.headers.set("Access-Control-Allow-Credentials", String(allowCredentials));

    res.headers.set(
      "Access-Control-Allow-Methods",
      "GET,OPTIONS,PATCH,DELETE,POST,PUT",
    );
    res.headers.set(
      "Access-Control-Allow-Headers",
      "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
    );
    // Vary: Origin tells caches the response differs per origin
    res.headers.set("Vary", "Origin");
  }

  return res;
}

/**
 * Handle CORS preflight (OPTIONS) requests for API routes.
 * Returns a 204 response with appropriate CORS headers if the origin is allowed.
 */
export function handleCorsPreflightRequest(
  req: NextRequest,
): NextResponse | null {
  if (req.method !== "OPTIONS") return null;

  const origin = req.headers.get("origin");
  const allowedOrigin = getAllowedOrigin(origin);

  if (!allowedOrigin) {
    return new NextResponse(null, { status: 204 });
  }

  const allowCredentials = !extraOrigins.wildcard || PLATFORM_ORIGINS.has(allowedOrigin);

  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Credentials": String(allowCredentials),
      "Access-Control-Allow-Methods": "GET,OPTIONS,PATCH,DELETE,POST,PUT",
      "Access-Control-Allow-Headers":
        "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}
