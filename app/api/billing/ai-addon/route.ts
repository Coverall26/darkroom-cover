/**
 * POST /api/billing/ai-addon — Subscribe to or cancel the AI CRM add-on.
 *
 * Body:
 *   { action: "subscribe", period: "monthly" | "yearly" }  — Start AI CRM add-on (14-day trial)
 *   { action: "cancel" }                                    — Cancel AI CRM add-on
 *
 * Requires active CRM_PRO or FUNDROOM base subscription.
 * AI CRM is a separate Stripe subscription on the same customer.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { stripeInstance } from "@/ee/stripe";
import { AI_CRM_ADDON } from "@/lib/stripe/crm-products";
import { invalidateTierCache } from "@/lib/tier/crm-tier";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { logAuditEvent } from "@/lib/audit/audit-logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  try {
    const auth = await requireAuthAppRouter();
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { action, period } = body as { action: string; period?: string };

    if (!action || !["subscribe", "cancel"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'subscribe' or 'cancel'." },
        { status: 400 },
      );
    }

    // Resolve user's org
    const user = await prisma.user.findUnique({
      where: { email: auth.email },
      select: {
        id: true,
        email: true,
        teams: {
          select: {
            team: {
              select: {
                id: true,
                organization: {
                  select: {
                    id: true,
                    stripeCustomerId: true,
                    stripeSubscriptionId: true,
                    stripeAiSubscriptionId: true,
                    subscriptionTier: true,
                    aiCrmEnabled: true,
                  },
                },
              },
            },
            role: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const adminTeam = user.teams.find(
      (t) => t.role === "ADMIN" || t.role === "OWNER" || t.role === "SUPER_ADMIN",
    );

    if (!adminTeam?.team.organization) {
      return NextResponse.json(
        { error: "No organization found. Only admins can manage billing." },
        { status: 403 },
      );
    }

    const org = adminTeam.team.organization;
    const stripe = stripeInstance();

    // ---------------------------------------------------------------------------
    // SUBSCRIBE to AI CRM add-on
    // ---------------------------------------------------------------------------
    if (action === "subscribe") {
      // Must have an active paid CRM subscription
      if (org.subscriptionTier === "FREE" || !org.stripeCustomerId) {
        return NextResponse.json(
          { error: "AI CRM requires an active CRM Pro or FundRoom subscription." },
          { status: 400 },
        );
      }

      // Already has AI CRM
      if (org.aiCrmEnabled && org.stripeAiSubscriptionId) {
        return NextResponse.json(
          { error: "AI CRM add-on is already active." },
          { status: 409 },
        );
      }

      const billingPeriod = period === "yearly" ? "yearly" : "monthly";
      const priceId = AI_CRM_ADDON.price[billingPeriod].priceId;

      if (!priceId) {
        return NextResponse.json(
          { error: "AI CRM price not configured." },
          { status: 400 },
        );
      }

      // Create a separate subscription for the AI add-on
      const subscription = await stripe.subscriptions.create({
        customer: org.stripeCustomerId,
        items: [{ price: priceId }],
        trial_period_days: AI_CRM_ADDON.trialDays,
        metadata: {
          orgId: org.id,
          system: "crm",
          addon: "AI_CRM",
        },
      });

      // Calculate trial end date
      const trialEndsAt = subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null;

      // Update org
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          aiCrmEnabled: true,
          stripeAiSubscriptionId: subscription.id,
          aiCrmTrialEndsAt: trialEndsAt,
        },
      });

      // Invalidate tier cache
      invalidateTierCache(org.id);

      // Audit
      logAuditEvent({
        eventType: "AI_CRM_ADDON_SUBSCRIBED",
        resourceType: "Organization",
        resourceId: org.id,
        userId: user.id,
        metadata: { subscriptionId: subscription.id, period: billingPeriod, trialEndsAt },
      }).catch((e) => reportError(e as Error));

      return NextResponse.json({
        subscriptionId: subscription.id,
        trialEndsAt,
        status: subscription.status,
      });
    }

    // ---------------------------------------------------------------------------
    // CANCEL AI CRM add-on
    // ---------------------------------------------------------------------------
    if (action === "cancel") {
      if (!org.stripeAiSubscriptionId) {
        return NextResponse.json(
          { error: "No active AI CRM subscription to cancel." },
          { status: 400 },
        );
      }

      // Cancel at period end (not immediately) to honor the billing cycle
      await stripe.subscriptions.update(org.stripeAiSubscriptionId, {
        cancel_at_period_end: true,
        cancellation_details: {
          comment: "User cancelled AI CRM add-on via billing settings.",
        },
      });

      // Note: Don't disable aiCrmEnabled yet — the webhook for
      // customer.subscription.deleted will handle that when the period ends.

      // Audit
      logAuditEvent({
        eventType: "AI_CRM_ADDON_CANCELLED",
        resourceType: "Organization",
        resourceId: org.id,
        userId: user.id,
        metadata: { subscriptionId: org.stripeAiSubscriptionId },
      }).catch((e) => reportError(e as Error));

      return NextResponse.json({
        message: "AI CRM add-on will be cancelled at the end of the billing period.",
        subscriptionId: org.stripeAiSubscriptionId,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
