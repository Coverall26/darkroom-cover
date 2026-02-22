import { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { nanoid } from "nanoid";
import { sendEmail } from "@/lib/resend";
import NewQuestion from "@/components/emails/new-question";
import { getTeamAdminEmails } from "@/lib/constants/admins";
import { createAdminMagicLink } from "@/lib/auth/admin-magic-link";
import { reportError } from "@/lib/error";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    const { viewId, content, documentId, dataroomId, linkId, pageNumber, viewerEmail, viewerName } = req.body;

    if (!viewId || !content) {
      return res.status(400).json({ error: "View ID and question content are required" });
    }

    try {
      const view = await prisma.view.findUnique({
        where: { id: viewId },
        include: { link: true },
      });

      if (!view) {
        return res.status(404).json({ error: "View not found" });
      }

      if (documentId && view.documentId && documentId !== view.documentId) {
        return res.status(400).json({ error: "Document ID does not match the view" });
      }
      if (dataroomId && view.dataroomId && dataroomId !== view.dataroomId) {
        return res.status(400).json({ error: "Dataroom ID does not match the view" });
      }
      if (linkId && view.linkId && linkId !== view.linkId) {
        return res.status(400).json({ error: "Link ID does not match the view" });
      }

      const viewer = view.viewerId 
        ? await prisma.viewer.findUnique({ where: { id: view.viewerId } })
        : null;

      const replyToken = nanoid(32);

      const dataroomQuestion = await prisma.dataroomQuestion.create({
        data: {
          content,
          viewId,
          viewerId: viewer?.id,
          viewerEmail: viewerEmail || view.viewerEmail || "",
          viewerName: viewerName || view.viewerName,
          documentId,
          dataroomId,
          linkId: linkId || view.linkId!,
          pageNumber,
          teamId: view.teamId!,
          status: "OPEN",
          replyToken,
        },
        include: {
          document: { select: { name: true } },
          dataroom: { select: { id: true, name: true } },
        },
      });

      // Get admin emails dynamically from the team
      const adminEmails = view.teamId 
        ? await getTeamAdminEmails(view.teamId)
        : [];

      const baseUrl = process.env.NEXTAUTH_URL || "https://app.fundroom.ai";
      const qandaPath = dataroomQuestion.dataroom?.id 
        ? `/datarooms/${dataroomQuestion.dataroom.id}/settings/qanda`
        : "/dashboard";

      for (const adminEmail of adminEmails) {
        try {
          // Create admin magic link for the Q&A URL
          const magicLinkResult = await createAdminMagicLink({
            email: adminEmail,
            redirectPath: qandaPath,
            baseUrl,
          });
          
          // Use magic link or fallback to admin login
          const qandaUrl = magicLinkResult?.magicLink || `${baseUrl}/admin/login?next=${encodeURIComponent(qandaPath)}`;
          
          await sendEmail({
            to: adminEmail,
            subject: `New Question from ${dataroomQuestion.viewerName || dataroomQuestion.viewerEmail}`,
            react: NewQuestion({
              questionId: dataroomQuestion.id,
              dataroomId: dataroomQuestion.dataroom?.id,
              dataroomName: dataroomQuestion.dataroom?.name || undefined,
              viewerEmail: dataroomQuestion.viewerEmail,
              viewerName: dataroomQuestion.viewerName,
              questionContent: dataroomQuestion.content,
              pageNumber: dataroomQuestion.pageNumber,
              documentName: dataroomQuestion.document?.name,
              qandaUrl,
            }),
          });
        } catch (emailError) {
          reportError(emailError as Error);
          console.error("Failed to send email notification:", emailError);
        }
      }

      return res.status(201).json(dataroomQuestion);
    } catch (error) {
      reportError(error as Error);
      console.error("Error creating question:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
