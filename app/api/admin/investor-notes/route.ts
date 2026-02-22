import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { Resend } from "resend";
import { reportError } from "@/lib/error";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/investor-notes — List investor notes with pagination
 * POST /api/admin/investor-notes — Create a note and optionally email the LP
 */

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAppRouter();
    if (auth instanceof NextResponse) return auth;

    // Get all GP-level teams (including MANAGER for notes access)
    const gpTeams = await prisma.userTeam.findMany({
      where: {
        userId: auth.userId,
        role: { in: ["OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER"] },
        status: "ACTIVE",
      },
      select: { teamId: true },
    });

    const teamIds = gpTeams.map((t) => t.teamId);

    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const investorId = searchParams.get("investorId");
    const limit = searchParams.get("limit") || "50";
    const offset = searchParams.get("offset") || "0";

    const where: Record<string, unknown> = {
      teamId: teamId || { in: teamIds },
    };

    if (investorId) {
      where.investorId = investorId;
    }

    const [notes, total] = await Promise.all([
      prisma.investorNote.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: parseInt(limit),
        skip: parseInt(offset),
        include: {
          investor: {
            select: {
              id: true,
              entityName: true,
              user: {
                select: { name: true, email: true },
              },
            },
          },
        },
      }),
      prisma.investorNote.count({ where }),
    ]);

    return NextResponse.json({ notes, total });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Investor notes GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAppRouter();
    if (auth instanceof NextResponse) return auth;

    // Get all GP-level teams (including MANAGER for notes access)
    const gpTeams = await prisma.userTeam.findMany({
      where: {
        userId: auth.userId,
        role: { in: ["OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER"] },
        status: "ACTIVE",
      },
      select: { teamId: true },
    });

    if (gpTeams.length === 0) {
      return NextResponse.json(
        { error: "GP access required" },
        { status: 403 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 403 },
      );
    }

    const teamIds = gpTeams.map((t) => t.teamId);

    let body: { investorId?: string; content?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const { investorId, content } = body;

    if (!investorId || !content?.trim()) {
      return NextResponse.json(
        { error: "Investor ID and content are required" },
        { status: 400 },
      );
    }

    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      include: {
        user: { select: { email: true, name: true } },
        fund: { select: { teamId: true } },
      },
    });

    if (!investor) {
      return NextResponse.json(
        { error: "Investor not found" },
        { status: 404 },
      );
    }

    const teamId = investor.fund?.teamId || teamIds[0];

    if (!teamIds.includes(teamId)) {
      return NextResponse.json(
        { error: "Not authorized for this investor's team" },
        { status: 403 },
      );
    }

    const note = await prisma.investorNote.create({
      data: {
        investorId,
        teamId,
        content: content.trim(),
        isFromInvestor: false,
      },
    });

    if (process.env.RESEND_API_KEY && investor.user.email) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);

        await resend.emails.send({
          from:
            process.env.RESEND_FROM_EMAIL ||
            "FundRoom <noreply@fundroom.ai>",
          to: investor.user.email,
          subject: "New Message from Your Fund Manager",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1a1a1a;">New Message from Fund Manager</h2>
              <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p style="margin: 0; color: #333;"><strong>From:</strong> ${user.name || "Fund Manager"}</p>
              </div>
              <div style="background: #fff; border: 1px solid #e0e0e0; padding: 16px; border-radius: 8px;">
                <p style="margin: 0; color: #333; white-space: pre-wrap;">${content.trim()}</p>
              </div>
              <p style="color: #666; font-size: 12px; margin-top: 24px;">
                Log in to your investor portal to respond or view all communications.
              </p>
            </div>
          `,
        });
      } catch (emailErr) {
        reportError(emailErr as Error);
        console.error(
          "Failed to send LP notification email:",
          emailErr,
        );
      }
    }

    return NextResponse.json({
      success: true,
      note: {
        id: note.id,
        content: note.content,
        createdAt: note.createdAt,
      },
    });
  } catch (error: unknown) {
    reportError(error as Error);
    console.error("Investor notes POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
