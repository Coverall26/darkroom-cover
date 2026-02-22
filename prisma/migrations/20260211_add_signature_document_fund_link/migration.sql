-- AlterTable: Add fund association and requiredForOnboarding to SignatureDocument
ALTER TABLE "SignatureDocument" ADD COLUMN "fundId" TEXT;
ALTER TABLE "SignatureDocument" ADD COLUMN "requiredForOnboarding" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "SignatureDocument_fundId_idx" ON "SignatureDocument"("fundId");

-- AddForeignKey
ALTER TABLE "SignatureDocument" ADD CONSTRAINT "SignatureDocument_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
