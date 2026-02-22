import { NextApiRequest, NextApiResponse } from "next";

import { z } from "zod";

import { createAdminMagicLink } from "@/lib/auth/admin-magic-link";
import { getAllAdminEmails, isUserAdminAsync } from "@/lib/constants/admins";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { strictRateLimiter } from "@/lib/security/rate-limiter";

import InviteRequest from "@/components/emails/invite-request";
import { reportError } from "@/lib/error";

const inviteRequestSchema = z.object({
  email: z.string().trim().email("Invalid email address").min(1),
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
  company: z.string().trim().min(2, "Company name must be at least 2 characters"),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const allowed = await strictRateLimiter(req, res);
  if (!allowed) return;

  try {
    const validation = inviteRequestSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ 
        error: "All fields are required and must be valid",
        errors: validation.error.errors,
      });
    }

    const { email, fullName, company } = validation.data;
    const emailLower = email.toLowerCase().trim();

    // Server-side defense-in-depth: check if user already has access
    const isAdmin = await isUserAdminAsync(emailLower);
    if (isAdmin) {
      return res.status(200).json({ 
        message: "You already have admin access. Please use the admin login.",
        hasAccess: true,
        isAdmin: true,
      });
    }

    // Check if user is already a viewer
    const existingViewer = await prisma.viewer.findFirst({
      where: {
        email: { equals: emailLower, mode: "insensitive" },
        accessRevokedAt: null,
      },
      select: { id: true }
    });
    if (existingViewer) {
      return res.status(200).json({ 
        message: "You already have access. Please enter your email on the login page.",
        hasAccess: true,
        isAdmin: false,
      });
    }

    const baseUrl = process.env.NEXTAUTH_URL || "https://app.fundroom.ai";
    const quickAddPath = `/admin/quick-add?email=${encodeURIComponent(email)}`;
    
    // Get admin emails dynamically from the database
    const allAdminEmails = await getAllAdminEmails();
    
    // Filter out the requester's email - they shouldn't get notified about their own request
    const adminEmails = allAdminEmails.filter(
      (adminEmail) => adminEmail.toLowerCase().trim() !== emailLower
    );
    
    if (adminEmails.length === 0) {
      return res.status(200).json({ message: "Request sent successfully" });
    }
    
    for (const adminEmail of adminEmails) {
      // Create magic link for Quick Add button
      const quickAddMagicLink = await createAdminMagicLink({
        email: adminEmail,
        redirectPath: quickAddPath,
        baseUrl,
      });
      
      // Create magic link for Enter Dataroom button (goes to dashboard)
      const dashboardMagicLink = await createAdminMagicLink({
        email: adminEmail,
        redirectPath: "/dashboard",
        baseUrl,
      });
      
      if (!quickAddMagicLink) {
        console.error("[REQUEST_INVITE] Failed to create quick-add magic link for:", adminEmail);
      }
      if (!dashboardMagicLink) {
        console.error("[REQUEST_INVITE] Failed to create dashboard magic link for:", adminEmail);
      }
      
      // Use magic links, with admin login fallback (not visitor login)
      const quickAddUrl = quickAddMagicLink?.magicLink || `${baseUrl}/admin/login?next=${encodeURIComponent(quickAddPath)}`;
      const signInUrl = dashboardMagicLink?.magicLink || `${baseUrl}/admin/login?next=${encodeURIComponent("/dashboard")}`;

      const emailTemplate = InviteRequest({
        email,
        fullName,
        company,
        signInUrl,
        quickAddUrl,
      });

      await sendEmail({
        to: adminEmail,
        subject: `New Investor Access Request: ${fullName}`,
        react: emailTemplate,
        system: true,
        replyTo: email,
      });
      
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    return res.status(200).json({ message: "Request sent successfully" });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Error sending invite request:", error);
    return res.status(500).json({ 
      error: "Internal server error",
    });
  }
}
