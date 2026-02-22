import ViewedDocumentEmail from "@/components/emails/viewed-document";

import { sendEmail, sendOrgEmail } from "@/lib/resend";

/**
 * Notify document owner when their document is viewed.
 * Tier 2 (org-branded) — sends from org's domain when teamId provided.
 */
export const sendViewedDocumentEmail = async ({
  ownerEmail,
  documentId,
  documentName,
  linkName,
  viewerEmail,
  teamMembers,
  locationString,
  teamId,
}: {
  ownerEmail: string | null;
  documentId: string;
  documentName: string;
  linkName: string;
  viewerEmail: string | null;
  teamMembers?: string[];
  locationString?: string;
  teamId?: string;
}) => {
  const emailTemplate = ViewedDocumentEmail({
    documentId,
    documentName,
    linkName,
    viewerEmail,
    locationString,
  });
  try {
    if (!ownerEmail) {
      throw new Error("Document Owner not found");
    }

    let subjectLine: string = `Your document has been viewed: ${documentName}`;
    if (viewerEmail) {
      subjectLine = `${viewerEmail} viewed the document: ${documentName}`;
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
