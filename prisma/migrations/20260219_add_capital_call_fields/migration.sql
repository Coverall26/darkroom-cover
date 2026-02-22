-- AlterTable: CapitalCall — add lifecycle and audit fields
ALTER TABLE "CapitalCall" ADD COLUMN "proRataPercentage" DECIMAL(5,4);
ALTER TABLE "CapitalCall" ADD COLUMN "notes" TEXT;
ALTER TABLE "CapitalCall" ADD COLUMN "noticeDate" TIMESTAMP(3);
ALTER TABLE "CapitalCall" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "CapitalCall" ADD COLUMN "fundedAt" TIMESTAMP(3);
ALTER TABLE "CapitalCall" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "CapitalCall" ADD COLUMN "noticePdfUrl" TEXT;
ALTER TABLE "CapitalCall" ADD COLUMN "createdBy" TEXT NOT NULL DEFAULT '';

-- CreateIndex: composite index for fund+status queries
CREATE INDEX "CapitalCall_fundId_status_idx" ON "CapitalCall"("fundId", "status");

-- AlterTable: CapitalCallResponse — add wire proof, GP confirmation, and notes fields
ALTER TABLE "CapitalCallResponse" ADD COLUMN "proofDocumentId" TEXT;
ALTER TABLE "CapitalCallResponse" ADD COLUMN "proofUploadedAt" TIMESTAMP(3);
ALTER TABLE "CapitalCallResponse" ADD COLUMN "confirmedBy" TEXT;
ALTER TABLE "CapitalCallResponse" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "CapitalCallResponse" ADD COLUMN "fundReceivedDate" TIMESTAMP(3);
ALTER TABLE "CapitalCallResponse" ADD COLUMN "notes" TEXT;
