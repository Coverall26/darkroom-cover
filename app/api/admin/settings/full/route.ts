import { NextRequest, NextResponse } from "next/server";

import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import {
  resolveSettings,
  type FundRoomSettings,
} from "@/lib/settings/resolve";
import { requireAdminAppRouter } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/settings/full?teamId=xxx&fundId=yyy
 *
 * Full Settings API — Hydrates entire Settings Center page.
 * Returns: organization, orgDefaults, team settings, fund list, tier map.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");
  const fundId = searchParams.get("fundId");

  if (!teamId) {
    return NextResponse.json(
      { error: "teamId is required" },
      { status: 400 },
    );
  }

  const auth = await requireAdminAppRouter(teamId);
  if (auth instanceof NextResponse) return auth;

  try {
    // Get team with org
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        id: true,
        name: true,
        organizationId: true,
        emailFromName: true,
        emailFromAddress: true,
        emailDomain: true,
        emailDomainStatus: true,
      },
    });

    const orgId = team?.organizationId || undefined;

    // Fetch organization
    const org = orgId
      ? await prisma.organization.findUnique({
          where: { id: orgId },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            entityType: true,
            phone: true,
            addressLine1: true,
            addressLine2: true,
            addressCity: true,
            addressState: true,
            addressZip: true,
            addressCountry: true,
            brandColor: true,
            accentColor: true,
            logo: true,
            favicon: true,
            companyDescription: true,
            sector: true,
            geography: true,
            website: true,
            foundedYear: true,
          },
        })
      : null;

    // Fetch org defaults
    const orgDefaults = orgId
      ? await prisma.organizationDefaults.findUnique({
          where: { organizationId: orgId },
        })
      : null;

    // Get available funds
    const funds = await prisma.fund.findMany({
      where: { teamId },
      select: {
        id: true,
        name: true,
        ndaGateEnabled: true,
        callFrequency: true,
        stagedCommitmentsEnabled: true,
        entityMode: true,
        waterfallType: true,
        hurdleRate: true,
        termYears: true,
        extensionYears: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Build tier map
    const systemSettings = await resolveSettings({});
    const orgSettings = orgId
      ? await resolveSettings({ orgId })
      : systemSettings;
    const teamSettings = await resolveSettings({ orgId, teamId });
    const fundSettings = fundId
      ? await resolveSettings({ orgId, teamId, fundId })
      : teamSettings;

    const settingKeys = Object.keys(
      systemSettings,
    ) as (keyof FundRoomSettings)[];
    const tierMap: Record<string, { value: unknown; source: string }> = {};

    for (const key of settingKeys) {
      const sysVal = systemSettings[key];
      const orgVal = orgSettings[key];
      const teamVal = teamSettings[key];
      const fundVal = fundSettings[key];

      let source = "System";
      let value = sysVal;

      if (orgId && orgVal !== sysVal) {
        source = "Organization";
        value = orgVal;
      }
      if (teamVal !== (orgId ? orgVal : sysVal)) {
        source = "Team";
        value = teamVal;
      }
      if (fundId && fundVal !== teamVal) {
        source = "Fund";
        value = fundVal;
      }

      tierMap[key] = { value, source };
    }

    // Fetch team members
    const teamMembers = await prisma.userTeam.findMany({
      where: { teamId },
      select: {
        role: true,
        status: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
        },
      },
      orderBy: { user: { createdAt: "asc" } },
    });

    // Count existing resources
    const [dataroomCount, linkCount, fundCount] = await Promise.all([
      prisma.dataroom.count({ where: { teamId } }),
      prisma.link.count({ where: { teamId } }),
      prisma.fund.count({ where: { teamId } }),
    ]);

    return NextResponse.json({
      org,
      orgDefaults: orgDefaults
        ? {
            dataroomConversationsEnabled:
              orgDefaults.dataroomConversationsEnabled,
            dataroomAllowBulkDownload:
              orgDefaults.dataroomAllowBulkDownload,
            dataroomShowLastUpdated:
              orgDefaults.dataroomShowLastUpdated,
            linkEmailProtected: orgDefaults.linkEmailProtected,
            linkAllowDownload: orgDefaults.linkAllowDownload,
            linkEnableNotifications:
              orgDefaults.linkEnableNotifications,
            linkEnableWatermark: orgDefaults.linkEnableWatermark,
            linkExpirationDays: orgDefaults.linkExpirationDays,
            linkPasswordRequired: orgDefaults.linkPasswordRequired,
            fundroomNdaGateEnabled:
              orgDefaults.fundroomNdaGateEnabled,
            fundroomKycRequired: orgDefaults.fundroomKycRequired,
            fundroomAccreditationRequired:
              orgDefaults.fundroomAccreditationRequired,
            fundroomStagedCommitmentsEnabled:
              orgDefaults.fundroomStagedCommitmentsEnabled,
            fundroomCallFrequency: orgDefaults.fundroomCallFrequency,
            auditLogRetentionDays: orgDefaults.auditLogRetentionDays,
            requireMfa: orgDefaults.requireMfa,
            // LP Onboarding Settings
            regulationDExemption: orgDefaults.regulationDExemption,
            accreditationMethod: orgDefaults.accreditationMethod,
            minimumInvestThreshold:
              orgDefaults.minimumInvestThreshold,
            onboardingStepConfig: orgDefaults.onboardingStepConfig,
            documentTemplateConfig:
              orgDefaults.documentTemplateConfig,
            allowExternalDocUpload:
              orgDefaults.allowExternalDocUpload,
            allowGpDocUploadForLp:
              orgDefaults.allowGpDocUploadForLp,
            requireGpApproval: orgDefaults.requireGpApproval,
            notifyGpLpOnboardingStart:
              orgDefaults.notifyGpLpOnboardingStart,
            notifyGpCommitment: orgDefaults.notifyGpCommitment,
            notifyGpWireUpload: orgDefaults.notifyGpWireUpload,
            notifyGpLpInactive: orgDefaults.notifyGpLpInactive,
            notifyGpExternalDocUpload:
              orgDefaults.notifyGpExternalDocUpload,
            notifyLpStepComplete: orgDefaults.notifyLpStepComplete,
            notifyLpWireConfirm: orgDefaults.notifyLpWireConfirm,
            notifyLpNewDocument: orgDefaults.notifyLpNewDocument,
            notifyLpChangeRequest: orgDefaults.notifyLpChangeRequest,
            notifyLpOnboardingReminder:
              orgDefaults.notifyLpOnboardingReminder,
          }
        : null,
      team: {
        id: team?.id,
        name: team?.name,
        emailFromName: team?.emailFromName,
        emailFromAddress: team?.emailFromAddress,
        emailDomain: team?.emailDomain,
        emailDomainStatus: team?.emailDomainStatus,
      },
      funds,
      tierMap,
      resolved: fundSettings,
      members: teamMembers.map((m: { role: string; status: string; user: { id: string; name: string | null; email: string | null; image: string | null; createdAt: Date } }) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        role: m.role,
        accepted: m.status === "ACTIVE",
        joinedAt: m.user.createdAt,
      })),
      counts: {
        datarooms: dataroomCount,
        links: linkCount,
        funds: fundCount,
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
