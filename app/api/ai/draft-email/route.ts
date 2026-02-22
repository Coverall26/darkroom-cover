/**
 * POST /api/ai/draft-email — AI-powered email draft generation.
 *
 * Body: { contactId, purpose, additionalContext? }
 * Requires AI_CRM add-on enabled.
 * Uses OpenAI to generate a professional email draft.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { resolveOrgTier } from "@/lib/tier/crm-tier";
import { createChatCompletion } from "@/lib/openai";
import {
  buildEmailDraftPrompt,
  type EmailPurpose,
  type ContactContext,
  type SenderContext,
} from "@/lib/ai/crm-prompts";

export const dynamic = "force-dynamic";

const VALID_PURPOSES: EmailPurpose[] = [
  "follow_up",
  "introduction",
  "commitment_check",
  "thank_you",
  "update",
  "re_engagement",
];

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { contactId, purpose, additionalContext } = body;

    // Validate inputs
    if (!contactId || typeof contactId !== "string") {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 },
      );
    }
    if (!purpose || !VALID_PURPOSES.includes(purpose)) {
      return NextResponse.json(
        {
          error: `Invalid purpose. Must be one of: ${VALID_PURPOSES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Load contact with recent activities
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, teamId },
      include: {
        contactActivities: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            type: true,
            description: true,
            createdAt: true,
          },
        },
      },
    });

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 },
      );
    }

    // Load sender (current user) + org info
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { name: true },
    });

    const org = orgId
      ? await prisma.organization.findUnique({
          where: { id: orgId },
          select: { name: true },
        })
      : null;

    // Load fund name if contact has an associated fund
    let fundName: string | null = null;
    if (orgId) {
      const fund = await prisma.fund.findFirst({
        where: {
          team: { organizationId: orgId },
          status: { not: "CLOSED" },
        },
        select: { name: true },
        orderBy: { createdAt: "desc" },
      });
      fundName = fund?.name ?? null;
    }

    // Build contexts
    const contactCtx: ContactContext = {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      company: contact.company,
      title: contact.title,
      status: contact.status,
      engagementScore: contact.engagementScore,
      lastContactedAt: contact.lastContactedAt?.toISOString() ?? null,
      lastEngagedAt: contact.lastEngagedAt?.toISOString() ?? null,
      recentActivities: (contact.contactActivities ?? []).map((a: { type: string; description: string | null; createdAt: Date }) => ({
        type: a.type,
        description: a.description ?? "",
        createdAt: a.createdAt.toISOString(),
      })),
    };

    const senderCtx: SenderContext = {
      name: user?.name ?? auth.session.user.name ?? null,
      company: org?.name ?? userTeam.team.name ?? null,
      fundName,
    };

    // Build prompt and call LLM
    const prompt = buildEmailDraftPrompt(
      contactCtx,
      senderCtx,
      purpose as EmailPurpose,
      additionalContext,
    );

    const completion = await createChatCompletion({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    // Parse JSON response
    let draft: { subject: string; body: string };
    try {
      draft = JSON.parse(raw);
      if (!draft.subject || !draft.body) {
        throw new Error("Missing subject or body in AI response");
      }
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response. Please try again." },
        { status: 502 },
      );
    }

    // Log AI draft activity on the contact
    await prisma.contactActivity.create({
      data: {
        contactId,
        type: "NOTE_ADDED",
        actorId: auth.userId,
        description: `AI drafted a ${purpose.replace(/_/g, " ")} email`,
        metadata: {
          action: "ai_email_draft",
          purpose,
          model: "gpt-4o-mini",
        },
      },
    });

    return NextResponse.json({
      subject: draft.subject,
      body: draft.body,
      contactId,
      purpose,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
