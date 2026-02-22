/**
 * Envelope Service — Core business logic for standalone e-signature envelopes.
 *
 * Handles envelope lifecycle: create → prepare → send → sign → complete → file.
 * Auto-creates Contact records for new signers, files signed copies to vaults.
 */
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import crypto from "crypto";
import type {
  Envelope,
  EnvelopeRecipient,
  EnvelopeStatus,
  EnvelopeRecipientRole,
  EnvelopeRecipientStatus,
  SigningMode,
} from "@prisma/client";

// ============================================================================
// Types
// ============================================================================

export interface CreateEnvelopeInput {
  teamId: string;
  createdById: string;
  title: string;
  description?: string;
  signingMode?: SigningMode;
  emailSubject?: string;
  emailMessage?: string;
  expiresAt?: Date;
  reminderEnabled?: boolean;
  reminderDays?: number;
  maxReminders?: number;
  recipients: {
    name: string;
    email: string;
    role?: EnvelopeRecipientRole;
    order?: number;
  }[];
  // Source file info (uploaded PDF)
  sourceFile?: string;
  sourceStorageType?: string;
  sourceFileName?: string;
  sourceMimeType?: string;
  sourceFileSize?: number;
  sourceNumPages?: number;
}

export interface EnvelopeWithRecipients extends Envelope {
  recipients: EnvelopeRecipient[];
}

// ============================================================================
// Create Envelope
// ============================================================================

export async function createEnvelope(
  input: CreateEnvelopeInput
): Promise<EnvelopeWithRecipients> {
  const {
    teamId,
    createdById,
    title,
    description,
    signingMode = "SEQUENTIAL",
    emailSubject,
    emailMessage,
    expiresAt,
    reminderEnabled = true,
    reminderDays = 3,
    maxReminders = 3,
    recipients,
    sourceFile,
    sourceStorageType,
    sourceFileName,
    sourceMimeType,
    sourceFileSize,
    sourceNumPages,
  } = input;

  // Validate at least one signer
  const signers = recipients.filter((r) => !r.role || r.role === "SIGNER");
  if (signers.length === 0) {
    throw new Error("At least one SIGNER recipient is required");
  }

  // Create envelope with recipients in a transaction
  const envelope = await prisma.$transaction(async (tx) => {
    const env = await tx.envelope.create({
      data: {
        teamId,
        createdById,
        title,
        description,
        signingMode,
        emailSubject: emailSubject || `Please sign: ${title}`,
        emailMessage,
        expiresAt,
        reminderEnabled,
        reminderDays,
        maxReminders,
        sourceFile: sourceFile || undefined,
        sourceStorageType: (sourceStorageType as any) || undefined,
        sourceFileName,
        sourceMimeType,
        sourceFileSize: sourceFileSize ? BigInt(sourceFileSize) : undefined,
        sourceNumPages,
        recipients: {
          create: recipients.map((r, idx) => ({
            name: r.name,
            email: r.email.toLowerCase().trim(),
            role: r.role || "SIGNER",
            order: r.order ?? idx + 1,
            signingToken: generateSigningToken(),
          })),
        },
      },
      include: {
        recipients: {
          orderBy: { order: "asc" },
        },
      },
    });

    return env;
  });

  // Audit log
  logAuditEvent({
    eventType: "ENVELOPE_CREATED",
    userId: createdById,
    teamId,
    resourceType: "Envelope",
    resourceId: envelope.id,
    metadata: {
      title,
      recipientCount: recipients.length,
      signerCount: signers.length,
      ccCount: recipients.filter((r) => r.role === "CC").length,
      signingMode,
    },
  }).catch((e) => reportError(e as Error));

  return envelope;
}

// ============================================================================
// Send Envelope
// ============================================================================

