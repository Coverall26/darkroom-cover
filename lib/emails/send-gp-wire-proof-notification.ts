import { sendOrgEmail } from "@/lib/resend";
import prisma from "@/lib/prisma";
import GpWireProofUploadedEmail from "@/components/emails/gp-wire-proof-uploaded";
import { reportError } from "@/lib/error";

/**
 * Notify GP team admins when an LP uploads wire proof of payment.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function sendGpWireProofNotification({
  investmentId,
  fundId,
  investorId,
  fileName,
  amountSent,
  bankReference,
}: {
  investmentId: string;
  fundId: string;
  investorId: string;
  fileName: string;
  amountSent?: number | null;
  bankReference?: string | null;
}): Promise<void> {
  try {
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: {
        name: true,
        teamId: true,
        team: {
          select: {
            id: true,
            users: {
              where: { role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] }, status: "ACTIVE" },
              include: { user: { select: { email: true, name: true } } },
            },
          },
        },
      },
    });

    if (!fund) return;

    const investor = await prisma.investor.findUnique({
      where: { id: investorId },
      select: {
        entityName: true,
        user: { select: { name: true, email: true } },
      },
    });

    if (!investor) return;

    // Get commitment amount from the investment
    const investment = await prisma.investment.findUnique({
      where: { id: investmentId },
      select: { commitmentAmount: true },
    });

    const gpEmails = fund.team.users
      .map((ut: { user: { email: string | null } }) => ut.user.email)
      .filter(Boolean) as string[];

    if (gpEmails.length === 0) return;

    const investorName =
      investor.user?.name || investor.entityName || "Unknown Investor";

    const formatCurrency = (val: number) =>
      `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const commitmentAmount = Number(investment?.commitmentAmount ?? 0);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const dashboardUrl = `${baseUrl}/admin/fund/${fundId}/wire?teamId=${fund.team.id}`;

    for (const email of gpEmails) {
      await sendOrgEmail({
        teamId: fund.team.id,
        to: email,
        subject: `Wire proof uploaded by ${investorName} — ${fund.name}`,
        react: GpWireProofUploadedEmail({
          fundName: fund.name,
          investorName,
          commitmentAmount: formatCurrency(commitmentAmount),
          proofFileName: fileName,
          uploadedAt: new Date().toLocaleDateString("en-US"),
          amountSent: amountSent ? formatCurrency(amountSent) : undefined,
          bankReference: bankReference || undefined,
          dashboardUrl,
        }),
        test: process.env.NODE_ENV === "development",
      });
    }
  } catch (error) {
    reportError(error as Error);
    console.error("[GP_WIRE_PROOF_EMAIL] Failed to send notification:", error);
  }
}
