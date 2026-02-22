import { sendOrgEmail } from "@/lib/resend";
import prisma from "@/lib/prisma";
import LpCommitmentConfirmationEmail from "@/components/emails/lp-commitment-confirmation";
import { reportError } from "@/lib/error";

/**
 * Notify LP when their investment commitment is received.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function sendLpCommitmentConfirmation({
  fundId,
  investorId,
  commitmentAmount,
  units,
}: {
  fundId: string;
  investorId: string;
  commitmentAmount: number;
  units?: number | null;
}): Promise<void> {
  try {
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: { name: true, teamId: true },
    });

    if (!fund) return;

    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      select: {
        entityName: true,
        user: { select: { email: true, name: true } },
      },
    });

    if (!investor?.user?.email) return;

    const investorName =
      investor.user.name || investor.entityName || "Investor";

    const formatCurrency = (val: number) =>
      `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const portalUrl = `${baseUrl}/lp/dashboard`;

    await sendOrgEmail({
      teamId: fund.teamId,
      to: investor.user.email,
      subject: `Commitment received — ${formatCurrency(commitmentAmount)} — ${fund.name}`,
      react: LpCommitmentConfirmationEmail({
        investorName,
        fundName: fund.name,
        commitmentAmount: formatCurrency(commitmentAmount),
        units: units || null,
        commitDate: new Date().toLocaleDateString("en-US"),
        portalUrl,
      }),
      test: process.env.NODE_ENV === "development",
    });
  } catch (error) {
    reportError(error as Error);
    console.error(
      "[LP_COMMITMENT_EMAIL] Failed to send commitment confirmation:",
      error,
    );
  }
}
