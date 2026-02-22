import SignatureReminderEmail from "@/components/emails/signature-reminder";
import { sendOrgEmail } from "@/lib/resend";

interface SignatureReminderEmailProps {
  email: string;
  recipientName: string;
  documentTitle: string;
  senderName: string;
  teamName: string;
  teamId: string;
  signingUrl: string;
  daysWaiting: number;
  expirationDate?: string | null;
}

export async function sendSignatureReminderEmail({
  email,
  recipientName,
  documentTitle,
  senderName,
  teamName,
  teamId,
  signingUrl,
  daysWaiting,
  expirationDate,
}: SignatureReminderEmailProps) {
  const subject =
    daysWaiting >= 7
      ? `[Action Required] Your signature is overdue on "${documentTitle}"`
      : `Reminder: Your signature is needed on "${documentTitle}"`;

  try {
    await sendOrgEmail({
      teamId,
      to: email,
      subject,
      react: SignatureReminderEmail({
        recipientName,
        documentTitle,
        senderName,
        teamName,
        signingUrl,
        daysWaiting,
        expirationDate: expirationDate ?? undefined,
      }),
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send signature reminder email:", error);
    return { success: false, error };
  }
}
