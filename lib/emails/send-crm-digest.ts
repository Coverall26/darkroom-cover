/**
 * Send CRM Daily Digest — Sends AI-generated digest to GP admins.
 *
 * Queries CRM metrics, generates AI summary via OpenAI,
 * then sends branded email to each admin team member.
 */

import { createElement } from "react";
import { sendOrgEmail } from "@/lib/resend";
import CrmDailyDigestEmail from "@/components/emails/crm-daily-digest";
import { reportError } from "@/lib/error";

interface DigestRecipient {
  email: string;
  name: string;
}

interface DigestStats {
  totalContacts: number;
  newContacts24h: number;
  emailsSent24h: number;
  emailsOpened24h: number;
  overdueFollowUps: number;
  hotLeads: number;
}

export async function sendCrmDigestEmail(params: {
  recipients: DigestRecipient[];
  companyName: string;
  digestText: string;
  stats: DigestStats;
  teamId: string;
}): Promise<{ sent: number; failed: number }> {
  const { recipients, companyName, digestText, stats, teamId } = params;

  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    try {
      await sendOrgEmail({
        teamId,
        to: recipient.email,
        subject: `CRM Daily Digest — ${date}`,
        react: createElement(CrmDailyDigestEmail, {
          recipientName: recipient.name || "Team Member",
          companyName,
          digestText,
          stats,
          date,
        }),
      });
      sent++;
    } catch (err) {
      reportError(err as Error);
      failed++;
    }
  }

  return { sent, failed };
}
