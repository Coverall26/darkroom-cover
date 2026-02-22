-- Contact outreach tracking fields
ALTER TABLE "Contact" ADD COLUMN "lastContactedAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "nextFollowUpAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "lastEmailedAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "unsubscribedAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "emailBounced" BOOLEAN NOT NULL DEFAULT false;

-- ContactActivity email tracking
ALTER TABLE "ContactActivity" ADD COLUMN "emailId" TEXT;

-- Indexes for outreach queue and follow-up queries
CREATE INDEX "Contact_nextFollowUpAt_idx" ON "Contact"("nextFollowUpAt");
CREATE INDEX "Contact_lastContactedAt_idx" ON "Contact"("lastContactedAt");
