/**
 * Signing Session Handler
 *
 * Bridges the Envelope system with the actual signing flow.
 * Handles:
 * - Token-based signer authentication for envelopes
 * - Recording signer completion (signature, IP, timestamp)
 * - Advancing signing order (sequential/parallel/mixed)
 * - Auto-filing on envelope completion
 * - ESIGN/UETA compliance records
 */
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import {
  advanceSigningOrder,
  autoCreateContactForSigner,
} from "@/lib/esign/envelope-service";
import { autoFileEnvelopeDocument } from "@/lib/esign/document-filing-service";
import crypto from "crypto";

// ============================================================================
// Types
// ============================================================================

export interface SignerSession {
  recipientId: string;
  envelopeId: string;
  teamId: string;
  email: string;
  name: string;
  role: string;
  status: string;
  signingMode: string;
  order: number;
  envelope: {
    id: string;
    title: string;
    status: string;
    sourceFile: string | null;
    emailSubject: string | null;
  };
  canSign: boolean;
  reason?: string;
}

export interface RecordSignatureInput {
  signingToken: string;
  signatureImage?: string;
  signatureType?: "draw" | "type" | "upload";
  ipAddress: string;
  userAgent?: string;
  /** Field values submitted by the signer */
  fieldValues?: Record<string, string>;
  /** ESIGN consent acknowledged */
  esignConsent?: boolean;
}

// ============================================================================
// Authenticate Signer by Token
// ============================================================================

/**
 * Validate a signing token and return the signer session info.
 * Determines whether the signer can currently sign based on signing mode
 * and order (sequential: must wait for prior groups; parallel: always can sign).
 */
