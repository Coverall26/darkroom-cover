import { JSXElementConstructor, ReactElement } from "react";

import { render, toPlainText } from "@react-email/render";
import { Resend } from "resend";

import { log, nanoid } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Resend Email Delivery Adapter
//
// Primary delivery method for all transactional and notification emails.
// Uses the Resend HTTP API (https://resend.com/docs/api-reference/emails/send)
//
// Configuration:
//   RESEND_API_KEY          — Required. Resend API key.
//   RESEND_FROM_EMAIL       — Optional. Override default sender address.
//   MAILER_FROM_EMAIL       — Optional. Fallback override for sender.
//
// Features:
//   - Tier 1 (platform) and Tier 2 (org-branded) email sending
//   - React Email template rendering (HTML + plaintext)
//   - Attachments support (base64 or Buffer)
//   - BCC support
//   - Custom headers (X-Entity-Ref-ID for dedup, List-Unsubscribe)
//   - Health check for monitoring dashboards
//   - Structured error logging via lib/utils log()
// ---------------------------------------------------------------------------

export const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/** Returns true if the Resend client is initialised (RESEND_API_KEY is set). */
export function isResendConfigured(): boolean {
  return resend !== null;
}

// ---------------------------------------------------------------------------
// Platform default addresses (@fundroom.ai)
// ---------------------------------------------------------------------------

export const PLATFORM_FROM_NOTIFICATIONS =
  process.env.RESEND_FROM_EMAIL ||
  process.env.MAILER_FROM_EMAIL ||
  "FundRoom <notifications@fundroom.ai>";
export const PLATFORM_FROM_SYSTEM = "FundRoom <system@fundroom.ai>";
export const PLATFORM_FROM_VERIFY = "FundRoom <verify@fundroom.ai>";

// ---------------------------------------------------------------------------
// Attachment type (matches Resend SDK interface)
// ---------------------------------------------------------------------------

export interface EmailAttachment {
  /** Filename with extension (e.g., "report.pdf") */
  filename: string;
  /** Base64-encoded content OR Buffer */
  content: string | Buffer;
  /** Optional content type (auto-detected from extension if omitted) */
  contentType?: string;
}

// ---------------------------------------------------------------------------
// Tier 1: Platform emails — always sent from @fundroom.ai
// Used for: auth, billing, onboarding, platform notifications
// ---------------------------------------------------------------------------

export const sendEmail = async ({
  to,
  subject,
  react,
  from,
  marketing,
  system,
  verify,
  test,
  cc,
  bcc,
  replyTo,
  scheduledAt,
  unsubscribeUrl,
  attachments,
  headers: customHeaders,
}: {
  to: string;
  subject: string;
  react: ReactElement<any, string | JSXElementConstructor<any>>;
  from?: string;
  marketing?: boolean;
  system?: boolean;
  verify?: boolean;
  test?: boolean;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  scheduledAt?: string;
  unsubscribeUrl?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
}) => {
  if (!resend) {
    console.error("[EMAIL] RESEND_API_KEY is not set — cannot send emails. Set RESEND_API_KEY in environment variables.");
    throw new Error("Email service is not configured. Please set RESEND_API_KEY.");
  }

  const html = await render(react);
  const plainText = toPlainText(html);

  const fromAddress =
    from ??
    (marketing
      ? PLATFORM_FROM_NOTIFICATIONS
      : system
        ? PLATFORM_FROM_SYSTEM
        : verify
          ? PLATFORM_FROM_VERIFY
          : !!scheduledAt
            ? PLATFORM_FROM_NOTIFICATIONS
            : PLATFORM_FROM_NOTIFICATIONS);

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: test ? "delivered@resend.dev" : to,
      cc: cc,
      bcc: bcc,
      replyTo: marketing ? PLATFORM_FROM_NOTIFICATIONS : replyTo,
      subject,
      react,
      scheduledAt,
      text: plainText,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: typeof a.content === "string" ? Buffer.from(a.content, "base64") : a.content,
      })),
      headers: {
        "X-Entity-Ref-ID": nanoid(),
        ...(unsubscribeUrl ? { "List-Unsubscribe": unsubscribeUrl } : {}),
        ...customHeaders,
      },
    });

    if (error) {
      log({
        message: `Resend returned error when sending email: ${error.name} \n\n ${error.message}`,
        type: "error",
        mention: true,
      });
      throw error;
    }

    return data;
  } catch (exception) {
    log({
      message: `Unexpected error when sending email: ${exception}`,
      type: "error",
      mention: true,
    });
    throw exception;
  }
};

// ---------------------------------------------------------------------------
// Tier 2: Org-branded emails — sent from org's verified domain if available,
// otherwise falls back to platform @fundroom.ai
//
// Used for: investor communications, signature requests, dataroom
// notifications, document reviews — any email where the org is the sender.
// ---------------------------------------------------------------------------

export const sendOrgEmail = async ({
  teamId,
  to,
  subject,
  react,
  test,
  cc,
  bcc,
  replyTo: replyToOverride,
  scheduledAt,
  unsubscribeUrl,
  attachments,
}: {
  teamId: string;
  to: string;
  subject: string;
  react: ReactElement<any, string | JSXElementConstructor<any>>;
  test?: boolean;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  scheduledAt?: string;
  unsubscribeUrl?: string;
  attachments?: EmailAttachment[];
}) => {
  // Lazy import to avoid circular dependency with prisma
  const { getTeamFromAddress } = await import("@/lib/email/domain-service");

  let from: string = PLATFORM_FROM_NOTIFICATIONS;
  let replyTo: string | undefined = replyToOverride;

  // Resolve org-branded "from" address
  try {
    const orgAddress = await getTeamFromAddress(teamId);
    if (orgAddress) {
      from = orgAddress.from;
      if (!replyToOverride && orgAddress.replyTo) {
        replyTo = orgAddress.replyTo;
      }
    }
  } catch (e) {
    console.warn("[EMAIL] Failed to resolve org email, using platform default:", e);
  }

  return sendEmail({
    to,
    subject,
    react,
    from,
    test,
    cc,
    bcc,
    replyTo,
    scheduledAt,
    unsubscribeUrl,
    attachments,
  });
};

// ---------------------------------------------------------------------------
// Health Check
//
// Verifies the Resend API is reachable. Used by health endpoints.
// ---------------------------------------------------------------------------

export async function checkEmailHealth(): Promise<{
  configured: boolean;
  reachable: boolean;
  latencyMs: number | null;
  provider: "resend" | "none";
}> {
  if (!resend) {
    return { configured: false, reachable: false, latencyMs: null, provider: "none" };
  }

  const start = Date.now();
  try {
    // Resend doesn't have a /ping — use domains.list as a lightweight check
    await resend.domains.list();
    return {
      configured: true,
      reachable: true,
      latencyMs: Date.now() - start,
      provider: "resend",
    };
  } catch {
    return {
      configured: true,
      reachable: false,
      latencyMs: Date.now() - start,
      provider: "resend",
    };
  }
}
