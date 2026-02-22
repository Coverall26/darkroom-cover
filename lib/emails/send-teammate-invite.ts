import TeamInvitation from "@/components/emails/team-invitation";

import { sendEmail, sendOrgEmail } from "@/lib/resend";

/**
 * Send a team/org invitation email.
 * Tier 2 (org-branded) — sends from org's domain when teamId provided.
 */
export const sendTeammateInviteEmail = async ({
  senderName,
  senderEmail,
  teamName,
  to,
  url,
  teamId,
}: {
  senderName: string;
  senderEmail: string;
  teamName: string;
  to: string;
  url: string;
  teamId?: string;
}) => {
  const emailProps = {
    to: to,
    subject: `You've been invited to join ${teamName}`,
    react: TeamInvitation({
      senderName,
      senderEmail,
      teamName,
      url,
    }),
    test: process.env.NODE_ENV === "development",
  };

  if (teamId) {
    await sendOrgEmail({ teamId, ...emailProps });
  } else {
    await sendEmail({ ...emailProps, system: true });
  }
};
