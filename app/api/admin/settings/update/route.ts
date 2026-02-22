import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";
import prisma from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit/audit-logger";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/settings/update
 *
 * Settings Update API — Per-Section Save.
 * Body: { teamId, section, data, applyToExisting? }
 *
 * Sections: "company", "branding", "compliance", "dataroomDefaults",
 *           "linkDefaults", "lpOnboarding", "audit", "notifications",
 *           "lpPortalSettings", "crmPreferences"
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { teamId, section, data, applyToExisting } = body;

  if (!teamId || !section || !data) {
    return NextResponse.json(
      { error: "teamId, section, and data are required" },
      { status: 400 },
    );
  }

  try {
    // Verify admin access
    const userTeam = await prisma.userTeam.findFirst({
      where: {
        userId: session.user.id,
        teamId,
        role: { in: ["OWNER", "ADMIN", "SUPER_ADMIN"] },
        status: "ACTIVE",
      },
    });

    if (!userTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get team's org
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { organizationId: true, name: true },
    });

    if (!team?.organizationId) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const orgId = team.organizationId;
    let updatedData: Record<string, unknown> = {};

    switch (section) {
      case "company": {
        const allowedFields = [
          "name",
          "description",
          "entityType",
          "phone",
          "addressLine1",
          "addressLine2",
          "addressCity",
          "addressState",
          "addressZip",
          "addressCountry",
          "companyDescription",
          "sector",
          "geography",
          "website",
          "foundedYear",
        ];
        const filtered: Record<string, unknown> = {};
        for (const key of allowedFields) {
          if (key in data) filtered[key] = data[key];
        }
        if (Object.keys(filtered).length > 0) {
          updatedData = await prisma.organization.update({
            where: { id: orgId },
            data: filtered,
          });
        }
        break;
      }

      case "branding": {
        const allowedFields = [
          "brandColor",
          "accentColor",
          "logo",
          "favicon",
        ];
        const filtered: Record<string, unknown> = {};
        for (const key of allowedFields) {
          if (key in data) filtered[key] = data[key];
        }
        if (Object.keys(filtered).length > 0) {
          updatedData = await prisma.organization.update({
            where: { id: orgId },
            data: filtered,
          });
        }
        if (data.emailSenderName !== undefined) {
          await prisma.team.update({
            where: { id: teamId },
            data: { emailFromName: data.emailSenderName || null },
          });
        }
        break;
      }

      case "compliance": {
        const orgDefaults =
          await prisma.organizationDefaults.findUnique({
            where: { organizationId: orgId },
          });
        const updateData: Record<string, unknown> = {};
        if ("ndaGateEnabled" in data)
          updateData.fundroomNdaGateEnabled = data.ndaGateEnabled;
        if ("accreditationRequired" in data)
          updateData.fundroomAccreditationRequired =
            data.accreditationRequired;
        if ("kycRequired" in data)
          updateData.fundroomKycRequired = data.kycRequired;
        if ("requireMfa" in data)
          updateData.requireMfa = data.requireMfa;

        if (Object.keys(updateData).length > 0) {
          if (orgDefaults) {
            updatedData = await prisma.organizationDefaults.update({
              where: { organizationId: orgId },
              data: updateData,
            });
          } else {
            updatedData = await prisma.organizationDefaults.create({
              data: { organizationId: orgId, ...updateData },
            });
          }
        }
        break;
      }

      case "dataroomDefaults": {
        const orgDefaults =
          await prisma.organizationDefaults.findUnique({
            where: { organizationId: orgId },
          });
        const updateData: Record<string, unknown> = {};
        if ("dataroomConversationsEnabled" in data)
          updateData.dataroomConversationsEnabled =
            data.dataroomConversationsEnabled;
        if ("dataroomAllowBulkDownload" in data)
          updateData.dataroomAllowBulkDownload =
            data.dataroomAllowBulkDownload;
        if ("dataroomShowLastUpdated" in data)
          updateData.dataroomShowLastUpdated =
            data.dataroomShowLastUpdated;

        if (Object.keys(updateData).length > 0) {
          if (orgDefaults) {
            updatedData = await prisma.organizationDefaults.update({
              where: { organizationId: orgId },
              data: updateData,
            });
          } else {
            updatedData = await prisma.organizationDefaults.create({
              data: { organizationId: orgId, ...updateData },
            });
          }
        }
        break;
      }

      case "linkDefaults": {
        const orgDefaults =
          await prisma.organizationDefaults.findUnique({
            where: { organizationId: orgId },
          });
        const updateData: Record<string, unknown> = {};
        if ("linkEmailProtected" in data)
          updateData.linkEmailProtected = data.linkEmailProtected;
        if ("linkAllowDownload" in data)
          updateData.linkAllowDownload = data.linkAllowDownload;
        if ("linkEnableNotifications" in data)
          updateData.linkEnableNotifications =
            data.linkEnableNotifications;
        if ("linkEnableWatermark" in data)
          updateData.linkEnableWatermark = data.linkEnableWatermark;
        if ("linkExpirationDays" in data)
          updateData.linkExpirationDays = data.linkExpirationDays;
        if ("linkPasswordRequired" in data)
          updateData.linkPasswordRequired = data.linkPasswordRequired;

        if (Object.keys(updateData).length > 0) {
          if (orgDefaults) {
            updatedData = await prisma.organizationDefaults.update({
              where: { organizationId: orgId },
              data: updateData,
            });
          } else {
            updatedData = await prisma.organizationDefaults.create({
              data: { organizationId: orgId, ...updateData },
            });
          }
        }
        break;
      }

      case "lpOnboarding": {
        const orgDefaults =
          await prisma.organizationDefaults.findUnique({
            where: { organizationId: orgId },
          });
        const updateData: Record<string, unknown> = {};
        if ("ndaGateEnabled" in data)
          updateData.fundroomNdaGateEnabled = data.ndaGateEnabled;
        if ("kycRequired" in data)
          updateData.fundroomKycRequired = data.kycRequired;
        if ("accreditationRequired" in data)
          updateData.fundroomAccreditationRequired =
            data.accreditationRequired;
        if ("stagedCommitmentsEnabled" in data)
          updateData.fundroomStagedCommitmentsEnabled =
            data.stagedCommitmentsEnabled;
        if ("regulationDExemption" in data)
          updateData.regulationDExemption = data.regulationDExemption;
        if ("accreditationMethod" in data)
          updateData.accreditationMethod = data.accreditationMethod;
        if ("minimumInvestThreshold" in data)
          updateData.minimumInvestThreshold =
            data.minimumInvestThreshold;
        if ("onboardingStepConfig" in data)
          updateData.onboardingStepConfig = data.onboardingStepConfig;
        if ("allowExternalDocUpload" in data)
          updateData.allowExternalDocUpload =
            data.allowExternalDocUpload;
        if ("allowGpDocUploadForLp" in data)
          updateData.allowGpDocUploadForLp =
            data.allowGpDocUploadForLp;
        if ("requireGpApproval" in data)
          updateData.requireGpApproval = data.requireGpApproval;
        if ("documentTemplates" in data && orgDefaults) {
          const currentFlags =
            (orgDefaults.featureFlags as Record<string, unknown>) ||
            {};
          updateData.featureFlags = {
            ...currentFlags,
            documentTemplates: data.documentTemplates,
          };
        }
        if ("notifyGpLpOnboardingStart" in data)
          updateData.notifyGpLpOnboardingStart =
            data.notifyGpLpOnboardingStart;
        if ("notifyGpCommitment" in data)
          updateData.notifyGpCommitment = data.notifyGpCommitment;
        if ("notifyGpWireUpload" in data)
          updateData.notifyGpWireUpload = data.notifyGpWireUpload;
        if ("notifyGpLpInactive" in data)
          updateData.notifyGpLpInactive = data.notifyGpLpInactive;
        if ("notifyGpExternalDocUpload" in data)
          updateData.notifyGpExternalDocUpload =
            data.notifyGpExternalDocUpload;
        if ("notifyLpStepComplete" in data)
          updateData.notifyLpStepComplete = data.notifyLpStepComplete;
        if ("notifyLpWireConfirm" in data)
          updateData.notifyLpWireConfirm = data.notifyLpWireConfirm;
        if ("notifyLpNewDocument" in data)
          updateData.notifyLpNewDocument = data.notifyLpNewDocument;
        if ("notifyLpChangeRequest" in data)
          updateData.notifyLpChangeRequest =
            data.notifyLpChangeRequest;
        if ("notifyLpOnboardingReminder" in data)
          updateData.notifyLpOnboardingReminder =
            data.notifyLpOnboardingReminder;

        if (Object.keys(updateData).length > 0) {
          if (orgDefaults) {
            updatedData = await prisma.organizationDefaults.update({
              where: { organizationId: orgId },
              data: updateData,
            });
          } else {
            updatedData = await prisma.organizationDefaults.create({
              data: { organizationId: orgId, ...updateData },
            });
          }
        }
        break;
      }

      case "audit": {
        const orgDefaults =
          await prisma.organizationDefaults.findUnique({
            where: { organizationId: orgId },
          });
        const updateData: Record<string, unknown> = {};
        if ("auditLogRetentionDays" in data)
          updateData.auditLogRetentionDays = data.auditLogRetentionDays;

        if (Object.keys(updateData).length > 0) {
          if (orgDefaults) {
            updatedData = await prisma.organizationDefaults.update({
              where: { organizationId: orgId },
              data: updateData,
            });
          } else {
            updatedData = await prisma.organizationDefaults.create({
              data: { organizationId: orgId, ...updateData },
            });
          }
        }
        break;
      }

      case "notifications": {
        const orgDefaultsNotif =
          await prisma.organizationDefaults.findUnique({
            where: { organizationId: orgId },
          });
        const updateDataNotif: Record<string, unknown> = {};
        if ("notifyGpLpOnboardingStart" in data)
          updateDataNotif.notifyGpLpOnboardingStart =
            data.notifyGpLpOnboardingStart;
        if ("notifyGpCommitment" in data)
          updateDataNotif.notifyGpCommitment = data.notifyGpCommitment;
        if ("notifyGpWireUpload" in data)
          updateDataNotif.notifyGpWireUpload = data.notifyGpWireUpload;
        if ("notifyGpLpInactive" in data)
          updateDataNotif.notifyGpLpInactive = data.notifyGpLpInactive;
        if ("notifyGpExternalDocUpload" in data)
          updateDataNotif.notifyGpExternalDocUpload =
            data.notifyGpExternalDocUpload;
        if ("notifyLpStepComplete" in data)
          updateDataNotif.notifyLpStepComplete =
            data.notifyLpStepComplete;
        if ("notifyLpWireConfirm" in data)
          updateDataNotif.notifyLpWireConfirm =
            data.notifyLpWireConfirm;
        if ("notifyLpNewDocument" in data)
          updateDataNotif.notifyLpNewDocument =
            data.notifyLpNewDocument;
        if ("notifyLpChangeRequest" in data)
          updateDataNotif.notifyLpChangeRequest =
            data.notifyLpChangeRequest;
        if ("notifyLpOnboardingReminder" in data)
          updateDataNotif.notifyLpOnboardingReminder =
            data.notifyLpOnboardingReminder;

        if (Object.keys(updateDataNotif).length > 0) {
          if (orgDefaultsNotif) {
            updatedData = await prisma.organizationDefaults.update({
              where: { organizationId: orgId },
              data: updateDataNotif,
            });
          } else {
            updatedData = await prisma.organizationDefaults.create({
              data: { organizationId: orgId, ...updateDataNotif },
            });
          }
        }
        break;
      }

      case "lpPortalSettings": {
        const orgDefaultsPortal =
          await prisma.organizationDefaults.findUnique({
            where: { organizationId: orgId },
          });
        const updateDataPortal: Record<string, unknown> = {};
        if ("allowExternalDocUpload" in data)
          updateDataPortal.allowExternalDocUpload =
            data.allowExternalDocUpload;
        if ("allowGpDocUploadForLp" in data)
          updateDataPortal.allowGpDocUploadForLp =
            data.allowGpDocUploadForLp;
        if ("requireGpApproval" in data)
          updateDataPortal.requireGpApproval = data.requireGpApproval;
        if ("accreditationMethod" in data)
          updateDataPortal.accreditationMethod =
            data.accreditationMethod;
        if ("minimumInvestThreshold" in data)
          updateDataPortal.minimumInvestThreshold =
            data.minimumInvestThreshold;

        if (Object.keys(updateDataPortal).length > 0) {
          if (orgDefaultsPortal) {
            updatedData = await prisma.organizationDefaults.update({
              where: { organizationId: orgId },
              data: updateDataPortal,
            });
          } else {
            updatedData = await prisma.organizationDefaults.create({
              data: { organizationId: orgId, ...updateDataPortal },
            });
          }
        }
        break;
      }

      case "crmPreferences": {
        const existingDefaults =
          await prisma.organizationDefaults.findFirst({
            where: { organizationId: orgId },
            select: { id: true, featureFlags: true },
          });
        const currentFlags =
          (existingDefaults?.featureFlags as Record<string, unknown>) ??
          {};
        const crmPrefs: Record<string, unknown> = {};
        const allowedCrmKeys = [
          "digestEnabled",
          "digestFrequency",
          "autoCaptureDateroom",
          "autoCaptureWaitlist",
          "defaultOutreachSignature",
          "engagementThresholdHot",
          "engagementThresholdWarm",
        ];
        const crmData =
          (data as Record<string, unknown>).crmPreferences ?? data;
        for (const key of allowedCrmKeys) {
          if (key in (crmData as Record<string, unknown>)) {
            crmPrefs[key] = (crmData as Record<string, unknown>)[key];
          }
        }
        const mergedFlags = {
          ...currentFlags,
          crmPreferences: crmPrefs,
        };
        if (existingDefaults) {
          updatedData = await prisma.organizationDefaults.update({
            where: { organizationId: orgId },
            data: { featureFlags: mergedFlags },
          });
        } else {
          updatedData = await prisma.organizationDefaults.create({
            data: {
              organizationId: orgId,
              featureFlags: mergedFlags,
            },
          });
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown section: ${section}` },
          { status: 400 },
        );
    }

    // Audit log
    await logAuditEvent({
      teamId,
      userId: session.user.id,
      eventType: "SETTINGS_UPDATED",
      resourceType: "Organization",
      resourceId: orgId,
      metadata: { section, changes: data, applyToExisting },
    });

    // Apply to existing if requested
    if (applyToExisting) {
      if (section === "dataroomDefaults") {
        const dataroomUpdates: Record<string, unknown> = {};
        if ("dataroomConversationsEnabled" in data) {
          dataroomUpdates.conversationsEnabled =
            data.dataroomConversationsEnabled;
        }
        if ("dataroomAllowBulkDownload" in data) {
          dataroomUpdates.allowBulkDownload =
            data.dataroomAllowBulkDownload;
        }
        if ("dataroomShowLastUpdated" in data) {
          dataroomUpdates.showLastUpdated =
            data.dataroomShowLastUpdated;
        }
        if (Object.keys(dataroomUpdates).length > 0) {
          await prisma.$transaction([
            prisma.dataroom.updateMany({
              where: { teamId },
              data: dataroomUpdates,
            }),
          ]);
        }
      }

      if (section === "linkDefaults") {
        const linkUpdates: Record<string, unknown> = {};
        if ("linkEmailProtected" in data)
          linkUpdates.emailProtected = data.linkEmailProtected;
        if ("linkAllowDownload" in data)
          linkUpdates.allowDownload = data.linkAllowDownload;
        if ("linkEnableNotifications" in data)
          linkUpdates.enableNotification =
            data.linkEnableNotifications;
        if ("linkEnableWatermark" in data)
          linkUpdates.enableWatermark = data.linkEnableWatermark;
        if ("linkPasswordRequired" in data) {
          if (!data.linkPasswordRequired) {
            linkUpdates.password = null;
          }
        }
        if (Object.keys(linkUpdates).length > 0) {
          await prisma.$transaction([
            prisma.link.updateMany({
              where: { teamId, deletedAt: null },
              data: linkUpdates,
            }),
          ]);
        }
      }
    }

    return NextResponse.json({
      success: true,
      section,
      appliedToExisting: !!applyToExisting,
    });
  } catch (error) {
    reportError(error as Error);
    console.error("[SETTINGS_UPDATE] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
