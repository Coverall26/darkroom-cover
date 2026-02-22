-- AlterTable: Add LP Onboarding Settings V2 fields to OrganizationDefaults
-- New fields: regulationDExemption, requireGpApproval, 4 new notification toggles

-- Regulation D exemption type (drives accreditation method)
ALTER TABLE "OrganizationDefaults" ADD COLUMN "regulationDExemption" TEXT NOT NULL DEFAULT '506B';

-- GP approval before commitment is finalized
ALTER TABLE "OrganizationDefaults" ADD COLUMN "requireGpApproval" BOOLEAN NOT NULL DEFAULT true;

-- GP notification: new LP starts onboarding
ALTER TABLE "OrganizationDefaults" ADD COLUMN "notifyGpLpOnboardingStart" BOOLEAN NOT NULL DEFAULT true;

-- GP notification: externally signed document uploaded by LP
ALTER TABLE "OrganizationDefaults" ADD COLUMN "notifyGpExternalDocUpload" BOOLEAN NOT NULL DEFAULT true;

-- LP notification: GP requests changes to submission
ALTER TABLE "OrganizationDefaults" ADD COLUMN "notifyLpChangeRequest" BOOLEAN NOT NULL DEFAULT true;

-- LP notification: onboarding incomplete reminder (3 days)
ALTER TABLE "OrganizationDefaults" ADD COLUMN "notifyLpOnboardingReminder" BOOLEAN NOT NULL DEFAULT true;
