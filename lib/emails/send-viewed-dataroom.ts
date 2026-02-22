import ViewedDataroomEmail from "@/components/emails/viewed-dataroom";

import { sendEmail, sendOrgEmail } from "@/lib/resend";

/**
 * Notify dataroom owner when their dataroom is viewed.
 * Tier 2 (org-branded) — sends from org's domain when teamId provided.
 */
export const sendViewedDataroomEmail = async ({
  ownerEmail,
  dataroomId,
  dataroomName,
  viewerEmail,
  linkName,
  teamMembers,
  locationString,
  teamId,
}: {
  ownerEmail: string | null;
  dataroomId: string;
  dataroomName: string;
  viewerEmail: string | null;
  linkName: string;
  teamMembers?: string[];
  locationString?: string;
  teamId?: string;
}) => {
  const emailTemplate = ViewedDataroomEmail({
    dataroomId,
    dataroomName,
    viewerEmail,
    linkName,
    locationString,
  });
  try {
    if (!ownerEmail) {
      throw new Error("Dataroom Admin not found");
    }

    let subjectLine: string = `Your dataroom has been viewed: ${dataroomName}`;
    if (viewerEmail) {
      subjectLine = `${viewerEmail} viewed the dataroom: ${dataroomName}`;
    }

    const emailProps = {
      to: ownerEmail,
      cc: teamMembers,
      subject: subjectLine,
      react: emailTemplate,
      test: process.env.NODE_ENV === "development",
    };

    const data = teamId
      ? await sendOrgEmail({ teamId, ...emailProps })
      : await sendEmail({ ...emailProps, system: true });

    return { success: true, data };
  } catch (error) {
    return { success: false, error };
  }
};
