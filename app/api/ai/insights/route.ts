/**
 * GET /api/ai/insights — AI-powered CRM insight cards.
 *
 * Returns 3 actionable insight cards based on contact pipeline analysis.
 * Requires AI_CRM add-on enabled.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { resolveOrgTier } from "@/lib/tier/crm-tier";
import { createChatCompletion } from "@/lib/openai";
import {
  buildInsightPrompt,
  buildContactInsightPrompt,
  type ContactContext,
} from "@/lib/ai/crm-prompts";

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

    // Optional: per-contact insight mode
    const contactId = req.nextUrl.searchParams.get("contactId");

    // Load contacts for analysis
    const contacts = await prisma.contact.findMany({
      where: {
        teamId,
        unsubscribedAt: null,
        ...(contactId ? { id: contactId } : {}),
      },
      orderBy: { engagementScore: "desc" },
      take: contactId ? 1 : 20,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        company: true,
        title: true,
        status: true,
        engagementScore: true,
        lastContactedAt: true,
        lastEngagedAt: true,
        contactActivities: contactId
          ? {
              orderBy: { createdAt: "desc" as const },
              take: 10,
              select: { type: true, description: true, createdAt: true },
            }
          : undefined,
      },
    });

    if (contacts.length === 0) {
      return NextResponse.json({ insights: [], message: "No contacts to analyze" });
    }

    // Get org name for prompt
    const org = orgId
      ? await prisma.organization.findUnique({
          where: { id: orgId },
          select: { name: true },
        })
      : null;

    const companyName = org?.name ?? userTeam.team.name ?? "Investment Firm";

    // Build contact contexts
    const contactContexts: ContactContext[] = contacts.map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      company: c.company,
      title: c.title,
      status: c.status,
      engagementScore: c.engagementScore,
      lastContactedAt: c.lastContactedAt?.toISOString() ?? null,
      lastEngagedAt: c.lastEngagedAt?.toISOString() ?? null,
      recentActivities: (c as Record<string, unknown>).contactActivities
        ? ((c as Record<string, unknown>).contactActivities as Array<{ type: string; description: string; createdAt: Date }>).map(
            (a) => ({
              type: a.type,
              description: a.description,
              createdAt: a.createdAt.toISOString(),
            }),
          )
        : undefined,
    }));

    // Build prompt — per-contact or pipeline-level
    const prompt = contactId && contactContexts.length === 1
      ? buildContactInsightPrompt(contactContexts[0], companyName)
      : buildInsightPrompt(contactContexts, companyName);

    const completion = await createChatCompletion({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 800,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    // Parse JSON response — expect { insights: [...] } or bare array
    let insights: Array<{
      title: string;
      description: string;
      type: string;
      priority: string;
      contactIds: string[];
    }>;

    try {
      const parsed = JSON.parse(raw);
      insights = Array.isArray(parsed) ? parsed : parsed.insights ?? parsed;
      if (!Array.isArray(insights)) {
        throw new Error("Response is not an array");
      }
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI insights. Please try again." },
        { status: 502 },
      );
    }

    // Validate and clean insight data
    insights = insights.slice(0, 3).map((i) => ({
      title: String(i.title ?? "").slice(0, 60),
      description: String(i.description ?? "").slice(0, 200),
      type: ["opportunity", "risk", "action", "trend"].includes(i.type)
        ? i.type
        : "action",
      priority: ["high", "medium", "low"].includes(i.priority)
        ? i.priority
        : "medium",
      contactIds: Array.isArray(i.contactIds)
        ? i.contactIds.filter((e: unknown) => typeof e === "string")
        : [],
    }));

    return NextResponse.json({ insights });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
