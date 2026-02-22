import { sendOrgEmail } from "@/lib/resend";
import prisma from "@/lib/prisma";
import LpWireProofConfirmationEmail from "@/components/emails/lp-wire-proof-confirmation";
import { reportError } from "@/lib/error";

/**
 * Notify LP when their wire proof upload is received.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function sendLpWireProofConfirmation({
  investmentId,
  fileName,
  amountSent,
}: {
  investmentId: string;
  fileName: string;
  amountSent?: number | null;
}): Promise<void> {
  try {
    const investment = await prisma.investment.findUnique({
      where: { id: investmentId },
      select: {
        fundId: true,
        investorId: true,
        fund: { select: { name: true, teamId: true } },
        investor: {
          select: {
            entityName: true,
            user: { select: { email: true, name: true } },
          },
        },
      },
    });

    if (!investment?.investor?.user?.email) return;
    if (!investment.fund) return;

    const investorName =
      investment.investor.user.name ||
      investment.investor.entityName ||
      "Investor";

    const formatCurrency = (val: number) =>
      `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const portalUrl = `${baseUrl}/lp/dashboard`;

    await sendOrgEmail({
      teamId: investment.fund.teamId,
      to: investment.investor.user.email,
      subject: `Wire proof received — ${investment.fund.name}`,
      react: LpWireProofConfirmationEmail({
        investorName,
        fundName: investment.fund.name,
        fileName,
        amountSent: amountSent ? formatCurrency(amountSent) : null,
        submittedAt: new Date().toLocaleDateString("en-US"),
        portalUrl,
      }),
      test: process.env.NODE_ENV === "development",
    });
  } catch (error) {
    reportError(error as Error);
    console.error(
      "[LP_WIRE_PROOF_EMAIL] Failed to send wire proof confirmation:",
      error,
    );
  }
}
