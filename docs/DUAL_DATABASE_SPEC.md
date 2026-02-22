# Dual-Database Architecture: Supabase (Primary) + Replit Postgres (Backup)

> **See also:** [`docs/BUG_MONITORING_TOOLS_REPORT.md`](./BUG_MONITORING_TOOLS_REPORT.md) — Section 15 covers dual-database health monitoring and debugging workflows.

## Overview
Every database write (create, update, upsert, delete) hits Supabase first, then is replicated asynchronously to Replit Postgres as a hot backup. Backup failures must never break the primary.

## Architecture

```
App → Prisma Client (SUPABASE_DATABASE_URL || DATABASE_URL → Supabase)
         ↓ (backup-write extension intercepts all mutations)
         ↓ Gets RESULT with real IDs from primary
         ↓ Queues backup operation with result data
      Ordered per-model backup queue
         ↓ Sequential processing per entity
      Backup Prisma Client (REPLIT_DATABASE_URL → Replit Postgres)
         ↓ Uses upsert (idempotent, retry-safe)
```

## Critical Design Decisions

### 1. Use Result Data, NOT Original Args
Primary write returns result with real auto-generated IDs (cuid). Backup must use this result data, not the original args, to ensure ID consistency between databases.

### 2. Upsert Pattern on Backup
All backup writes use upsert (idempotent). This means:
- Retries are safe (no duplicate key errors)
- Out-of-order processing is handled gracefully
- Creates and updates both work correctly

### 3. Ordered Per-Model Queue
Instead of raw `setImmediate`, use an ordered queue per model/ID to prevent race conditions (e.g., create followed immediately by update on same record).

### 4. Transaction Batching
When `prisma.$transaction()` is used, batch all backup writes and apply them in order to maintain consistency.

### 5. Extension Chain Order
In Prisma, the LAST `$extends()` call is the outermost (intercepts first). So backup-write must be LAST to capture final results after soft-delete/audit transforms:
```typescript
return baseClient
  .$extends(softDeleteExtension)    // innermost — runs first
  .$extends(auditLogExtension)      // middle — audit logging
  .$extends(backupWriteExtension);  // outermost (LAST) — captures final results
```
The backup-write extension must be LAST because in Prisma, the last `$extends()` is the outermost interceptor. This ensures backup captures the final post-soft-delete, post-audit result.

## Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| `SUPABASE_DATABASE_URL` | Supabase (secret) | **Primary** database — preferred by `lib/prisma.ts` |
| `DATABASE_URL` | Supabase or Replit (secret/env) | Fallback primary database (used if `SUPABASE_DATABASE_URL` not set) |
| `POSTGRES_PRISMA_URL` | Supabase (existing secret) | Pooled Supabase connection (same as DATABASE_URL) |
| `REPLIT_DATABASE_URL` | Replit Postgres (env var) | Backup database |
| `BACKUP_DB_ENABLED` | Env var, `"true"/"false"` | Kill switch to disable backup writes (currently `"false"`) |

### Connection Priority (lib/prisma.ts)
`lib/prisma.ts` uses `datasourceUrl` to override the Prisma schema's `env("DATABASE_URL")` at runtime:
1. **`SUPABASE_DATABASE_URL`** — checked first, always points to Supabase session pooler (port 5432)
2. **`DATABASE_URL`** — fallback if `SUPABASE_DATABASE_URL` is not set

This eliminates the previous DATABASE_URL conflict in Replit where Replit's runtime could override the Supabase connection string.

### Port Selection
- **Port 5432** (session pooler) — used from Replit/Claude because the transaction pooler times out from Replit's network
- **Port 6543** (transaction pooler) — used from Vercel serverless functions for connection pooling

## Implementation Files

| File | Purpose |
|------|---------|
| `lib/prisma/backup-client.ts` | Backup Prisma client singleton |
| `lib/prisma/backup-queue.ts` | Ordered, per-model async queue with retry |
| `lib/prisma/extensions/backup-write.ts` | Dual-write extension using result data + upsert |
| `lib/prisma.ts` | Wire backup-write extension (LAST in chain = outermost) |
| `scripts/sync-backup-db.ts` | One-time initial data sync from Supabase |
| `pages/api/admin/db-health.ts` | Health check + drift detection endpoint |

## Implementation Details

### backup-client.ts
- Singleton PrismaClient using `REPLIT_DATABASE_URL`
- NO extensions applied (raw client to avoid recursive backup writes)
- Lazy initialization (only created when first write happens)
- Respects `BACKUP_DB_ENABLED` kill switch

