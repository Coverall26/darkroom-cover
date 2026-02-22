import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { requireAdminAppRouter } from "@/lib/auth/rbac";
import { processSignatureReminders } from "@/app/api/cron/signature-reminders/route";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/signature-reminders
 *
 * View pending signature recipients and reminder status.
 */
export async function GET() {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  const { teamId } = auth;

  try {
    const pendingRecipients = await prisma.signatureRecipient.findMany({
      where: {
        status: { in: ["PENDING", "SENT", "VIEWED"] },
        role: "SIGNER",
        document: {
          teamId,
          status: { in: ["SENT", "VIEWED", "PARTIALLY_SIGNED"] },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        reminderCount: true,
        lastReminderSentAt: true,
        createdAt: true,
        document: {
          select: {
            id: true,
            title: true,
            sentAt: true,
            expirationDate: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const now = new Date();
    const items = pendingRecipients.map((r: {
      id: string;
      name: string;
      email: string;
      status: string;
      reminderCount: number;
      lastReminderSentAt: Date | null;
      createdAt: Date;
      document: {
        id: string;
        title: string;
        sentAt: Date | null;
        expirationDate: Date | null;
        status: string;
      };
    }) => {
      const daysSinceSent = r.document.sentAt
        ? Math.floor(
            (now.getTime() - r.document.sentAt.getTime()) /
              (24 * 60 * 60 * 1000),
          )
        : 0;

      return {
        recipientId: r.id,
        recipientName: r.name,
        recipientEmail: r.email,
        recipientStatus: r.status,
        documentId: r.document.id,
        documentTitle: r.document.title,
        documentStatus: r.document.status,
        daysSinceSent,
        reminderCount: r.reminderCount,
        lastReminderSentAt: r.lastReminderSentAt,
        expirationDate: r.document.expirationDate,
      };
    });

    return NextResponse.json({
      success: true,
      total: items.length,
      items,
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/signature-reminders
 *
 * Manually trigger reminder processing (same logic as cron).
 */
export async function POST() {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await processSignatureReminders();
    return NextResponse.json(result);
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
