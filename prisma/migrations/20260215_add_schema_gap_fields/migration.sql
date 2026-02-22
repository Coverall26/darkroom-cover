-- AlterTable: Add relatedPersons to Organization (Form D Section 3)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "relatedPersons" JSONB;

-- AlterTable: Add accreditationDocumentIds to Investor (506(c) document references)
ALTER TABLE "Investor" ADD COLUMN IF NOT EXISTS "accreditationDocumentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
