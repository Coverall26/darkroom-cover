/**
 * CRM Outreach Email Sending Service.
 *
 * Sends outreach emails via Resend with merge-variable interpolation,
 * optional tracking pixel injection, and unsubscribe link headers.
 * Updates Contact.lastEmailedAt and Contact.lastContactedAt on success.
 * Creates ContactActivity records for audit trail.
 */

import prisma from "@/lib/prisma";
import { sendOrgEmail } from "@/lib/resend";
import { reportError } from "@/lib/error";
import { buildComplianceFooterHtml } from "@/components/emails/email-footer-compliance";
import { sanitizeForRender } from "@/lib/utils/sanitize-html";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutreachEmailPayload {
  contactId: string;
  teamId: string;
  subject: string;
  body: string; // HTML body (merge vars already interpolated)
  actorId: string; // GP user who triggered the send
  trackOpens?: boolean; // Inject tracking pixel
  templateId?: string; // For audit trail
  sequenceEnrollmentId?: string; // If sent as part of a sequence
}

export interface OutreachSendResult {
  success: boolean;
  emailId?: string; // Resend email ID
  error?: string;
}

// ---------------------------------------------------------------------------
// Merge variable interpolation
// ---------------------------------------------------------------------------

export interface MergeContext {
  contact: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    company?: string | null;
    title?: string | null;
  };
  sender?: {
    name?: string | null;
    email?: string | null;
    company?: string | null;
  };
  fund?: {
    name?: string | null;
  };
}

/**
 * Replace {{contact.firstName}}, {{sender.name}}, etc. in template strings.
 * Unknown variables are left as-is (not removed).
 */
export function interpolateMergeVars(
  template: string,
  ctx: MergeContext,
): string {
  return template.replace(/\{\{(\w+)\.(\w+)\}\}/g, (_match, group, field) => {
    const obj = ctx[group as keyof MergeContext];
    if (obj && typeof obj === "object" && field in obj) {
      const val = (obj as Record<string, unknown>)[field];
      return val != null ? String(val) : "";
    }
    return _match; // Leave unresolved vars as-is
  });
}

// ---------------------------------------------------------------------------
// Tracking pixel HTML
// ---------------------------------------------------------------------------

