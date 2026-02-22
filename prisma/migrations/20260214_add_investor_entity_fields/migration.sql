-- Add comprehensive entity fields to Investor model for LP Onboarding Step 4 (Entity Architecture)

-- Mailing address (when different from physical)
ALTER TABLE "Investor" ADD COLUMN "mailingAddressLine1" TEXT;
ALTER TABLE "Investor" ADD COLUMN "mailingAddressLine2" TEXT;
ALTER TABLE "Investor" ADD COLUMN "mailingCity" TEXT;
ALTER TABLE "Investor" ADD COLUMN "mailingState" TEXT;
ALTER TABLE "Investor" ADD COLUMN "mailingPostalCode" TEXT;
ALTER TABLE "Investor" ADD COLUMN "mailingCountry" TEXT;

-- Individual-specific fields
ALTER TABLE "Investor" ADD COLUMN "dateOfBirth" TEXT;
ALTER TABLE "Investor" ADD COLUMN "citizenship" TEXT DEFAULT 'US';

-- LLC / Other entity fields
ALTER TABLE "Investor" ADD COLUMN "stateOfFormation" TEXT;
ALTER TABLE "Investor" ADD COLUMN "dateOfFormation" TEXT;
ALTER TABLE "Investor" ADD COLUMN "taxClassification" TEXT;
ALTER TABLE "Investor" ADD COLUMN "authorizedSignatory" TEXT;
ALTER TABLE "Investor" ADD COLUMN "signatoryTitle" TEXT;

-- Trust-specific fields
ALTER TABLE "Investor" ADD COLUMN "trustType" TEXT;
ALTER TABLE "Investor" ADD COLUMN "trustDate" TEXT;
ALTER TABLE "Investor" ADD COLUMN "trusteeName" TEXT;
ALTER TABLE "Investor" ADD COLUMN "governingState" TEXT;

-- Retirement account fields
ALTER TABLE "Investor" ADD COLUMN "accountType" TEXT;
ALTER TABLE "Investor" ADD COLUMN "accountTitle" TEXT;
ALTER TABLE "Investor" ADD COLUMN "custodianCoSignRequired" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Investor" ADD COLUMN "custodianEin" TEXT;

-- Other entity fields
ALTER TABLE "Investor" ADD COLUMN "otherEntityType" TEXT;
ALTER TABLE "Investor" ADD COLUMN "countryOfFormation" TEXT DEFAULT 'US';

-- Entity-specific nested data (signatory contact, custodian details, account holder, etc.)
ALTER TABLE "Investor" ADD COLUMN "entityData" JSONB;
