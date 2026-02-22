# FundRoom.ai — Database Setup, Migrations & Seeding Guide

**Last Updated:** February 15, 2026

---

## Quick Start

```bash
# 1. Set database URL
export SUPABASE_DATABASE_URL="postgresql://postgres.[project]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

# 2. Generate Prisma client
npx prisma generate

# 3. Apply all migrations
npx prisma migrate deploy

# 4. Seed first tenant
npx ts-node prisma/seed-bermuda.ts

# 5. (Optional) Create platform admin with password
npx ts-node prisma/seed-platform-admin.ts --set-password YourPassword123

# 6. Start dev server
npm run dev -- -p 5000 -H 0.0.0.0
```

---

## 1. Database Architecture

FundRoom.ai uses a **dual-database architecture**: Supabase PostgreSQL as the primary database with an optional Replit Postgres hot backup.

```
App Request → Prisma Client (SUPABASE_DATABASE_URL)
                ↓
           Primary Write → Supabase PostgreSQL
                ↓ (backup-write extension)
           Queue async backup (if BACKUP_DB_ENABLED=true)
                ↓ (100ms → 500ms → 2000ms retries)
           Upsert → Replit Postgres (backup)
```

### Environment Variables

| Variable | Priority | Purpose |
|----------|----------|---------|
| `SUPABASE_DATABASE_URL` | 1st (preferred) | Primary database connection |
| `DATABASE_URL` | 2nd (fallback) | Fallback if SUPABASE_DATABASE_URL not set |
| `REPLIT_DATABASE_URL` | Optional | Backup database (development/fallback) |
| `BACKUP_DB_ENABLED` | Default: `false` | Kill switch for backup writes |

### Connection String Format

**Supabase (Session Pooler — recommended for development):**
```
postgresql://postgres.[project]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

**Supabase (Transaction Pooler — recommended for serverless/Vercel):**
```
postgresql://postgres.[project]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

| Port | Mode | Best For |
|------|------|----------|
| 5432 | Session pooler | Interactive dev sessions, Replit |
| 6543 | Transaction pooler | Vercel serverless, high-concurrency |

---

## 2. Prisma Configuration

