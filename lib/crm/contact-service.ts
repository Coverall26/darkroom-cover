import { ContactStatus, ContactSource, ContactActivityType, Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Contact Service — CRM Contact CRUD, Search, Upsert
//
// Manages Contact lifecycle for GP teams. Each contact is unique per team by
// email (@@unique([teamId, email])). Supports:
// - Full CRUD with team scoping
// - Search/filter by status, source, assignee, tags
// - Upsert by email (idempotent auto-capture)
// - Engagement score updates
// - Activity logging (via logContactActivity)
// ---------------------------------------------------------------------------

export interface ContactCreateInput {
  teamId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  title?: string;
  status?: ContactStatus;
  source?: ContactSource;
  investorId?: string;
  assignedToId?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  referralSource?: string;
  notes?: string;
}

export interface ContactUpdateInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  title?: string;
  status?: ContactStatus;
  assignedToId?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  referralSource?: string;
  notes?: string;
  engagementScore?: number;
  lastEngagedAt?: Date;
  convertedAt?: Date;
  closedAt?: Date;
}

export interface ContactSearchParams {
  teamId: string;
  query?: string; // Search across email, firstName, lastName, company
  status?: ContactStatus | ContactStatus[];
  source?: ContactSource | ContactSource[];
  assignedToId?: string;
  hasInvestor?: boolean; // Filter to only contacts linked to investors
  minEngagementScore?: number;
  tags?: string[]; // Filter by any matching tag
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "updatedAt" | "engagementScore" | "lastEngagedAt" | "email" | "lastName";
  sortOrder?: "asc" | "desc";
}

export interface ContactSearchResult {
  contacts: Awaited<ReturnType<typeof prisma.contact.findMany>>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

export async function createContact(input: ContactCreateInput) {
  const data: Prisma.ContactCreateInput = {
    team: { connect: { id: input.teamId } },
    email: input.email.toLowerCase().trim(),
    firstName: input.firstName?.trim(),
    lastName: input.lastName?.trim(),
    phone: input.phone?.trim(),
    company: input.company?.trim(),
    title: input.title?.trim(),
    status: input.status ?? "PROSPECT",
    source: input.source ?? "MANUAL_ENTRY",
    tags: (input.tags ?? []) as Prisma.InputJsonValue,
    customFields: (input.customFields ?? {}) as Prisma.InputJsonValue,
    referralSource: input.referralSource?.trim(),
    notes: input.notes,
  };

  if (input.investorId) {
    data.investor = { connect: { id: input.investorId } };
  }
  if (input.assignedToId) {
    data.assignedTo = { connect: { id: input.assignedToId } };
  }

  return prisma.contact.create({ data, include: contactIncludes });
}

export async function getContact(id: string, teamId: string) {
  return prisma.contact.findFirst({
    where: { id, teamId },
    include: contactIncludes,
  });
}

export async function getContactByEmail(email: string, teamId: string) {
  return prisma.contact.findUnique({
    where: {
      teamId_email: { teamId, email: email.toLowerCase().trim() },
    },
    include: contactIncludes,
  });
}

export async function updateContact(id: string, teamId: string, input: ContactUpdateInput) {
  // Verify contact belongs to team
  const existing = await prisma.contact.findFirst({
    where: { id, teamId },
    select: { id: true, status: true },
  });
  if (!existing) return null;

  const data: Prisma.ContactUpdateInput = {};

  if (input.firstName !== undefined) data.firstName = input.firstName?.trim();
  if (input.lastName !== undefined) data.lastName = input.lastName?.trim();
  if (input.phone !== undefined) data.phone = input.phone?.trim();
  if (input.company !== undefined) data.company = input.company?.trim();
  if (input.title !== undefined) data.title = input.title?.trim();
  if (input.status !== undefined) data.status = input.status;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.customFields !== undefined) data.customFields = input.customFields as Prisma.InputJsonValue;
  if (input.referralSource !== undefined) data.referralSource = input.referralSource?.trim();
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.engagementScore !== undefined) data.engagementScore = input.engagementScore;
  if (input.lastEngagedAt !== undefined) data.lastEngagedAt = input.lastEngagedAt;
  if (input.convertedAt !== undefined) data.convertedAt = input.convertedAt;
  if (input.closedAt !== undefined) data.closedAt = input.closedAt;

  // Handle assignedTo — null means unassign
  if (input.assignedToId === null) {
    data.assignedTo = { disconnect: true };
  } else if (input.assignedToId !== undefined) {
    data.assignedTo = { connect: { id: input.assignedToId } };
  }

  return prisma.contact.update({
    where: { id },
    data,
    include: contactIncludes,
  });
}

