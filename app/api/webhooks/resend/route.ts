/**
 * POST /api/webhooks/resend — Resend webhook handler for email delivery events.
 *
 * Handles Resend email events to update CRM Contact records:
 *   - email.delivered   — Mark email as delivered (activity log)
 *   - email.opened      — Track email open (already handled by pixel, this is a backup)
 *   - email.clicked     — Track link clicks, update engagement score
 *   - email.bounced     — Mark contact as bounced, cancel outreach
 *   - email.complained  — Mark contact as unsubscribed (spam complaint)
 *
 * Resend webhook verification uses the Svix library headers:
 *   svix-id, svix-timestamp, svix-signature
 *
 * Webhook secret: RESEND_WEBHOOK_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logContactActivity } from "@/lib/crm/contact-service";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Svix signature verification (Resend uses Svix under the hood)
// ---------------------------------------------------------------------------

function verifyResendWebhook(
  body: string,
  headers: {
    svixId: string | null;
    svixTimestamp: string | null;
    svixSignature: string | null;
  },
  secret: string,
): boolean {
  if (!headers.svixId || !headers.svixTimestamp || !headers.svixSignature) {
    return false;
  }

  // Resend webhook secrets are prefixed with "whsec_" — strip it and decode base64
  const secretBytes = Buffer.from(
    secret.startsWith("whsec_") ? secret.slice(6) : secret,
    "base64",
  );

  // Tolerance: 5 minutes
  const timestamp = parseInt(headers.svixTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return false;
  }

  // Compute expected signature
  const toSign = `${headers.svixId}.${headers.svixTimestamp}.${body}`;
  const expectedSignature = crypto
    .createHmac("sha256", secretBytes)
    .update(toSign)
    .digest("base64");

  // Resend sends multiple signatures separated by spaces (e.g., "v1,<sig1> v1,<sig2>")
  const signatures = headers.svixSignature.split(" ");
  for (const sig of signatures) {
    const [, sigValue] = sig.split(",");
    if (sigValue && sigValue === expectedSignature) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

interface ResendEmailEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
    click?: {
      link: string;
      timestamp: string;
    };
    bounce?: {
      message: string;
      type: string; // "hard" | "soft"
    };
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // If no secret configured, accept events without verification (dev mode)
    // In production, always set RESEND_WEBHOOK_SECRET
  }

  const body = await req.text();

  // Verify signature if secret is set
  if (webhookSecret) {
    const isValid = verifyResendWebhook(body, {
      svixId: req.headers.get("svix-id"),
      svixTimestamp: req.headers.get("svix-timestamp"),
      svixSignature: req.headers.get("svix-signature"),
    }, webhookSecret);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 },
      );
    }
  }

  let event: ResendEmailEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventType = event.type;
  if (!eventType) {
    return NextResponse.json({ received: true });
  }

  try {
    switch (eventType) {
      case "email.delivered":
        await handleEmailDelivered(event);
        break;
      case "email.opened":
        await handleEmailOpened(event);
        break;
      case "email.clicked":
        await handleEmailClicked(event);
        break;
      case "email.bounced":
        await handleEmailBounced(event);
        break;
      case "email.complained":
        await handleEmailComplained(event);
        break;
      default:
        // Unknown event type — acknowledge but don't process
        break;
    }
  } catch (error) {
    reportError(error as Error, {
      path: "/api/webhooks/resend",
      action: "webhook_handler",
      eventType,
    });
    // Return 200 to prevent Resend from retrying — we've logged the error
    return NextResponse.json({ received: true, error: "Handler failed" });
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/**
 * Find a Contact by email address (checking the emailId on ContactActivity first,
 * then falling back to email lookup).
 */
async function findContactByEmailEvent(event: ResendEmailEvent): Promise<{
  contactId: string;
  teamId: string;
} | null> {
  const emailId = event.data.email_id;
  const recipientEmail = event.data.to?.[0]?.toLowerCase().trim();

  // First try: look up by emailId in ContactActivity (most accurate)
  if (emailId) {
    const activity = await prisma.contactActivity.findFirst({
      where: { emailId, type: "EMAIL_SENT" },
      select: { contactId: true, contact: { select: { teamId: true } } },
    });
    if (activity) {
      return { contactId: activity.contactId, teamId: activity.contact.teamId };
    }
  }

  // Fallback: look up by recipient email (may match multiple contacts across teams)
  if (recipientEmail) {
    const contact = await prisma.contact.findFirst({
      where: { email: recipientEmail },
      select: { id: true, teamId: true },
      orderBy: { updatedAt: "desc" }, // Most recently active
    });
    if (contact) {
      return { contactId: contact.id, teamId: contact.teamId };
    }
  }

  return null;
}

