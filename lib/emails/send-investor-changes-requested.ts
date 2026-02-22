import { sendOrgEmail } from "@/lib/resend";
import prisma from "@/lib/prisma";
import InvestorChangesRequestedEmail from "@/components/emails/investor-changes-requested";

/**
 * Send a "Changes Requested" notification email to the investor.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 *
 * Called when GP requests changes to an investor's submission.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function sendInvestorChangesRequestedEmail({
  investorId,
  fundId,
  flaggedFields,
  generalNotes,
}: {
  investorId: string;
  fundId: string;
  flaggedFields: Array<{ fieldName: string; reason: string }>;
  generalNotes?: string;
}): Promise<void> {
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
        "[INVESTOR_EMAIL] No email found for changes-requested notification:",
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
    const teamId = fund?.teamId || "";
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const portalUrl = `${baseUrl}/lp/dashboard`;

    await sendOrgEmail({
      teamId,
      to: investor.user.email,
      subject: `Changes requested for your ${fundName} submission`,
      react: InvestorChangesRequestedEmail({
        investorName,
        fundName,
        gpFirmName,
        flaggedFields,
        generalNotes,
        portalUrl,
      }),
      test: process.env.NODE_ENV === "development",
    });

  } catch (error) {
    console.error(
      "[INVESTOR_EMAIL] Failed to send changes-requested notification:",
      error,
    );
  }
}
