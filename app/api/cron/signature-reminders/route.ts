import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { receiver, limiter } from "@/lib/cron";
import { log } from "@/lib/utils";
import { reportError } from "@/lib/error";
import { sendSignatureReminderEmail } from "@/lib/emails/send-signature-reminder";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ---------------------------------------------------------------------------
// Signature Reminder Cron Job
//
// Runs daily via QStash / Vercel Cron. Sends reminder emails to recipients
// who have not signed their documents after a configurable interval.
//
// Schedule: Once daily (recommended: 0 9 * * *)
//
// Configuration (env vars):
//   SIGNATURE_REMINDER_FIRST_DAYS  — Days before first reminder (default: 3)
//   SIGNATURE_REMINDER_REPEAT_DAYS — Days between subsequent reminders (default: 3)
//   SIGNATURE_REMINDER_MAX         — Maximum reminders per recipient (default: 5)
// ---------------------------------------------------------------------------

const FIRST_REMINDER_DAYS = parseInt(
  process.env.SIGNATURE_REMINDER_FIRST_DAYS || "3",
);
const REPEAT_REMINDER_DAYS = parseInt(
  process.env.SIGNATURE_REMINDER_REPEAT_DAYS || "3",
);
const MAX_REMINDERS = parseInt(process.env.SIGNATURE_REMINDER_MAX || "5");

/**
 * POST handler — triggered by QStash cron schedule.
 * Finds pending/sent/viewed recipients whose documents are SENT/VIEWED/PARTIALLY_SIGNED
 * and sends reminder emails if enough time has elapsed.
 */
export async function POST(req: Request) {
  // Verify QStash signature in production
  if (process.env.VERCEL === "1") {
    if (!receiver) {
      return new Response("Receiver not configured", { status: 500 });
    }
    const body = await req.text();
    try {
      const isValid = await receiver.verify({
        signature: req.headers.get("Upstash-Signature") || "",
        body,
      });
      if (!isValid) {
        return new Response("Unauthorized", { status: 401 });
      }
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const result = await processSignatureReminders();
    return NextResponse.json(result);
  } catch (error) {
    reportError(error as Error);
    log({
      message: `Signature reminder cron failed: ${error}`,
      type: "cron",
      mention: true,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET handler — status check for monitoring dashboards.
 */
export async function GET() {
  const now = new Date();
  const pendingCount = await prisma.signatureRecipient.count({
    where: {
      status: { in: ["PENDING", "SENT", "VIEWED"] },
      role: "SIGNER",
      document: {
        status: { in: ["SENT", "VIEWED", "PARTIALLY_SIGNED"] },
      },
    },
  });

  return NextResponse.json({
    status: "Signature reminder cron active",
    config: {
      firstReminderDays: FIRST_REMINDER_DAYS,
      repeatReminderDays: REPEAT_REMINDER_DAYS,
      maxReminders: MAX_REMINDERS,
    },
    pendingRecipients: pendingCount,
    nextCheckDescription: `Recipients pending > ${FIRST_REMINDER_DAYS} days get first reminder, then every ${REPEAT_REMINDER_DAYS} days up to ${MAX_REMINDERS} total`,
    timestamp: now.toISOString(),
  });
}

/**
 * Core reminder processing logic — extracted for reuse by admin manual trigger.
 */
export async function processSignatureReminders(): Promise<{
  success: boolean;
  recipientsChecked: number;
  remindersSent: number;
  errors: number;
  skipped: number;
}> {
  const now = new Date();

  // Find all signers who haven't signed yet, on active documents
  const pendingRecipients = await prisma.signatureRecipient.findMany({
    where: {
      status: { in: ["PENDING", "SENT", "VIEWED"] },
      role: "SIGNER",
      reminderCount: { lt: MAX_REMINDERS },
      document: {
        status: { in: ["SENT", "VIEWED", "PARTIALLY_SIGNED"] },
      },
    },
    include: {
      document: {
        include: {
          team: {
            include: {
              users: {
                where: {
                  role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
                },
                include: { user: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  let remindersSent = 0;
  let errors = 0;
  let skipped = 0;

  for (const recipient of pendingRecipients) {
    try {
      // Determine if it's time to send a reminder
      const sentAt = recipient.document.sentAt;
      if (!sentAt) {
        skipped++;
        continue;
      }

      const daysSinceSent = Math.floor(
        (now.getTime() - sentAt.getTime()) / (24 * 60 * 60 * 1000),
      );

      // First reminder: after FIRST_REMINDER_DAYS since document was sent
      // Subsequent: after REPEAT_REMINDER_DAYS since last reminder
      let shouldRemind = false;

      if (recipient.reminderCount === 0) {
        // First reminder
        shouldRemind = daysSinceSent >= FIRST_REMINDER_DAYS;
      } else if (recipient.lastReminderSentAt) {
        // Subsequent reminders
        const daysSinceLastReminder = Math.floor(
          (now.getTime() - recipient.lastReminderSentAt.getTime()) /
            (24 * 60 * 60 * 1000),
        );
        shouldRemind = daysSinceLastReminder >= REPEAT_REMINDER_DAYS;
      }

      if (!shouldRemind) {
        skipped++;
        continue;
      }

      // Skip if document is expired
      if (
        recipient.document.expirationDate &&
        recipient.document.expirationDate < now
      ) {
        skipped++;
        continue;
      }

      // Resolve sender name from team admins
      const teamAdmin = recipient.document.team?.users?.[0]?.user;
      const senderName = teamAdmin?.name || "The Team";
      const teamName = recipient.document.team?.name || "FundRoom";
      const teamId = recipient.document.teamId;

      // Format expiration date if present
      const expirationDate = recipient.document.expirationDate
        ? recipient.document.expirationDate.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : null;

      // Send via Bottleneck limiter to respect Resend rate limits
      await limiter.schedule(async () => {
        const result = await sendSignatureReminderEmail({
          email: recipient.email,
          recipientName: recipient.name,
          documentTitle: recipient.document.title,
          senderName,
          teamName,
          teamId,
          signingUrl:
            recipient.signingUrl ||
            `${process.env.NEXTAUTH_URL || "https://app.fundroom.ai"}/view/sign/${recipient.signingToken}`,
          daysWaiting: daysSinceSent,
          expirationDate,
        });

        if (result.success) {
          // Update recipient with reminder tracking
          await prisma.signatureRecipient.update({
            where: { id: recipient.id },
            data: {
              lastReminderSentAt: now,
              reminderCount: { increment: 1 },
            },
          });
          remindersSent++;
        } else {
          errors++;
        }
      });
    } catch (error) {
      reportError(error as Error);
      errors++;
    }
  }

  log({
    message: `Signature reminders: ${remindersSent} sent, ${skipped} skipped, ${errors} errors (${pendingRecipients.length} checked)`,
    type: "cron",
    mention: errors > 0,
  });

  return {
    success: true,
    recipientsChecked: pendingRecipients.length,
    remindersSent,
    errors,
    skipped,
  };
}
