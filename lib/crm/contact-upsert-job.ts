import { ContactSource, ContactActivityType } from "@prisma/client";

import { upsertContact, logContactActivity, incrementEngagementScore, ContactLimitError } from "@/lib/crm/contact-service";
import { recordDocumentCreated, recordDocumentSent, recordDocumentCompleted } from "@/lib/esig/usage-service";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// ContactUpsertJob — Auto-Capture Contacts from Various Events
//
// This module provides fire-and-forget functions that create or update CRM
// contacts whenever key events occur:
//
// 1. Signing events — when someone signs or is sent a document
// 2. Dataroom views — when someone views a dataroom
// 3. LP registration — when an LP registers for onboarding
// 4. Express interest — when someone expresses interest via marketplace
//
// All functions are designed to be called in a fire-and-forget pattern:
//   captureFromSigningEvent({...}).catch(e => reportError(e))
//
// Never downgrades contact status. Increments engagement score additively.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Engagement Score Weights
// ---------------------------------------------------------------------------

const ENGAGEMENT_WEIGHTS = {
  DOCUMENT_SIGNED: 10,
  DOCUMENT_SENT: 3,
  DOCUMENT_VIEWED: 2,
  DATAROOM_VIEWED: 1,
  LP_REGISTERED: 5,
  EXPRESS_INTEREST: 3,
  RETURN_VISIT: 2,
} as const;

// ---------------------------------------------------------------------------
// Signing Event Auto-Capture
// ---------------------------------------------------------------------------

export interface SigningEventInput {
  email: string;
  name?: string;
  teamId: string;
  signatureDocumentId: string;
  eventType: "DOCUMENT_CREATED" | "DOCUMENT_SENT" | "DOCUMENT_SIGNED" | "DOCUMENT_COMPLETED";
  actorId?: string; // GP user who initiated the action
}

/**
 * Auto-capture or update a CRM contact from a signing event.
 *
 * Called from:
 *   - POST /api/sign/[token] — when a recipient signs
 *   - Signature document creation — when GP creates a doc
 *   - Document send — when GP sends doc for signing
 *
 * Flow:
 *   1. Upsert contact by email + team (never downgrades)
 *   2. Log activity on the contact
 *   3. Update engagement score
 *   4. Track esig usage
 */
export async function captureFromSigningEvent(
  input: SigningEventInput,
): Promise<void> {
  try {
    // Parse name into first/last
    const { firstName, lastName } = parseName(input.name);

    // Map event type to contact source
    const source = mapSigningEventToSource(input.eventType);

    // Map event type to engagement score weight
    const engagementScore = mapSigningEventToScore(input.eventType);

    // Map event type to activity type
    const activityType = mapSigningEventToActivityType(input.eventType);

    // Upsert contact (never downgrades status, additive engagement)
    const contact = await upsertContact({
      teamId: input.teamId,
      email: input.email,
      firstName,
      lastName,
      source,
      engagementScore,
      lastEngagedAt: new Date(),
    });

    // Log activity on the contact
    if (activityType) {
      await logContactActivity({
        contactId: contact.id,
        type: activityType,
        actorId: input.actorId,
        description: getActivityDescription(input.eventType, input.signatureDocumentId),
        metadata: {
          signatureDocumentId: input.signatureDocumentId,
          eventType: input.eventType,
        },
        documentId: input.signatureDocumentId,
      }).catch((e) => reportError(e as Error));
    }

    // Track esig usage
    await trackEsigUsage(input.teamId, input.eventType, input.signatureDocumentId);
  } catch (error) {
    if (error instanceof ContactLimitError) {
      // Expected — contact saved as PendingContact, not a real error
      return;
    }
    reportError(error as Error);
  }
}

// ---------------------------------------------------------------------------
// Dataroom View Auto-Capture
// ---------------------------------------------------------------------------

export interface DataroomViewInput {
  email: string;
  name?: string;
  teamId: string;
  dataroomId?: string;
  linkId?: string;
  referralSource?: string;
}

/**
 * Auto-capture or update a CRM contact from a dataroom view.
 *
 * Called from:
 *   - Dataroom view tracking endpoints
 *   - Email-gated link views
 */
