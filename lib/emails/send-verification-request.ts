import crypto from "crypto";
import { sendEmail, isResendConfigured } from "@/lib/resend";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { serverInstance as rollbar } from "@/lib/rollbar";

import LoginLink from "@/components/emails/verification-link";

import { generateChecksum } from "../utils/generate-checksum";

export const sendVerificationRequestEmail = async (params: {
  email: string;
  url: string;
}) => {
  const { url, email } = params;

  // --- Pre-flight: check that Resend is configured ---
  if (!isResendConfigured()) {
    console.error(
      "[EMAIL] Cannot send verification email — RESEND_API_KEY is not set. " +
      "Add RESEND_API_KEY to your environment variables.",
    );
    rollbar.error("[EMAIL] RESEND_API_KEY missing — verification email not sent", {
      email: email.substring(0, 3) + "***",
    });
    // Throw a clear error so NextAuth returns a proper error response
    throw new Error("Email service is not configured");
  }

  const callbackUrlObj = new URL(url);
  const callbackHost = callbackUrlObj.host;
  const nextauthUrl = process.env.NEXTAUTH_URL || 'not-set';
  const nextauthHost = nextauthUrl !== 'not-set' ? new URL(nextauthUrl).host : 'not-set';

  rollbar.info("[EMAIL] Creating magic link", {
    email: email.substring(0, 3) + "***",
    callbackHost,
    nextauthHost,
    hostMatch: callbackHost === nextauthHost,
    env: process.env.NODE_ENV,
  });

  const emailLower = email.toLowerCase();

  await prisma.magicLinkCallback.deleteMany({
    where: { identifier: emailLower },
  });

  const magicLinkToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await prisma.magicLinkCallback.create({
    data: {
      identifier: emailLower,
      token: magicLinkToken,
      callbackUrl: url,
      authTokenHash: "",
      expires: expiresAt,
    },
  });

  const checksum = generateChecksum(magicLinkToken);
  const verificationUrlParams = new URLSearchParams({
    id: magicLinkToken,
    checksum,
  });

  const baseUrl = process.env.VERIFICATION_EMAIL_BASE_URL || process.env.NEXTAUTH_URL;
  const verificationUrl = `${baseUrl}/verify?${verificationUrlParams}`;

  const emailTemplate = LoginLink({ url: verificationUrl });
  try {
    await sendEmail({
      to: email as string,
      subject: "Your FundRoom Login Link",
      react: emailTemplate,
    });
  } catch (e) {
    console.error("[EMAIL] Error sending verification email:", e);
    reportError(e as Error, { path: "send-verification-request", action: "send-email" });
    throw new Error("Failed to send verification email. Please try again later.");
  }
};
