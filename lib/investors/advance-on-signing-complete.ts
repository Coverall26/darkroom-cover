import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { sendInvestorApprovedEmail } from "@/lib/emails/send-investor-approved";

/**
 * After an LP signs all required signature documents for a fund,
 * advance their Investment status from COMMITTED → DOCS_APPROVED.
 *
 * This is the e-signature equivalent of `advanceInvestorOnDocApproval`
 * (which handles manual LP document uploads via LPDocument model).
 *
 * Called fire-and-forget from /api/sign/[token].ts after document completion.
 *
 * Logic:
 * 1. Find the investor by email
 * 2. Find their fund (from the completed SignatureDocument.fundId or investor.fundId)
 * 3. Find all required SignatureDocuments for that fund
 * 4. Check if all are COMPLETED for this investor (recipient status = SIGNED)
 * 5. If yes, advance Investment.status COMMITTED → DOCS_APPROVED
 */
export async function advanceInvestorOnSigningComplete({
  investorEmail,
  documentId,
}: {
  investorEmail: string;
  documentId: string;
}): Promise<void> {
  try {
    // 1. Get the completed document's fund info
    const completedDoc = await prisma.signatureDocument.findUnique({
      where: { id: documentId },
      select: {
        fundId: true,
        teamId: true,
        requiredForOnboarding: true,
      },
    });

    if (!completedDoc) return;

    // 2. Find investor by email
    const user = await prisma.user.findUnique({
      where: { email: investorEmail },
      select: { id: true },
    });
    if (!user) return;

    const investor = await prisma.investor.findUnique({
      where: { userId: user.id },
      select: { id: true, fundId: true },
    });
    if (!investor) return;

    // Determine fund — use document's fundId, fall back to investor's fundId
    const fundId = completedDoc.fundId || investor.fundId;
    if (!fundId) return;

    // 3. Find all required signature documents for this fund
    const requiredDocs = await prisma.signatureDocument.findMany({
      where: {
        fundId,
        requiredForOnboarding: true,
        status: { not: "VOIDED" },
      },
      select: {
        id: true,
        status: true,
        recipients: {
          where: { email: investorEmail, role: "SIGNER" },
          select: { status: true },
        },
      },
    });

    // If no required docs exist, nothing to check
    if (requiredDocs.length === 0) return;

    // 4. Check if all required docs have this investor as a SIGNED recipient
    const allSigned = requiredDocs.every((doc) => {
      // The investor must be a recipient and must have signed
      const recipientForDoc = doc.recipients[0];
      return recipientForDoc?.status === "SIGNED";
    });

    if (!allSigned) return;

    // 5. Check investment status — only advance from COMMITTED
    const investment = await prisma.investment.findFirst({
      where: {
        investorId: investor.id,
        fundId,
        status: "COMMITTED",
      },
      select: { id: true },
    });

    if (!investment) return; // Already advanced or no investment at COMMITTED

    // 6. Advance to DOCS_APPROVED
    await prisma.investment.update({
      where: { id: investment.id },
      data: { status: "DOCS_APPROVED" },
    });

    // 7. Sync fundData.approvalStage + approvalHistory on the Investor model
    // so the GP pipeline UI reflects the auto-advance
    const investorRecord = await prisma.investor.findUnique({
      where: { id: investor.id },
      select: { onboardingStep: true, fundData: true },
    });

    if (investorRecord) {
      const existingFundData = (investorRecord.fundData as Record<string, unknown>) || {};
      const updateData: Record<string, unknown> = {
        fundData: {
          ...existingFundData,
          approvalStage: "DOCS_APPROVED",
          approvalHistory: [
            ...((existingFundData.approvalHistory as unknown[]) || []),
            {
              from: "COMMITTED",
              to: "DOCS_APPROVED",
              by: "system:e-signature",
              notes: "All required signature documents completed",
              at: new Date().toISOString(),
            },
          ],
        },
      };

      if (investorRecord.onboardingStep < 5) {
        updateData.onboardingStep = 5;
      }

      await prisma.investor.update({
        where: { id: investor.id },
        data: updateData as any,
      });
    }

    // 8. Audit log
    await logAuditEvent({
      eventType: "ADMIN_ACTION",
      userId: user.id,
      teamId: completedDoc.teamId,
      resourceType: "Investment",
      resourceId: investment.id,
      metadata: {
        action: "Investment auto-advanced to DOCS_APPROVED via e-signature",
        reason: "All required signature documents completed",
        investorId: investor.id,
        fundId,
        completedDocCount: requiredDocs.length,
      },
      ipAddress: null,
      userAgent: null,
    });

    // 9. Fire-and-forget: send investor approved email
    sendInvestorApprovedEmail(investor.id, fundId);

    // Investment auto-advanced to DOCS_APPROVED via e-signature — logged via audit trail
  } catch (error) {
    console.error(
      "[INVESTOR_ADVANCE] Error checking/advancing investor on signing complete:",
      error,
    );
  }
}
