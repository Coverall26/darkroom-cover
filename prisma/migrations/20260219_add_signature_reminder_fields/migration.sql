-- Add reminder tracking fields to SignatureRecipient
ALTER TABLE "SignatureRecipient" ADD COLUMN "lastReminderSentAt" TIMESTAMP(3);
ALTER TABLE "SignatureRecipient" ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;
