import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { sendInvestorApprovedEmail } from "@/lib/emails/send-investor-approved";
import { sendInvestorChangesRequestedEmail } from "@/lib/emails/send-investor-changes-requested";
import { sendInvestorRejectedEmail } from "@/lib/emails/send-investor-rejected";
import { publishServerEvent } from "@/lib/tracking/server-events";
import { ChangeRequestType } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/investors/[investorId]/review
 *
 * GP Approval Gates API
 *
 * Actions:
 *   - approve: Approve investor profile as-is
 *   - approve-with-changes: Approve but flag fields GP edited (originals in audit log)
 *   - request-changes: Flag specific fields for LP to re-submit
 *   - reject: Reject investor with reason
 */

interface ReviewRequestBody {
  action: "approve" | "approve-with-changes" | "request-changes" | "reject";
  fundId: string;
  teamId: string;
  notes?: string;
  changes?: Array<{
    field: string;
    originalValue: string;
    newValue: string;
  }>;
  requestedChanges?: Array<{
    changeType: string;
    fieldName: string;
    reason: string;
    currentValue?: string;
    requestedValue?: string;
  }>;
  rejectionReason?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ investorId: string }> },
) {
  const { investorId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ReviewRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, fundId, teamId, notes } = body;

  if (!action || !fundId || !teamId) {
    return NextResponse.json(
      { error: "Missing required fields: action, fundId, teamId" },
      { status: 400 },
    );
  }

  try {
    // Verify GP has admin access to this team
    const userTeam = await prisma.userTeam.findFirst({
      where: {
        userId: session.user.id,
        teamId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify fundId belongs to this team — prevents cross-tenant manipulation
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, teamId },
      select: { id: true },
    });

    if (!fund) {
      return NextResponse.json(
        { error: "Fund not found for this team" },
        { status: 403 },
      );
    }

    // Get investor
    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      include: {
        user: { select: { email: true, name: true } },
        investments: { where: { fundId } },
      },
    });

    if (!investor) {
      return NextResponse.json(
        { error: "Investor not found" },
        { status: 404 },
      );
    }

    const ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
    const userAgent = req.headers.get("user-agent") || null;

    switch (action) {
      case "approve": {
        await prisma.investor.update({
          where: { id: investorId },
          data: {
            fundData: {
              ...((investor.fundData as Record<string, unknown>) || {}),
              stage: "APPROVED",
              approvedBy: session.user.id,
              approvedAt: new Date().toISOString(),
            },
          },
        });

        await logAuditEvent({
          eventType: "INVESTOR_APPROVED",
          userId: session.user.id,
          teamId,
          resourceType: "Investor",
          resourceId: investorId,
          metadata: { action: "approve", fundId, notes },
          ipAddress,
          userAgent,
        });

        sendInvestorApprovedEmail(investorId, fundId).catch((err) => {
          reportError(err as Error);
          console.error(
            "[INVESTOR_REVIEW] Failed to send approved email:",
            err,
          );
        });

        publishServerEvent("funnel_investor_approved", {
          userId: session.user.id,
          investorId,
          teamId,
        }).catch((e) => reportError(e as Error));

        return NextResponse.json({
          message: "Investor approved",
          stage: "APPROVED",
        });
      }

      case "approve-with-changes": {
        const changes = body.changes || [];

        if (changes.length === 0) {
          return NextResponse.json(
            { error: "No changes provided" },
            { status: 400 },
          );
        }

        const updateData: Record<string, unknown> = {};
        for (const change of changes) {
          updateData[change.field] = change.newValue;
        }

        await prisma.investor.update({
          where: { id: investorId },
          data: {
            ...updateData,
            fundData: {
              ...((investor.fundData as Record<string, unknown>) || {}),
              stage: "APPROVED",
              approvedBy: session.user.id,
              approvedAt: new Date().toISOString(),
              approvedWithChanges: true,
            },
          },
        });

        await logAuditEvent({
          eventType: "INVESTOR_APPROVED_WITH_CHANGES",
          userId: session.user.id,
          teamId,
          resourceType: "Investor",
          resourceId: investorId,
          metadata: {
            action: "approve-with-changes",
            fundId,
            notes,
            originalValues: changes.map((c) => ({
              field: c.field,
              original: c.originalValue,
              new: c.newValue,
            })),
          },
          ipAddress,
          userAgent,
        });

        sendInvestorApprovedEmail(investorId, fundId).catch((err) => {
          reportError(err as Error);
          console.error(
            "[INVESTOR_REVIEW] Failed to send approved email:",
            err,
          );
        });

        return NextResponse.json({
          message: "Investor approved with changes",
          stage: "APPROVED",
          changesApplied: changes.length,
        });
      }

      case "request-changes": {
        const requestedChanges = body.requestedChanges || [];

        if (requestedChanges.length === 0) {
          return NextResponse.json(
            { error: "No change requests provided" },
            { status: 400 },
          );
        }

        const changeRequests = await Promise.all(
          requestedChanges.map((change) =>
            prisma.profileChangeRequest.create({
              data: {
                investorId,
                fundId,
                requestedBy: session.user.id,
                status: "PENDING",
                changeType: change.changeType as ChangeRequestType,
                fieldName: change.fieldName,
                reason: change.reason,
                currentValue: change.currentValue,
                requestedValue: change.requestedValue,
                gpNote: notes,
              },
            }),
          ),
        );

        await prisma.investor.update({
          where: { id: investorId },
          data: {
            fundData: {
              ...((investor.fundData as Record<string, unknown>) || {}),
              stage: "UNDER_REVIEW",
              changesRequested: true,
              changesRequestedBy: session.user.id,
              changesRequestedAt: new Date().toISOString(),
            },
          },
        });

        await logAuditEvent({
          eventType: "INVESTOR_CHANGES_REQUESTED",
          userId: session.user.id,
          teamId,
          resourceType: "Investor",
          resourceId: investorId,
          metadata: {
            action: "request-changes",
            fundId,
            notes,
            changeRequestIds: changeRequests.map((cr) => cr.id),
            fieldsRequested: requestedChanges.map((c) => c.fieldName),
          },
          ipAddress,
          userAgent,
        });

        sendInvestorChangesRequestedEmail({
          investorId,
          fundId,
          flaggedFields: requestedChanges.map((c) => ({
            fieldName: c.fieldName,
            reason: c.reason,
          })),
          generalNotes: notes,
        }).catch((err) => {
          reportError(err as Error);
          console.error(
            "[INVESTOR_REVIEW] Failed to send changes-requested email:",
            err,
          );
        });

        return NextResponse.json({
          message: "Changes requested from investor",
          stage: "UNDER_REVIEW",
          changeRequestCount: changeRequests.length,
        });
      }

      case "reject": {
        const rejectionReason =
          body.rejectionReason ||
          notes ||
          "Did not meet fund requirements";

        await prisma.investor.update({
          where: { id: investorId },
          data: {
            fundData: {
              ...((investor.fundData as Record<string, unknown>) || {}),
              stage: "REJECTED",
              rejectedBy: session.user.id,
              rejectedAt: new Date().toISOString(),
              rejectionReason,
            },
          },
        });

        await logAuditEvent({
          eventType: "INVESTOR_REJECTED",
          userId: session.user.id,
          teamId,
          resourceType: "Investor",
          resourceId: investorId,
          metadata: {
            action: "reject",
            fundId,
            rejectionReason,
            notes,
          },
          ipAddress,
          userAgent,
        });

        sendInvestorRejectedEmail(investorId, fundId, rejectionReason).catch(
          (err) => {
            reportError(err as Error);
            console.error(
              "[INVESTOR_REVIEW] Failed to send rejected email:",
              err,
            );
          },
        );

        return NextResponse.json({
          message: "Investor rejected",
          stage: "REJECTED",
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400 },
        );
    }
  } catch (error) {
    reportError(error as Error);
    console.error("[INVESTOR_REVIEW] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