### backup-queue.ts
- In-memory ordered queue, keyed by `${model}:${id}`
- Sequential processing per entity (prevents race conditions)
- Max queue size: 1000 items (drop oldest if full, log warning)
- Retry logic: 3 attempts with exponential backoff (100ms, 500ms, 2000ms)
- Failed writes logged to console + Rollbar

### backup-write.ts Extension
Must intercept ALL mutation operations:
- `create` → upsert result data on backup
- `update` → upsert result data on backup
- `upsert` → upsert result data on backup
- `delete` → delete on backup (by ID from result)
- `createMany` → batch upsert results on backup
- `updateMany` → re-query affected records, upsert on backup
- `deleteMany` → delete matching records on backup

Pattern for create/update/upsert:
```typescript
async create({ model, args, query }) {
  const result = await query(args); // Primary write
  enqueueBackup(model, "upsert", {
    where: { id: result.id },
    create: result,
    update: result,
  });
  return result;
}
```

### sync-backup-db.ts
- One-time script to copy all data from Supabase to Replit DB
- Reads tables in dependency order (Users first, then related tables)
- Batch inserts (500 rows per batch)
- Uses upsert to be idempotent (safe to re-run)
- Disables FK constraints during import, re-enables after

### db-health.ts
- Protected admin-only endpoint
- Compares row counts on critical tables between primary and backup
- Returns JSON with per-table counts and any drift detected
- Critical tables: User, Team, Document, Dataroom, Fund, Investor, Transaction

## Schema Sync Process
After any Prisma migration on Supabase:
1. Run `DATABASE_URL=$REPLIT_DATABASE_URL npx prisma db push` against backup
2. Or run `DATABASE_URL=$REPLIT_DATABASE_URL npx prisma migrate deploy`

### Schema Sync Status (Feb 15, 2026)
Both databases are fully synced with the Prisma schema:

| Metric | Supabase (Production) | Replit (Development) |
|--------|----------------------|---------------------|
| Tables | 117 | 117 |
| Columns | 1,694 | 1,694 |
| Indexes | 530 | 530 |
| Enums | 40 | 40 |

**Sync method used**: `prisma db push` (non-destructive, adds missing structure only).
**Last sync date**: Feb 15, 2026.
**Items added since Feb 13**: 11 columns on OrganizationDefaults (LP onboarding settings), 3 columns on SignatureDocument (signedFileUrl, signedFileType, signedAt), 7 columns on Investor (entityType, entityDetails, taxIdType, taxIdEncrypted, authorizedSigner fields, sourceOfFunds, occupation), 6 composite indexes (Investor, Investment, LPDocument).
**Items added to Supabase (Feb 13)**: 8 tables, 36+ columns, 1 enum.
**Items added to Replit (Feb 13)**: 3 tables.

## Encrypted Data Replication

Encrypted fields (AES-256-GCM ciphertext, IVs, auth tags, key hashes) are replicated **as-is** to the backup database. The backup contains identical encrypted data:

- `Document.encryptionKeyHash`, `encryptionIv`, `isClientEncrypted` — replicated as-is
- `SignatureDocument.metadata.encryption.*` (encrypted passwords, files) — replicated as-is
- `OrganizationIntegrationCredential.encryptedCredentials` — replicated as-is
- All SHA-256 checksums and hash-chained audit logs — replicated as-is

**Security property**: Even if the backup database is compromised, all sensitive data remains encrypted. Encryption keys live in environment variables (`NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY`, `STORAGE_ENCRYPTION_KEY`), independent of both databases.

The `stripRelations()` helper in `backup-write.ts` only strips Prisma relation objects — JSON fields containing encrypted payloads (ciphertext + IV + authTag) are preserved during replication.

## Caveats
- Not true replication — application-level dual-write
- `$executeRaw` and `$queryRaw` calls are NOT intercepted
- Brief eventual consistency delay (milliseconds)
- If app crashes mid-request, backup may miss that write
- Reads always go to Supabase only

## Related Documentation

| Document | Coverage |
|----------|----------|
| [`docs/BUG_MONITORING_TOOLS_REPORT.md`](./BUG_MONITORING_TOOLS_REPORT.md) | DB health monitoring, debugging backup sync issues |
| [`docs/TRACKING_AND_MONITORING.md`](./TRACKING_AND_MONITORING.md) | Error reporting, Rollbar integration |
| `CLAUDE.md` | Project overview with bug monitoring quick reference |
