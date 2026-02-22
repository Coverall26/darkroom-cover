# FundRoom.ai — Operational Runbook

**Last Updated:** February 20, 2026
**Audience:** Platform administrators and on-call engineers

---

## Table of Contents

1. [Add a New GP Organization](#1-add-a-new-gp-organization)
2. [Reset LP Onboarding](#2-reset-lp-onboarding)
3. [Confirm a Wire Transfer](#3-confirm-a-wire-transfer)
4. [Export Fund Data (Form D / CSV)](#4-export-fund-data)
5. [Rotate Encryption Keys](#5-rotate-encryption-keys)
6. [Run Database Migrations](#6-run-database-migrations)
7. [Rollback a Deployment](#7-rollback-a-deployment)
8. [Investigate Email Delivery Issues](#8-investigate-email-delivery-issues)
9. [Check Audit Logs](#9-check-audit-logs)
10. [Manage Platform Settings](#10-manage-platform-settings)
11. [Troubleshoot Health Check Failures](#11-troubleshoot-health-check-failures)
12. [Manage CRM Billing](#12-manage-crm-billing)

---

## 1. Add a New GP Organization

### Via GP Setup Wizard (Standard)

1. GP signs up at `https://app.fundroom.ai/signup`
2. Email verification via magic link
3. GP completes 9-step wizard at `/admin/setup`
4. Wizard creates: Organization, Team, Fund, FundroomActivation, Dataroom

### Via Seed Script (Development/Staging)

```bash
# Seed Bermuda test tenant
npx ts-node prisma/seed-bermuda.ts

# Create platform admin
npx ts-node prisma/seed-platform-admin.ts --set-password
```

### Via Database (Emergency)

```sql
-- Create organization
INSERT INTO "Organization" (id, name, slug, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Acme Capital', 'acme-capital', NOW(), NOW());

-- Create team linked to org
INSERT INTO "Team" (id, name, "organizationId", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Acme Capital', '<org-id>', NOW(), NOW());

-- Activate FundRoom for the team
INSERT INTO "FundroomActivation" (id, "teamId", status, mode, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), '<team-id>', 'ACTIVE', 'GP_FUND', NOW(), NOW());
```

---

## 2. Reset LP Onboarding

### Scenario: LP needs to restart onboarding (stuck, data corruption, etc.)

**Step 1: Identify the investor**
```sql
SELECT i.id, i."userId", i."onboardingStep", i."ndaSigned",
       i."accreditationStatus", u.email
FROM "Investor" i
JOIN "User" u ON i."userId" = u.id
WHERE u.email = 'investor@example.com';
```

**Step 2: Reset onboarding state**
```sql
-- Reset investor onboarding fields
UPDATE "Investor"
SET "onboardingStep" = 1,
    "ndaSigned" = false,
    "accreditationStatus" = 'PENDING',
    "updatedAt" = NOW()
WHERE id = '<investor-id>';

-- Delete any OnboardingFlow records (auto-save state)
DELETE FROM "OnboardingFlow" WHERE "investorId" = '<investor-id>';
```

**Step 3: Reset investment if needed**
```sql
-- Revert investment to ONBOARDING status
UPDATE "Investment"
SET status = 'ONBOARDING', "updatedAt" = NOW()
WHERE "investorId" = '<investor-id>' AND "fundId" = '<fund-id>';
```

**Step 4: Verify**
- LP logs in and sees wizard starting from Step 1
- No data loss — previous form entries may still be in `OnboardingFlow` if not deleted

---

## 3. Confirm a Wire Transfer

### Via GP Dashboard (Standard)

1. GP navigates to `/admin/fund/[id]/wire` → "Confirm Receipt" tab
2. Selects pending transaction → fills date, amount, bank reference
3. Submit confirms atomically: Transaction → COMPLETED, Investment.fundedAmount updated, LP emailed

### Via API (Programmatic)

```bash
curl -X POST https://app.fundroom.ai/api/admin/wire/confirm \
  -H "Cookie: <session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "<transaction-id>",
    "fundsReceivedDate": "2026-02-20",
    "amount": 50000,
    "bankReference": "WR-12345",
    "confirmationNotes": "Confirmed via bank statement"
  }'
```

### Via Database (Emergency)

```sql
BEGIN;

-- Mark transaction complete
UPDATE "Transaction"
SET status = 'COMPLETED',
    "fundsReceivedDate" = NOW(),
    "confirmedAt" = NOW(),
    "confirmationMethod" = 'MANUAL',
    "updatedAt" = NOW()
WHERE id = '<transaction-id>';

-- Update investment funded amount
UPDATE "Investment"
SET "fundedAmount" = "fundedAmount" + 50000,
    status = CASE WHEN "fundedAmount" + 50000 >= "commitmentAmount" THEN 'FUNDED' ELSE status END,
    "updatedAt" = NOW()
WHERE id = '<investment-id>';

COMMIT;
```

---

## 4. Export Fund Data

### Form D Export

```bash
# Via API (requires admin session)
curl -X GET "https://app.fundroom.ai/api/admin/reports/form-d?fundId=<fund-id>&format=csv" \
  -H "Cookie: <session-cookie>" \
  -o form-d-export.csv
```

Returns SEC Form D fields: Section 1 (Issuer), Section 2 (Principal Place), Section 3 (Related Persons), Section 6 (Exemption), Section 13 (Offering Amounts), Section 14 (Investor Counts).

### Fund Reports CSV

```bash
curl -X GET "https://app.fundroom.ai/api/admin/reports/export?fundId=<fund-id>" \
  -H "Cookie: <session-cookie>" \
  -o fund-report.csv
```

### Data Migration Export

Use Settings Center → Advanced → Data Export / Import:
- Exports 12 data models (JSON/CSV)
- Includes: Organizations, Teams, Funds, Investors, Investments, Documents, etc.

---

## 5. Rotate Encryption Keys

**CRITICAL: Key rotation requires re-encryption of all encrypted data.**

### Encryption Salts (env vars)

1. Generate new salt: `openssl rand -hex 32`
2. Update env var in Vercel dashboard (e.g., `DOCUMENT_ENCRYPTION_SALT`)
3. **Re-encrypt all affected data** — this requires a migration script:

```typescript
// Example: re-encrypt tax IDs with new salt
import { decryptTaxId, encryptTaxId } from '@/lib/encryption';

const investors = await prisma.investor.findMany({
  where: { taxIdEncrypted: { not: null } }
});

for (const inv of investors) {
  const decrypted = decryptTaxId(inv.taxIdEncrypted!, OLD_SALT);
  const reEncrypted = encryptTaxId(decrypted, NEW_SALT);
  await prisma.investor.update({
    where: { id: inv.id },
    data: { taxIdEncrypted: reEncrypted }
  });
}
```

4. Redeploy with new env var
5. Verify decryption works with test data

### NEXTAUTH_SECRET Rotation

1. Set new secret in Vercel
2. All existing sessions will be invalidated (users must re-login)
3. All pending magic links will be invalidated
4. Redeploy

---

## 6. Run Database Migrations

### Development

```bash
# Create a new migration
npx prisma migrate dev --name <migration-name>

# Apply pending migrations
npx prisma migrate dev

# Reset database (destructive — drops all data)
npx prisma migrate reset
```

### Production (Vercel/Supabase)

```bash
# Apply pending migrations to production
npx prisma migrate deploy

# Or push schema changes directly (use with caution)
npx prisma db push
```

### Verify After Migration

```bash
# Regenerate Prisma client
npx prisma generate

# Check TypeScript
npx tsc --noEmit

# Run tests
npm test
```

### Rollback a Migration

Prisma does not support automatic migration rollback. To revert:

1. Write a reverse migration SQL manually
2. Apply via `prisma migrate dev --name revert-<original-name>`
3. Or restore from database backup

---

## 7. Rollback a Deployment

### Via Vercel Dashboard

1. Go to Vercel Dashboard → Deployments
2. Find the last working deployment
3. Click "..." → "Promote to Production"
4. Verify health: `GET /api/health`

### Via Vercel CLI

```bash
# List recent deployments
vercel ls

# Promote a specific deployment
vercel promote <deployment-url>
```

### Via Vercel API

```bash
curl -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "darkroom", "target": "production", "gitSource": {"ref": "<commit-sha>"}}'
```

### After Rollback

- Check `/api/health` returns `healthy`
- Check `/api/admin/deployment-readiness` for any new failures
- Monitor Rollbar for error rate changes
- If database migration was involved, ensure schema compatibility

---

## 8. Investigate Email Delivery Issues

### Check Resend Configuration

```bash
# Verify Resend is configured
curl -X GET https://app.fundroom.ai/api/health
# Look for: "email": { "status": "up" }
```

### Check Resend Dashboard

1. Login to [resend.com](https://resend.com)
2. Check Logs → filter by recipient email
3. Common issues:
   - **Bounced**: Invalid recipient email
   - **Complained**: Recipient marked as spam
   - **Dropped**: Resend rate limit or suppression list

### Check Domain Verification

1. Resend Dashboard → Domains
2. Verify `fundroom.ai` has all DNS records (SPF, DKIM, DMARC)
3. For org custom domains: check Team.emailDomainStatus in database

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| No emails sent | `RESEND_API_KEY` missing or test key | Set live key in Vercel |
| Emails go to spam | Missing SPF/DKIM records | Add DNS records per Resend dashboard |
| Magic links expired | `NEXTAUTH_URL` mismatch | Verify URL matches production domain |
| Org emails fail | Custom domain not verified | Run verification from Settings → Email Domain |

### Test Email Delivery

```bash
# Trigger a test email via the signup flow
# Or use the Resend API directly:
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from": "test@fundroom.ai", "to": "admin@fundroom.ai", "subject": "Test", "text": "Test email"}'
```

---

## 9. Check Audit Logs

### Via Admin Dashboard

1. Navigate to `/admin/audit`
2. Filter by: event type, user, date range, resource type
3. Export to CSV for compliance reporting

### Via Database Query

```sql
-- Recent audit events
SELECT "eventType", "userId", "resourceType", "resourceId",
       "ipAddress", "createdAt"
FROM "AuditLog"
ORDER BY "createdAt" DESC
LIMIT 50;

-- Specific user's actions
SELECT * FROM "AuditLog"
WHERE "userId" = '<user-id>'
ORDER BY "createdAt" DESC;

-- SEC 506(c) compliance events
SELECT * FROM "ImmutableAuditLog"
WHERE "eventType" IN ('ACCREDITATION_VERIFIED', 'DOCUMENT_SIGNED', 'INVESTMENT_COMMITTED')
ORDER BY "createdAt" DESC;
```

### Audit Event Types

Key event types to monitor:
- `WIRE_CONFIRMED` — GP confirmed a wire transfer
- `DOCUMENT_APPROVED` / `DOCUMENT_REJECTED` — GP document review
- `INVESTMENT_COMMITTED` — LP committed capital
- `ACCREDITATION_VERIFIED` — LP accreditation confirmed
- `FUNDROOM_ACTIVATED` / `FUNDROOM_DEACTIVATED` — Org activation changes
- `DATA_EXPORT` — Data export (compliance tracking)
- `CRM_SUBSCRIPTION_CHANGED` — Billing tier change

---

## 10. Manage Platform Settings

### Platform-Wide Toggle (Platform Owner Only)

```bash
# Get current settings
curl -X GET https://app.fundroom.ai/api/admin/platform/settings \
  -H "Cookie: <admin-session>"

# Disable paywall globally
curl -X PATCH https://app.fundroom.ai/api/admin/platform/settings \
  -H "Cookie: <admin-session>" \
  -H "Content-Type: application/json" \
  -d '{"paywallEnforced": false}'

# Enable maintenance mode
curl -X PATCH https://app.fundroom.ai/api/admin/platform/settings \
  -H "Cookie: <admin-session>" \
  -H "Content-Type: application/json" \
  -d '{"maintenanceMode": true, "maintenanceMessage": "Scheduled maintenance in progress"}'
```

### Per-Org Activation

```bash
# Check org activation status
curl -X GET "https://app.fundroom.ai/api/teams/<teamId>/fundroom-activation" \
  -H "Cookie: <owner-session>"

# Suspend an org
curl -X PATCH "https://app.fundroom.ai/api/teams/<teamId>/fundroom-activation" \
  -H "Cookie: <owner-session>" \
  -H "Content-Type: application/json" \
  -d '{"action": "suspend"}'

# Reactivate
curl -X PATCH "https://app.fundroom.ai/api/teams/<teamId>/fundroom-activation" \
  -H "Cookie: <owner-session>" \
  -H "Content-Type: application/json" \
  -d '{"action": "reactivate"}'
```

---

## 11. Troubleshoot Health Check Failures

### Health Endpoint: `GET /api/health`

| Service | Status | Meaning | Fix |
|---------|--------|---------|-----|
| database | `down` | Cannot connect to Postgres | Check `SUPABASE_DATABASE_URL`, Supabase status page |
| redis | `down` | Cannot connect to Redis | Check `UPSTASH_REDIS_REST_URL/TOKEN`, Upstash status page |
| redis | `not_configured` | No Redis credentials | Set `UPSTASH_REDIS_REST_URL/TOKEN` (falls back to in-memory) |
| storage | `down` | Storage provider not configured | Set `STORAGE_PROVIDER` env var |
| email | `down` | Resend not configured | Set `RESEND_API_KEY` |

### Overall Status Logic

- `healthy` = all services up (or configured with fallback)
- `degraded` = non-critical service down (redis, email)
- `unhealthy` = database down (returns HTTP 503)

### Deployment Readiness: `GET /api/admin/deployment-readiness`

Requires admin auth. Returns 30+ checks across categories:
- Database (connection + latency + schema + Redis)
- Authentication (secrets, OAuth)
- Email (API key + client init)
- Storage (provider + credentials)
- Monitoring (Rollbar tokens)
- Security (encryption keys + roundtrip test)
- Data (tenant seeded, admin exists)
- Billing (paywall config)

---

## 12. Manage CRM Billing

### Setup Stripe Products (First Time)

```bash
# Development/sandbox
npx ts-node scripts/setup-stripe-crm-products.ts

# Production (creates real products)
npx ts-node scripts/setup-stripe-crm-products.ts --live
```

Set the output price IDs as env vars in Vercel.

### Check Org Subscription Status

```sql
SELECT name, "subscriptionTier", "subscriptionStatus",
       "aiCrmEnabled", "stripeCustomerId"
FROM "Organization"
WHERE id = '<org-id>';
```

### Manually Upgrade/Downgrade

```sql
-- Upgrade to FUNDROOM tier
UPDATE "Organization"
SET "subscriptionTier" = 'FUNDROOM',
    "subscriptionStatus" = 'ACTIVE',
    "updatedAt" = NOW()
WHERE id = '<org-id>';
```

### Webhook Troubleshooting

1. Check Stripe Dashboard → Webhooks → Events
2. Look for failed deliveries to `/api/webhooks/stripe-crm`
3. Verify `STRIPE_CRM_WEBHOOK_SECRET` matches Stripe dashboard
4. Check Rollbar for webhook handler errors

---

## See Also

- `docs/ENV_VARS.md` — Environment variable reference
- `docs/DEPLOYMENT.md` — Deployment procedures
- `docs/LAUNCH_CHECKLIST.md` — Pre-launch checklist
- `docs/DATABASE_SETUP.md` — Database setup and migration guide
- `docs/SEC_COMPLIANCE.md` — SEC compliance requirements
- `docs/ARCHITECTURE.md` — System architecture
