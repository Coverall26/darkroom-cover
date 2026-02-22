-- Add wizard and SEC compliance fields
-- Organization: Bad Actor certification, legal info, Form D
-- Fund: Startup instrument fields (SAFE, Convertible Note, Priced Round)
-- Investor: Accreditation method, category, self-financing confirmation

-- Organization model additions
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "yearIncorporated" INTEGER;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "jurisdiction" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "previousNames" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "badActorCertified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "badActorCertifiedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "badActorCertifiedBy" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "regulationDExemption" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "formDReminderEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Fund model additions (startup instruments)
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "instrumentType" TEXT;
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "fundStrategy" TEXT;
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "safeType" TEXT;
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "valuationCap" DECIMAL(18,2);
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "discountRatePct" DECIMAL(5,4);
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "interestRatePct" DECIMAL(5,4);
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "maturityDate" TIMESTAMP(3);
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "qualifiedFinancingThreshold" DECIMAL(18,2);
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "preMoneyValuation" DECIMAL(18,2);
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "liquidationPreference" TEXT;
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "antiDilutionType" TEXT;
ALTER TABLE "Fund" ADD COLUMN IF NOT EXISTS "optionPoolPct" DECIMAL(5,4);

-- Investor model additions (accreditation)
ALTER TABLE "Investor" ADD COLUMN IF NOT EXISTS "accreditationMethod" TEXT;
ALTER TABLE "Investor" ADD COLUMN IF NOT EXISTS "accreditationCategory" TEXT;
ALTER TABLE "Investor" ADD COLUMN IF NOT EXISTS "selfFinancingConfirmed" BOOLEAN NOT NULL DEFAULT false;
