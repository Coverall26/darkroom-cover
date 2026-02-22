-- CreateEnum
CREATE TYPE "AccreditationGateType" AS ENUM ('SELF_CERTIFICATION', 'QUALIFIED_PURCHASER', 'ACCREDITED_ONLY');

-- AlterTable: Add accreditation gate fields to Link
ALTER TABLE "Link" ADD COLUMN "enableAccreditation" BOOLEAN DEFAULT false;
ALTER TABLE "Link" ADD COLUMN "accreditationType" "AccreditationGateType" DEFAULT 'SELF_CERTIFICATION';
ALTER TABLE "Link" ADD COLUMN "accreditationMessage" TEXT;

-- AlterTable: Add accreditation gate fields to LinkPreset
ALTER TABLE "LinkPreset" ADD COLUMN "enableAccreditation" BOOLEAN DEFAULT false;
ALTER TABLE "LinkPreset" ADD COLUMN "accreditationType" TEXT;
ALTER TABLE "LinkPreset" ADD COLUMN "accreditationMessage" TEXT;

-- CreateTable
CREATE TABLE "AccreditationGateResponse" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "accreditationType" "AccreditationGateType" NOT NULL DEFAULT 'SELF_CERTIFICATION',
    "confirmedAccredited" BOOLEAN NOT NULL DEFAULT false,
    "confirmedRiskAware" BOOLEAN NOT NULL DEFAULT false,
    "confirmedOwnResearch" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccreditationGateResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccreditationGateResponse_viewId_key" ON "AccreditationGateResponse"("viewId");

-- CreateIndex
CREATE INDEX "AccreditationGateResponse_linkId_idx" ON "AccreditationGateResponse"("linkId");

-- CreateIndex
CREATE INDEX "AccreditationGateResponse_viewId_idx" ON "AccreditationGateResponse"("viewId");

-- AddForeignKey
ALTER TABLE "AccreditationGateResponse" ADD CONSTRAINT "AccreditationGateResponse_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccreditationGateResponse" ADD CONSTRAINT "AccreditationGateResponse_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "View"("id") ON DELETE CASCADE ON UPDATE CASCADE;