// email.delivered — Log delivery confirmation
async function handleEmailDelivered(event: ResendEmailEvent): Promise<void> {
  const match = await findContactByEmailEvent(event);
  if (!match) return;

  // Check for duplicate
  const existing = await prisma.contactActivity.findFirst({
    where: {
      contactId: match.contactId,
      type: "EMAIL_SENT",
      emailId: event.data.email_id,
      metadata: { path: ["delivered"], equals: true },
    },
  });
  if (existing) return;

  // Update the existing EMAIL_SENT activity to mark as delivered
  if (event.data.email_id) {
    await prisma.contactActivity.updateMany({
      where: {
        contactId: match.contactId,
        emailId: event.data.email_id,
        type: "EMAIL_SENT",
      },
      data: {
        metadata: {
          delivered: true,
          deliveredAt: event.created_at,
        },
      },
    });
  }
}

// email.opened — Track open (backup for tracking pixel)
async function handleEmailOpened(event: ResendEmailEvent): Promise<void> {
  const match = await findContactByEmailEvent(event);
  if (!match) return;

  // Deduplicate: check if we already tracked this open via the tracking pixel
  if (event.data.email_id) {
    const existingOpen = await prisma.contactActivity.findFirst({
      where: {
        contactId: match.contactId,
        type: "EMAIL_OPENED",
        emailId: event.data.email_id,
      },
    });
    if (existingOpen) return;
  }

  await logContactActivity({
    contactId: match.contactId,
    type: "EMAIL_OPENED",
    description: `Email opened: "${event.data.subject ?? "Unknown subject"}"`,
    metadata: {
      emailId: event.data.email_id,
      source: "resend_webhook",
    },
  });

  // Increment engagement score (+2 for open)
  await prisma.contact.update({
    where: { id: match.contactId },
    data: {
      engagementScore: { increment: 2 },
      lastEngagedAt: new Date(),
    },
  });
}

// email.clicked — Track link click
async function handleEmailClicked(event: ResendEmailEvent): Promise<void> {
  const match = await findContactByEmailEvent(event);
  if (!match) return;

  const clickedLink = event.data.click?.link ?? "unknown";

  // Skip tracking/unsubscribe links
  if (
    clickedLink.includes("/api/outreach/track/") ||
    clickedLink.includes("/api/outreach/unsubscribe")
  ) {
    return;
  }

  await logContactActivity({
    contactId: match.contactId,
    type: "LINK_CLICKED",
    description: `Link clicked in email`,
    metadata: {
      emailId: event.data.email_id,
      link: clickedLink,
      clickedAt: event.data.click?.timestamp ?? event.created_at,
      source: "resend_webhook",
    },
  });

  // Increment engagement score (+3 for click — more valuable than open)
  await prisma.contact.update({
    where: { id: match.contactId },
    data: {
      engagementScore: { increment: 3 },
      lastEngagedAt: new Date(),
    },
  });
}

// email.bounced — Mark contact as bounced, cancel active sequences
async function handleEmailBounced(event: ResendEmailEvent): Promise<void> {
  const match = await findContactByEmailEvent(event);
  if (!match) return;

  const bounceType = event.data.bounce?.type ?? "unknown";
  const bounceMessage = event.data.bounce?.message ?? "";

  // Only mark as bounced for hard bounces
  if (bounceType === "hard" || bounceType === "unknown") {
    await prisma.contact.update({
      where: { id: match.contactId },
      data: { emailBounced: true },
    });
  }

  await logContactActivity({
    contactId: match.contactId,
    type: "PROFILE_UPDATED",
    description: `Email bounced (${bounceType}): ${bounceMessage || "No details"}`,
    metadata: {
      emailId: event.data.email_id,
      bounceType,
      bounceMessage,
      source: "resend_webhook",
    },
  });

  // Cancel active sequence enrollments for this contact (hard bounce only)
  if (bounceType === "hard" || bounceType === "unknown") {
    await prisma.sequenceEnrollment.updateMany({
      where: {
        contactId: match.contactId,
        status: "ACTIVE",
      },
      data: {
        status: "CANCELLED",
        pausedReason: "email_bounced",
        nextStepAt: null,
      },
    });
  }
}

// email.complained — Spam complaint → unsubscribe + cancel sequences
async function handleEmailComplained(event: ResendEmailEvent): Promise<void> {
  const match = await findContactByEmailEvent(event);
  if (!match) return;

  // Unsubscribe the contact
  await prisma.contact.update({
    where: { id: match.contactId },
    data: { unsubscribedAt: new Date() },
  });

  await logContactActivity({
    contactId: match.contactId,
    type: "PROFILE_UPDATED",
    description: "Marked as unsubscribed due to spam complaint",
    metadata: {
      emailId: event.data.email_id,
      reason: "spam_complaint",
      source: "resend_webhook",
    },
  });

  // Cancel all active sequence enrollments
  await prisma.sequenceEnrollment.updateMany({
    where: {
      contactId: match.contactId,
      status: "ACTIVE",
    },
    data: {
      status: "CANCELLED",
      pausedReason: "spam_complaint",
      nextStepAt: null,
    },
  });
}