export async function sendEnvelope(
  envelopeId: string,
  userId: string
): Promise<EnvelopeWithRecipients> {
  const envelope = await prisma.envelope.findUnique({
    where: { id: envelopeId },
    include: { recipients: { orderBy: { order: "asc" } } },
  });

  if (!envelope) {
    throw new Error("Envelope not found");
  }

  if (envelope.status !== "DRAFT" && envelope.status !== "PREPARING") {
    throw new Error(`Cannot send envelope in ${envelope.status} status`);
  }

  const signers = envelope.recipients.filter((r) => r.role === "SIGNER");
  if (signers.length === 0) {
    throw new Error("No signers assigned to envelope");
  }

  const now = new Date();

  // Determine which recipients to notify based on signing mode
  let recipientsToNotify: EnvelopeRecipient[] = [];

  if (envelope.signingMode === "PARALLEL") {
    // All signers can sign at once
    recipientsToNotify = signers;
  } else if (envelope.signingMode === "SEQUENTIAL") {
    // Only the first signer by order
    const firstOrder = Math.min(...signers.map((s) => s.order));
    recipientsToNotify = signers.filter((s) => s.order === firstOrder);
  } else {
    // MIXED: first signing group (all with the lowest order number)
    const firstOrder = Math.min(...signers.map((s) => s.order));
    recipientsToNotify = signers.filter((s) => s.order === firstOrder);
  }

  // Update envelope and recipient statuses
  const updated = await prisma.$transaction(async (tx) => {
    // Update envelope status
    await tx.envelope.update({
      where: { id: envelopeId },
      data: {
        status: "SENT",
        sentAt: now,
      },
    });

    // Mark notified recipients as SENT
    for (const r of recipientsToNotify) {
      await tx.envelopeRecipient.update({
        where: { id: r.id },
        data: {
          status: "SENT",
          sentAt: now,
        },
      });
    }

    return tx.envelope.findUnique({
      where: { id: envelopeId },
      include: { recipients: { orderBy: { order: "asc" } } },
    });
  });

  // Audit log
  logAuditEvent({
    eventType: "ENVELOPE_SENT",
    userId,
    teamId: envelope.teamId,
    resourceType: "Envelope",
    resourceId: envelopeId,
    metadata: {
      recipientsNotified: recipientsToNotify.map((r) => r.email),
      signingMode: envelope.signingMode,
    },
  }).catch((e) => reportError(e as Error));

  return updated as EnvelopeWithRecipients;
}

// ============================================================================
// Void Envelope
// ============================================================================

export async function voidEnvelope(
  envelopeId: string,
  userId: string,
  reason?: string
): Promise<Envelope> {
  const envelope = await prisma.envelope.findUnique({
    where: { id: envelopeId },
  });

  if (!envelope) {
    throw new Error("Envelope not found");
  }

  if (envelope.status === "COMPLETED" || envelope.status === "VOIDED") {
    throw new Error(`Cannot void envelope in ${envelope.status} status`);
  }

  const updated = await prisma.envelope.update({
    where: { id: envelopeId },
    data: {
      status: "VOIDED",
      voidedAt: new Date(),
      voidedReason: reason,
    },
  });

  logAuditEvent({
    eventType: "ENVELOPE_VOIDED",
    userId,
    teamId: envelope.teamId,
    resourceType: "Envelope",
    resourceId: envelopeId,
    metadata: { reason },
  }).catch((e) => reportError(e as Error));

  return updated;
}

// ============================================================================
// Decline Envelope
// ============================================================================

export async function declineEnvelope(
  envelopeId: string,
  recipientId: string,
  reason?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<Envelope> {
  const recipient = await prisma.envelopeRecipient.findUnique({
    where: { id: recipientId },
    include: { envelope: true },
  });

  if (!recipient) {
    throw new Error("Recipient not found");
  }

  if (recipient.envelopeId !== envelopeId) {
    throw new Error("Recipient does not belong to this envelope");
  }

  if (recipient.status === "SIGNED" || recipient.status === "DECLINED") {
    throw new Error(`Recipient already ${recipient.status.toLowerCase()}`);
  }

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    // Update recipient
    await tx.envelopeRecipient.update({
      where: { id: recipientId },
      data: {
        status: "DECLINED",
        declinedAt: now,
        declinedReason: reason,
        ipAddress,
        userAgent,
      },
    });

    // Update envelope status
    return tx.envelope.update({
      where: { id: envelopeId },
      data: {
        status: "DECLINED",
        declinedAt: now,
        declinedBy: recipient.email,
      },
    });
  });

  logAuditEvent({
    eventType: "ENVELOPE_DECLINED",
    userId: null,
    teamId: recipient.envelope.teamId,
    resourceType: "Envelope",
    resourceId: envelopeId,
    metadata: {
      recipientEmail: recipient.email,
      reason,
      ipAddress,
    },
  }).catch((e) => reportError(e as Error));

  return updated;
}

// ============================================================================
// Send Reminder
// ============================================================================

