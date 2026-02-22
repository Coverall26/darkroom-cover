/**
 * POST /api/outreach/send — Send a single outreach email to a contact.
 *
 * Body: { contactId, subject, body, trackOpens?, templateId? }
 * Requires CRM_PRO+ tier with email tracking.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import {
  sendOutreachEmail,
  interpolateMergeVars,
  MergeContext,
} from "@/lib/outreach/send-email";
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

    const body = await req.json();
    const { contactId, subject, body: emailBody, trackOpens, templateId } = body;

    if (!contactId || typeof contactId !== "string") {
      return NextResponse.json(
        { error: "contactId is required" },
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

    // Resolve user's team
    const userTeam = await prisma.userTeam.findFirst({
      where: { userId: session.user.id },
      select: {
        role: true,
        crmRole: true,
        team: { select: { id: true, name: true, organizationId: true } },
        user: { select: { name: true, email: true } },
      },
    });
    if (!userTeam?.team) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    // CRM role check: MANAGER required to send outreach emails
    const crmRole = resolveCrmRole(userTeam.role, userTeam.crmRole);
    if (!hasCrmPermission(crmRole, "MANAGER")) {
      return NextResponse.json(
        { error: "Forbidden: CRM MANAGER role required to send emails" },
        { status: 403 },
      );
    }

    const teamId = userTeam.team.id;

    // Load contact for merge vars
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, teamId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        company: true,
        title: true,
      },
    });
    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 },
      );
    }

    // Interpolate merge variables
    const ctx: MergeContext = {
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        company: contact.company,
        title: contact.title,
      },
      sender: {
        name: userTeam.user?.name ?? null,
        email: userTeam.user?.email ?? null,
        company: userTeam.team.name ?? null,
      },
    };

    const interpolatedSubject = interpolateMergeVars(subject.trim(), ctx);
    const interpolatedBody = interpolateMergeVars(emailBody.trim(), ctx);

    // Send
    const result = await sendOutreachEmail({
      contactId: contact.id,
      teamId,
      subject: interpolatedSubject,
      body: interpolatedBody,
      actorId: session.user.id,
      trackOpens: trackOpens === true,
      templateId,
    });

    if (!result.success) {
      const statusMap: Record<string, number> = {
        CONTACT_NOT_FOUND: 404,
        TEAM_MISMATCH: 403,
        UNSUBSCRIBED: 422,
        BOUNCED: 422,
      };
      const status = statusMap[result.error ?? ""] ?? 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(
      { success: true, emailId: result.emailId },
      { status: 200 },
    );
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
