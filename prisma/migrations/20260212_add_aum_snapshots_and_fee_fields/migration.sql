-- Add fee and AUM calculation fields to Fund
ALTER TABLE "Fund" ADD COLUMN "orgFeePct" DECIMAL(5,4);
ALTER TABLE "Fund" ADD COLUMN "expenseRatioPct" DECIMAL(5,4);
ALTER TABLE "Fund" ADD COLUMN "aumCalculationFrequency" TEXT NOT NULL DEFAULT 'DAILY';

-- Create AumSnapshot table for historical AUM tracking
CREATE TABLE "AumSnapshot" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "period" TEXT NOT NULL,
    "grossAum" DECIMAL(18,2) NOT NULL,
    "netAum" DECIMAL(18,2) NOT NULL,
    "nav" DECIMAL(18,2) NOT NULL,
    "totalCommitted" DECIMAL(18,2) NOT NULL,
    "totalFunded" DECIMAL(18,2) NOT NULL,
    "totalDistributed" DECIMAL(18,2) NOT NULL,
    "managementFees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "performanceFees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "orgFees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "expenses" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "investorCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "managementFeeRate" DECIMAL(5,4),
    "carryRate" DECIMAL(5,4),
    "orgFeeRate" DECIMAL(5,4),
    "expenseRate" DECIMAL(5,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AumSnapshot_pkey" PRIMARY KEY ("id")
);

-- Indexes for AumSnapshot
CREATE UNIQUE INDEX "AumSnapshot_fundId_date_period_key" ON "AumSnapshot"("fundId", "date", "period");
CREATE INDEX "AumSnapshot_fundId_period_date_idx" ON "AumSnapshot"("fundId", "period", "date");
CREATE INDEX "AumSnapshot_date_idx" ON "AumSnapshot"("date");

-- Foreign key
ALTER TABLE "AumSnapshot" ADD CONSTRAINT "AumSnapshot_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
