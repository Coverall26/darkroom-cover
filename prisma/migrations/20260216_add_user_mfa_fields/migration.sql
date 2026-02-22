-- Add MFA fields to User model
ALTER TABLE "User" ADD COLUMN "mfaSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "mfaRecoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[];
