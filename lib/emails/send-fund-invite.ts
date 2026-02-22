import { resend, PLATFORM_FROM_NOTIFICATIONS } from "@/lib/resend";

interface SendFundInviteParams {
  toEmail: string;
  fundName: string;
  inviterName: string;
  inviteLink: string;
  customMessage?: string;
}

/**
 * Send a fund-specific investor onboarding invitation email.
 * Uses Resend client directly with raw HTML (not react-email component).
 */
export async function sendInviteFundEmail({
  toEmail,
  fundName,
  inviterName,
  inviteLink,
  customMessage,
}: SendFundInviteParams): Promise<void> {
  if (!resend) {
    console.warn("[EMAIL] Resend not initialized — skipping fund invite email");
    return;
  }

  try {
    await resend.emails.send({
      from: PLATFORM_FROM_NOTIFICATIONS,
      to: process.env.NODE_ENV === "development" ? "delivered@resend.dev" : toEmail,
      subject: `You're invited to invest in ${fundName} | FundRoom`,
      html: buildFundInviteHtml({ fundName, inviterName, inviteLink, customMessage }),
      text: buildFundInviteText({ fundName, inviterName, inviteLink, customMessage }),
    });
  } catch (error) {
    console.error("[EMAIL] Failed to send fund invite:", error);
    throw error;
  }
}

function buildFundInviteHtml(params: {
  fundName: string;
  inviterName: string;
  inviteLink: string;
  customMessage?: string;
}): string {
  const { fundName, inviterName, inviteLink, customMessage } = params;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background-color: #0A1628; border-radius: 12px 12px 0 0; padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; font-size: 24px; margin: 0;">FundRoom</h1>
      <p style="color: #94a3b8; font-size: 14px; margin: 8px 0 0;">Secure Fund Operations Platform</p>
    </div>
    <div style="background-color: #ffffff; padding: 32px; border-radius: 0 0 12px 12px;">
      <h2 style="color: #0A1628; font-size: 20px; margin: 0 0 16px;">You're Invited to Invest</h2>
      <p style="color: #374151; font-size: 15px; line-height: 1.6;">
        <strong>${inviterName}</strong> has invited you to review and invest in <strong>${fundName}</strong> through the FundRoom investor portal.
      </p>
      ${
        customMessage
          ? `<div style="background-color: #f8fafc; border-left: 4px solid #0066FF; padding: 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
        <p style="color: #374151; font-size: 14px; margin: 0; font-style: italic;">&ldquo;${customMessage}&rdquo;</p>
        <p style="color: #6b7280; font-size: 13px; margin: 8px 0 0;">&mdash; ${inviterName}</p>
      </div>`
          : ""
      }
      <p style="color: #374151; font-size: 15px; line-height: 1.6;">
        Click the button below to begin your investor onboarding. You'll be guided through accreditation verification, NDA acceptance, and commitment setup.
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${inviteLink}" style="display: inline-block; background-color: #0066FF; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Begin Investor Onboarding
        </a>
      </div>
      <p style="color: #6b7280; font-size: 13px; line-height: 1.5;">
        This is a confidential invitation. If you believe you received this in error, please disregard this message.
      </p>
    </div>
    <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px;">
      Powered by FundRoom.ai &mdash; Secure Fund Operations
    </p>
  </div>
</body>
</html>`;
}

function buildFundInviteText(params: {
  fundName: string;
  inviterName: string;
  inviteLink: string;
  customMessage?: string;
}): string {
  const { fundName, inviterName, inviteLink, customMessage } = params;

  let text = `You're invited to invest in ${fundName}\n\n`;
  text += `${inviterName} has invited you to review and invest in ${fundName} through the FundRoom investor portal.\n\n`;
  if (customMessage) {
    text += `"${customMessage}" — ${inviterName}\n\n`;
  }
  text += `Begin your investor onboarding: ${inviteLink}\n\n`;
  text += `You'll be guided through accreditation verification, NDA acceptance, and commitment setup.\n\n`;
  text += `This is a confidential invitation. If you received this in error, please disregard.\n\n`;
  text += `Powered by FundRoom.ai`;

  return text;
}