export async function captureFromDataroomView(
  input: DataroomViewInput,
): Promise<void> {
  try {
    const { firstName, lastName } = parseName(input.name);

    const contact = await upsertContact({
      teamId: input.teamId,
      email: input.email,
      firstName,
      lastName,
      source: "DATAROOM_VIEW",
      referralSource: input.referralSource,
      engagementScore: ENGAGEMENT_WEIGHTS.DATAROOM_VIEWED,
      lastEngagedAt: new Date(),
    });

    await logContactActivity({
      contactId: contact.id,
      type: "DOCUMENT_VIEWED",
      description: `Viewed dataroom${input.dataroomId ? ` (${input.dataroomId})` : ""}`,
      metadata: {
        dataroomId: input.dataroomId,
        linkId: input.linkId,
        referralSource: input.referralSource,
      },
    }).catch((e) => reportError(e as Error));
  } catch (error) {
    if (error instanceof ContactLimitError) {
      return;
    }
    reportError(error as Error);
  }
}

// ---------------------------------------------------------------------------
// LP Registration Auto-Capture
// ---------------------------------------------------------------------------

export interface LPRegistrationInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  teamId: string;
  investorId?: string;
  fundId?: string;
}

/**
 * Auto-capture or update a CRM contact from LP registration.
 *
 * Called from:
 *   - POST /api/lp/register — when an LP registers
 */
export async function captureFromLPRegistration(
  input: LPRegistrationInput,
): Promise<void> {
  try {
    const contact = await upsertContact({
      teamId: input.teamId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      source: "INVESTOR_ONBOARDING",
      investorId: input.investorId,
      engagementScore: ENGAGEMENT_WEIGHTS.LP_REGISTERED,
      lastEngagedAt: new Date(),
    });

    await logContactActivity({
      contactId: contact.id,
      type: "CREATED",
      description: "LP registered for onboarding",
      metadata: {
        investorId: input.investorId,
        fundId: input.fundId,
      },
    }).catch((e) => reportError(e as Error));
  } catch (error) {
    if (error instanceof ContactLimitError) {
      return;
    }
    reportError(error as Error);
  }
}

// ---------------------------------------------------------------------------
// Express Interest Auto-Capture
// ---------------------------------------------------------------------------

export interface ExpressInterestInput {
  email: string;
  name?: string;
  teamId: string;
  fundId?: string;
  investorType?: string;
}

/**
 * Auto-capture or update a CRM contact from express interest.
 *
 * Called from:
 *   - POST /api/lp/express-interest — marketplace interest form
 */
export async function captureFromExpressInterest(
  input: ExpressInterestInput,
): Promise<void> {
  try {
    const { firstName, lastName } = parseName(input.name);

    const contact = await upsertContact({
      teamId: input.teamId,
      email: input.email,
      firstName,
      lastName,
      source: "DEAL_INTEREST",
      engagementScore: ENGAGEMENT_WEIGHTS.EXPRESS_INTEREST,
      lastEngagedAt: new Date(),
    });

    await logContactActivity({
      contactId: contact.id,
      type: "CREATED",
      description: "Expressed interest via marketplace",
      metadata: {
        fundId: input.fundId,
        investorType: input.investorType,
      },
    }).catch((e) => reportError(e as Error));
  } catch (error) {
    if (error instanceof ContactLimitError) {
      return;
    }
    reportError(error as Error);
  }
}

// ---------------------------------------------------------------------------
// Bulk Auto-Capture (for backfill or batch processing)
// ---------------------------------------------------------------------------

/**
 * Capture contacts from existing dataroom viewers (backfill).
 * Processes viewers in batches to avoid overwhelming the DB.
 */