export async function authenticateSigner(
  signingToken: string
): Promise<SignerSession> {
  const recipient = await prisma.envelopeRecipient.findUnique({
    where: { signingToken },
    include: {
      envelope: {
        include: {
          recipients: {
            where: { role: "SIGNER" },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (!recipient) {
    throw new Error("Invalid signing token");
  }

  const envelope = recipient.envelope;

  // Check envelope status
  if (
    envelope.status === "VOIDED" ||
    envelope.status === "DECLINED" ||
    envelope.status === "EXPIRED"
  ) {
    return {
      recipientId: recipient.id,
      envelopeId: envelope.id,
      teamId: envelope.teamId,
      email: recipient.email,
      name: recipient.name,
      role: recipient.role,
      status: recipient.status,
      signingMode: envelope.signingMode,
      order: recipient.order,
      envelope: {
        id: envelope.id,
        title: envelope.title,
        status: envelope.status,
        sourceFile: envelope.sourceFile,
        emailSubject: envelope.emailSubject,
      },
      canSign: false,
      reason: `This envelope has been ${envelope.status.toLowerCase()}`,
    };
  }

  // Check if already signed
  if (recipient.status === "SIGNED") {
    return {
      recipientId: recipient.id,
      envelopeId: envelope.id,
      teamId: envelope.teamId,
      email: recipient.email,
      name: recipient.name,
      role: recipient.role,
      status: recipient.status,
      signingMode: envelope.signingMode,
      order: recipient.order,
      envelope: {
        id: envelope.id,
        title: envelope.title,
        status: envelope.status,
        sourceFile: envelope.sourceFile,
        emailSubject: envelope.emailSubject,
      },
      canSign: false,
      reason: "You have already signed this document",
    };
  }

  // Check if declined
  if (recipient.status === "DECLINED") {
    return {
      recipientId: recipient.id,
      envelopeId: envelope.id,
      teamId: envelope.teamId,
      email: recipient.email,
      name: recipient.name,
      role: recipient.role,
      status: recipient.status,
      signingMode: envelope.signingMode,
      order: recipient.order,
      envelope: {
        id: envelope.id,
        title: envelope.title,
        status: envelope.status,
        sourceFile: envelope.sourceFile,
        emailSubject: envelope.emailSubject,
      },
      canSign: false,
      reason: "You have declined to sign this document",
    };
  }

  // CC recipients cannot sign
  if (recipient.role === "CC" || recipient.role === "CERTIFIED_DELIVERY") {
    return {
      recipientId: recipient.id,
      envelopeId: envelope.id,
      teamId: envelope.teamId,
      email: recipient.email,
      name: recipient.name,
      role: recipient.role,
      status: recipient.status,
      signingMode: envelope.signingMode,
      order: recipient.order,
      envelope: {
        id: envelope.id,
        title: envelope.title,
        status: envelope.status,
        sourceFile: envelope.sourceFile,
        emailSubject: envelope.emailSubject,
      },
      canSign: false,
      reason: "You are a CC recipient and do not need to sign",
    };
  }

  // Determine if this signer can sign now based on signing mode
  let canSign = true;
  let reason: string | undefined;

  if (envelope.signingMode === "SEQUENTIAL" || envelope.signingMode === "MIXED") {
    // Check if all prior order groups have completed
    const signers = envelope.recipients;
    const priorSigners = signers.filter((s) => s.order < recipient.order);
    const allPriorDone = priorSigners.every((s) => s.status === "SIGNED");

    if (!allPriorDone) {
      canSign = false;
      reason = "Waiting for other signers to complete first";
    }
  }
  // PARALLEL mode: always canSign = true

  // Mark as VIEWED if first access
  if (
    recipient.status === "SENT" ||
    recipient.status === "DELIVERED" ||
    recipient.status === "PENDING"
  ) {
    await prisma.envelopeRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "VIEWED",
        viewedAt: recipient.viewedAt || new Date(),
      },
    });

    // Update envelope status if first view
    if (envelope.status === "SENT") {
      await prisma.envelope.update({
        where: { id: envelope.id },
        data: { status: "VIEWED" },
      });
    }
  }

  return {
    recipientId: recipient.id,
    envelopeId: envelope.id,
    teamId: envelope.teamId,
    email: recipient.email,
    name: recipient.name,
    role: recipient.role,
    status: recipient.status,
    signingMode: envelope.signingMode,
    order: recipient.order,
    envelope: {
      id: envelope.id,
      title: envelope.title,
      status: envelope.status,
      sourceFile: envelope.sourceFile,
      emailSubject: envelope.emailSubject,
    },
    canSign,
    reason,
  };
}

// ============================================================================
// Record Signer Completion
// ============================================================================

/**
 * Record that a signer has completed signing.
 * Handles:
 * 1. Update recipient status to SIGNED
 * 2. Record ESIGN consent and compliance data
 * 3. Advance signing order (if sequential/mixed)
 * 4. Auto-file on completion (if all signers done)
 * 5. Auto-create Contact for signer
 */
export async function recordSignerCompletion(
  input: RecordSignatureInput
): Promise<{
  success: boolean;
  isEnvelopeComplete: boolean;
  nextRecipients: string[];
  filingResult?: any;
}> {
  // Authenticate the signer
  const session = await authenticateSigner(input.signingToken);

  if (!session.canSign) {
    throw new Error(session.reason || "Cannot sign at this time");
  }

  const now = new Date();

  // Build ESIGN consent hash
  const consentData = JSON.stringify({
    email: session.email,
    timestamp: now.toISOString(),
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    esignConsent: input.esignConsent,
  });
  const consentHash = crypto
    .createHash("sha256")
    .update(consentData)
    .digest("hex");

  // Update recipient as SIGNED
  await prisma.envelopeRecipient.update({
    where: { id: session.recipientId },
    data: {
      status: "SIGNED",
      signedAt: now,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      consentRecord: {
        timestamp: now.toISOString(),
        consentHash,
        signatureType: input.signatureType,
        esignConsent: input.esignConsent,
        version: "1.0",
      },
      signatureChecksum: {
        documentHash: consentHash,
        signedAt: now.toISOString(),
      },
    },
  });

  // Audit log
  logAuditEvent({
    eventType: "DOCUMENT_SIGNED",
    userId: null,
    teamId: session.teamId,
    resourceType: "Envelope",
    resourceId: session.envelopeId,
    metadata: {
      recipientEmail: session.email,
      signatureType: input.signatureType,
      signingMode: session.signingMode,
      order: session.order,
      consentHash,
    },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  }).catch((e) => reportError(e as Error));

  // Auto-create contact for signer (non-blocking)
  autoCreateContactForSigner(
    session.teamId,
    session.email,
    session.name
  ).catch((e) => reportError(e as Error));

  // Advance signing order
  const { nextRecipients, isComplete } = await advanceSigningOrder(
    session.envelopeId
  );

  let filingResult;

  if (isComplete) {
    // All signers done — auto-file the document
    try {
      filingResult = await autoFileEnvelopeDocument(session.envelopeId);
    } catch (err) {
      reportError(err as Error);
    }

    // Notify CC recipients that signing is complete
    // TODO: Send completion email to CC recipients
    // TODO: Send completion email to envelope creator
  }

  // TODO: Send email to next recipients (for sequential/mixed mode)
  // nextRecipients.forEach(email => sendSigningInvitation(email, ...));

  return {
    success: true,
    isEnvelopeComplete: isComplete,
    nextRecipients,
    filingResult,
  };
}

// ============================================================================
// Check signing order eligibility
// ============================================================================

/**
 * For a given envelope, return which recipients can currently sign.
 * Useful for UI rendering and progress display.
 */
export async function getSigningStatus(envelopeId: string): Promise<{
  mode: string;
  totalSigners: number;
  signedCount: number;
  currentGroup: { email: string; name: string; status: string; order: number }[];
  waitingGroups: { order: number; recipients: { email: string; name: string }[] }[];
  isComplete: boolean;
}> {
  const envelope = await prisma.envelope.findUnique({
    where: { id: envelopeId },
    include: {
      recipients: {
        where: { role: "SIGNER" },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!envelope) {
    throw new Error("Envelope not found");
  }

  const signers = envelope.recipients;
  const signedCount = signers.filter((s) => s.status === "SIGNED").length;
  const isComplete = signedCount === signers.length;

  if (envelope.signingMode === "PARALLEL") {
    // All signers are in the "current" group
    return {
      mode: "PARALLEL",
      totalSigners: signers.length,
      signedCount,
      currentGroup: signers.map((s) => ({
        email: s.email,
        name: s.name,
        status: s.status,
        order: s.order,
      })),
      waitingGroups: [],
      isComplete,
    };
  }

  // Sequential/Mixed: determine current active group
  const signedOrders = new Set(
    signers.filter((s) => s.status === "SIGNED").map((s) => s.order)
  );

  // Find the minimum order that hasn't been fully completed
  const orderGroups = new Map<number, typeof signers>();
  for (const s of signers) {
    const group = orderGroups.get(s.order) || [];
    group.push(s);
    orderGroups.set(s.order, group);
  }

  let currentOrder: number | null = null;
  for (const [order, group] of orderGroups) {
    const allDone = group.every((s) => s.status === "SIGNED");
    if (!allDone) {
      currentOrder = order;
      break;
    }
  }

  const currentGroup = currentOrder !== null
    ? (orderGroups.get(currentOrder) || []).map((s) => ({
        email: s.email,
        name: s.name,
        status: s.status,
        order: s.order,
      }))
    : [];

  const waitingGroups: { order: number; recipients: { email: string; name: string }[] }[] = [];
  if (currentOrder !== null) {
    for (const [order, group] of orderGroups) {
      if (order > currentOrder) {
        waitingGroups.push({
          order,
          recipients: group.map((s) => ({
            email: s.email,
            name: s.name,
          })),
        });
      }
    }
  }

  return {
    mode: envelope.signingMode,
    totalSigners: signers.length,
    signedCount,
    currentGroup,
    waitingGroups,
    isComplete,
  };
}
