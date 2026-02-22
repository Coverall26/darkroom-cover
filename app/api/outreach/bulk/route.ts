/**
 * POST /api/outreach/bulk — Send outreach emails to multiple contacts.
 *
 * Body: { contactIds, subject, body, trackOpens?, templateId? }
 * Max 50 recipients per request.
 * Requires CRM_PRO+ tier with email tracking.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { sendBulkOutreachEmail } from "@/lib/outreach/send-email";
import { resolveOrgTier } from "@/lib/tier/crm-tier";
import { resolveCrmRole, hasCrmPermission } from "@/lib/auth/crm-roles";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userTeam = await prisma.userTeam.findFirst({
      where: { userId: session.user.id },
      select: {
        role: true,
        crmRole: true,
        team: { select: { id: true, organizationId: true } },
      },
    });
    if (!userTeam?.team) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    const teamId = userTeam.team.id;
    const orgId = userTeam.team.organizationId;

    // CRM role check: MANAGER required to send bulk emails
    const crmRole = resolveCrmRole(userTeam.role, userTeam.crmRole);
    if (!hasCrmPermission(crmRole, "MANAGER")) {
      return NextResponse.json(
        { error: "Forbidden: CRM MANAGER role required to send bulk emails" },
        { status: 403 },
      );
    }

    // Check tier — bulk email requires CRM_PRO+
    if (orgId) {
      const tier = await resolveOrgTier(orgId);
      if (!tier.hasEmailTracking) {
        return NextResponse.json(
          {
            error: "Bulk email requires CRM Pro or FundRoom plan",
            upgradeUrl: "/admin/settings?tab=billing",
          },
          { status: 403 },
        );
      }
    }

    const body = await req.json();
    const { contactIds, subject, body: emailBody, trackOpens, templateId } = body;

    // Validate
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json(
        { error: "contactIds array is required" },
        { status: 400 },
      );
    }
    if (contactIds.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 recipients per bulk send" },
        { status: 400 },
      );
    }
    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return NextResponse.json(
        { error: "subject is required" },
        { status: 400 },
      );
    }
    if (!emailBody || typeof emailBody !== "string" || !emailBody.trim()) {
      return NextResponse.json(
        { error: "body is required" },
        { status: 400 },
      );
    }

    const result = await sendBulkOutreachEmail({
      contactIds,
      teamId,
      subject: subject.trim(),
      bodyTemplate: emailBody.trim(),
      actorId: session.user.id,
      trackOpens: trackOpens === true,
      templateId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
