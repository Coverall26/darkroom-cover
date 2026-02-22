import DataroomNotification from "@/components/emails/dataroom-notification";

import { sendEmail, sendOrgEmail } from "@/lib/resend";

/**
 * Notify viewer about new dataroom content.
 * Tier 2 (org-branded) — sends from org's domain when teamId provided.
 */
export const sendDataroomNotification = async ({
  dataroomName,
  documentName,
  senderEmail,
  to,
  url,
  unsubscribeUrl,
  teamId,
}: {
  dataroomName: string;
  documentName: string | undefined;
  senderEmail: string;
  to: string;
  url: string;
  unsubscribeUrl: string;
  teamId?: string;
}) => {
  try {
    const emailProps = {
      to: to,
      subject: `New document available in ${dataroomName}`,
      react: DataroomNotification({
        senderEmail,
        dataroomName,
        documentName,
        url,
        unsubscribeUrl,
      }),
      test: process.env.NODE_ENV === "development",
      unsubscribeUrl,
    };

    if (teamId) {
      await sendOrgEmail({ teamId, ...emailProps });
    } else {
      await sendEmail({ ...emailProps, system: true });
    }
  } catch (e) {
    console.error(e);
  }
};