export async function sendReminder(
  envelopeId: string,
  userId: string,
  recipientId?: string
): Promise<{ reminded: string[] }> {
  const envelope = await prisma.envelope.findUnique({
    where: { id: envelopeId },
    include: { recipients: true },
  });

  if (!envelope) {
    throw new Error("Envelope not found");
  }

  if (envelope.status !== "SENT" && envelope.status !== "VIEWED" && envelope.status !== "PARTIALLY_SIGNED") {
    throw new Error(`Cannot send reminders for envelope in ${envelope.status} status`);
  }

  const now = new Date();
  const pendingRecipients = envelope.recipients.filter(
    (r) =>
      r.role === "SIGNER" &&
      (r.status === "SENT" || r.status === "DELIVERED" || r.status === "VIEWED") &&
      r.reminderCount < envelope.maxReminders &&
      (!recipientId || r.id === recipientId)
  );

  const reminded: string[] = [];

  for (const r of pendingRecipients) {
    await prisma.envelopeRecipient.update({
      where: { id: r.id },
      data: {
        lastReminderSentAt: now,
        reminderCount: { increment: 1 },
      },
    });
    reminded.push(r.email);

    // TODO: Send actual reminder email via Resend
    // sendEnvelopeReminderEmail(r, envelope);
  }

  logAuditEvent({
    eventType: "ENVELOPE_REMINDER_SENT",
    userId,
    teamId: envelope.teamId,
    resourceType: "Envelope",
    resourceId: envelopeId,
    metadata: { reminded },
  }).catch((e) => reportError(e as Error));

  return { reminded };
}

// ============================================================================
// Advance signing after a recipient completes (for sequential/mixed mode)
// ============================================================================

export async function advanceSigningOrder(
  envelopeId: string
): Promise<{ nextRecipients: string[]; isComplete: boolean }> {
  const envelope = await prisma.envelope.findUnique({
    where: { id: envelopeId },
    include: { recipients: { orderBy: { order: "asc" } } },
  });

  if (!envelope) {
    throw new Error("Envelope not found");
  }

  const signers = envelope.recipients.filter((r) => r.role === "SIGNER");
  const allSigned = signers.every((s) => s.status === "SIGNED");

  if (allSigned) {
    // All signers done — mark envelope as completed
    await prisma.envelope.update({
      where: { id: envelopeId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    return { nextRecipients: [], isComplete: true };
  }

  if (envelope.signingMode === "PARALLEL") {
    // In parallel mode, everyone already has access — just update status
    const partiallyDone = signers.some((s) => s.status === "SIGNED");
    if (partiallyDone) {
      await prisma.envelope.update({
        where: { id: envelopeId },
        data: { status: "PARTIALLY_SIGNED" },
      });
    }
    return { nextRecipients: [], isComplete: false };
  }

  // Sequential/Mixed: find next group
  const signedOrders = new Set(
    signers.filter((s) => s.status === "SIGNED").map((s) => s.order)
  );
  const pendingSigners = signers.filter(
    (s) => s.status === "PENDING" && !signedOrders.has(s.order)
  );

  if (pendingSigners.length === 0) {
    return { nextRecipients: [], isComplete: false };
  }

  // Find the next order group
  const nextOrder = Math.min(...pendingSigners.map((s) => s.order));
  const nextGroup = pendingSigners.filter((s) => s.order === nextOrder);

  // Check if all signers in the current order are done
  const currentOrder = nextOrder - 1;
  const currentGroupSigners = signers.filter((s) => s.order === currentOrder);
  const currentGroupDone =
    currentGroupSigners.length === 0 ||
    currentGroupSigners.every((s) => s.status === "SIGNED");

  if (!currentGroupDone) {
    return { nextRecipients: [], isComplete: false };
  }

  // Send to next group
  const now = new Date();
  const nextEmails: string[] = [];

  for (const r of nextGroup) {
    await prisma.envelopeRecipient.update({
      where: { id: r.id },
      data: {
        status: "SENT",
        sentAt: now,
      },
    });
    nextEmails.push(r.email);
  }

  // Update envelope status
  await prisma.envelope.update({
    where: { id: envelopeId },
    data: { status: "PARTIALLY_SIGNED" },
  });

  return { nextRecipients: nextEmails, isComplete: false };
}

// ============================================================================
// Auto-create Contact for signer if not exists
// ============================================================================

export async function autoCreateContactForSigner(
  teamId: string,
  email: string,
  name: string
): Promise<string | null> {
  try {
    // Check if contact already exists
    const existing = await prisma.contact.findFirst({
      where: {
        teamId,
        email: email.toLowerCase().trim(),
      },
    });

    if (existing) {
      return existing.id;
    }

    // Parse name
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    const contact = await prisma.contact.create({
      data: {
        teamId,
        email: email.toLowerCase().trim(),
        firstName,
        lastName,
        source: "SIGNATURE_EVENT",
        status: "PROSPECT",
      },
    });

    return contact.id;
  } catch (error) {
    // Non-blocking — don't fail the signing process
    reportError(error as Error);
    return null;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function generateSigningToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getSigningUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "https://app.fundroom.ai";
  return `${baseUrl}/sign/envelope/${token}`;
}
