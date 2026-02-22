import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { appRouterRateLimit } from "@/lib/security/rate-limiter";
import type { Role } from "@prisma/client";

/**
 * POST /api/teams/[teamId]/funds/[fundId]/capital-calls/[callId]/responses/[responseId]/confirm
 * GP confirms receipt of an LP's capital call payment.
 * Updates amountPaid, status, and optionally marks the entire call as FUNDED.
 */

const GP_ROLES: Role[] = ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"];

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      teamId: string;
      fundId: string;
      callId: string;
      responseId: string;
    }>;
  },
) {
  const blocked = await appRouterRateLimit(req);
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId, fundId, callId, responseId } = await params;

  try {
    // Verify GP access
    const userTeam = await prisma.userTeam.findFirst({
      where: {
        teamId,
        userId: session.user.id,
        role: { in: GP_ROLES },
        status: "ACTIVE",
      },
    });
    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
    });
    if (!fund) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }

    // Verify call and response belong together
    const call = await prisma.capitalCall.findFirst({
      where: { id: callId, fundId },
    });
    if (!call) {
      return NextResponse.json(
        { error: "Capital call not found" },
        { status: 404 },
      );
    }

    if (call.status !== "SENT" && call.status !== "PARTIALLY_FUNDED") {
      return NextResponse.json(
        {
          error:
            "Capital call must be in SENT or PARTIALLY_FUNDED status to confirm payments",
        },
        { status: 400 },
      );
    }

    const response = await prisma.capitalCallResponse.findFirst({
      where: { id: responseId, capitalCallId: callId },
      include: {
        investor: {
          select: { id: true, entityName: true },
        },
      },
    });
    if (!response) {
      return NextResponse.json(
        { error: "Response not found" },
        { status: 404 },
      );
    }

    if (response.status === "FUNDED") {
      return NextResponse.json(
        { error: "This response is already fully funded" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const { amountPaid, fundReceivedDate, notes } = body;

    if (!amountPaid || amountPaid <= 0) {
      return NextResponse.json(
        { error: "Amount paid must be positive" },
        { status: 400 },
      );
    }

    const currentPaid = response.amountPaid.toNumber();
    const amountDue = response.amountDue.toNumber();
    const newTotalPaid = currentPaid + amountPaid;

    if (newTotalPaid > amountDue * 1.01) {
      // Allow 1% tolerance for rounding
      return NextResponse.json(
        {
          error: `Payment would exceed amount due ($${amountDue.toFixed(2)}). Current paid: $${currentPaid.toFixed(2)}, new payment: $${amountPaid.toFixed(2)}`,
        },
        { status: 400 },
      );
    }

    let parsedReceivedDate: Date | undefined;
    if (fundReceivedDate) {
      parsedReceivedDate = new Date(fundReceivedDate);
      if (isNaN(parsedReceivedDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid fund received date" },
          { status: 400 },
        );
      }
    }

    // Determine new response status
    const newStatus =
      newTotalPaid >= amountDue ? "FUNDED" : "PARTIAL";

    // Update response in a transaction — also check if all responses are funded
    const result = await prisma.$transaction(async (tx) => {
      const updatedResponse = await tx.capitalCallResponse.update({
        where: { id: responseId },
        data: {
          amountPaid: newTotalPaid,
          status: newStatus,
          confirmedBy: session.user.id,
          confirmedAt: new Date(),
          fundReceivedDate: parsedReceivedDate || new Date(),
          notes: notes || null,
        },
        include: {
          investor: {
            select: {
              id: true,
              entityName: true,
              user: { select: { email: true } },
            },
          },
        },
      });

      // Check if all responses for this call are now funded
      const allResponses = await tx.capitalCallResponse.findMany({
        where: { capitalCallId: callId },
      });

      const allFunded = allResponses.every((r) => r.status === "FUNDED");
      const anyFunded = allResponses.some(
        (r) => r.status === "FUNDED" || r.status === "PARTIAL",
      );

      let newCallStatus = call.status;
      if (allFunded) {
        newCallStatus = "FUNDED";
      } else if (anyFunded) {
        newCallStatus = "PARTIALLY_FUNDED";
      }

      let updatedCall = null;
      if (newCallStatus !== call.status) {
        updatedCall = await tx.capitalCall.update({
          where: { id: callId },
          data: {
            status: newCallStatus,
            ...(newCallStatus === "FUNDED" ? { fundedAt: new Date() } : {}),
          },
        });
      }

      return { updatedResponse, updatedCall, newCallStatus };
    });

    // Audit log
    logAuditEvent({
      eventType: "CAPITAL_CALL_UPDATED",
      userId: session.user.id,
      teamId,
      resourceType: "CapitalCallResponse",
      resourceId: responseId,
      metadata: {
        action: "payment_confirmed",
        amountPaid,
        newTotalPaid,
        responseStatus: newStatus,
        callStatus: result.newCallStatus,
        investorId: response.investor?.id,
        investorName: response.investor?.entityName,
      },
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null,
      userAgent: req.headers.get("user-agent"),
    }).catch((e) => reportError(e as Error));

    return NextResponse.json({
      response: {
        ...result.updatedResponse,
        amountDue: result.updatedResponse.amountDue.toNumber(),
        amountPaid: result.updatedResponse.amountPaid.toNumber(),
      },
      callStatus: result.newCallStatus,
      callFullyFunded: result.newCallStatus === "FUNDED",
    });
  } catch (error: unknown) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