export async function deleteContact(id: string, teamId: string) {
  const existing = await prisma.contact.findFirst({
    where: { id, teamId },
    select: { id: true },
  });
  if (!existing) return null;

  return prisma.contact.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Search & List
// ---------------------------------------------------------------------------

export async function searchContacts(params: ContactSearchParams): Promise<ContactSearchResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const skip = (page - 1) * pageSize;

  const where: Prisma.ContactWhereInput = { teamId: params.teamId };

  // Text search across email, firstName, lastName, company
  if (params.query) {
    const q = params.query.trim();
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
    ];
  }

  // Status filter (single or multiple)
  if (params.status) {
    where.status = Array.isArray(params.status)
      ? { in: params.status }
      : params.status;
  }

  // Source filter (single or multiple)
  if (params.source) {
    where.source = Array.isArray(params.source)
      ? { in: params.source }
      : params.source;
  }

  if (params.assignedToId) {
    where.assignedToId = params.assignedToId;
  }

  if (params.hasInvestor !== undefined) {
    where.investorId = params.hasInvestor ? { not: null } : null;
  }

  if (params.minEngagementScore !== undefined) {
    where.engagementScore = { gte: params.minEngagementScore };
  }

  // Tag filter — JSON array containment
  if (params.tags && params.tags.length > 0) {
    where.tags = { array_contains: params.tags };
  }

  const sortBy = params.sortBy ?? "createdAt";
  const sortOrder = params.sortOrder ?? "desc";

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: contactIncludes,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  return {
    contacts,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// Upsert (Idempotent Auto-Capture)
//
// Used by auto-capture flows (signing events, dataroom views, etc.)
// Creates a new contact if none exists for the email+team, otherwise updates.
// Never downgrades status or overwrites user-entered data with empty values.
// ---------------------------------------------------------------------------

export interface ContactUpsertInput {
  teamId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  title?: string;
  source?: ContactSource;
  investorId?: string;
  referralSource?: string;
  engagementScore?: number;
  lastEngagedAt?: Date;
}

/**
 * Upsert a contact by email + team. If the contact already exists, updates it.
 * If creating a new contact and the org is at the FREE tier contact cap,
 * creates a PendingContact instead and throws ContactLimitError.
 *
 * Callers in auto-capture flows should catch ContactLimitError gracefully.
 */
export async function upsertContact(input: ContactUpsertInput) {
  const email = input.email.toLowerCase().trim();

  // Check if contact already exists — if so, update is always allowed
  const existing = await prisma.contact.findUnique({
    where: { teamId_email: { teamId: input.teamId, email } },
    select: { id: true },
  });

  // If creating a new contact, check the contact limit for the org
  if (!existing) {
    const team = await prisma.team.findUnique({
      where: { id: input.teamId },
      select: { organizationId: true },
    });

    if (team?.organizationId) {
      const { checkContactLimit } = await import("@/lib/tier/gates");
      const limitCheck = await checkContactLimit(team.organizationId);

      if (!limitCheck.allowed) {
        // At contact cap — create PendingContact instead
        await prisma.pendingContact.upsert({
          where: { orgId_email: { orgId: team.organizationId, email } },
          create: {
            orgId: team.organizationId,
            email,
            firstName: input.firstName?.trim(),
            lastName: input.lastName?.trim(),
            source: input.source ?? "MANUAL_ENTRY",
          },
          update: {
            firstName: input.firstName?.trim() || undefined,
            lastName: input.lastName?.trim() || undefined,
          },
        });

        throw new ContactLimitError(
          `Contact limit reached for org ${team.organizationId}. Created PendingContact for ${email}.`,
          {
            email,
            orgId: team.organizationId,
            current: limitCheck.meta?.current as number,
            limit: limitCheck.meta?.limit as number,
          },
        );
      }
    }
  }

  const createData: Prisma.ContactCreateInput = {
    team: { connect: { id: input.teamId } },
    email,
    firstName: input.firstName?.trim(),
    lastName: input.lastName?.trim(),
    phone: input.phone?.trim(),
    company: input.company?.trim(),
    title: input.title?.trim(),
    source: input.source ?? "MANUAL_ENTRY",
    referralSource: input.referralSource?.trim(),
    engagementScore: input.engagementScore ?? 0,
    lastEngagedAt: input.lastEngagedAt,
  };

  if (input.investorId) {
    createData.investor = { connect: { id: input.investorId } };
  }

  // On update: only set fields that are non-empty (never overwrite with null/empty)
  const updateData: Prisma.ContactUpdateInput = {};
  if (input.firstName?.trim()) updateData.firstName = input.firstName.trim();
  if (input.lastName?.trim()) updateData.lastName = input.lastName.trim();
  if (input.phone?.trim()) updateData.phone = input.phone.trim();
  if (input.company?.trim()) updateData.company = input.company.trim();
  if (input.title?.trim()) updateData.title = input.title.trim();
  if (input.lastEngagedAt) updateData.lastEngagedAt = input.lastEngagedAt;

  // Only link investor if not already linked
  if (input.investorId) {
    updateData.investor = { connect: { id: input.investorId } };
  }

  // Increment engagement score additively if provided
  if (input.engagementScore && input.engagementScore > 0) {
    updateData.engagementScore = { increment: input.engagementScore };
  }

  const result = await prisma.contact.upsert({
    where: {
      teamId_email: { teamId: input.teamId, email },
    },
    create: createData,
    update: updateData,
    include: contactIncludes,
  });

  // If this was a new creation and a PendingContact existed, clean it up
  if (!existing) {
    const orgTeam = await prisma.team.findUnique({
      where: { id: input.teamId },
      select: { organizationId: true },
    });
    if (orgTeam?.organizationId) {
      await prisma.pendingContact.deleteMany({
        where: { orgId: orgTeam.organizationId, email },
      }).catch(() => {}); // Non-critical cleanup
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// ContactLimitError — thrown when org is at FREE tier contact cap
// ---------------------------------------------------------------------------

export class ContactLimitError extends Error {
  public readonly email: string;
  public readonly orgId: string;
  public readonly current: number;
  public readonly limit: number;

  constructor(
    message: string,
    details: { email: string; orgId: string; current: number; limit: number },
  ) {
    super(message);
    this.name = "ContactLimitError";
    this.email = details.email;
    this.orgId = details.orgId;
    this.current = details.current;
    this.limit = details.limit;
  }
}

// ---------------------------------------------------------------------------
// PendingContact Promotion — Batch-promote on tier upgrade
// ---------------------------------------------------------------------------

/**
 * Promote PendingContacts to real Contacts when an org upgrades from FREE.
 *
 * Called from the Stripe CRM webhook after a tier upgrade (FREE → CRM_PRO/FUNDROOM).
 * Processes in batches of 50 to avoid overwhelming the DB.
 *
 * Returns summary of promoted, skipped (duplicate), and failed counts.
 */
export async function promotePendingContacts(orgId: string): Promise<{
  promoted: number;
  skipped: number;
  failed: number;
}> {
  let promoted = 0;
  let skipped = 0;
  let failed = 0;

  // Find the primary team for this org (contacts are team-scoped)
  const team = await prisma.team.findFirst({
    where: { organizationId: orgId },
    select: { id: true },
    orderBy: { createdAt: "asc" }, // Use the oldest (primary) team
  });

  if (!team) {
    return { promoted: 0, skipped: 0, failed: 0 };
  }

  // Process in batches
  const BATCH_SIZE = 50;
  let cursor: string | undefined;

  while (true) {
    const pendingContacts = await prisma.pendingContact.findMany({
      where: { orgId },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "asc" },
    });

    if (pendingContacts.length === 0) break;

    for (const pending of pendingContacts) {
      try {
        const email = pending.email.toLowerCase().trim();

        // Check if a contact with this email already exists on any team in the org
        const existingContact = await prisma.contact.findFirst({
          where: {
            email,
            team: { organizationId: orgId },
          },
          select: { id: true },
        });

        if (existingContact) {
          // Already exists — delete PendingContact and skip
          await prisma.pendingContact.delete({ where: { id: pending.id } });
          skipped++;
          continue;
        }

        // Create real Contact + delete PendingContact in a transaction
        await prisma.$transaction([
          prisma.contact.create({
            data: {
              team: { connect: { id: team.id } },
              email,
              firstName: pending.firstName,
              lastName: pending.lastName,
              source: (pending.source as ContactSource) || "DATAROOM_VIEW",
              status: "PROSPECT",
              engagementScore: 0,
            },
          }),
          prisma.pendingContact.delete({ where: { id: pending.id } }),
        ]);

        promoted++;
      } catch {
        failed++;
      }
    }

    cursor = pendingContacts[pendingContacts.length - 1]?.id;
    if (pendingContacts.length < BATCH_SIZE) break;
  }

  return { promoted, skipped, failed };
}

// ---------------------------------------------------------------------------
// Engagement Score Update
// ---------------------------------------------------------------------------

export async function incrementEngagementScore(
  contactId: string,
  teamId: string,
  points: number,
) {
  return prisma.contact.updateMany({
    where: { id: contactId, teamId },
    data: {
      engagementScore: { increment: points },
      lastEngagedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Full Engagement Score Recalculation (with email interactions + time decay)
// ---------------------------------------------------------------------------

/** Per-activity-type scoring weights. */
const ACTIVITY_WEIGHTS: Record<string, number> = {
  COMMITMENT_MADE: 15,
  WIRE_RECEIVED: 12,
  DOCUMENT_SIGNED: 10,
  EMAIL_REPLIED: 8,
  MEETING: 7,
  CALL: 5,
  DEAL_INTEREST: 5,
  EMAIL_OPENED: 2,
  LINK_CLICKED: 3,
  DOCUMENT_VIEWED: 2,
  EMAIL_SENT: 1,
  NOTE_ADDED: 1,
  TASK_COMPLETED: 1,
  STATUS_CHANGE: 0,
  PROFILE_UPDATED: 0,
  ASSIGNED: 0,
  CREATED: 0,
};

/** Time-decay multiplier: recent activities are worth more. */
function timeDecayMultiplier(activityDate: Date): number {
  const daysSince = (Date.now() - activityDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 7) return 1.0;    // Last 7 days: full weight
  if (daysSince <= 30) return 0.7;   // 8-30 days: 70%
  if (daysSince <= 90) return 0.4;   // 31-90 days: 40%
  return 0.1;                         // 90+ days: 10%
}

export interface EngagementBreakdown {
  total: number;
  tier: "HOT" | "WARM" | "COOL" | "NONE";
  byType: Record<string, { count: number; rawPoints: number; decayedPoints: number }>;
  emailMetrics: {
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    openRate: number;  // opened / sent (0-1)
    clickRate: number; // clicked / sent (0-1)
  };
  lastActivityAt: Date | null;
  activityCount: number;
}

/**
 * Recalculate a contact's engagement score from all activity history.
 *
 * Unlike `incrementEngagementScore` (additive, used for real-time events),
 * this function examines all ContactActivity records and applies:
 *  - Per-type weights (email open/click/reply, docs, meetings, etc.)
 *  - Time-decay multiplier (recent activity worth more)
 *  - Capped at 100 for display normalization
 *
 * Call this periodically or on-demand (e.g., from a cron job or admin action).
 */
export async function recalculateContactEngagement(
  contactId: string,
  teamId: string,
): Promise<EngagementBreakdown> {
  const activities = await prisma.contactActivity.findMany({
    where: { contactId },
    select: { type: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 500, // Cap for performance
  });

  const byType: Record<string, { count: number; rawPoints: number; decayedPoints: number }> = {};
  let total = 0;
  let lastActivityAt: Date | null = null;

  // Email-specific counters
  let emailSent = 0;
  let emailOpened = 0;
  let emailClicked = 0;
  let emailReplied = 0;

  for (const activity of activities) {
    const typeStr = activity.type as string;
    const weight = ACTIVITY_WEIGHTS[typeStr] ?? 0;
    const decay = timeDecayMultiplier(activity.createdAt);
    const decayedPoints = Math.round(weight * decay * 10) / 10;

    if (!byType[typeStr]) {
      byType[typeStr] = { count: 0, rawPoints: 0, decayedPoints: 0 };
    }
    byType[typeStr].count++;
    byType[typeStr].rawPoints += weight;
    byType[typeStr].decayedPoints += decayedPoints;

    total += decayedPoints;

    if (!lastActivityAt || activity.createdAt > lastActivityAt) {
      lastActivityAt = activity.createdAt;
    }

    // Count email metrics
    if (typeStr === "EMAIL_SENT") emailSent++;
    if (typeStr === "EMAIL_OPENED") emailOpened++;
    if (typeStr === "LINK_CLICKED") emailClicked++;
    if (typeStr === "EMAIL_REPLIED") emailReplied++;
  }

  // Round total and cap at 100
  const finalScore = Math.min(100, Math.round(total));

  // Determine tier
  let tier: "HOT" | "WARM" | "COOL" | "NONE" = "NONE";
  if (finalScore >= 15) tier = "HOT";
  else if (finalScore >= 5) tier = "WARM";
  else if (finalScore >= 1) tier = "COOL";

  // Persist updated score
  await prisma.contact.updateMany({
    where: { id: contactId, teamId },
    data: {
      engagementScore: finalScore,
      lastEngagedAt: lastActivityAt ?? undefined,
    },
  });

  return {
    total: finalScore,
    tier,
    byType,
    emailMetrics: {
      sent: emailSent,
      opened: emailOpened,
      clicked: emailClicked,
      replied: emailReplied,
      openRate: emailSent > 0 ? emailOpened / emailSent : 0,
      clickRate: emailSent > 0 ? emailClicked / emailSent : 0,
    },
    lastActivityAt,
    activityCount: activities.length,
  };
}

/**
 * Batch recalculate engagement scores for all contacts in a team.
 * Useful for cron jobs or admin "refresh all" actions.
 */
export async function recalculateTeamEngagement(
  teamId: string,
): Promise<{ processed: number; errors: number }> {
  const contacts = await prisma.contact.findMany({
    where: { teamId, unsubscribedAt: null },
    select: { id: true },
  });

  let processed = 0;
  let errors = 0;

  for (const contact of contacts) {
    try {
      await recalculateContactEngagement(contact.id, teamId);
      processed++;
    } catch {
      errors++;
    }
  }

  return { processed, errors };
}

// ---------------------------------------------------------------------------
// Activity Logging
// ---------------------------------------------------------------------------

export async function logContactActivity(input: {
  contactId: string;
  type: ContactActivityType;
  actorId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  dealId?: string;
  documentId?: string;
  fundId?: string;
}) {
  return prisma.contactActivity.create({
    data: {
      contact: { connect: { id: input.contactId } },
      type: input.type,
      description: input.description,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      dealId: input.dealId,
      documentId: input.documentId,
      fundId: input.fundId,
      ...(input.actorId ? { actor: { connect: { id: input.actorId } } } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Notes CRUD
// ---------------------------------------------------------------------------

export async function createContactNote(input: {
  contactId: string;
  authorId: string;
  content: string;
  isPinned?: boolean;
  isPrivate?: boolean;
}) {
  return prisma.contactNote.create({
    data: {
      contact: { connect: { id: input.contactId } },
      author: { connect: { id: input.authorId } },
      content: input.content,
      isPinned: input.isPinned ?? false,
      isPrivate: input.isPrivate ?? false,
    },
    include: { author: { select: { id: true, name: true, email: true } } },
  });
}

export async function getContactNotes(contactId: string, includePrivate: boolean, userId?: string) {
  const where: Prisma.ContactNoteWhereInput = { contactId };
  if (!includePrivate) {
    // Show public notes + user's own private notes
    where.OR = [
      { isPrivate: false },
      ...(userId ? [{ isPrivate: true, authorId: userId }] : []),
    ];
  }

  return prisma.contactNote.findMany({
    where,
    include: { author: { select: { id: true, name: true, email: true } } },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
  });
}

export async function updateContactNote(noteId: string, authorId: string, data: {
  content?: string;
  isPinned?: boolean;
  isPrivate?: boolean;
}) {
  // Only the author can update their own note
  const note = await prisma.contactNote.findFirst({
    where: { id: noteId, authorId },
    select: { id: true },
  });
  if (!note) return null;

  return prisma.contactNote.update({
    where: { id: noteId },
    data,
    include: { author: { select: { id: true, name: true, email: true } } },
  });
}

export async function deleteContactNote(noteId: string, authorId: string) {
  const note = await prisma.contactNote.findFirst({
    where: { id: noteId, authorId },
    select: { id: true },
  });
  if (!note) return null;

  return prisma.contactNote.delete({ where: { id: noteId } });
}

// ---------------------------------------------------------------------------
// Shared Includes
// ---------------------------------------------------------------------------

const contactIncludes = {
  assignedTo: { select: { id: true, name: true, email: true } },
  investor: { select: { id: true, entityName: true, entityType: true, accreditationStatus: true } },
  _count: { select: { contactNotes: true, contactActivities: true } },
} as const;
