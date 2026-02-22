-- AlterTable: Add documentTemplateConfig to OrganizationDefaults
ALTER TABLE "OrganizationDefaults" ADD COLUMN IF NOT EXISTS "documentTemplateConfig" JSONB;
