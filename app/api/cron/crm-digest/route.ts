/**
 * POST /api/cron/crm-digest — Send daily CRM digest to all AI CRM orgs.
 *
 * Called by Vercel Cron (daily at 8am UTC) or external scheduler.
 * For each org with AI CRM enabled:
 *   1. Gather 24h CRM metrics
 *   2. Generate AI summary via OpenAI
 *   3. Send digest email to GP admin team members
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { createChatCompletion } from "@/lib/openai";
import { buildDigestPrompt } from "@/lib/ai/crm-prompts";
import { sendCrmDigestEmail } from "@/lib/emails/send-crm-digest";
import { OrgSubscriptionStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Allow up to 2 minutes for multi-org processing

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");
    const bearerToken = authHeader?.replace("Bearer ", "");

    if (cronSecret && bearerToken !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find all orgs with AI CRM enabled
    const orgs = await prisma.organization.findMany({
      where: {
        aiCrmEnabled: true,
        subscriptionStatus: { not: OrgSubscriptionStatus.CANCELED },
      },
      include: {
        teams: {
          take: 1,
          select: {
            id: true,
            users: {
              where: {
                role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
              },
              select: {
                user: { select: { email: true, name: true } },
              },
            },
          },
        },
      },
    });

    const results = [];

    for (const org of orgs) {
      const team = org.teams[0];
      if (!team) continue;

      const recipients = team.users
        .map((m: { user: { email: string | null; name: string | null } }) => ({
          email: m.user.email ?? "",
          name: m.user.name ?? "",
        }))
        .filter((r: { email: string }) => r.email);

      if (recipients.length === 0) continue;

      try {
        // Gather CRM stats for the last 24 hours
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [
          totalContacts,
          newContacts,
          emailsSent,
          emailsOpened,
          overdueFollowUps,
          hotLeads,
          recentActivities,
        ] = await Promise.all([
          prisma.contact.count({ where: { teamId: team.id } }),
          prisma.contact.count({
            where: { teamId: team.id, createdAt: { gte: yesterday } },
          }),
          prisma.contactActivity.count({
            where: {
              contact: { teamId: team.id },
              type: "EMAIL_SENT",
              createdAt: { gte: yesterday },
            },
          }),
          prisma.contactActivity.count({
            where: {
              contact: { teamId: team.id },
              type: "EMAIL_OPENED",
              createdAt: { gte: yesterday },
            },
          }),
          prisma.contact.count({
            where: {
              teamId: team.id,
              nextFollowUpAt: { lt: now },
              unsubscribedAt: null,
            },
          }),
          prisma.contact.count({
            where: {
              teamId: team.id,
              engagementScore: { gte: 15 },
              unsubscribedAt: null,
            },
          }),
          prisma.contactActivity.findMany({
            where: {
              contact: { teamId: team.id },
              createdAt: { gte: yesterday },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: { type: true, description: true },
          }),
        ]);

        const stats = {
          totalContacts,
          newContacts24h: newContacts,
          emailsSent24h: emailsSent,
          emailsOpened24h: emailsOpened,
          overdueFollowUps,
          hotLeads,
          recentActivities: recentActivities.map((a) => ({
            type: a.type,
            description: a.description ?? "",
          })),
        };

        // Generate AI digest
        const firstRecipientName = recipients[0]?.name || "Team";
        const prompt = buildDigestPrompt(
          stats,
          firstRecipientName,
          org.name ?? "Your Organization",
        );

        const completion = await createChatCompletion({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.5,
          max_tokens: 500,
        });

        const digestText =
          completion.choices[0]?.message?.content?.trim() ??
          "No digest available for today.";

        // Send digest emails
        const emailResult = await sendCrmDigestEmail({
          recipients,
          companyName: org.name ?? "Your Organization",
          digestText,
          stats: {
            totalContacts,
            newContacts24h: newContacts,
            emailsSent24h: emailsSent,
            emailsOpened24h: emailsOpened,
            overdueFollowUps,
            hotLeads,
          },
          teamId: team.id,
        });

        results.push({
          orgId: org.id,
          orgName: org.name,
          ...emailResult,
        });
      } catch (err) {
        reportError(err as Error);
        results.push({
          orgId: org.id,
          orgName: org.name,
          sent: 0,
          failed: 0,
          error: "Processing failed",
        });
      }
    }

    return NextResponse.json({
      success: true,
      orgsProcessed: results.length,
      results,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// Also support GET for Vercel Cron
export async function GET(req: NextRequest) {
  return POST(req);
}
