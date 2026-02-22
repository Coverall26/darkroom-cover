-- Add foreign key constraint from Transaction.fundId to Fund.id
-- Transaction.fundId was previously a plain String? field without a FK constraint.
-- This migration adds the proper FK relationship with onDelete: Restrict.
-- Existing data: fundId values that don't match a Fund.id will need to be fixed first.

-- First, set any orphaned fundId references to NULL (safety net)
UPDATE "Transaction" SET "fundId" = NULL WHERE "fundId" IS NOT NULL AND "fundId" NOT IN (SELECT "id" FROM "Fund");

-- Add foreign key constraint
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
