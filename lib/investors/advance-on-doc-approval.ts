import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { sendInvestorApprovedEmail } from "@/lib/emails/send-investor-approved";

/**
 * Check if all LP documents for an investor+fund are approved,
 * and if so, advance the investment status from COMMITTED → DOCS_APPROVED.
 *
 * Called after every GP document approval. Fire-and-forget safe.
 *
 * Pipeline stages for Investment.status:
 *   COMMITTED → DOCS_APPROVED → FUNDED
 */
export async function advanceInvestorOnDocApproval({
  investorId,
  fundId,
  reviewerUserId,
  teamId,
}: {
  investorId: string;
  fundId: string;
  reviewerUserId: string;
  teamId: string;
}): Promise<void> {
  try {
    // 1. Get all LP documents for this investor + fund
    const allDocs = await prisma.lPDocument.findMany({
      where: {
        investorId,
        fundId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        documentType: true,
      },
    });

    // No docs = nothing to check
    if (allDocs.length === 0) return;

    // 2. Check if any docs are still pending or need revision
    const hasPending = allDocs.some(
      (doc: any) =>
        doc.status === "UPLOADED_PENDING_REVIEW" ||
        doc.status === "REVISION_REQUESTED",
    );

    // If there are still pending/revision docs, don't advance
    if (hasPending) return;

    // 3. Check if at least one doc is approved (not all rejected)
    const hasApproved = allDocs.some(
      (doc: any) => doc.status === "APPROVED",
    );

    if (!hasApproved) return;

    // 4. Check the investment status — only advance from COMMITTED
    const investment = await prisma.investment.findFirst({
      where: {
        investorId,
        fundId,
        status: "COMMITTED",
      },
      select: { id: true, status: true },
    });

    if (!investment) return; // Already advanced or no investment

    // 5. Advance to DOCS_APPROVED
    await prisma.investment.update({
      where: { id: investment.id },
      data: { status: "DOCS_APPROVED" },
    });

    // 6. Sync fundData.approvalStage + approvalHistory on the Investor model
    // so the GP pipeline UI reflects the auto-advance
    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      select: { onboardingStep: true, fundData: true },
    });

    if (investor) {
      const existingFundData = (investor.fundData as Record<string, unknown>) || {};
      const updateData: Record<string, unknown> = {
        fundData: {
          ...existingFundData,
          approvalStage: "DOCS_APPROVED",
          approvalHistory: [
            ...((existingFundData.approvalHistory as unknown[]) || []),
            {
              from: "COMMITTED",
              to: "DOCS_APPROVED",
              by: `system:doc-approval:${reviewerUserId}`,
              notes: "All LP documents approved by GP",
              at: new Date().toISOString(),
            },
          ],
        },
      };

      if (investor.onboardingStep < 5) {
        updateData.onboardingStep = 5;
      }

      await prisma.investor.update({
        where: { id: investorId },
        data: updateData as any,
      });
    }

    // 7. Audit log
    await logAuditEvent({
      eventType: "ADMIN_ACTION",
      userId: reviewerUserId,
      teamId,
      resourceType: "Investor",
      resourceId: investment.id,
      metadata: {
        action: "Investment auto-advanced to DOCS_APPROVED",
        reason: "All LP documents approved by GP",
        investorId,
        fundId,
        approvedDocCount: allDocs.filter(
          (d: any) => d.status === "APPROVED",
        ).length,
        totalDocCount: allDocs.length,
      },
      ipAddress: null,
      userAgent: null,
    });

    // 8. Fire-and-forget: send investor approved email
    sendInvestorApprovedEmail(investorId, fundId);

    // Investment auto-advanced to DOCS_APPROVED — logged via audit trail
  } catch (error) {
    console.error(
      "[INVESTOR_ADVANCE] Error checking/advancing investor:",
      error,
    );
  }
}
