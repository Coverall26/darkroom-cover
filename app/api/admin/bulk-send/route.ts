import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { requireAdminAppRouter } from "@/lib/auth/rbac";
import { sendOrgEmail } from "@/lib/resend";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { nanoid } from "@/lib/utils";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Bulk Send via CSV Upload
//
// POST — Parse CSV rows, validate, and send signature documents to recipients
// GET  — Download a CSV template with expected columns
//
// CSV columns: name, email, signingOrder (optional, default 1)
//
// Request body:
//   { documentId: string, recipients: Array<{ name, email, signingOrder? }> }
// ---------------------------------------------------------------------------

const recipientSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(255),
  signingOrder: z.number().int().min(1).max(100).optional().default(1),
});

const bulkSendSchema = z.object({
  documentId: z.string().min(1),
  recipients: z.array(recipientSchema).min(1).max(500),
});

/**
 * GET /api/admin/bulk-send
 *
 * Download a CSV template with expected columns.
 */
export async function GET() {
  const csvTemplate = [
    "name,email,signingOrder",
    "John Doe,john@example.com,1",
    "Jane Smith,jane@example.com,2",
    "Bob Wilson,bob@example.com,1",
  ].join("\n");

  return new NextResponse(csvTemplate, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="bulk-send-template.csv"',
    },
  });
}

/**
 * POST /api/admin/bulk-send
 *
 * Parse CSV rows, validate, and send signature documents to recipients.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  const { teamId, userId } = auth;

  try {
    const body = await req.json();
    const parsed = bulkSendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsed.error.issues.map((i: { path: (string | number)[]; message: string }) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const { documentId, recipients } = parsed.data;

    // Verify document belongs to this team and is in a sendable state
    const document = await prisma.signatureDocument.findFirst({
      where: {
        id: documentId,
        teamId,
        status: { in: ["DRAFT", "SENT", "VIEWED", "PARTIALLY_SIGNED"] },
      },
      include: {
        team: {
          include: {
            users: {
              where: { role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] } },
              include: { user: true },
              take: 1,
            },
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found or not in sendable state" },
        { status: 404 },
      );
    }

    const senderName =
      document.team?.users?.[0]?.user?.name || "The Team";
    const teamName = document.team?.name || "FundRoom";
    const baseUrl = process.env.NEXTAUTH_URL || "https://app.fundroom.ai";

    // Deduplicate by email (last entry wins)
    const uniqueRecipients = new Map<
      string,
      { name: string; email: string; signingOrder: number }
    >();
    for (const r of recipients) {
      uniqueRecipients.set(r.email.toLowerCase(), {
        ...r,
        email: r.email.toLowerCase(),
      });
    }

    const results: Array<{
      email: string;
      name: string;
      success: boolean;
      error?: string;
      recipientId?: string;
    }> = [];

    let succeeded = 0;
    let failed = 0;

    for (const recipient of uniqueRecipients.values()) {
      try {
        // Check if recipient already exists on this document
        const existing = await prisma.signatureRecipient.findFirst({
          where: {
            documentId,
            email: recipient.email,
          },
        });

        if (existing) {
          results.push({
            email: recipient.email,
            name: recipient.name,
            success: true,
            recipientId: existing.id,
            error: "Already exists on document",
          });
          succeeded++;
          continue;
        }

        // Create signing token and URL
        const signingToken = nanoid(32);
        const signingUrl = `${baseUrl}/view/sign/${signingToken}`;

        // Create recipient record
        const created = await prisma.signatureRecipient.create({
          data: {
            documentId,
            name: recipient.name,
            email: recipient.email,
            role: "SIGNER",
            signingOrder: recipient.signingOrder,
            signingToken,
            signingUrl,
            status: "SENT",
          },
        });

        // Send email (fire-and-forget with error capture)
        sendOrgEmail({
          teamId,
          to: recipient.email,
          subject: document.emailSubject || `Please sign: ${document.title}`,
          react: (
            await import("@/components/emails/signature-request")
          ).default({
            recipientName: recipient.name,
            documentTitle: document.title,
            senderName,
            teamName,
            message: document.emailMessage || undefined,
            signingUrl,
          }),
        }).catch((e) => reportError(e as Error));

        results.push({
          email: recipient.email,
          name: recipient.name,
          success: true,
          recipientId: created.id,
        });
        succeeded++;
      } catch (error) {
        reportError(error as Error);
        results.push({
          email: recipient.email,
          name: recipient.name,
          success: false,
          error: "Failed to add recipient",
        });
        failed++;
      }
    }

    // Update document status to SENT if it was DRAFT
    if (document.status === "DRAFT" && succeeded > 0) {
      await prisma.signatureDocument.update({
        where: { id: documentId },
        data: {
          status: "SENT",
          sentAt: new Date(),
        },
      });
    }

    // Audit log
    logAuditEvent({
      eventType: "BULK_SEND",
      resourceType: "SignatureDocument",
      resourceId: documentId,
      userId,
      teamId,
      metadata: {
        total: uniqueRecipients.size,
        succeeded,
        failed,
        documentTitle: document.title,
      },
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({
      success: true,
      total: uniqueRecipients.size,
      succeeded,
      failed,
      results,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
