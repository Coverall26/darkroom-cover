import { sendEmail, sendOrgEmail } from "@/lib/resend";
import prisma from "@/lib/prisma";
import InvestorApprovedEmail from "@/components/emails/investor-approved";
import WireInstructionsEmail from "@/components/emails/wire-instructions";

/**
 * Send an "Approved" notification email to the investor.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 *
 * Also sends wire instructions email when the fund has wire details configured.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function sendInvestorApprovedEmail(
  investorId: string,
  fundId: string,
): Promise<void> {
  try {
    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      select: {
        entityName: true,
        user: { select: { name: true, email: true } },
      },
    });

    if (!investor?.user?.email) {
      console.warn(
        "[INVESTOR_EMAIL] No email found for approved notification:",
        investorId,
      );
      return;
    }

    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: {
        name: true,
        teamId: true,
        team: { select: { name: true } },
      },
    });

    const investorName =
      investor.entityName || investor.user.name || "Investor";
    const fundName = fund?.name ?? "the fund";
    const gpFirmName = fund?.team?.name ?? "the fund manager";
    const teamId = fund?.teamId;
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const portalUrl = `${baseUrl}/lp/dashboard`;

    // 1. Send approval notification (org-branded when team available)
    const approvalEmail = {
      to: investor.user.email,
      subject: `Your investment in ${fundName} has been approved`,
      react: InvestorApprovedEmail({
        investorName,
        fundName,
        gpFirmName,
        nextSteps:
          "Please proceed to your investor portal to review wire transfer instructions and complete your investment.",
        portalUrl,
      }),
      test: process.env.NODE_ENV === "development",
    };

    if (teamId) {
      await sendOrgEmail({ teamId, ...approvalEmail });
    } else {
      await sendEmail(approvalEmail);
    }

    // 2. If wire instructions are configured, send them too
    await sendWireInstructionsIfAvailable(investor.user.email, investorName, fundId);
  } catch (error) {
    console.error(
      "[INVESTOR_EMAIL] Failed to send approved notification:",
      error,
    );
  }
}

/**
 * Send wire transfer instructions email if the fund has them configured.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 * Called automatically after approval, but can also be triggered manually.
 */
export async function sendWireInstructionsIfAvailable(
  email: string,
  investorName: string,
  fundId: string,
  commitmentAmount?: number,
): Promise<void> {
  try {
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: {
        name: true,
        teamId: true,
        wireInstructions: true,
      },
    });

    if (!fund) return;

    const wireInstructions = fund.wireInstructions as
      | Record<string, string>
      | null;

    // Only send if wire instructions are configured
    if (
      !wireInstructions?.bankName ||
      !wireInstructions?.accountNumber ||
      !wireInstructions?.routingNumber
    ) {
      return;
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const portalUrl = `${baseUrl}/lp/wire`;

    const formatCurrency = (val: number | undefined) => {
      if (!val) return "Per your commitment";
      return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const wireEmail = {
      to: email,
      subject: `Wire instructions for your ${fund.name} investment`,
      react: WireInstructionsEmail({
        investorName,
        fundName: fund.name,
        commitmentAmount: formatCurrency(commitmentAmount),
        bankName: wireInstructions.bankName,
        accountName: wireInstructions.beneficiaryName || fund.name,
        routingNumber: wireInstructions.routingNumber,
        accountNumber: wireInstructions.accountNumber,
        reference: wireInstructions.reference || `Investment — ${investorName}`,
        notes: wireInstructions.notes || undefined,
        portalUrl,
      }),
      test: process.env.NODE_ENV === "development",
    };

    if (fund.teamId) {
      await sendOrgEmail({ teamId: fund.teamId, ...wireEmail });
    } else {
      await sendEmail(wireEmail);
    }
  } catch (error) {
    console.error(
      "[INVESTOR_EMAIL] Failed to send wire instructions email:",
      error,
    );
  }
}