### Schema File
**Location:** `prisma/schema.prisma` (~4,274 lines)

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["relationJoins"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Note:** The schema uses `env("DATABASE_URL")` but `lib/prisma.ts` overrides this at runtime to prefer `SUPABASE_DATABASE_URL`.

### Client Initialization
**File:** `lib/prisma.ts`

```typescript
function createPrismaClient() {
  const datasourceUrl =
    process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;

  const baseClient = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(datasourceUrl ? { datasourceUrl } : {}),
  });

  return baseClient
    .$extends(softDeleteExtension)    // Runs first (innermost)
    .$extends(auditLogExtension)      // Runs second
    .$extends(backupWriteExtension);  // Runs last (outermost interceptor)
}
```

**Extension order matters:** `backupWriteExtension` must be last to capture final results after soft-delete and audit transforms.

### Schema Metrics (Feb 15, 2026)

| Metric | Count |
|--------|-------|
| Models | 117 |
| Enums | 40 |
| Schema lines | ~4,274 |
| Columns | ~1,720 |
| Indexes | 530 |
| Composite indexes | 6 |

---

## 3. Schema Organization

### Model Groups (117 models)

| Group | Key Models | Count |
|-------|-----------|-------|
| **Core Identity** | User, Account, Session, Organization, Team, UserTeam | 7 |
| **Fund & Investment** | Fund, FundAggregate, Investor, Investment, InvestmentTranche, PricingTier, CapitalCall, Distribution | 12 |
| **Dataroom & Documents** | Dataroom, Document, DocumentVersion, LPDocument | 8 |
| **E-Signature** | SignatureDocument, SignatureRecipient, SignatureField, SignatureTemplate | 5 |
| **Onboarding** | OnboardingFlow, AccreditationAck, MarketplaceWaitlist | 6 |
| **Wire Transfer** | Transaction, ManualInvestment, BankLink | 3 |
| **Marketplace** | Deal, DealNote, DealInterest, MarketplaceListing | 6 |
| **Audit & Compliance** | AuditLog, AuditMetadata, AumSnapshot, ProfileChangeRequest | 4 |
| **Settings** | OrganizationDefaults, SecurityPolicy, FundroomActivation | 8 |
| **Other** | View, Click, Export, Notification, Engagement, etc. | 58 |

### Key Relations
```
Organization → Team (one-to-many)
User → Team (many-to-many via UserTeam)
Team → Fund (one-to-many)
Fund → Investor (one-to-many via Investment)
Investment → InvestmentTranche (one-to-many)
Fund → SignatureDocument (one-to-many)
Investor → OnboardingFlow (one-to-one)
Dataroom → Document (one-to-many)
SignatureDocument → SignatureRecipient (one-to-many)
```

### Cascade Delete Policy
Financial and compliance models use `onDelete: Restrict` to prevent accidental data loss:

| Model | Relation | Policy | Why |
|-------|----------|--------|-----|
| AuditLog | team | Restrict | SEC 506(c) compliance records |
| SignatureDocument | team, owner | Restrict | Legally binding documents |
| Investment | fund, investor | Restrict | Financial records |
| CapitalCall | fund | Restrict | Capital call records |
| InvestmentTranche | investment | Restrict | Tranche records |
| Distribution | fund | Restrict | Distribution records |
| LPDocument | investor, uploadedBy | Restrict | Investor documents |

---

## 4. Migrations

### Migration Directory
**Path:** `prisma/migrations/` (19 migrations as of Feb 15, 2026)

### Creating a New Migration

#### Option 1: Interactive (development only)
```bash
npx prisma migrate dev --name descriptive_name
```
This creates the migration, applies it, and regenerates the client.

#### Option 2: Manual (recommended for production-critical changes)
```bash
# 1. Create migration directory
mkdir -p prisma/migrations/20260215_your_migration_name

# 2. Write SQL manually or generate diff
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "postgresql://user@localhost:5432/shadow-db" \
  --script > prisma/migrations/20260215_your_migration_name/migration.sql

# 3. Apply and mark as resolved
npx prisma migrate deploy
```

#### Option 3: Schema-only sync (non-destructive)
For adding missing tables/columns without migration history:
```bash
npx prisma db push
```

### Deploying Migrations

**To Supabase (production):**
```bash
npx prisma migrate deploy
```

**To Replit (backup):**
```bash
DATABASE_URL=$REPLIT_DATABASE_URL npx prisma migrate deploy
```

### After Any Schema Change
Always regenerate the Prisma client:
```bash
npx prisma generate
```
TypeScript compilation will fail if the client is stale.

### Migration History (Latest First)

| Migration | Date | Description |
|-----------|------|-------------|
| `20260215_add_org_setup_fields` | Feb 15 | 27 fields: Organization (Bad Actor cert), Fund (waterfall, hurdle), OrgDefaults (LP onboarding) |
| `20260214_add_investor_sec_compliance_fields` | Feb 14 | sourceOfFunds, occupation on Investor |
| `20260214_add_investor_entity_fields` | Feb 14 | entityType, entityDetails, taxId, authorized signer |
| `20260214_add_gp_document_types` | Feb 14 | GP document type enum values |
| `20260214_add_document_template_config` | Feb 14 | documentTemplateConfig JSON on OrgDefaults |
| `20260213_add_signed_file_url_to_signature_document` | Feb 13 | signedFileUrl, signedFileType, signedAt on SignatureDocument |
| `20260213_add_lp_onboarding_settings` | Feb 13 | 11 LP onboarding columns on OrgDefaults |
| `20260213_add_fund_details_gp_fields` | Feb 13 | GP fund detail fields |
| `20260211_add_signature_document_fund_link` | Feb 11 | fundId, requiredForOnboarding on SignatureDocument |
| `20260210_add_transaction_receipt_tracking` | Feb 10 | Wire confirmation fields on Transaction |
| Earlier migrations | Feb 7-9 | Wire instructions, marketplace models, audit cascade |

---

## 5. Seed Scripts

### Bermuda Tenant Seed (Production)
**File:** `prisma/seed-bermuda.ts`

Seeds the first production tenant with complete fund, users, and pricing.

```bash
npx ts-node prisma/seed-bermuda.ts
npx ts-node prisma/seed-bermuda.ts --clean      # Reset and re-seed
npx ts-node prisma/seed-bermuda.ts --dry-run     # Preview without writing
```

**Creates:**
| Entity | Details |
|--------|---------|
| Organization | Bermuda Franchise Group (navy/gold branding) |
| Team | Bermuda Franchise Fund I |
| Fund | $9.55M target, 2.5% mgmt fee, 20% carry, 8% hurdle, European waterfall |
| GP Admin | `rciesco@fundroom.ai` (platform admin) |
| GP User | `joe@bermudafranchisegroup.com` / `FundRoom2026!` |
| LP User | `demo-investor@example.com` / `Investor2026!` |
| Pricing Tiers | 6 tiers (90 total units) |
| Signature Docs | NDA + Subscription Agreement (requiredForOnboarding) |
| Wire Instructions | Fund wire transfer details |

**Idempotent:** Yes — safe to run multiple times.

### Platform Admin Seed
**File:** `prisma/seed-platform-admin.ts`

Creates or updates the platform admin user.

```bash
npx ts-node prisma/seed-platform-admin.ts
npx ts-node prisma/seed-platform-admin.ts --set-password MyPassword123
```

**Creates:**
- Platform admin user (`rciesco@fundroom.ai`)
- Optional bcrypt-hashed password (12 salt rounds)

**Post-seed workflow:**
1. Login at `/admin/login` with email + password (or magic link)
2. Complete Org Setup Wizard at `/admin/setup`
3. Wizard creates: Organization, Team, Fund, Dataroom, SecurityPolicy

### Data Import Seed
**File:** `prisma/seed.ts`

Import fund data from JSON export.

```bash
npx ts-node prisma/seed.ts --file=export.json --team=teamId
npx ts-node prisma/seed.ts --file=export.json --dry-run
```

### Test Data Seed
**File:** `prisma/test-seed.ts`

Seeds test data for automated testing (test users, orgs, funds, investors).

---

## 6. Dual-Database Architecture

### Implementation Files

| File | Lines | Purpose |
|------|-------|---------|
| `lib/prisma.ts` | 33 | Main client factory with extension chain |
| `lib/prisma/backup-client.ts` | 30 | Backup Prisma client singleton |
| `lib/prisma/backup-queue.ts` | 109 | Ordered async queue with retry logic |
| `lib/prisma/extensions/backup-write.ts` | 150 | Dual-write Prisma extension |

### Backup Configuration

| Setting | Value |
|---------|-------|
| Queue type | In-memory, ordered per model/ID |
| Max queue size | 1,000 items (drops oldest if full) |
| Retry strategy | 3 attempts: 100ms → 500ms → 2,000ms |
| Write pattern | Upsert (idempotent, safe for retries) |
| Failed writes | Logged to console + Rollbar (never blocks primary) |
| Kill switch | `BACKUP_DB_ENABLED=false` (default) |

### Enabling Backup Writes

```bash
# 1. Set env vars
export BACKUP_DB_ENABLED=true
export REPLIT_DATABASE_URL="postgresql://..."

# 2. Sync backup schema
DATABASE_URL=$REPLIT_DATABASE_URL npx prisma db push

# 3. Restart server — backup writes begin automatically
```

### Monitoring Backup Sync

```bash
# Admin endpoint (requires auth)
curl -H "Cookie: session=..." https://app.fundroom.ai/api/admin/db-health
```

Returns per-table row count comparison and drift detection for 10 critical tables.

---

## 7. Health Endpoints

### Public Health Check
**Endpoint:** `GET /api/health` (no auth required)

```bash
curl https://app.fundroom.ai/api/health
```

```json
{
  "status": "healthy",
  "timestamp": "2026-02-15T12:34:56.789Z",
  "checks": {
    "database": { "status": "up", "latencyMs": 45 },
    "storage": { "status": "up", "provider": "vercel" }
  }
}
```

| Status | Meaning |
|--------|---------|
| `healthy` | Database up + storage configured |
| `degraded` | Database up but storage not configured |
| `unhealthy` | Database down (returns HTTP 503) |

### Admin Database Health
**Endpoint:** `GET /api/admin/db-health` (admin auth required)

Returns row count comparison between primary and backup for 10 critical tables (user, team, document, dataroom, fund, investor, transaction, auditLog, signatureDocument, organization).

---

## 8. Encryption

### Encrypted Fields

| Field | Model | Purpose |
|-------|-------|---------|
| `taxIdEncrypted` | Investor | SSN (XXX-XX-XXXX) or EIN (XX-XXXXXXX) |
| `ein` | Organization | Employer Identification Number |
| Wire instructions | Fund (featureFlags JSON) | Bank account, routing, SWIFT |
| Signature images | SignatureDocument | Base64 signature/initials |
| API keys | OrganizationIntegrationCredential | Third-party integration keys |

### Encryption Implementation

**Algorithm:** AES-256-GCM (authenticated encryption)

**Key derivation:**
```typescript
const keyBase = process.env.NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY || process.env.NEXTAUTH_SECRET;
const key = crypto.createHash("sha256").update(`${keyBase}:fundroom-document-encryption-v1`).digest();
```

**Key files:**
| File | Purpose |
|------|---------|
| `lib/crypto/secure-storage.ts` | `encryptTaxId()`, `decryptTaxId()`, document checksums |
| `lib/signature/encryption-service.ts` | Signature image + document encryption |
| `lib/crypto/pdf-encryption.ts` | Password-protected PDFs |

### Backup Replication
Encrypted fields are replicated as ciphertext to the backup database. Encryption keys live in environment variables — never stored in the database.

---

## 9. Vercel Production Configuration

### Build Command
```bash
npx prisma generate --schema=./prisma/schema.prisma && \
  node scripts/generate-sw-version.js && \
  next build
```

### Required Environment Variables (Vercel)

| Variable | Value | Why |
|----------|-------|-----|
| `SUPABASE_DATABASE_URL` | Connection string | Primary database |
| `STORAGE_PROVIDER` | `vercel` | Vercel Blob Storage |
| `BACKUP_DB_ENABLED` | `false` | Disable backup writes |
| `NEXTAUTH_URL` | `https://app.fundroom.ai` | Auth callbacks |
| `NEXT_PUBLIC_BASE_URL` | `https://app.fundroom.ai` | Client URL resolution |

See `.env.example` for all 108 environment variables.

---

## 10. Troubleshooting

### "Drift detected" Error
```bash
# Option 1: Schema-only sync (non-destructive)
npx prisma db push

# Option 2: Reset dev database (WARNING: deletes all data)
npx prisma migrate reset
```

### Stale Prisma Client (TypeScript Errors)
```bash
npx prisma generate
```
Must run after any `schema.prisma` modification.

### Connection Timeout from Replit
Switch from transaction pooler (port 6543) to session pooler (port 5432) in your connection string.

### Verify Schema is Valid
```bash
npx prisma validate
```

### Check Which Database is Active
```bash
# In Node.js
console.log(process.env.SUPABASE_DATABASE_URL ? "Supabase" : "DATABASE_URL fallback");
```

### Sync Backup After Schema Changes
```bash
DATABASE_URL=$REPLIT_DATABASE_URL npx prisma db push
```

---

## 11. Related Documentation

| Document | Purpose |
|----------|---------|
| `docs/DUAL_DATABASE_SPEC.md` | Complete dual-database architecture, sync procedures |
| `prisma/README.md` | Migration creation with shadow databases |
| `CLAUDE.md` | Implementation status with all schema changes by date |
| `.env.example` | All 108 environment variables with descriptions |
| `docs/BUG_MONITORING_TOOLS_REPORT.md` | DB health monitoring tools |
