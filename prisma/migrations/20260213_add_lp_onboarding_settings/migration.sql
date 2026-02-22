-- Add LP Onboarding Settings fields to OrganizationDefaults
ALTER TABLE "OrganizationDefaults" ADD COLUMN "onboardingStepConfig" JSONB;
ALTER TABLE "OrganizationDefaults" ADD COLUMN "allowExternalDocUpload" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrganizationDefaults" ADD COLUMN "allowGpDocUploadForLp" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrganizationDefaults" ADD COLUMN "accreditationMethod" TEXT NOT NULL DEFAULT 'SELF_ACK';
ALTER TABLE "OrganizationDefaults" ADD COLUMN "minimumInvestThreshold" DOUBLE PRECISION;

-- Add Notification Preferences fields to OrganizationDefaults
ALTER TABLE "OrganizationDefaults" ADD COLUMN "notifyLpStepComplete" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrganizationDefaults" ADD COLUMN "notifyGpCommitment" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrganizationDefaults" ADD COLUMN "notifyGpWireUpload" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrganizationDefaults" ADD COLUMN "notifyGpLpInactive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrganizationDefaults" ADD COLUMN "notifyLpWireConfirm" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OrganizationDefaults" ADD COLUMN "notifyLpNewDocument" BOOLEAN NOT NULL DEFAULT true;
