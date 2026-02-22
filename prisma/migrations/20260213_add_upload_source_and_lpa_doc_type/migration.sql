-- CreateEnum: LPDocumentUploadSource
CREATE TYPE "LPDocumentUploadSource" AS ENUM ('LP_UPLOADED', 'LP_UPLOADED_EXTERNAL', 'GP_UPLOADED_FOR_LP', 'PLATFORM_SIGNED', 'SYSTEM_GENERATED');

-- AlterEnum: Add LPA to LPDocumentType
ALTER TYPE "LPDocumentType" ADD VALUE 'LPA';

-- AlterTable: Add uploadSource, externalSigningDate to LPDocument
ALTER TABLE "LPDocument" ADD COLUMN "uploadSource" "LPDocumentUploadSource" NOT NULL DEFAULT 'LP_UPLOADED';
ALTER TABLE "LPDocument" ADD COLUMN "externalSigningDate" TIMESTAMP(3);

-- CreateIndex: uploadSource on LPDocument
CREATE INDEX "LPDocument_uploadSource_idx" ON "LPDocument"("uploadSource");
