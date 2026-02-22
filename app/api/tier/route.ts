/**
 * GET /api/tier — Returns current org CRM tier limits + usage for frontend rendering.
 *
 * The frontend calls this on page load to know which features to show/hide/gray out.
 */

import { NextResponse } from "next/server";
import { requireAuthAppRouter } from "@/lib/auth/rbac";
import prisma from "@/lib/prisma";
import { resolveOrgTier } from "@/lib/tier/crm-tier";
import { reportError } from "@/lib/error";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthAppRouter();
  if (auth instanceof NextResponse) return auth;

  try {
    // Resolve orgId from user's team
    const userTeam = await prisma.userTeam.findFirst({
      where: { userId: auth.userId },
      select: { team: { select: { id: true, organizationId: true } } },
    });

    const orgId = userTeam?.team?.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 404 },
      );
    }

    const teamId = userTeam.team.id;
    const tier = await resolveOrgTier(orgId);

    // Get usage counts + billing fields in parallel
    const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

    const [contactCount, esigUsage, signerCount, pendingContactCount, org] =
      await Promise.all([
        prisma.contact.count({ where: { teamId } }),
        prisma.esigUsage.findUnique({
          where: { orgId_month: { orgId, month } },
          select: { signaturesUsed: true },
        }),
        prisma.signatureRecipient.count({
          where: { document: { teamId } },
        }),
        prisma.pendingContact.count({ where: { orgId } }),
        prisma.organization.findUnique({
          where: { id: orgId },
          select: {
            aiCrmTrialEndsAt: true,
            subscriptionStatus: true,
            productMode: true,
          },
        }),
      ]);

    return NextResponse.json({
      tier: tier.tier,
      aiCrmEnabled: tier.aiCrmEnabled,
      productMode: org?.productMode ?? "GP_FUND",
      aiTrialEndsAt: org?.aiCrmTrialEndsAt?.toISOString() ?? null,
      cancelAtPeriodEnd: org?.subscriptionStatus === "CANCEL_AT_PERIOD_END",
      limits: tier,
      usage: {
        contactCount,
        contactLimit: tier.maxContacts,
        esigUsedThisMonth: esigUsage?.signaturesUsed ?? 0,
        esigLimit: tier.maxEsigsPerMonth,
        signerCount,
        signerLimit: tier.maxSignerStorage,
        pendingContactCount,
      },
    });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
