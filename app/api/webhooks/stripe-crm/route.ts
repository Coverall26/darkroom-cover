/**
 * POST /api/webhooks/stripe-crm — Stripe webhook handler for CRM billing events.
 *
 * Handles CRM-specific subscription lifecycle events:
 *   - checkout.session.completed (new CRM subscription via Checkout)
 *   - customer.subscription.created (direct API subscription creation)
 *   - customer.subscription.updated (plan change, renewal, status change)
 *   - customer.subscription.deleted (cancellation → revert to FREE)
 *   - invoice.payment_failed (set PAST_DUE status, 7-day grace period)
 *   - invoice.paid (clear PAST_DUE on payment recovery)
 *
 * Separate from the existing /api/stripe/webhook (which handles SaaS/team billing).
 * Routes CRM events by checking subscription metadata for system: "crm".
 *
 * Webhook secret: STRIPE_CRM_WEBHOOK_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { stripeInstance } from "@/ee/stripe";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { invalidateTierCache } from "@/lib/tier/crm-tier";
import { getCrmPlanFromPriceId } from "@/lib/stripe/crm-products";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { publishServerEvent } from "@/lib/tracking/server-events";
import { promotePendingContacts } from "@/lib/crm/contact-service";
import { SubscriptionTier, OrgSubscriptionStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

// Disable body parsing — Stripe needs raw body for signature verification
export const runtime = "nodejs";

const RELEVANT_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.paid",
]);

export async function POST(req: NextRequest) {
  const stripe = stripeInstance();
  const webhookSecret = process.env.STRIPE_CRM_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // Fall back to the main webhook secret if CRM-specific one isn't set
    const fallbackSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!fallbackSecret) {
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 500 },
      );
    }
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || "",
    );
  } catch (err) {
    reportError(err as Error, {
      path: "/api/webhooks/stripe-crm",
      action: "webhook_signature_verification",
    });
    return NextResponse.json({ error: "Webhook signature verification failed" }, { status: 400 });
  }

  // Only process relevant events
  if (!RELEVANT_EVENTS.has(event.type)) {
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event, stripe);
        break;
      case "customer.subscription.created":
        await handleSubscriptionCreated(event);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event);
        break;
    }
  } catch (error) {
    reportError(error as Error, {
      path: "/api/webhooks/stripe-crm",
      action: "webhook_handler",
      eventType: event.type,
      eventId: event.id,
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 400 });
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// checkout.session.completed — New CRM subscription
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(event: Stripe.Event, stripe: Stripe) {
  const session = event.data.object as Stripe.Checkout.Session;

  // Only handle CRM checkouts
  if (session.metadata?.system !== "crm") return;

  const orgId = session.metadata?.orgId || session.client_reference_id;
  if (!orgId || !session.customer || !session.subscription) return;

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string,
  );

  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) return;

  const planInfo = getCrmPlanFromPriceId(priceId);
  if (!planInfo) return;

  const stripeCustomerId = session.customer.toString();
  const subscriptionId = subscription.id;

  // Determine if this is a base plan or AI add-on
  if (planInfo.slug === "AI_CRM") {
    // AI add-on checkout
    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null;

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        stripeCustomerId,
        aiCrmEnabled: true,
        stripeAiSubscriptionId: subscriptionId,
        aiCrmTrialEndsAt: trialEnd,
      },
    });
  } else {
    // Base plan checkout (CRM_PRO or FUNDROOM)
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        stripeCustomerId,
        subscriptionTier: planInfo.slug as SubscriptionTier,
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: OrgSubscriptionStatus.ACTIVE,
      },
    });
  }

  // Invalidate tier cache
  invalidateTierCache(orgId);

  // Promote PendingContacts now that org has a paid tier (fire-and-forget)
  if (planInfo.slug !== "AI_CRM") {
    promotePendingContacts(orgId).catch((e) => reportError(e as Error));
  }

  // Analytics
  publishServerEvent("funnel_crm_upgrade_completed", {
    orgId,
    plan: planInfo.slug,
  });

  // Audit
  logAuditEvent({
    eventType: "CRM_SUBSCRIPTION_CREATED",
    resourceType: "Organization",
    resourceId: orgId,
    metadata: { plan: planInfo.slug, period: planInfo.period, subscriptionId },
  }).catch((e) => reportError(e as Error));
}

// ---------------------------------------------------------------------------
// customer.subscription.updated — Plan change or renewal
// ---------------------------------------------------------------------------

async function handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;

  // Only handle CRM subscriptions
  if (subscription.metadata?.system !== "crm") return;

  const orgId = subscription.metadata?.orgId;
  if (!orgId) return;

  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) return;

  const planInfo = getCrmPlanFromPriceId(priceId);
  if (!planInfo) return;

  // Map Stripe status to our status
  const statusMap: Record<string, OrgSubscriptionStatus> = {
    active: OrgSubscriptionStatus.ACTIVE,
    past_due: OrgSubscriptionStatus.PAST_DUE,
    canceled: OrgSubscriptionStatus.CANCELED,
    trialing: OrgSubscriptionStatus.TRIALING,
    unpaid: OrgSubscriptionStatus.PAST_DUE,
    incomplete: OrgSubscriptionStatus.ACTIVE,
    incomplete_expired: OrgSubscriptionStatus.CANCELED,
    paused: OrgSubscriptionStatus.ACTIVE,
  };

  const subscriptionStatus = statusMap[subscription.status] || OrgSubscriptionStatus.ACTIVE;

  if (planInfo.slug === "AI_CRM") {
    // AI add-on subscription update
    const isActive = subscription.status === "active" || subscription.status === "trialing";
    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null;

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        aiCrmEnabled: isActive,
        aiCrmTrialEndsAt: trialEnd,
      },
    });
  } else {
    // Base plan subscription update
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        subscriptionTier: planInfo.slug as SubscriptionTier,
        subscriptionStatus,
      },
    });
  }

  // Invalidate tier cache
  invalidateTierCache(orgId);

  // Promote PendingContacts on upgrade to a paid base plan (fire-and-forget)
  if (planInfo.slug !== "AI_CRM" && (planInfo.slug === "CRM_PRO" || planInfo.slug === "FUNDROOM")) {
    promotePendingContacts(orgId).catch((e) => reportError(e as Error));
  }

  // Audit
  logAuditEvent({
    eventType: "CRM_SUBSCRIPTION_UPDATED",
    resourceType: "Organization",
    resourceId: orgId,
    metadata: {
      plan: planInfo.slug,
      status: subscriptionStatus,
      stripeStatus: subscription.status,
    },
  }).catch((e) => reportError(e as Error));
}

// ---------------------------------------------------------------------------
// customer.subscription.deleted — Cancellation
// ---------------------------------------------------------------------------

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;

  // Only handle CRM subscriptions
  if (subscription.metadata?.system !== "crm") return;

  const orgId = subscription.metadata?.orgId;
  if (!orgId) return;

  const isAddon = subscription.metadata?.addon === "AI_CRM";

  if (isAddon) {
    // AI CRM add-on cancelled
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        aiCrmEnabled: false,
        stripeAiSubscriptionId: null,
        aiCrmTrialEndsAt: null,
      },
    });
  } else {
    // Base CRM plan cancelled → revert to FREE
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        subscriptionTier: SubscriptionTier.FREE,
        stripeSubscriptionId: null,
        subscriptionStatus: OrgSubscriptionStatus.CANCELED,
        // Also disable AI if it was bundled
        aiCrmEnabled: false,
        stripeAiSubscriptionId: null,
        aiCrmTrialEndsAt: null,
      },
    });
  }

  // Invalidate tier cache
  invalidateTierCache(orgId);

  // Analytics
  publishServerEvent("funnel_crm_subscription_cancelled", {
    orgId,
    plan: isAddon ? "AI_CRM" : "base_plan",
  });

  // Audit
  logAuditEvent({
    eventType: "CRM_SUBSCRIPTION_CANCELLED",
    resourceType: "Organization",
    resourceId: orgId,
    metadata: {
      type: isAddon ? "AI_CRM" : "base_plan",
      subscriptionId: subscription.id,
    },
  }).catch((e) => reportError(e as Error));
}

// ---------------------------------------------------------------------------
// customer.subscription.created — Direct API subscription creation
//
// Handles subscriptions created outside the checkout flow (e.g., via Stripe
// API or dashboard). checkout.session.completed covers the standard flow;
// this handler catches direct subscription creation as a safety net.
// ---------------------------------------------------------------------------

async function handleSubscriptionCreated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;

  // Only handle CRM subscriptions
  if (subscription.metadata?.system !== "crm") return;

  const orgId = subscription.metadata?.orgId;
  if (!orgId) return;

  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) return;

  const planInfo = getCrmPlanFromPriceId(priceId);
  if (!planInfo) return;

  const stripeCustomerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;

  if (planInfo.slug === "AI_CRM") {
    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null;

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        stripeCustomerId: stripeCustomerId || undefined,
        aiCrmEnabled: true,
        stripeAiSubscriptionId: subscription.id,
        aiCrmTrialEndsAt: trialEnd,
      },
    });
  } else {
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        stripeCustomerId: stripeCustomerId || undefined,
        subscriptionTier: planInfo.slug as SubscriptionTier,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: OrgSubscriptionStatus.ACTIVE,
      },
    });
  }

  // Invalidate tier cache
  invalidateTierCache(orgId);

  // Promote PendingContacts on upgrade to a paid base plan (fire-and-forget)
  if (planInfo.slug !== "AI_CRM" && (planInfo.slug === "CRM_PRO" || planInfo.slug === "FUNDROOM")) {
    promotePendingContacts(orgId).catch((e) => reportError(e as Error));
  }

  // Audit
  logAuditEvent({
    eventType: "CRM_SUBSCRIPTION_CREATED",
    resourceType: "Organization",
    resourceId: orgId,
    metadata: {
      plan: planInfo.slug,
      subscriptionId: subscription.id,
      source: "direct_api",
    },
  }).catch((e) => reportError(e as Error));
}

// ---------------------------------------------------------------------------
// invoice.payment_failed — Payment failure → PAST_DUE with 7-day grace
//
// When Stripe fails to charge the customer, we set subscriptionStatus to
// PAST_DUE. The tier resolver interprets PAST_DUE as "still active but
// degraded" — features remain accessible for a 7-day grace period.
// After 7 days, Stripe will typically cancel the subscription, which
// triggers handleSubscriptionDeleted and reverts to FREE.
// ---------------------------------------------------------------------------

async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;

  // Resolve orgId from invoice metadata or subscription metadata
  let orgId = (invoice.metadata as Record<string, string> | null)?.orgId;

  if (!orgId && invoice.subscription) {
    // Try to get orgId from subscription metadata
    try {
      const stripe = stripeInstance();
      const sub = await stripe.subscriptions.retrieve(
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription.id,
      );
      if (sub.metadata?.system !== "crm") return;
      orgId = sub.metadata?.orgId;
    } catch {
      // Subscription lookup failed — can't determine org
      return;
    }
  }

  if (!orgId) return;

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      subscriptionStatus: OrgSubscriptionStatus.PAST_DUE,
    },
  });

  // Invalidate tier cache so PAST_DUE status is reflected immediately
  invalidateTierCache(orgId);

  // Analytics
  publishServerEvent("crm_payment_failed", {
    orgId,
    source: invoice.id,
  });

  // Audit
  logAuditEvent({
    eventType: "CRM_PAYMENT_FAILED",
    resourceType: "Organization",
    resourceId: orgId,
    metadata: {
      invoiceId: invoice.id,
      amountDue: invoice.amount_due,
      attemptCount: invoice.attempt_count,
    },
  }).catch((e) => reportError(e as Error));
}

// ---------------------------------------------------------------------------
// invoice.paid — Payment recovered → Clear PAST_DUE status
//
// When a previously failed invoice is paid (manually or retry succeeds),
// restore ACTIVE status to unblock features.
// ---------------------------------------------------------------------------

async function handleInvoicePaid(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;

  // Resolve orgId from invoice metadata or subscription metadata
  let orgId = (invoice.metadata as Record<string, string> | null)?.orgId;

  if (!orgId && invoice.subscription) {
    try {
      const stripe = stripeInstance();
      const sub = await stripe.subscriptions.retrieve(
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription.id,
      );
      if (sub.metadata?.system !== "crm") return;
      orgId = sub.metadata?.orgId;
    } catch {
      return;
    }
  }

  if (!orgId) return;

  // Only clear PAST_DUE status — don't change ACTIVE or other states
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { subscriptionStatus: true },
  });

  if (org?.subscriptionStatus === OrgSubscriptionStatus.PAST_DUE) {
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        subscriptionStatus: OrgSubscriptionStatus.ACTIVE,
      },
    });

    // Invalidate tier cache
    invalidateTierCache(orgId);

    // Analytics
    publishServerEvent("crm_payment_recovered", {
      orgId,
      source: invoice.id,
    });

    // Audit
    logAuditEvent({
      eventType: "CRM_PAYMENT_RECOVERED",
      resourceType: "Organization",
      resourceId: orgId,
      metadata: {
        invoiceId: invoice.id,
        amountPaid: invoice.amount_paid,
      },
    }).catch((e) => reportError(e as Error));
  }
}
