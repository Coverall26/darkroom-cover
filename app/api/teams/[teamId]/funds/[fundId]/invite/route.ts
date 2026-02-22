import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

/**
 * POST /api/teams/[teamId]/funds/[fundId]/invite
 *
 * GP endpoint to invite investors to a specific fund.
 * Sends them a fund-specific onboarding link.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string; fundId: string }> },
) {
  const { teamId, fundId } = await params;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is admin of this team
    const userTeam = await prisma.userTeam.findFirst({
      where: {
        userId: session.user.id,
        teamId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
      },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify fund belongs to team
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: { id: true, name: true },
    });

    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const body = await req.json();
    const { emails, message: customMessage } = body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json({ error: "At least one email is required" }, { status: 400 });
    }

    // Generate the fund-specific onboarding link
    const baseUrl = process.env.NEXTAUTH_URL || "https://app.fundroom.ai";
    const inviteLink = `${baseUrl}/lp/onboard?teamId=${teamId}`;

    const results: { email: string; status: string }[] = [];

    for (const email of emails) {
      const normalizedEmail = (email as string).toLowerCase().trim();
      if (!normalizedEmail.includes("@")) {
        results.push({ email: normalizedEmail, status: "invalid_email" });
        continue;
      }

      try {
        // Send invite email via dynamic import (fire-and-forget pattern)
        const { sendInviteFundEmail } = await import(
          "@/lib/emails/send-fund-invite"
        );
        await sendInviteFundEmail({
          toEmail: normalizedEmail,
          fundName: fund.name,
          inviterName: session.user.name || "A fund manager",
          inviteLink,
          customMessage: customMessage || undefined,
        });

        results.push({ email: normalizedEmail, status: "invited" });
      } catch (err) {
        console.warn(`[FUND INVITE] Failed to send to ${normalizedEmail}:`, err);
        results.push({ email: normalizedEmail, status: "send_failed" });
      }
    }

    return NextResponse.json({
      success: true,
      inviteLink,
      results,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
