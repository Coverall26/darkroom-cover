/**
 * GET /api/ai/digest — AI-powered daily CRM digest.
 *
 * Returns a concise daily summary of CRM activity, metrics, and priority actions.
 * Requires AI_CRM add-on enabled.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { resolveOrgTier } from "@/lib/tier/crm-tier";
import { createChatCompletion } from "@/lib/openai";
import { buildDigestPrompt } from "@/lib/ai/crm-prompts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const auth = await requireAuthAppRouter();
    if (auth instanceof NextResponse) return auth;

    const userTeam = await prisma.userTeam.findFirst({
      where: { userId: auth.userId },
      select: {
        team: {
          select: {
            id: true,
            organizationId: true,
            name: true,
          },
        },
      },
    });
    if (!userTeam?.team) {
      return NextResponse.json({ error: "No team found" }, { status: 403 });
    }

    const teamId = userTeam.team.id;
    const orgId = userTeam.team.organizationId;

    // Check AI CRM is enabled
    if (orgId) {
      const tier = await resolveOrgTier(orgId);
      if (!tier.hasAiFeatures) {
        return NextResponse.json(
          {
            error: "AI CRM features require the AI CRM add-on",
            upgradeUrl: "/admin/settings?tab=billing",
          },
          { status: 403 },
        );
      }
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Gather metrics in parallel
    const [
      totalContacts,
      newContacts24h,
      emailsSent24h,
      emailsOpened24h,
      overdueFollowUps,
      hotLeads,
      recentActivities,
    ] = await Promise.all([
      prisma.contact.count({ where: { teamId } }),
      prisma.contact.count({
        where: { teamId, createdAt: { gte: twentyFourHoursAgo } },
      }),
      prisma.contactActivity.count({
        where: {
          contact: { teamId },
          type: "EMAIL_SENT",
          createdAt: { gte: twentyFourHoursAgo },
        },
      }),
      prisma.contactActivity.count({
        where: {
          contact: { teamId },
          type: "EMAIL_OPENED",
          createdAt: { gte: twentyFourHoursAgo },
        },
      }),
      prisma.contact.count({
        where: {
          teamId,
          nextFollowUpAt: { lt: now },
          status: { notIn: ["CUSTOMER", "WON", "LOST", "ARCHIVED"] },
        },
      }),
      prisma.contact.count({
        where: { teamId, engagementScore: { gte: 15 } },
      }),
      prisma.contactActivity.findMany({
        where: {
          contact: { teamId },
          createdAt: { gte: twentyFourHoursAgo },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { type: true, description: true },
      }),
    ]);

    // Build stats object for the prompt
    const stats = {
      totalContacts,
      newContacts24h,
      emailsSent24h,
      emailsOpened24h,
      overdueFollowUps,
      hotLeads,
      recentActivities: recentActivities.map((a) => ({
        type: a.type,
        description: a.description,
      })),
    };

    // Get org name for prompt
    const org = orgId
      ? await prisma.organization.findUnique({
          where: { id: orgId },
          select: { name: true },
        })
      : null;

    const companyName = org?.name ?? userTeam.team.name ?? "Investment Firm";
    const senderName = auth.session.user.name ?? auth.email ?? "Fund Manager";

    const prompt = buildDigestPrompt(stats, senderName, companyName);

    const completion = await createChatCompletion({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 600,
    });

    const digest = completion.choices[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({
      digest,
      stats,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
