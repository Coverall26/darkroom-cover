import { NextRequest, NextResponse } from "next/server";
import { authenticateGP } from "@/lib/marketplace/auth";
import {
  createEmailDomain,
  getEmailDomainStatus,
  removeEmailDomain,
  updateEmailFromSettings,
} from "@/lib/email/domain-service";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ teamId: string }>;
};

/**
 * GET /api/teams/[teamId]/email-domain
 * Get the team's email domain configuration and current status.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        emailDomainId: true,
        emailDomain: true,
        emailDomainStatus: true,
        emailDomainRegion: true,
        emailFromName: true,
        emailFromAddress: true,
        emailReplyTo: true,
        emailDomainVerifiedAt: true,
        emailDomainDnsRecords: true,
      },
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // If domain exists, refresh status from Resend
    if (team.emailDomainId) {
      try {
        const liveStatus = await getEmailDomainStatus(teamId);
        return NextResponse.json({
          configured: true,
          domain: liveStatus.name,
          domainId: liveStatus.id,
          status: liveStatus.status,
          region: liveStatus.region,
          dnsRecords: liveStatus.dnsRecords,
          fromName: team.emailFromName,
          fromAddress: team.emailFromAddress,
          replyTo: team.emailReplyTo,
          verifiedAt: team.emailDomainVerifiedAt,
        });
      } catch (e) {
        // If Resend API fails, return cached data
        return NextResponse.json({
          configured: true,
          domain: team.emailDomain,
          domainId: team.emailDomainId,
          status: team.emailDomainStatus,
          region: team.emailDomainRegion,
          dnsRecords: team.emailDomainDnsRecords,
          fromName: team.emailFromName,
          fromAddress: team.emailFromAddress,
          replyTo: team.emailReplyTo,
          verifiedAt: team.emailDomainVerifiedAt,
          cached: true,
        });
      }
    }

    return NextResponse.json({ configured: false });
  } catch (error: unknown) {
    console.error("[EMAIL_DOMAIN_API] GET error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/teams/[teamId]/email-domain
 * Add a new sending domain for this team.
 *
 * Body: { domain: string, region?: string }
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();
    const { domain, region } = body;

    if (!domain || typeof domain !== "string") {
      return NextResponse.json(
        { error: "domain is required" },
        { status: 400 },
      );
    }

    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return NextResponse.json(
        { error: "Invalid domain format" },
        { status: 400 },
      );
    }

    const result = await createEmailDomain(teamId, domain.toLowerCase(), region);

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const msg = (error instanceof Error ? error.message : "") || "";
    if (msg.includes("already has a domain")) {
      return NextResponse.json({ error: "Team already has a domain configured. Remove it first." }, { status: 409 });
    }
    console.error("[EMAIL_DOMAIN_API] POST error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/teams/[teamId]/email-domain
 * Update email "from" settings (name, address, reply-to).
 *
 * Body: { fromName?: string, fromAddress?: string, replyTo?: string }
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    const body = await req.json();
    const { fromName, fromAddress, replyTo } = body;

    await updateEmailFromSettings(teamId, { fromName, fromAddress, replyTo });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[EMAIL_DOMAIN_API] PATCH error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/teams/[teamId]/email-domain
 * Remove the email domain from this team.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { teamId } = await params;
    const auth = await authenticateGP(teamId);
    if ("error" in auth) return auth.error;

    await removeEmailDomain(teamId);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = (error instanceof Error ? error.message : "") || "";
    if (msg.includes("No email domain configured")) {
      return NextResponse.json({ error: "No email domain configured for this team" }, { status: 400 });
    }
    console.error("[EMAIL_DOMAIN_API] DELETE error:", error);
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
