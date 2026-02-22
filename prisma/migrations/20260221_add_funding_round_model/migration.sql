-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('COMPLETED', 'ACTIVE', 'PLANNED');

-- CreateTable
CREATE TABLE "FundingRound" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "roundName" TEXT NOT NULL,
    "roundOrder" INTEGER NOT NULL,
    "amountRaised" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "targetAmount" DECIMAL(15,2),
    "preMoneyVal" DECIMAL(15,2),
    "postMoneyVal" DECIMAL(15,2),
    "leadInvestor" TEXT,
    "investorCount" INTEGER NOT NULL DEFAULT 0,
    "roundDate" TIMESTAMP(3),
    "closeDate" TIMESTAMP(3),
    "status" "RoundStatus" NOT NULL DEFAULT 'PLANNED',
    "isExternal" BOOLEAN NOT NULL DEFAULT false,
    "externalNotes" TEXT,
    "instrumentType" TEXT,
    "valuationCap" DECIMAL(15,2),
    "discount" DECIMAL(5,2),
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundingRound_fundId_idx" ON "FundingRound"("fundId");

-- CreateIndex
CREATE INDEX "FundingRound_orgId_idx" ON "FundingRound"("orgId");

-- CreateIndex
CREATE INDEX "FundingRound_fundId_status_idx" ON "FundingRound"("fundId", "status");

-- AddForeignKey
ALTER TABLE "FundingRound" ADD CONSTRAINT "FundingRound_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
