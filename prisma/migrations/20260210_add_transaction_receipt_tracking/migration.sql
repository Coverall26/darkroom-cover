-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "fundsReceivedDate" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN "fundsClearedDate" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN "confirmedBy" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN "confirmationMethod" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "bankReference" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "confirmationNotes" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "confirmationProofDocumentId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "expectedAmount" DECIMAL(18,2);
ALTER TABLE "Transaction" ADD COLUMN "amountVariance" DECIMAL(18,2);
ALTER TABLE "Transaction" ADD COLUMN "varianceNotes" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_confirmedBy_idx" ON "Transaction"("confirmedBy");
