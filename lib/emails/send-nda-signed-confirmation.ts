import { sendOrgEmail } from "@/lib/resend";
import prisma from "@/lib/prisma";
import NdaSignedConfirmationEmail from "@/components/emails/nda-signed-confirmation";
import { reportError } from "@/lib/error";

/**
 * Notify LP when they accept the NDA for a fund.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function sendNdaSignedConfirmation({
  userId,
  investorId,
  fundId,
}: {
  userId: string;
  investorId: string;
  fundId?: string | null;
}): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user?.email) return;

    let fundName = "your fund";
    let teamId: string | null = null;

    if (fundId) {
      const fund = await prisma.fund.findUnique({
        where: { id: fundId },
        select: { name: true, teamId: true },
      });
      if (fund) {
        fundName = fund.name;
        teamId = fund.teamId;
      }
    }

    // If no fund context, try to resolve from investor's fund
    if (!teamId) {
      const investor = await prisma.investor.findUnique({
        where: { id: investorId },
        select: {
          fundId: true,
          fund: { select: { name: true, teamId: true } },
        },
      });
      if (investor?.fund) {
        fundName = investor.fund.name;
        teamId = investor.fund.teamId;
      }
    }

    if (!teamId) return;

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const portalUrl = `${baseUrl}/lp/dashboard`;

    const investorName = user.name || "Investor";

    await sendOrgEmail({
      teamId,
      to: user.email,
      subject: `NDA signed — ${fundName}`,
      react: NdaSignedConfirmationEmail({
        investorName,
        fundName,
        signedAt: new Date().toLocaleDateString("en-US"),
        portalUrl,
      }),
      test: process.env.NODE_ENV === "development",
    });
  } catch (error) {
    reportError(error as Error);
    console.error(
      "[NDA_SIGNED_EMAIL] Failed to send NDA confirmation:",
      error,
    );
  }
}
