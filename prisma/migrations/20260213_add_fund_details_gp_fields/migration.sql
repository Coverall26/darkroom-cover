-- AlterTable: Add GP Fund details fields to Fund model
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "keyPersonName" TEXT;
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "clawbackProvision" BOOLEAN DEFAULT true;
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "mgmtFeeOffsetPct" DECIMAL(5, 2);
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "regulationDExemption" TEXT;
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "marketplaceDescription" TEXT;
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "marketplaceCategory" TEXT;
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "marketplaceInterestDate" TIMESTAMP(3);
