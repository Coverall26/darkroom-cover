-- AlterTable: Add SEC compliance fields to Investor
ALTER TABLE "Investor" ADD COLUMN "sourceOfFunds" TEXT;
ALTER TABLE "Investor" ADD COLUMN "occupation" TEXT;
