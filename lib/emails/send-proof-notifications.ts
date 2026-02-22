import { sendOrgEmail } from "@/lib/resend";
import prisma from "@/lib/prisma";
import ProofReceivedEmail from "@/components/emails/proof-received";
import ProofVerifiedEmail from "@/components/emails/proof-verified";
import ProofRejectedEmail from "@/components/emails/proof-rejected";

/**
 * Notify GP team admins when an LP uploads proof of payment.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 * Fire-and-forget — errors are logged, not thrown.
 */
export async function sendProofReceivedNotification(
  investmentId: string,
): Promise<void> {
  try {
    const investment = await prisma.manualInvestment.findUnique({
      where: { id: investmentId },
      include: {
        investor: { select: { entityName: true } },
        fund: { select: { name: true, teamId: true } },
        team: {
          select: {
            id: true,
            name: true,
            users: {
              where: { role: { in: ["OWNER", "ADMIN"] }, status: "ACTIVE" },
              include: { user: { select: { email: true, name: true } } },
            },
          },
        },
      },
    });

    if (!investment) return;

    const gpEmails = investment.team.users
      .map((ut) => ut.user.email)
      .filter(Boolean) as string[];

    if (gpEmails.length === 0) return;

    const teamId = investment.team.id;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const dashboardUrl = `${baseUrl}/admin/wire-transfers?teamId=${teamId}`;

    const formatCurrency = (val: unknown) => {
      const num = Number(val);
      return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    for (const email of gpEmails) {
      await sendOrgEmail({
        teamId,
        to: email,
        subject: `Wire proof received from ${investment.investor.entityName ?? "investor"} — ${investment.fund.name}`,
        react: ProofReceivedEmail({
          fundName: investment.fund.name,
          investorName: investment.investor.entityName ?? "Unknown Investor",
          commitmentAmount: formatCurrency(investment.commitmentAmount),
          proofFileName: investment.proofFileName ?? "Unknown file",
          uploadedAt: investment.proofUploadedAt
            ? investment.proofUploadedAt.toLocaleDateString("en-US")
            : new Date().toLocaleDateString("en-US"),
          proofNotes: investment.proofNotes ?? undefined,
          dashboardUrl,
        }),
        test: process.env.NODE_ENV === "development",
      });
    }
  } catch (error) {
    console.error("[PROOF_EMAIL] Failed to send proof received notification:", error);
  }
}

/**
 * Notify LP when their proof of payment is verified by GP.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 */
export async function sendProofVerifiedNotification(
  investmentId: string,
): Promise<void> {
  try {
    const investment = await prisma.manualInvestment.findUnique({
      where: { id: investmentId },
      include: {
        investor: {
          select: {
            entityName: true,
            user: { select: { email: true, name: true } },
          },
        },
        fund: { select: { name: true, teamId: true } },
      },
    });

    if (!investment?.investor?.user?.email) return;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const portalUrl = `${baseUrl}/lp/investments`;

    const formatCurrency = (val: unknown) => {
      const num = Number(val);
      return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    await sendOrgEmail({
      teamId: investment.fund.teamId,
      to: investment.investor.user.email,
      subject: `Wire transfer verified — ${investment.fund.name}`,
      react: ProofVerifiedEmail({
        fundName: investment.fund.name,
        investorName:
          investment.investor.user.name ??
          investment.investor.entityName ??
          "Investor",
        commitmentAmount: formatCurrency(investment.commitmentAmount),
        verifiedAt: investment.proofVerifiedAt
          ? investment.proofVerifiedAt.toLocaleDateString("en-US")
          : new Date().toLocaleDateString("en-US"),
        portalUrl,
      }),
      test: process.env.NODE_ENV === "development",
    });
  } catch (error) {
    console.error("[PROOF_EMAIL] Failed to send proof verified notification:", error);
  }
}

/**
 * Notify LP when their proof of payment is rejected by GP.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 */
export async function sendProofRejectedNotification(
  investmentId: string,
): Promise<void> {
  try {
    const investment = await prisma.manualInvestment.findUnique({
      where: { id: investmentId },
      include: {
        investor: {
          select: {
            entityName: true,
            user: { select: { email: true, name: true } },
          },
        },
        fund: { select: { name: true, teamId: true } },
      },
    });

    if (!investment?.investor?.user?.email) return;

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const portalUrl = `${baseUrl}/lp/investments`;

    const formatCurrency = (val: unknown) => {
      const num = Number(val);
      return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    await sendOrgEmail({
      teamId: investment.fund.teamId,
      to: investment.investor.user.email,
      subject: `Wire proof requires resubmission — ${investment.fund.name}`,
      react: ProofRejectedEmail({
        fundName: investment.fund.name,
        investorName:
          investment.investor.user.name ??
          investment.investor.entityName ??
          "Investor",
        commitmentAmount: formatCurrency(investment.commitmentAmount),
        rejectionReason: investment.proofRejectionReason ?? "No reason provided",
        rejectedAt: investment.proofRejectedAt
          ? investment.proofRejectedAt.toLocaleDateString("en-US")
          : new Date().toLocaleDateString("en-US"),
        portalUrl,
      }),
      test: process.env.NODE_ENV === "development",
    });
  } catch (error) {
    console.error("[PROOF_EMAIL] Failed to send proof rejected notification:", error);
  }
}
