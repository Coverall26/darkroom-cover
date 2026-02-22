import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import { sendOrgEmail } from "@/lib/resend";
import { createElement } from "react";
import type { Role } from "@prisma/client";

/**
 * POST /api/teams/[teamId]/funds/[fundId]/capital-calls/[callId]/send
 * Send capital call notices to all investors. Transitions status DRAFT → SENT.
 */

const GP_ROLES: Role[] = ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"];

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ teamId: string; fundId: string; callId: string }>;
  },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId, fundId, callId } = await params;

  try {
    // Verify GP access
    const userTeam = await prisma.userTeam.findFirst({
      where: { teamId, userId: session.user.id, role: { in: GP_ROLES }, status: "ACTIVE" },
    });
    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      include: {
        team: {
          include: {
            organization: {
              select: { name: true },
            },
          },
        },
      },
    });
    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    const call = await prisma.capitalCall.findFirst({
      where: { id: callId, fundId },
      include: {
        responses: {
          where: { amountDue: { gt: 0 } },
          include: {
            investor: {
              select: {
                id: true,
                entityName: true,
                user: { select: { email: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!call) {
      return NextResponse.json(
        { error: "Capital call not found" },
        { status: 404 },
      );
    }

    if (call.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Only DRAFT capital calls can be sent" },
        { status: 400 },
      );
    }

    // Transition to SENT
    const now = new Date();
    const updated = await prisma.capitalCall.update({
      where: { id: callId },
      data: {
        status: "SENT",
        sentAt: now,
        noticeDate: now,
      },
    });

    // Send email notifications to investors (fire-and-forget)
    const orgName = fund.team?.organization?.name || "FundRoom";
    const fundName = fund.name || "Fund";

    for (const response of call.responses) {
      const investorEmail = response.investor?.user?.email;
      if (!investorEmail) continue;

      const investorName =
        response.investor?.entityName ||
        response.investor?.user?.name ||
        "Investor";
      const amountDue = response.amountDue.toNumber();
      const formattedAmount = `$${amountDue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
      const formattedDate = call.dueDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const cellStyle = { padding: "8px", border: "1px solid #E5E7EB" };
      const labelStyle = { ...cellStyle, fontWeight: 600 };

      const emailElement = createElement(
        "div",
        { style: { fontFamily: "Inter, sans-serif", maxWidth: "600px", margin: "0 auto" } },
        createElement("h2", { style: { color: "#0A1628" } }, "Capital Call Notice"),
        createElement("p", null, `Dear ${investorName},`),
        createElement(
          "p",
          null,
          "A capital call has been issued for ",
          createElement("strong", null, fundName),
          ".",
        ),
        createElement(
          "table",
          { style: { borderCollapse: "collapse", width: "100%", margin: "16px 0" } },
          createElement("tbody", null,
            createElement("tr", null,
              createElement("td", { style: labelStyle }, "Call #"),
              createElement("td", { style: cellStyle }, String(call.callNumber)),
            ),
            createElement("tr", null,
              createElement("td", { style: labelStyle }, "Amount Due"),
              createElement("td", { style: cellStyle }, formattedAmount),
            ),
            createElement("tr", null,
              createElement("td", { style: labelStyle }, "Due Date"),
              createElement("td", { style: cellStyle }, formattedDate),
            ),
            ...(call.purpose
              ? [createElement("tr", null,
                  createElement("td", { style: labelStyle }, "Purpose"),
                  createElement("td", { style: cellStyle }, call.purpose),
                )]
              : []),
          ),
        ),
        createElement("p", null, "Please log in to your LP portal to view wire instructions and submit proof of payment."),
        createElement("p", { style: { color: "#6B7280", fontSize: "14px" } }, `— ${orgName}`),
      );

      sendOrgEmail({
        teamId,
        to: investorEmail,
        subject: `Capital Call Notice — ${fundName}`,
        react: emailElement,
      }).catch((e) => reportError(e as Error));
    }

    // Audit log
    logAuditEvent({
      eventType: "CAPITAL_CALL_SENT",
      userId: session.user.id,
      teamId,
      resourceType: "CapitalCall",
      resourceId: callId,
      metadata: {
        callNumber: call.callNumber,
        recipientCount: call.responses.length,
        totalAmount: call.amount.toNumber(),
      },
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
      userAgent: req.headers.get("user-agent"),
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({
      ...updated,
      amount: updated.amount.toNumber(),
      proRataPercentage: updated.proRataPercentage?.toNumber() ?? null,
      noticesSent: call.responses.length,
    });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
