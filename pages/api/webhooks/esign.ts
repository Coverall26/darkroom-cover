import { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import SignatureCompletedEmail from "@/components/emails/signature-completed";
import { SignatureEventType } from "@/lib/webhook/triggers/signature-events";
import { reportError } from "@/lib/error";

interface EsignWebhookPayload {
  id: string;
  event: SignatureEventType;
  timestamp: string;
  data: {
    documentId: string;
    documentTitle: string;
    teamId: string;
    teamName: string;
    recipientId?: string;
    recipientName?: string;
    recipientEmail?: string;
    status: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    allRecipients?: Array<{
      name: string;
      email: string;
      status: string;
      signedAt?: string | null;
    }>;
  };
}

interface AuditEntry {
  event: string;
  timestamp: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  recipientEmail?: string | null;
  status?: string;
  details?: Record<string, unknown>;
}

function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rawBody = await getRawBody(req);
    let payload: EsignWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString()) as EsignWebhookPayload;
    } catch {
      console.error("[ESIGN_WEBHOOK] Invalid JSON in request body");
      return res.status(400).json({ error: "Invalid request body" });
    }
    
    const webhookSecret = process.env.ESIGN_WEBHOOK_SECRET;
    const signature = req.headers["x-esign-signature"] as string | undefined;

    // In production, webhook secret is required
    if (process.env.NODE_ENV === "production" && !webhookSecret) {
      console.error("[ESIGN_WEBHOOK] ESIGN_WEBHOOK_SECRET not configured");
      return res.status(500).json({ error: "Internal server error" });
    }

    // Signature verification is mandatory when secret is configured
    if (webhookSecret) {
      if (!signature) {
        console.error("[ESIGN_WEBHOOK] Missing signature header");
        return res.status(401).json({ error: "Missing signature header" });
      }

      // Use deterministic JSON serialization for signature verification
      const sortedBody = JSON.stringify(payload, Object.keys(payload).sort());
      
      if (!verifyWebhookSignature(sortedBody, signature, webhookSecret)) {
        console.error("[ESIGN_WEBHOOK] Invalid signature");
        return res.status(401).json({ error: "Invalid webhook signature" });
      }
    }

    if (!payload.event || !payload.data?.documentId) {
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    // Verify document exists and belongs to the claimed team
    const document = await prisma.signatureDocument.findUnique({
      where: { id: payload.data.documentId },
      select: { id: true, teamId: true, status: true },
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found" });
    }

    if (document.teamId !== payload.data.teamId) {
      console.error("[ESIGN_WEBHOOK] Team mismatch");
      return res.status(403).json({ error: "Access denied" });
    }

    // Verify recipient exists if recipientId is provided
    if (payload.data.recipientId) {
      const recipient = await prisma.signatureRecipient.findFirst({
        where: {
          id: payload.data.recipientId,
          documentId: payload.data.documentId,
        },
      });

      if (!recipient) {
        return res.status(404).json({ error: "Recipient not found" });
      }
    }

    // Use IP from payload if provided (from original signer), otherwise use request IP
    const ipAddress = payload.data.ipAddress ||
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.socket.remoteAddress ||
      "unknown";
    const userAgent = payload.data.userAgent || req.headers["user-agent"] || null;

    const auditEntry: AuditEntry = {
      event: payload.event,
      timestamp: new Date().toISOString(),
      ipAddress,
      userAgent,
      recipientEmail: payload.data.recipientEmail || null,
      status: payload.data.status,
      details: {
        source: "webhook",
        webhookId: payload.id,
        originalTimestamp: payload.timestamp,
      },
    };

    switch (payload.event) {
      case "signature.recipient_signed":
        await handleRecipientSigned(payload.data, auditEntry);
        break;

      case "signature.document_completed":
        await handleDocumentCompleted(payload.data, auditEntry);
        break;

      case "signature.document_declined":
        await handleDocumentDeclined(payload.data, auditEntry);
        break;

      case "signature.document_viewed":
        await handleDocumentViewed(payload.data, auditEntry);
        break;

      default:
        break;
    }

    return res.status(200).json({ 
      success: true, 
      message: "Webhook processed",
      event: payload.event,
      documentId: payload.data.documentId,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[ESIGN_WEBHOOK] Error processing webhook:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function appendToAuditTrail(documentId: string, entry: AuditEntry) {
  try {
    const doc = await prisma.signatureDocument.findUnique({
      where: { id: documentId },
      select: { auditTrail: true },
    });

    const currentAudit = (doc?.auditTrail as { entries?: AuditEntry[] }) || { entries: [] };
    const entries = currentAudit.entries || [];
    entries.push(entry);

    await prisma.signatureDocument.update({
      where: { id: documentId },
      data: {
        auditTrail: JSON.parse(JSON.stringify({ entries })),
      },
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[AUDIT_TRAIL] Failed to append:", error);
  }
}

async function handleRecipientSigned(
  data: EsignWebhookPayload["data"],
  auditEntry: AuditEntry
) {
  await prisma.$transaction(async (tx) => {
    if (data.recipientId) {
      await tx.signatureRecipient.update({
        where: { id: data.recipientId },
        data: {
          status: "SIGNED",
          signedAt: new Date(),
          ipAddress: auditEntry.ipAddress || null,
          userAgent: auditEntry.userAgent || null,
        },
      });
    }

    const allRecipients = await tx.signatureRecipient.findMany({
      where: { documentId: data.documentId },
    });

    const signersAndApprovers = allRecipients.filter(
      (r: { role: string }) => r.role === "SIGNER" || r.role === "APPROVER"
    );
    const signedCount = signersAndApprovers.filter(
      (r: { status: string }) => r.status === "SIGNED"
    ).length;

    if (signedCount > 0 && signedCount < signersAndApprovers.length) {
      await tx.signatureDocument.update({
        where: { id: data.documentId },
        data: { status: "PARTIALLY_SIGNED" },
      });
    }
  });

  await appendToAuditTrail(data.documentId, {
    ...auditEntry,
    details: {
      ...auditEntry.details,
      recipientName: data.recipientName,
    },
  });

}

async function handleDocumentCompleted(
  data: EsignWebhookPayload["data"],
  auditEntry: AuditEntry
) {
  await prisma.signatureDocument.update({
    where: { id: data.documentId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  await appendToAuditTrail(data.documentId, {
    ...auditEntry,
    details: {
      ...auditEntry.details,
      allRecipients: data.allRecipients,
    },
  });

  if (data.allRecipients && data.allRecipients.length > 0) {
    const completedAt = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const signersList = data.allRecipients
      .filter((r) => r.status === "SIGNED")
      .map((r) => `${r.name} (${r.email})`);

    for (const recipient of data.allRecipients) {
      try {
        await sendEmail({
          to: recipient.email,
          subject: `Completed: ${data.documentTitle}`,
          react: SignatureCompletedEmail({
            recipientName: recipient.name,
            documentTitle: data.documentTitle,
            teamName: data.teamName,
            completedAt,
            signersList,
          }),
        });
      } catch (err) {
        reportError(err as Error);
        console.error(`[ESIGN_WEBHOOK] Failed to send email to ${recipient.email}:`, err);
      }
    }
  }

}

async function handleDocumentDeclined(
  data: EsignWebhookPayload["data"],
  auditEntry: AuditEntry
) {
  await prisma.$transaction(async (tx) => {
    if (data.recipientId) {
      await tx.signatureRecipient.update({
        where: { id: data.recipientId },
        data: {
          status: "DECLINED",
          declinedAt: new Date(),
          ipAddress: auditEntry.ipAddress || null,
          userAgent: auditEntry.userAgent || null,
        },
      });
    }

    await tx.signatureDocument.update({
      where: { id: data.documentId },
      data: {
        status: "DECLINED",
        declinedAt: new Date(),
      },
    });
  });

  await appendToAuditTrail(data.documentId, auditEntry);

}

async function handleDocumentViewed(
  data: EsignWebhookPayload["data"],
  auditEntry: AuditEntry
) {
  if (data.recipientId) {
    await prisma.signatureRecipient.update({
      where: { id: data.recipientId },
      data: {
        status: "VIEWED",
        viewedAt: new Date(),
      },
    });
  }

  await appendToAuditTrail(data.documentId, auditEntry);

}
