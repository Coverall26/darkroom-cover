/**
 * MFA (Multi-Factor Authentication) — TOTP Implementation
 *
 * Provides:
 * - TOTP secret generation and verification (RFC 6238)
 * - Recovery code generation
 * - Encryption/decryption of secrets (AES-256)
 * - Enforcement middleware for org-level MFA requirements
 *
 * Uses the Web Crypto API (no external TOTP library).
 */

import crypto from "crypto";

import prisma from "@/lib/prisma";
import { resolveSettings } from "@/lib/settings/resolve";

// TOTP parameters
const TOTP_PERIOD = 30; // seconds
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = "SHA-1"; // Standard for Google Authenticator compatibility

// Encryption key for MFA secrets (derived from env)
const MFA_ENCRYPTION_KEY =
  process.env.MFA_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || "";

// ─── TOTP Core ──────────────────────────────────────────────────────────

/** Generate a random TOTP secret (base32 encoded, 20 bytes) */
export function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  return base32Encode(bytes);
}

/** Generate a TOTP code for the given secret and time */
export function generateTotpCode(
  secret: string,
  time?: number,
): string {
  const counter = Math.floor((time ?? Date.now() / 1000) / TOTP_PERIOD);
  return hotpGenerate(secret, counter);
}

/** Verify a TOTP code (allows 1-step drift window) */
export function verifyTotpCode(
  secret: string,
  code: string,
  window = 1,
): boolean {
  const now = Math.floor(Date.now() / 1000);
  for (let i = -window; i <= window; i++) {
    const counter = Math.floor(now / TOTP_PERIOD) + i;
    const expected = hotpGenerate(secret, counter);
    if (timingSafeCompare(expected, code)) {
      return true;
    }
  }
  return false;
}

/** Build an otpauth:// URI for QR code generation */
export function buildTotpUri(
  secret: string,
  email: string,
  issuer = "FundRoom",
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=${TOTP_ALGORITHM}&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

// ─── Recovery Codes ─────────────────────────────────────────────────────

/** Generate N recovery codes (8-char hex each) */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
  }
  return codes;
}

/** Format recovery codes for display (XXXX-XXXX) */
export function formatRecoveryCode(code: string): string {
  const clean = code.replace(/-/g, "").toUpperCase();
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

// ─── Encryption ─────────────────────────────────────────────────────────

/** Encrypt a TOTP secret with AES-256-GCM */
export function encryptMfaSecret(secret: string): string {
  if (!MFA_ENCRYPTION_KEY) {
    throw new Error("MFA_ENCRYPTION_KEY not configured");
  }
  const key = crypto
    .createHash("sha256")
    .update(MFA_ENCRYPTION_KEY)
    .digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/** Decrypt a TOTP secret from AES-256-GCM */
export function decryptMfaSecret(encryptedSecret: string): string {
  if (!MFA_ENCRYPTION_KEY) {
    throw new Error("MFA_ENCRYPTION_KEY not configured");
  }
  const [ivHex, authTagHex, encryptedHex] = encryptedSecret.split(":");
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Invalid encrypted MFA secret format");
  }
  const key = crypto
    .createHash("sha256")
    .update(MFA_ENCRYPTION_KEY)
    .digest();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ─── Enforcement ────────────────────────────────────────────────────────

/**
 * Check if MFA is required for a user based on their org's settings.
 * Returns { required: boolean, enabled: boolean, verified: boolean }
 */
export async function checkMfaStatus(userId: string): Promise<{
  required: boolean;
  enabled: boolean;
  verified: boolean;
}> {
  // Get user's MFA status
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      mfaEnabled: true,
      mfaVerifiedAt: true,
      teams: {
        where: { status: "ACTIVE" },
        select: {
          team: {
            select: {
              id: true,
              organizationId: true,
            },
          },
        },
        take: 1,
      },
    },
  });

  if (!user) {
    return { required: false, enabled: false, verified: false };
  }

  // Check if any of the user's orgs require MFA
  let mfaRequired = false;
  const team = user.teams[0]?.team;
  if (team) {
    const settings = await resolveSettings({
      orgId: team.organizationId || undefined,
      teamId: team.id,
    });
    mfaRequired = settings.requireMfa;
  }

  return {
    required: mfaRequired,
    enabled: user.mfaEnabled,
    verified: !!user.mfaVerifiedAt,
  };
}

// ─── HOTP Implementation (RFC 4226) ────────────────────────────────────

function hotpGenerate(secret: string, counter: number): string {
  const decodedSecret = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    buffer[i] = counter & 0xff;
    counter = counter >> 8;
  }

  const hmac = crypto.createHmac("sha1", decodedSecret);
  hmac.update(buffer);
  const hmacResult = hmac.digest();

  const offset = hmacResult[hmacResult.length - 1] & 0x0f;
  const code =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  return (code % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

// ─── Base32 Encoding/Decoding ───────────────────────────────────────────

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/[=\s]/g, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_CHARS.indexOf(cleaned[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

// ─── Timing-safe comparison ─────────────────────────────────────────────

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}
