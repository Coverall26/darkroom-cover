import { sendEmail, sendOrgEmail } from "@/lib/resend";
import prisma from "@/lib/prisma";
import InvestorWelcomeEmail from "@/components/emails/investor-welcome";

/**
 * Send a welcome email to a new LP investor.
 * Tier 1 (platform) — no team context available, sends from @fundroom.ai.
 *
 * Fire-and-forget — errors are logged but never thrown so the caller
 * (registration endpoint) is never blocked by email failures.
 */
export async function sendInvestorWelcomeEmail(
  userId: string,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        investorProfile: {
          select: {
            entityName: true,
          },
        },
      },
    });

    if (!user?.email) {
      console.warn("[INVESTOR_EMAIL] No user/email found for welcome email:", userId);
      return;
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const portalUrl = `${baseUrl}/lp/dashboard`;

    await sendEmail({
      to: user.email,
      subject: "Welcome to FundRoom — Your investor portal is ready",
      react: InvestorWelcomeEmail({
        investorName:
          user.investorProfile?.entityName || user.name || "Investor",
        fundName: "our fund",
        gpFirmName: "FundRoom",
        portalUrl,
      }),
      test: process.env.NODE_ENV === "development",
    });
  } catch (error) {
    console.error("[INVESTOR_EMAIL] Failed to send welcome email:", error);
  }
}

/**
 * Richer variant: send welcome email with fund + org context.
 * Tier 2 (org-branded) — sends from org's verified domain if configured.
 * Use this when the investor's fund/team association is known at registration time.
 */
export async function sendInvestorWelcomeEmailWithFund(
  userId: string,
  fundId: string,
): Promise<void> {
  try {
    const [user, fund] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          email: true,
          investorProfile: { select: { entityName: true } },
        },
      }),
      prisma.fund.findUnique({
        where: { id: fundId },
        select: {
          name: true,
          teamId: true,
          team: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    if (!user?.email) {
      console.warn("[INVESTOR_EMAIL] No user/email for welcome+fund:", userId);
      return;
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.fundroom.ai";
    const portalUrl = `${baseUrl}/lp/dashboard`;

    const emailProps = {
      to: user.email,
      subject: `Welcome to ${fund?.name ?? "the fund"} — Your investor portal is ready`,
      react: InvestorWelcomeEmail({
        investorName:
          user.investorProfile?.entityName || user.name || "Investor",
        fundName: fund?.name ?? "the fund",
        gpFirmName: fund?.team?.name ?? "the fund manager",
        portalUrl,
      }),
      test: process.env.NODE_ENV === "development",
    };

    // Use org-branded email when team context is available
    if (fund?.teamId) {
      await sendOrgEmail({ teamId: fund.teamId, ...emailProps });
    } else {
      await sendEmail(emailProps);
    }
  } catch (error) {
    console.error(
      "[INVESTOR_EMAIL] Failed to send welcome+fund email:",
      error,
    );
  }
}