export async function backfillContactsFromDataroomViewers(
  teamId: string,
  batchSize: number = 50,
): Promise<{ created: number; updated: number; errors: number; pending: number }> {
  let created = 0;
  let updated = 0;
  let errors = 0;
  let pending = 0;
  let skip = 0;

  while (true) {
    const viewers = await prisma.view.findMany({
      where: {
        teamId,
        viewerEmail: { not: null },
      },
      select: {
        viewerEmail: true,
        viewerName: true,
        referralSource: true,
        dataroomId: true,
        linkId: true,
      },
      distinct: ["viewerEmail"],
      skip,
      take: batchSize,
    });

    if (viewers.length === 0) break;

    for (const viewer of viewers) {
      if (!viewer.viewerEmail) continue;

      try {
        // Check if contact already exists
        const existing = await prisma.contact.findUnique({
          where: {
            teamId_email: {
              teamId,
              email: viewer.viewerEmail.toLowerCase().trim(),
            },
          },
          select: { id: true },
        });

        await upsertContact({
          teamId,
          email: viewer.viewerEmail,
          firstName: parseName(viewer.viewerName ?? undefined).firstName,
          lastName: parseName(viewer.viewerName ?? undefined).lastName,
          source: "DATAROOM_VIEW",
          referralSource: viewer.referralSource ?? undefined,
          engagementScore: ENGAGEMENT_WEIGHTS.DATAROOM_VIEWED,
          lastEngagedAt: new Date(),
        });

        if (existing) {
          updated++;
        } else {
          created++;
        }
      } catch (error) {
        if (error instanceof ContactLimitError) {
          pending++;
        } else {
          errors++;
          reportError(error as Error);
        }
      }
    }

    skip += batchSize;
  }

  return { created, updated, errors, pending };
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Parse a full name string into first and last name.
 */
function parseName(name?: string): { firstName?: string; lastName?: string } {
  if (!name?.trim()) return {};

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0] };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function mapSigningEventToSource(
  eventType: SigningEventInput["eventType"],
): ContactSource {
  switch (eventType) {
    case "DOCUMENT_CREATED":
    case "DOCUMENT_SENT":
      return "MANUAL_ENTRY";
    case "DOCUMENT_SIGNED":
    case "DOCUMENT_COMPLETED":
      return "SIGNATURE_EVENT";
    default:
      return "MANUAL_ENTRY";
  }
}

function mapSigningEventToScore(
  eventType: SigningEventInput["eventType"],
): number {
  switch (eventType) {
    case "DOCUMENT_SIGNED":
    case "DOCUMENT_COMPLETED":
      return ENGAGEMENT_WEIGHTS.DOCUMENT_SIGNED;
    case "DOCUMENT_SENT":
      return ENGAGEMENT_WEIGHTS.DOCUMENT_SENT;
    default:
      return 0;
  }
}

function mapSigningEventToActivityType(
  eventType: SigningEventInput["eventType"],
): ContactActivityType | null {
  switch (eventType) {
    case "DOCUMENT_SIGNED":
      return "DOCUMENT_SIGNED";
    case "DOCUMENT_SENT":
      return "EMAIL_SENT";
    case "DOCUMENT_COMPLETED":
      return "DOCUMENT_SIGNED";
    default:
      return null;
  }
}

function getActivityDescription(
  eventType: SigningEventInput["eventType"],
  documentId: string,
): string {
  switch (eventType) {
    case "DOCUMENT_SIGNED":
      return `Signed document (${documentId})`;
    case "DOCUMENT_SENT":
      return `Sent document for signing (${documentId})`;
    case "DOCUMENT_COMPLETED":
      return `All signatures completed on document (${documentId})`;
    case "DOCUMENT_CREATED":
      return `Document created (${documentId})`;
    default:
      return `Signing event on document (${documentId})`;
  }
}

async function trackEsigUsage(
  teamId: string,
  eventType: SigningEventInput["eventType"],
  signatureDocumentId: string,
): Promise<void> {
  switch (eventType) {
    case "DOCUMENT_CREATED":
      await recordDocumentCreated(teamId, signatureDocumentId);
      break;
    case "DOCUMENT_SENT":
      await recordDocumentSent(teamId);
      break;
    case "DOCUMENT_COMPLETED":
      await recordDocumentCompleted(teamId);
      break;
  }
}

// Export for testing
export { parseName, ENGAGEMENT_WEIGHTS };
