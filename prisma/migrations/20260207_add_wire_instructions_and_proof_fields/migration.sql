-- Migration: Add wire instructions to Fund model and proof-of-payment fields to ManualInvestment
-- Part of Manual Wire + Proof Upload MVP

-- ============================================================================
-- Fund: Wire Instructions
-- ============================================================================

ALTER TABLE "Fund" ADD COLUMN "wireInstructions" JSONB;
ALTER TABLE "Fund" ADD COLUMN "wireInstructionsUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Fund" ADD COLUMN "wireInstructionsUpdatedBy" TEXT;

-- ============================================================================
-- ManualInvestment: Proof of Payment
-- ============================================================================

ALTER TABLE "ManualInvestment" ADD COLUMN "proofStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "ManualInvestment" ADD COLUMN "proofDocumentKey" TEXT;
ALTER TABLE "ManualInvestment" ADD COLUMN "proofStorageType" TEXT;
ALTER TABLE "ManualInvestment" ADD COLUMN "proofFileType" TEXT;
ALTER TABLE "ManualInvestment" ADD COLUMN "proofFileName" TEXT;
ALTER TABLE "ManualInvestment" ADD COLUMN "proofFileSize" INTEGER;
ALTER TABLE "ManualInvestment" ADD COLUMN "proofUploadedBy" TEXT;
ALTER TABLE "ManualInvestment" ADD COLUMN "proofUploadedAt" TIMESTAMP(3);
ALTER TABLE "ManualInvestment" ADD COLUMN "proofVerifiedBy" TEXT;
ALTER TABLE "ManualInvestment" ADD COLUMN "proofVerifiedAt" TIMESTAMP(3);
ALTER TABLE "ManualInvestment" ADD COLUMN "proofRejectedBy" TEXT;
ALTER TABLE "ManualInvestment" ADD COLUMN "proofRejectedAt" TIMESTAMP(3);
ALTER TABLE "ManualInvestment" ADD COLUMN "proofRejectionReason" TEXT;
ALTER TABLE "ManualInvestment" ADD COLUMN "proofNotes" TEXT;

-- Index for GP dashboard queries filtering by proof status
CREATE INDEX "ManualInvestment_proofStatus_idx" ON "ManualInvestment"("proofStatus");