function buildTrackingPixel(contactId: string, emailId: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
  const pixelUrl = `${baseUrl}/api/outreach/track/open?cid=${encodeURIComponent(contactId)}&eid=${encodeURIComponent(emailId)}`;
  return `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;
}

// ---------------------------------------------------------------------------
// Unsubscribe URL
// ---------------------------------------------------------------------------

function buildUnsubscribeUrl(contactId: string, teamId: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
  return `${baseUrl}/api/outreach/unsubscribe?cid=${encodeURIComponent(contactId)}&tid=${encodeURIComponent(teamId)}`;
}

// ---------------------------------------------------------------------------
// Main send function
// ---------------------------------------------------------------------------

/**
 * Send a single outreach email to a contact.
 * - Checks unsubscribe / bounce status before sending
 * - Injects tracking pixel if trackOpens=true
 * - Updates Contact timestamps
 * - Creates ContactActivity record
 */
export async function sendOutreachEmail(
  payload: OutreachEmailPayload,
): Promise<OutreachSendResult> {
  const {
    contactId,
    teamId,
    subject,
    body,
    actorId,
    trackOpens = false,
    templateId,
    sequenceEnrollmentId,
  } = payload;

  try {
    // 1. Load contact and verify it's sendable
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        email: true,
        teamId: true,
        unsubscribedAt: true,
        emailBounced: true,
      },
    });

    if (!contact) {
      return { success: false, error: "CONTACT_NOT_FOUND" };
    }
    if (contact.teamId !== teamId) {
      return { success: false, error: "TEAM_MISMATCH" };
    }
    if (contact.unsubscribedAt) {
      return { success: false, error: "UNSUBSCRIBED" };
    }
    if (contact.emailBounced) {
      return { success: false, error: "BOUNCED" };
    }

    // 2. Build unsubscribe URL
    const unsubscribeUrl = buildUnsubscribeUrl(contactId, teamId);

    // 2b. Fetch org address for CAN-SPAM compliant footer
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        name: true,
        organization: {
          select: {
            name: true,
            addressLine1: true,
            addressLine2: true,
            addressCity: true,
            addressState: true,
            addressZip: true,
            addressCountry: true,
          },
        },
      },
    });

    const orgName = team?.organization?.name ?? team?.name ?? "FundRoom";
    const complianceFooter = buildComplianceFooterHtml({
      orgName,
      address: team?.organization
        ? {
            line1: team.organization.addressLine1,
            line2: team.organization.addressLine2,
            city: team.organization.addressCity,
            state: team.organization.addressState,
            zip: team.organization.addressZip,
            country: team.organization.addressCountry,
          }
        : undefined,
      unsubscribeUrl,
    });

    // 3. Prepare body with compliance footer and optional tracking pixel
    // We generate a temporary email ID for the pixel URL — the real Resend ID
    // will be stored in the activity record after sending.
    const tempPixelId = `pending-${contactId}-${Date.now()}`;

    // Inject compliance footer before </body> or at the end
    let finalBody = body;
    if (finalBody.includes("</body>")) {
      finalBody = finalBody.replace("</body>", `${complianceFooter}</body>`);
    } else {
      finalBody += complianceFooter;
    }
    if (trackOpens) {
      // Insert pixel before closing </body> if present, otherwise append
      if (finalBody.includes("</body>")) {
        finalBody = finalBody.replace(
          "</body>",
          `${buildTrackingPixel(contactId, tempPixelId)}</body>`,
        );
      } else {
        finalBody += buildTrackingPixel(contactId, tempPixelId);
      }
    }

    // 4. Send via Resend (Tier 2 — org-branded)
    const { createElement } = await import("react");

    // Create a minimal React element that renders raw HTML
    const EmailBody = () =>
      createElement("div", { dangerouslySetInnerHTML: { __html: sanitizeForRender(finalBody) } });

    const result = await sendOrgEmail({
      teamId,
      to: contact.email,
      subject,
      react: createElement(EmailBody),
      unsubscribeUrl,
    });

    const emailId = result?.id ?? tempPixelId;

    // 5. Update contact timestamps
    const now = new Date();
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        lastEmailedAt: now,
        lastContactedAt: now,
      },
    });

    // 6. Create activity record
    await prisma.contactActivity.create({
      data: {
        contactId,
        type: "EMAIL_SENT",
        actorId,
        description: `Email sent: "${subject}"`,
        emailId,
        metadata: {
          subject,
          templateId: templateId ?? null,
          sequenceEnrollmentId: sequenceEnrollmentId ?? null,
          trackOpens,
        },
      },
    });

    return { success: true, emailId };
  } catch (error) {
    reportError(error as Error);
    return {
      success: false,
      error: "SEND_FAILED",
    };
  }
}

// ---------------------------------------------------------------------------
// Bulk send (max 50 per call)
// ---------------------------------------------------------------------------

export interface BulkOutreachPayload {
  contactIds: string[];
  teamId: string;
  subject: string;
  bodyTemplate: string; // HTML with merge vars
  actorId: string;
  trackOpens?: boolean;
  templateId?: string;
}

export interface BulkSendResult {
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  results: Array<{
    contactId: string;
    success: boolean;
    error?: string;
  }>;
}

const MAX_BULK_RECIPIENTS = 50;

/**
 * Send outreach emails to multiple contacts.
 * Interpolates merge variables per-contact.
 * Rate-limited to MAX_BULK_RECIPIENTS per call.
 */
export async function sendBulkOutreachEmail(
  payload: BulkOutreachPayload,
): Promise<BulkSendResult> {
  const {
    contactIds,
    teamId,
    subject: subjectTemplate,
    bodyTemplate,
    actorId,
    trackOpens = false,
    templateId,
  } = payload;

  const limited = contactIds.slice(0, MAX_BULK_RECIPIENTS);
  const results: BulkSendResult["results"] = [];

  // Load all contacts in one query
  const contacts = await prisma.contact.findMany({
    where: { id: { in: limited }, teamId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      company: true,
      title: true,
      unsubscribedAt: true,
      emailBounced: true,
    },
  });

  // Load sender info
  const userTeam = await prisma.userTeam.findFirst({
    where: { userId: actorId },
    select: {
      user: { select: { name: true, email: true } },
      team: { select: { name: true } },
    },
  });

  const senderCtx: MergeContext["sender"] = {
    name: userTeam?.user?.name ?? null,
    email: userTeam?.user?.email ?? null,
    company: userTeam?.team?.name ?? null,
  };

  for (const contact of contacts) {
    // Skip unsubscribed/bounced
    if (contact.unsubscribedAt || contact.emailBounced) {
      results.push({
        contactId: contact.id,
        success: false,
        error: contact.unsubscribedAt ? "UNSUBSCRIBED" : "BOUNCED",
      });
      continue;
    }

    // Interpolate merge vars
    const ctx: MergeContext = {
      contact: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        company: contact.company,
        title: contact.title,
      },
      sender: senderCtx,
    };

    const interpolatedSubject = interpolateMergeVars(subjectTemplate, ctx);
    const interpolatedBody = interpolateMergeVars(bodyTemplate, ctx);

    const result = await sendOutreachEmail({
      contactId: contact.id,
      teamId,
      subject: interpolatedSubject,
      body: interpolatedBody,
      actorId,
      trackOpens,
      templateId,
    });

    results.push({
      contactId: contact.id,
      success: result.success,
      error: result.error,
    });
  }

  const sent = results.filter((r) => r.success).length;
  const skipped = results.filter((r) =>
    ["UNSUBSCRIBED", "BOUNCED"].includes(r.error ?? ""),
  ).length;

  return {
    total: limited.length,
    sent,
    skipped,
    failed: limited.length - sent - skipped,
    results,
  };
}
