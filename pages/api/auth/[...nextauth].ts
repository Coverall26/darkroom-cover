import { NextApiRequest, NextApiResponse } from "next";

import { checkRateLimit, rateLimiters } from "@/ee/features/security";
import NextAuth, { type NextAuthOptions } from "next-auth";

import { identifyUser, trackAnalytics } from "@/lib/analytics";
import { authOptions } from "@/lib/auth/auth-options";
import { authorizeAdminPortal, authorizeVisitorPortal } from "@/lib/auth/authorization";
import { isBlacklistedEmail } from "@/lib/edge-config/blacklist";
import { reportError } from "@/lib/error";
import { publishServerEvent } from "@/lib/tracking/server-events";
import { log } from "@/lib/utils";
import { getIpAddress } from "@/lib/utils/ip";

export { authOptions };

export const config = {
  maxDuration: 180,
};

function sanitizeCallbackUrl(callbackUrl: string, baseUrl: string): string {
  if (!callbackUrl) return "";
  
  try {
    if (callbackUrl.startsWith("/")) {
      return callbackUrl;
    }
    
    const url = new URL(callbackUrl);
    const base = new URL(baseUrl);
    
    if (url.hostname !== base.hostname) {
      return "";
    }
    
    return url.pathname + url.search;
  } catch {
    if (callbackUrl.startsWith("/")) {
      return callbackUrl;
    }
    return "";
  }
}

function detectPortalFromCallbackUrl(callbackUrl: string): "ADMIN" | "VISITOR" {
  if (!callbackUrl) return "VISITOR";

  const adminPatterns = ["/dashboard", "/admin", "/datarooms", "/documents", "/settings", "/hub"];
  const pathOnly = callbackUrl.split("?")[0];
  const isAdminPortal = adminPatterns.some(pattern => pathOnly.startsWith(pattern));
  return isAdminPortal ? "ADMIN" : "VISITOR";
}

function detectPortalFromReferer(referer: string | undefined | null, baseUrl: string): "ADMIN" | "VISITOR" | null {
  if (!referer) return null;
  try {
    const refererUrl = new URL(referer, baseUrl);
    const path = refererUrl.pathname;
    if (path.startsWith("/admin")) return "ADMIN";
  } catch {
    // Invalid referer URL
  }
  return null;
}

async function checkRateLimitForRequest(req: NextApiRequest): Promise<boolean> {
  if (!req || !rateLimiters?.auth) return true;
  
  try {
    const clientIP = getIpAddress(req.headers);
    const result = await checkRateLimit(rateLimiters.auth, clientIP);
    
    if (!result.success) {
      log({
        message: `Rate limit exceeded for IP ${clientIP} during signin attempt`,
        type: "error",
      });
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

const getAuthOptions = (req: NextApiRequest): NextAuthOptions => {
  const baseUrl = process.env.NEXTAUTH_URL || `https://${req.headers.host}`;
  const callbackUrlFromCookie = req.cookies?.["next-auth.callback-url"] || "";
  const callbackUrlFromQuery = typeof req.query?.callbackUrl === "string" ? req.query.callbackUrl : "";
  // For POST requests (credentials login), callbackUrl is in the body, not query
  const callbackUrlFromBody = typeof req.body?.callbackUrl === "string" ? req.body.callbackUrl : "";
  const rawCallbackUrl = callbackUrlFromQuery || callbackUrlFromBody || callbackUrlFromCookie;
  const callbackUrl = sanitizeCallbackUrl(rawCallbackUrl, baseUrl);
  let detectedPortal = detectPortalFromCallbackUrl(callbackUrl);

  // Fallback: detect portal from Referer header (covers credentials login
  // where callbackUrl may not be set in query/cookie/body)
  if (detectedPortal === "VISITOR" && !callbackUrl) {
    const referer = req.headers?.referer || req.headers?.["referer"];
    const refererPortal = detectPortalFromReferer(
      Array.isArray(referer) ? referer[0] : referer,
      baseUrl,
    );
    if (refererPortal) {
      detectedPortal = refererPortal;
    }
  }
  
  // Get the base JWT callback from authOptions
  const baseJwtCallback = authOptions.callbacks?.jwt;

  return {
    ...authOptions,
    callbacks: {
      ...authOptions.callbacks,
      signIn: async ({ user }) => {
        if (!user.email) return false;

        if (await isBlacklistedEmail(user.email)) {
          await identifyUser(user.email);
          await trackAnalytics({
            event: "User Sign In Attempted",
            email: user.email,
            userId: user.id,
          });
          return false;
        }

        const authResult = detectedPortal === "ADMIN"
          ? await authorizeAdminPortal(user.email)
          : await authorizeVisitorPortal(user.email);

        if (!authResult.allowed) {
          log({
            message: `Access denied: ${user.email} - ${authResult.reason}`,
            type: "error",
          });
          return authResult.redirectUrl || false;
        }

        if (detectedPortal === "VISITOR") {
          const rateLimitOk = await checkRateLimitForRequest(req);
          if (!rateLimitOk) return false;
        }

        return true;
      },
      // Extend JWT callback to include loginPortal
      jwt: async (params) => {
        // First call the base JWT callback to get standard token
        let token = baseJwtCallback ? await baseJwtCallback(params) : params.token;

        // On sign-in, add the loginPortal to the token
        if (params.user) {
          token.loginPortal = detectedPortal;
        }

        return token;
      },
    },
    events: {
      ...authOptions.events,
      signIn: async (message) => {
        // Track analytics
        await Promise.allSettled([
          identifyUser(message.user.email ?? message.user.id),
          trackAnalytics({
            event: "User Signed In",
            email: message.user.email,
            portal: detectedPortal,
          }),
        ]);

        // Fire-and-forget server-side funnel event to Tinybird (no PII)
        if (message.isNewUser) {
          publishServerEvent("funnel_signup_completed", {
            userId: message.user.id,
            method: "email",
            portal: detectedPortal,
          });
        }

      },
    },
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    return await NextAuth(req, res, getAuthOptions(req));
  } catch (error) {
    // Catch unhandled errors from NextAuth (e.g. email send failures)
    // so they return a proper error response instead of raw 500
    console.error("[NEXTAUTH] Unhandled error in auth handler:", error);
    reportError(error as Error, { path: "/api/auth/[...nextauth]" });

    // If headers already sent (e.g. redirect started), we can't respond
    if (res.headersSent) return;

    return res.status(500).json({
      error: "EmailSignin",
      message: "Authentication failed. Please try again.",
    });
  }
}
