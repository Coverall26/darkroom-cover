import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { sendFormDReminderEmail } from "@/lib/emails/send-form-d-reminder";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/form-d-reminders
 *
 * Returns Form D filing reminders for the user's funds.
 */
export async function GET() {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  const now = new Date();

  const fundsWithReminders = await prisma.fund.findMany({
    where: {
      teamId: auth.teamId,
      formDFilingDate: { not: null },
    },
    select: {
      id: true,
      name: true,
      formDFilingDate: true,
      formDAmendmentDue: true,
      formDReminderSent: true,
      stateNoticesRequired: true,
      status: true,
    },
    orderBy: { formDAmendmentDue: "asc" },
  });

  const reminders = fundsWithReminders.map((fund) => {
    const amendmentDue = fund.formDAmendmentDue
      ? new Date(fund.formDAmendmentDue)
      : fund.formDFilingDate
        ? new Date(
            new Date(fund.formDFilingDate).getTime() +
              365 * 24 * 60 * 60 * 1000,
          )
        : null;

    const daysUntilDue = amendmentDue
      ? Math.ceil(
          (amendmentDue.getTime() - now.getTime()) /
            (24 * 60 * 60 * 1000),
        )
      : null;

    const urgency =
      daysUntilDue !== null
        ? daysUntilDue <= 0
          ? "OVERDUE"
          : daysUntilDue <= 7
            ? "CRITICAL"
            : daysUntilDue <= 30
              ? "WARNING"
              : "OK"
        : "UNKNOWN";

    return {
      fundId: fund.id,
      fundName: fund.name,
      formDFilingDate: fund.formDFilingDate,
      amendmentDue,
      daysUntilDue,
      urgency,
      reminderSent: fund.formDReminderSent,
      stateNotices: fund.stateNoticesRequired,
      status: fund.status,
    };
  });

  const upcomingReminders = reminders.filter(
    (r: { daysUntilDue: number | null }) => r.daysUntilDue !== null && r.daysUntilDue <= 30,
  );

  return NextResponse.json({
    reminders,
    upcomingCount: upcomingReminders.length,
    overdueCount: reminders.filter((r: { urgency: string }) => r.urgency === "OVERDUE")
      .length,
  });
}

/**
 * POST /api/admin/form-d-reminders
 *
 * Actions: send_reminder, check_all, update_filing
 * Body: { action, fundId?, formDFilingDate?, formDAmendmentDue? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminAppRouter();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { fundId, action } = body;

  if (
    !action ||
    !["send_reminder", "check_all", "update_filing"].includes(action)
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid action. Must be send_reminder, check_all, or update_filing",
      },
      { status: 400 },
    );
  }

  if (action === "send_reminder" && fundId) {
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      include: {
        team: {
          include: {
            users: {
              where: {
                role: { in: ["ADMIN", "OWNER", "SUPER_ADMIN"] },
              },
              include: { user: true },
            },
          },
        },
      },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Fund not found" },
        { status: 404 },
      );
    }

    const amendmentDue = fund.formDAmendmentDue
      ? new Date(fund.formDAmendmentDue)
      : fund.formDFilingDate
        ? new Date(
            new Date(fund.formDFilingDate).getTime() +
              365 * 24 * 60 * 60 * 1000,
          )
        : null;

    const adminEmails = fund.team.users
      .map((ut: { user: { email: string | null } }) => ut.user.email)
      .filter(Boolean) as string[];

    for (const email of adminEmails) {
      await sendFormDReminderEmail({
        email,
        fundName: fund.name,
        amendmentDueDate: amendmentDue,
        filingDate: fund.formDFilingDate,
      });
    }

    await prisma.fund.update({
      where: { id: fundId },
      data: { formDReminderSent: true },
    });

    return NextResponse.json({
      success: true,
      message: `Reminder sent to ${adminEmails.length} admin(s)`,
    });
  }

  if (action === "check_all") {
    const now = new Date();
    const thirtyDaysFromNow = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    const fundsNeedingReminder = await prisma.fund.findMany({
      where: {
        formDFilingDate: { not: null },
        formDReminderSent: false,
        OR: [
          { formDAmendmentDue: { lte: thirtyDaysFromNow } },
          {
            formDAmendmentDue: null,
            formDFilingDate: {
              lte: new Date(
                now.getTime() - 335 * 24 * 60 * 60 * 1000,
              ),
            },
          },
        ],
      },
      include: {
        team: {
          include: {
            users: {
              where: {
                role: { in: ["ADMIN", "OWNER", "SUPER_ADMIN"] },
              },
              include: { user: true },
            },
          },
        },
      },
    });

    let sentCount = 0;
    for (const fund of fundsNeedingReminder) {
      const amendmentDue = fund.formDAmendmentDue
        ? new Date(fund.formDAmendmentDue)
        : new Date(
            new Date(fund.formDFilingDate!).getTime() +
              365 * 24 * 60 * 60 * 1000,
          );

      const adminEmails = fund.team.users
        .map((ut: { user: { email: string | null } }) => ut.user.email)
        .filter(Boolean) as string[];

      for (const email of adminEmails) {
        await sendFormDReminderEmail({
          email,
          fundName: fund.name,
          amendmentDueDate: amendmentDue,
          filingDate: fund.formDFilingDate,
        });
      }

      await prisma.fund.update({
        where: { id: fund.id },
        data: { formDReminderSent: true },
      });

      sentCount++;
    }

    return NextResponse.json({
      success: true,
      fundsChecked: fundsNeedingReminder.length,
      remindersSent: sentCount,
    });
  }

  if (action === "update_filing" && fundId) {
    const { formDFilingDate, formDAmendmentDue } = body;

    await prisma.fund.update({
      where: { id: fundId },
      data: {
        formDFilingDate: formDFilingDate
          ? new Date(formDFilingDate)
          : undefined,
        formDAmendmentDue: formDAmendmentDue
          ? new Date(formDAmendmentDue)
          : undefined,
        formDReminderSent: false,
      },
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Invalid action or missing required parameters" },
    { status: 400 },
  );
}
