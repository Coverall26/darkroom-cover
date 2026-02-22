import { sendOrgEmail } from "@/lib/resend";
import prisma from "@/lib/prisma";
import GpNewCommitmentEmail from "@/components/emails/gp-new-commitment";
import { reportError } from "@/lib/error";

/**
 * Notify GP team admins when an LP makes a new investment commitment.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function sendGpCommitmentNotification({
  fundId,
  investorId,
  commitmentAmount,
  units,
  pricePerUnit,
}: {
  fundId: string;
  investorId: string;
  commitmentAmount: number;
  units?: number | null;
  pricePerUnit?: number | null;
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

    const gpEmails = fund.team.users
      .map((ut: { user: { email: string | null } }) => ut.user.email)
      .filter(Boolean) as string[];

    if (gpEmails.length === 0) return;

    const investorName =
      investor.user?.name || investor.entityName || "Unknown Investor";

    const formatCurrency = (val: number) =>
      `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const dashboardUrl = `${baseUrl}/admin/investors?teamId=${fund.team.id}`;

    for (const email of gpEmails) {
      await sendOrgEmail({
        teamId: fund.team.id,
        to: email,
        subject: `New commitment: ${investorName} — ${formatCurrency(commitmentAmount)} — ${fund.name}`,
        react: GpNewCommitmentEmail({
          fundName: fund.name,
          investorName,
          commitmentAmount: formatCurrency(commitmentAmount),
          units: units || null,
          pricePerUnit: pricePerUnit ? formatCurrency(pricePerUnit) : undefined,
          commitDate: new Date().toLocaleDateString("en-US"),
          dashboardUrl,
        }),
        test: process.env.NODE_ENV === "development",
      });
    }
  } catch (error) {
    reportError(error as Error);
    console.error("[GP_COMMITMENT_EMAIL] Failed to send notification:", error);
  }
}
