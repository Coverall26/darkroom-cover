-- AlterTable: Add signed file tracking columns to SignatureDocument
ALTER TABLE "SignatureDocument" ADD COLUMN "signedFileUrl" TEXT;
ALTER TABLE "SignatureDocument" ADD COLUMN "signedFileType" TEXT;
ALTER TABLE "SignatureDocument" ADD COLUMN "signedAt" TIMESTAMP(3);
