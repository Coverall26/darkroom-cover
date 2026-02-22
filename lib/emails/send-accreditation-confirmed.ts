import { sendOrgEmail } from "@/lib/resend";
import prisma from "@/lib/prisma";
import AccreditationConfirmedEmail from "@/components/emails/accreditation-confirmed";
import { reportError } from "@/lib/error";

/**
 * Notify LP when their accreditation status is confirmed.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function sendAccreditationConfirmedEmail({
  userId,
  investorId,
  accreditationType,
}: {
  userId: string;
  investorId: string;
  accreditationType: string;
}): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (!user?.email) return;

    // Resolve teamId from investor's fund
    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      select: {
        fundId: true,
        fund: { select: { teamId: true } },
      },
    });

    const teamId = investor?.fund?.teamId;
    if (!teamId) return;

    const investorName = user.name || "Investor";

    await sendOrgEmail({
      teamId,
      to: user.email,
      subject: "Accreditation confirmed — FundRoom",
      react: AccreditationConfirmedEmail({
        investorName,
        email: user.email,
        accreditationType,
        completedAt: new Date().toISOString(),
      }),
      test: process.env.NODE_ENV === "development",
    });
  } catch (error) {
    reportError(error as Error);
    console.error(
      "[ACCREDITATION_EMAIL] Failed to send accreditation confirmation:",
      error,
    );
  }
}
