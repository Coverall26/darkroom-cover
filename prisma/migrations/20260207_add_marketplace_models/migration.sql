-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('SOURCED', 'SCREENING', 'DUE_DILIGENCE', 'TERM_SHEET', 'COMMITMENT', 'CLOSING', 'FUNDED', 'MONITORING', 'EXIT', 'PASSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('EQUITY', 'DEBT', 'CONVERTIBLE', 'FUND_OF_FUNDS', 'SECONDARY', 'CO_INVESTMENT', 'SPV');

-- CreateEnum
CREATE TYPE "DealVisibility" AS ENUM ('PRIVATE', 'INVITE_ONLY', 'QUALIFIED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "InterestStatus" AS ENUM ('EXPRESSED', 'REVIEWING', 'COMMITTED', 'ALLOCATED', 'CONFIRMED', 'DECLINED', 'WAITLISTED');

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "thesis" TEXT,
    "dealType" "DealType" NOT NULL DEFAULT 'EQUITY',
    "stage" "DealStage" NOT NULL DEFAULT 'SOURCED',
    "visibility" "DealVisibility" NOT NULL DEFAULT 'PRIVATE',
    "targetName" TEXT,
    "targetSector" TEXT,
    "targetSubSector" TEXT,
    "targetGeography" TEXT,
    "targetWebsite" TEXT,
    "targetRaise" DECIMAL(18,2),
    "minimumTicket" DECIMAL(18,2),
    "maximumTicket" DECIMAL(18,2),
    "preMoneyValuation" DECIMAL(18,2),
    "expectedReturn" TEXT,
    "holdPeriod" TEXT,
    "managementFee" DECIMAL(5,4),
    "carriedInterest" DECIMAL(5,4),
    "preferredReturn" DECIMAL(5,4),
    "totalCommitted" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAllocated" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "investorCount" INTEGER NOT NULL DEFAULT 0,
    "sourcedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ddStartedAt" TIMESTAMP(3),
    "termSheetAt" TIMESTAMP(3),
    "closingDate" TIMESTAMP(3),
    "fundedAt" TIMESTAMP(3),
    "exitAt" TIMESTAMP(3),
    "deadlineAt" TIMESTAMP(3),
    "fundId" TEXT,
    "leadSponsor" TEXT,
    "isLeadDeal" BOOLEAN NOT NULL DEFAULT true,
    "syndication" JSONB,
    "tags" TEXT[],
    "customFields" JSONB,
    "riskScore" INTEGER,
    "confidential" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStageHistory" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStage" "DealStage",
    "toStage" "DealStage" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealInterest" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "investorId" TEXT,
    "userId" TEXT,
    "status" "InterestStatus" NOT NULL DEFAULT 'EXPRESSED',
    "indicativeAmount" DECIMAL(18,2),
    "notes" TEXT,
    "conditionsOrTerms" TEXT,
    "gpNotes" TEXT,
    "respondedByUserId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "convertedToInvestmentId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealAllocation" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "requestedAmount" DECIMAL(18,2) NOT NULL,
    "allocatedAmount" DECIMAL(18,2) NOT NULL,
    "confirmedAmount" DECIMAL(18,2),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "offeredAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "allocationNotes" TEXT,
    "allocatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealDocument" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "storageKey" TEXT,
    "storageType" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "requiredStage" "DealStage",
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealActivity" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealNote" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "highlights" TEXT[],
    "category" TEXT,
    "coverImageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "interestCount" INTEGER NOT NULL DEFAULT 0,
    "saveCount" INTEGER NOT NULL DEFAULT 0,
    "searchTags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deal_teamId_idx" ON "Deal"("teamId");
CREATE INDEX "Deal_stage_idx" ON "Deal"("stage");
CREATE INDEX "Deal_dealType_idx" ON "Deal"("dealType");
CREATE INDEX "Deal_visibility_idx" ON "Deal"("visibility");
CREATE INDEX "Deal_fundId_idx" ON "Deal"("fundId");
CREATE INDEX "Deal_createdByUserId_idx" ON "Deal"("createdByUserId");
CREATE INDEX "Deal_deletedAt_idx" ON "Deal"("deletedAt");
CREATE INDEX "Deal_deadlineAt_idx" ON "Deal"("deadlineAt");
CREATE INDEX "Deal_targetSector_idx" ON "Deal"("targetSector");
CREATE UNIQUE INDEX "Deal_teamId_slug_key" ON "Deal"("teamId", "slug");

-- CreateIndex
CREATE INDEX "DealStageHistory_dealId_idx" ON "DealStageHistory"("dealId");
CREATE INDEX "DealStageHistory_toStage_idx" ON "DealStageHistory"("toStage");
CREATE INDEX "DealStageHistory_createdAt_idx" ON "DealStageHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealInterest_dealId_investorId_key" ON "DealInterest"("dealId", "investorId");
CREATE INDEX "DealInterest_dealId_idx" ON "DealInterest"("dealId");
CREATE INDEX "DealInterest_investorId_idx" ON "DealInterest"("investorId");
CREATE INDEX "DealInterest_userId_idx" ON "DealInterest"("userId");
CREATE INDEX "DealInterest_status_idx" ON "DealInterest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DealAllocation_dealId_investorId_key" ON "DealAllocation"("dealId", "investorId");
CREATE INDEX "DealAllocation_dealId_idx" ON "DealAllocation"("dealId");
CREATE INDEX "DealAllocation_investorId_idx" ON "DealAllocation"("investorId");
CREATE INDEX "DealAllocation_status_idx" ON "DealAllocation"("status");

-- CreateIndex
CREATE INDEX "DealDocument_dealId_idx" ON "DealDocument"("dealId");
CREATE INDEX "DealDocument_category_idx" ON "DealDocument"("category");

-- CreateIndex
CREATE INDEX "DealActivity_dealId_idx" ON "DealActivity"("dealId");
CREATE INDEX "DealActivity_activityType_idx" ON "DealActivity"("activityType");
CREATE INDEX "DealActivity_createdAt_idx" ON "DealActivity"("createdAt");

-- CreateIndex
CREATE INDEX "DealNote_dealId_idx" ON "DealNote"("dealId");
CREATE INDEX "DealNote_authorId_idx" ON "DealNote"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_dealId_key" ON "MarketplaceListing"("dealId");
CREATE INDEX "MarketplaceListing_teamId_idx" ON "MarketplaceListing"("teamId");
CREATE INDEX "MarketplaceListing_isActive_idx" ON "MarketplaceListing"("isActive");
CREATE INDEX "MarketplaceListing_category_idx" ON "MarketplaceListing"("category");
CREATE INDEX "MarketplaceListing_featured_idx" ON "MarketplaceListing"("featured");
CREATE INDEX "MarketplaceListing_publishedAt_idx" ON "MarketplaceListing"("publishedAt");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealStageHistory" ADD CONSTRAINT "DealStageHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealInterest" ADD CONSTRAINT "DealInterest_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealInterest" ADD CONSTRAINT "DealInterest_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DealInterest" ADD CONSTRAINT "DealInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAllocation" ADD CONSTRAINT "DealAllocation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealAllocation" ADD CONSTRAINT "DealAllocation_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealAllocation" ADD CONSTRAINT "DealAllocation_allocatedByUserId_fkey" FOREIGN KEY ("allocatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealDocument" ADD CONSTRAINT "DealDocument_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealDocument" ADD CONSTRAINT "DealDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealActivity" ADD CONSTRAINT "DealActivity_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealActivity" ADD CONSTRAINT "DealActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealNote" ADD CONSTRAINT "DealNote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealNote" ADD CONSTRAINT "DealNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
