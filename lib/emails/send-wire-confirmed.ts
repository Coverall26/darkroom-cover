import { sendOrgEmail } from "@/lib/resend";
import prisma from "@/lib/prisma";
import WireConfirmedEmail from "@/components/emails/wire-confirmed";

/**
 * Notify LP when GP confirms receipt of wire transfer funds.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function sendWireConfirmedNotification({
  transactionId,
  amountReceived,
  fundsReceivedDate,
  bankReference,
  confirmationNotes,
}: {
  transactionId: string;
  amountReceived: string;
  fundsReceivedDate: string;
  bankReference?: string;
  confirmationNotes?: string;
}): Promise<void> {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        investor: {
          select: {
            entityName: true,
            fundId: true,
            user: { select: { email: true, name: true } },
          },
        },
      },
    });

    if (!transaction?.investor?.user?.email) return;

    // Look up fund name and teamId via the transaction's fundId
    let fundName = "your fund";
    let teamId: string | null = null;

    if (transaction.fundId) {
      const fund = await prisma.fund.findUnique({
        where: { id: transaction.fundId },
        select: { name: true, teamId: true },
      });
      if (fund) {
        fundName = fund.name;
        teamId = fund.teamId;
      }
    }

    if (!teamId) return;

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const portalUrl = `${baseUrl}/lp/investments`;

    const investorName =
      transaction.investor.user.name ??
      transaction.investor.entityName ??
      "Investor";

    await sendOrgEmail({
      teamId,
      to: transaction.investor.user.email,
      subject: `Funds received — ${fundName}`,
      react: WireConfirmedEmail({
        fundName,
        investorName,
        amountReceived,
        fundsReceivedDate,
        bankReference,
        confirmationNotes,
        portalUrl,
      }),
      test: process.env.NODE_ENV === "development",
    });
  } catch (error) {
    console.error(
      "[WIRE_CONFIRMED_EMAIL] Failed to send wire confirmed notification:",
      error,
    );
  }
}
