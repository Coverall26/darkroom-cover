import { redis } from "@/lib/redis";
import { sendOrgEmail } from "@/lib/resend";

import OtpEmailVerification from "@/components/emails/otp-verification";

/**
 * Send OTP verification email for document/dataroom access.
 * Tier 2 (org-branded) — sends from org's verified domain if configured,
 * falls back to @fundroom.ai. Replaces the old Edge Config custom email approach.
 */
export const sendOtpVerificationEmail = async (
  email: string,
  code: string,
  isDataroom: boolean = false,
  teamId: string,
  magicLink?: string,
) => {
  let logo: string | null = null;

  // Load team brand logo from Redis cache
  if (redis && teamId) {
    try {
      logo = await redis.get(`brand:logo:${teamId}`);
    } catch (e) {
      // Redis lookup failure is non-critical
    }
  }

  const emailTemplate = OtpEmailVerification({
    email,
    code,
    isDataroom,
    logo: logo ?? undefined,
    magicLink,
  });

  try {
    await sendOrgEmail({
      teamId,
      to: email,
      subject: `Access your ${isDataroom ? "dataroom" : "document"} - FundRoom`,
      react: emailTemplate,
      test: process.env.NODE_ENV === "development",
    });
    return { success: true };
  } catch (e) {
    console.error("Failed to send OTP verification email:", e);
    return { success: false, error: e };
  }
};
