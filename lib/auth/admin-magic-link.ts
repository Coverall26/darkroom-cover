import { encode, decode } from "next-auth/jwt";

import { isUserAdminAsync } from "@/lib/constants/admins";

const AUTH_DEBUG = process.env.AUTH_DEBUG === "true";
const ADMIN_MAGIC_LINK_EXPIRY_SECONDS = 60 * 60; // 1 hour

/**
 * Creates an admin magic link using a signed JWT token.
 *
 * Uses JWT instead of database-stored tokens to avoid dependency on the
 * VerificationToken table (which may have schema mismatches in production).
 * The JWT is signed with NEXTAUTH_SECRET and includes the admin email +
 * purpose claim. Expiry is enforced by the JWT `exp` claim.
 */
export async function createAdminMagicLink({
  email,
  redirectPath,
  baseUrl,
}: {
  email: string;
  redirectPath?: string;
  baseUrl: string;
}): Promise<{ magicLink: string; token: string } | null> {
  const normalizedEmail = email.trim().toLowerCase();

  // Check if user is an admin (static list OR database)
  const isAdmin = await isUserAdminAsync(normalizedEmail);
  if (!isAdmin) {
    console.error("[ADMIN_MAGIC_LINK] Email not an admin:", normalizedEmail);
    return null;
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error("[ADMIN_MAGIC_LINK] NEXTAUTH_SECRET is not configured");
    return null;
  }

  try {
    // Create a signed JWT — no database write required
    const token = await encode({
      token: {
        email: normalizedEmail,
        purpose: "admin-magic-link",
      },
      secret,
      maxAge: ADMIN_MAGIC_LINK_EXPIRY_SECONDS,
    });

    const params = new URLSearchParams({
      token,
      email: normalizedEmail,
    });

    if (redirectPath) {
      params.set("redirect", redirectPath);
    }

    const magicLink = `${baseUrl}/api/auth/admin-magic-verify?${params.toString()}`;
    if (AUTH_DEBUG) console.log("[ADMIN_MAGIC_LINK] Created JWT magic link for:", normalizedEmail);

    return { magicLink, token };
  } catch (error) {
    console.error("[ADMIN_MAGIC_LINK] Error creating JWT magic link:", error);
    return null;
  }
}

/**
 * Verifies an admin magic link by decoding and validating the JWT token.
 *
 * Checks: signature validity, expiry, purpose claim, and email match.
 * Also verifies the email belongs to an admin user.
 */
export async function verifyAdminMagicLink({
  token,
  email,
}: {
  token: string;
  email: string;
}): Promise<boolean> {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    if (AUTH_DEBUG) console.log("[ADMIN_MAGIC_LINK] Verifying JWT token for:", normalizedEmail);

    // Check if user is an admin (static list OR database)
    const isAdmin = await isUserAdminAsync(normalizedEmail);
    if (!isAdmin) {
      if (AUTH_DEBUG) console.log("[ADMIN_MAGIC_LINK] User is not an admin:", normalizedEmail);
      return false;
    }

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error("[ADMIN_MAGIC_LINK] NEXTAUTH_SECRET is not configured");
      return false;
    }

    // Decode and verify the JWT (signature + expiry checked by jose)
    const decoded = await decode({ token, secret });

    if (!decoded) {
      if (AUTH_DEBUG) console.log("[ADMIN_MAGIC_LINK] Failed to decode JWT token (invalid or expired)");
      return false;
    }

    // Verify purpose claim
    if (decoded.purpose !== "admin-magic-link") {
      if (AUTH_DEBUG) console.log("[ADMIN_MAGIC_LINK] Invalid token purpose:", decoded.purpose);
      return false;
    }

    // Verify email match
    if (decoded.email !== normalizedEmail) {
      if (AUTH_DEBUG) console.log("[ADMIN_MAGIC_LINK] Email mismatch in token");
      return false;
    }

    // Extra safety: manual expiry check (decode should already enforce this)
    const expValue = decoded.exp as number | undefined;
    if (expValue && expValue < Math.floor(Date.now() / 1000)) {
      if (AUTH_DEBUG) console.log("[ADMIN_MAGIC_LINK] Token expired");
      return false;
    }

    if (AUTH_DEBUG) console.log("[ADMIN_MAGIC_LINK] JWT token verified successfully for:", normalizedEmail);
    return true;
  } catch (error) {
    console.error("[ADMIN_MAGIC_LINK] Error verifying JWT magic link:", error);
    return false;
  }
}
