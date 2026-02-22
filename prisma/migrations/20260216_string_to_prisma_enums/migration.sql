-- String to Prisma Enum Migration
-- Converts 8 string fields to typed Prisma enums for compile-time type safety

-- 1. InvestorStage enum (not applied to model yet — Investor has no 'stage' column, uses fundData.approvalStage)

-- 2. InvestmentStatus enum
CREATE TYPE "InvestmentStatus" AS ENUM ('APPLIED', 'COMMITTED', 'DOCS_APPROVED', 'PARTIALLY_FUNDED', 'FUNDED', 'CANCELLED', 'DECLINED', 'WITHDRAWN');
ALTER TABLE "Investment" ALTER COLUMN "status" SET DEFAULT 'COMMITTED';
ALTER TABLE "Investment" ALTER COLUMN "status" TYPE "InvestmentStatus" USING "status"::"InvestmentStatus";

-- 3. TransactionStatus enum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PROOF_UPLOADED');
ALTER TABLE "Transaction" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "Transaction" ALTER COLUMN "status" TYPE "TransactionStatus" USING "status"::"TransactionStatus";

-- 4. TransactionType enum
CREATE TYPE "TransactionType" AS ENUM ('CAPITAL_CALL', 'DISTRIBUTION', 'WIRE_TRANSFER', 'SUBSCRIPTION_PAYMENT');
ALTER TABLE "Transaction" ALTER COLUMN "type" TYPE "TransactionType" USING "type"::"TransactionType";

-- 5. AccreditationStatus enum
CREATE TYPE "AccreditationStatus" AS ENUM ('PENDING', 'SELF_CERTIFIED', 'THIRD_PARTY_VERIFIED', 'KYC_VERIFIED', 'EXPIRED');
ALTER TABLE "Investor" ALTER COLUMN "accreditationStatus" SET DEFAULT 'PENDING';
ALTER TABLE "Investor" ALTER COLUMN "accreditationStatus" TYPE "AccreditationStatus" USING "accreditationStatus"::"AccreditationStatus";

-- 6. InvestmentTrancheStatus enum
CREATE TYPE "InvestmentTrancheStatus" AS ENUM ('SCHEDULED', 'CALLED', 'PARTIALLY_FUNDED', 'FUNDED', 'OVERDUE', 'DEFAULTED', 'CANCELLED');
ALTER TABLE "InvestmentTranche" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';
ALTER TABLE "InvestmentTranche" ALTER COLUMN "status" TYPE "InvestmentTrancheStatus" USING "status"::"InvestmentTrancheStatus";

-- 7. FundStatus enum
CREATE TYPE "FundStatus" AS ENUM ('RAISING', 'ACTIVE', 'DEPLOYED', 'CLOSED', 'LIQUIDATING');
ALTER TABLE "Fund" ALTER COLUMN "status" SET DEFAULT 'RAISING';
ALTER TABLE "Fund" ALTER COLUMN "status" TYPE "FundStatus" USING "status"::"FundStatus";

-- 8. ActivationStatus enum
CREATE TYPE "ActivationStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');
ALTER TABLE "FundroomActivation" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "FundroomActivation" ALTER COLUMN "status" TYPE "ActivationStatus" USING "status"::"ActivationStatus";
