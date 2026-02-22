/**
 * Central session cookie name constant.
 *
 * NextAuth uses "__Secure-" prefix in production (HTTPS) and no prefix in
 * development. This constant MUST stay in sync with the cookie configuration
 * in lib/auth/auth-options.ts. All middleware, token-login endpoints, and
 * admin guards should import from here instead of computing the name locally.
 */
export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
