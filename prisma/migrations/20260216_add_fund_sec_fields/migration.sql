-- Add missing SEC / Investment Company Act fields to Fund model
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "investmentCompanyExemption" TEXT;
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "useOfProceeds" TEXT;
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "salesCommissions" TEXT;

-- Add productMode to Organization model (explicit field, was only in featureFlags JSON)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "productMode" TEXT;
