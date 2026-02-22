# Deployment Guide

FundRoom deploys to **Vercel** with a **Supabase** PostgreSQL database. This guide covers environment setup, deployment procedures, and rollback.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Vercel Project Configuration](#vercel-project-configuration)
- [Environment Variables](#environment-variables)
- [Domain Setup](#domain-setup)
- [Database Setup](#database-setup)
- [Deployment Procedures](#deployment-procedures)
- [Rollback Procedures](#rollback-procedures)
- [Health Checks](#health-checks)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
                    ┌─────────────────────────┐
                    │     Vercel Edge CDN      │
                    │   (TLS, DDoS, Headers)   │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │    Next.js 16 (Node 22)  │
                    │     Serverless Functions  │
                    └──┬────────┬────────┬────┘
                       │        │        │
          ┌────────────▼──┐ ┌──▼──────┐ ┌▼──────────────┐
          │ Supabase PG   │ │ S3/Blob │ │ Resend Email   │
          │ (Primary DB)  │ │ Storage │ │ + Rollbar      │
          └───────────────┘ └─────────┘ └────────────────┘
```

| Component | Provider | Details |
|-----------|----------|---------|
| Hosting | Vercel | Project `darkroom`, team `bffi`, Node 22.x |
| Database (Primary) | Supabase | PostgreSQL, session pooler port 5432 |
| Database (Backup) | Replit Postgres | Optional, `BACKUP_DB_ENABLED=false` by default |
| Storage | AWS S3 or Vercel Blob | `STORAGE_PROVIDER=vercel` on Vercel |
| Email | Resend | fundroom.ai verified domain |
| Monitoring | Rollbar | Server + client error tracking |
| Analytics | Tinybird | Server-side events, US West 2 |

---

## Vercel Project Configuration

| Setting | Value |
|---------|-------|
| Project Name | `darkroom` |
| Team | `bffi` |
| Org ID | `team_UhYGRc30tmOLJuxfGViNKwhz` |
| Project ID | `prj_TrkpUM6UHrGWQUY8SPHvASmM8BCA` |
| Framework | Next.js |
| Node.js Version | 22.x |
| Build Command | `prisma generate --schema=./prisma/schema.prisma && node scripts/generate-sw-version.js && next build` |
| Install Command | `npm install --legacy-peer-deps` |

### Build Settings

```json
{
  "buildCommand": "prisma generate && node scripts/generate-sw-version.js && next build",
  "installCommand": "npm install --legacy-peer-deps",
  "framework": "nextjs"
}
```

### Function Timeouts

| Function | Max Duration |
|----------|-------------|
| `pages/api/mupdf/convert-page.ts` | 180s |
| `pages/api/mupdf/annotate-document.ts` | 300s |
| `pages/api/mupdf/process-pdf-local.ts` | 300s |
| `pages/api/sign/[token].ts` | 30s |
| `pages/api/webhooks/persona.ts` | 30s |
| `pages/api/webhooks/esign.ts` | 30s |

---

## Environment Variables

### Required for Production

| Category | Variable | Description |
|----------|----------|-------------|
| **Database** | `SUPABASE_DATABASE_URL` | Supabase PostgreSQL connection string (session pooler, port 5432) |
| **Auth** | `NEXTAUTH_SECRET` | 64-char random string for JWT signing |
| **Auth** | `NEXTAUTH_URL` | `https://app.fundroom.ai` |
| **Domain** | `NEXT_PUBLIC_BASE_URL` | `https://app.fundroom.ai` |
| **Domain** | `NEXT_PUBLIC_APP_BASE_HOST` | `app.fundroom.ai` |
| **Domain** | `NEXT_PUBLIC_PLATFORM_DOMAIN` | `fundroom.ai` |
| **Email** | `RESEND_API_KEY` | Resend API key |
| **Storage** | `STORAGE_PROVIDER` | `vercel` (for Vercel deployments) |
| **Storage** | `BLOB_READ_WRITE_TOKEN` | Vercel Blob Storage token |
| **Monitoring** | `ROLLBAR_SERVER_TOKEN` | Rollbar server-side token |
| **Monitoring** | `NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN` | Rollbar client-side token |
| **Encryption** | `NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY` | AES-256 document encryption key |
| **Encryption** | `NEXT_PRIVATE_ENCRYPTION_KEY` | AES-256 PII encryption key (SSN, EIN, bank details) |
| **Encryption** | `STORAGE_ENCRYPTION_KEY` | 64-char hex for storage encryption |

### Required Encryption Salts (6 unique 64-char hex strings)

| Variable | Purpose |
|----------|---------|
| `DOCUMENT_ENCRYPTION_SALT` | Document-level encryption |
| `PLAID_TOKEN_ENCRYPTION_SALT` | Plaid token encryption (Phase 2) |
| `MASTER_ENCRYPTION_KEY` | Master key derivation |
| `HKDF_STORAGE_SALT` | HKDF-based storage encryption |
| `SIGNATURE_VERIFICATION_SALT` | Signature hash verification |
| `AUTH_TOKEN_HASHING_SALT` | Auth token hashing |

### OAuth (Required for Social Login)

| Variable | Description |
|----------|-------------|
| `FUNDROOM_GOOGLE_CLIENT_ID` | Primary Google OAuth client ID |
| `FUNDROOM_GOOGLE_CLIENT_SECRET` | Primary Google OAuth client secret |
| `GOOGLE_CLIENT_ID` | Legacy fallback (remove after migration) |
| `GOOGLE_CLIENT_SECRET` | Legacy fallback |

### Optional but Recommended

| Variable | Default | Description |
|----------|---------|-------------|
| `TINYBIRD_TOKEN` | — | Server analytics |
| `TINYBIRD_HOST` | `https://api.us-west-2.tinybird.co` | Tinybird region |
| `ROLLBAR_READ_TOKEN` | — | Error reading |
| `PERSONA_API_KEY` | — | KYC verification |
| `PERSONA_WEBHOOK_SECRET` | — | KYC webhook validation |
| `STRIPE_SECRET_KEY` | — | Stripe API key for billing |
| `STRIPE_WEBHOOK_SECRET` | — | SaaS billing webhook secret |
| `STRIPE_CRM_WEBHOOK_SECRET` | — | CRM billing webhook secret (falls back to STRIPE_WEBHOOK_SECRET) |
| `STRIPE_CRM_PRO_MONTHLY_PRICE_ID` | — | CRM Pro $20/mo Stripe price ID |
| `STRIPE_CRM_PRO_YEARLY_PRICE_ID` | — | CRM Pro $200/yr Stripe price ID |
| `STRIPE_FUNDROOM_MONTHLY_PRICE_ID` | — | FundRoom $79/mo Stripe price ID |
| `STRIPE_FUNDROOM_YEARLY_PRICE_ID` | — | FundRoom $790/yr Stripe price ID |
| `STRIPE_AI_CRM_MONTHLY_PRICE_ID` | — | AI CRM add-on $49/mo Stripe price ID |
| `STRIPE_AI_CRM_YEARLY_PRICE_ID` | — | AI CRM add-on $490/yr Stripe price ID |
| `UPSTASH_REDIS_REST_URL` | — | Rate limiting (Upstash Redis). **Required for production** — without Redis, rate limiting falls back to in-memory counters that reset on cold start and don't share state across serverless functions |
| `UPSTASH_REDIS_REST_TOKEN` | — | Rate limiting auth token (paired with UPSTASH_REDIS_REST_URL) |
| `PAYWALL_BYPASS` | `true` | Bypass paywall for MVP. **Set to `false` when Stripe is integrated.** |
| `AUTH_DEBUG` | `false` | Auth debug logging (dev only) |
| `CORS_ALLOWED_ORIGINS` | `""` (empty) | Comma-separated list of allowed origins for cross-origin API requests. Platform domains (app.fundroom.ai, etc.) are always allowed. Leave blank to allow only platform domains (default, most secure). Use `*` for wildcard (public embed scenarios only — disables credentials). Example: `https://portal.acme.com,https://ir.bigfund.com` |
| `ENFORCE_CSP` | `false` | Content Security Policy enforcement mode. `true` = enforced (Content-Security-Policy header, blocks violations). `false`/unset = report-only (Content-Security-Policy-Report-Only header, logs violations without blocking). **Set to `true` in production after verifying no CSP violations in report-only mode.** |

### Vercel API Access (for domain management, deployments)

| Variable | Description |
|----------|-------------|
| `VERCEL_TOKEN` | Vercel API token |
| `VERCEL_ORG_ID` | `team_UhYGRc30tmOLJuxfGViNKwhz` |
| `VERCEL_PROJECT_ID` | `prj_TrkpUM6UHrGWQUY8SPHvASmM8BCA` |

### Full Reference

See `.env.example` for all 108 environment variables with descriptions and categories.

---

## Domain Setup

### Production Domains

| Domain | Purpose | Status |
|--------|---------|--------|
| `app.fundroom.ai` | Main application | Active |
| `app.login.fundroom.ai` | Standard org login | Active |
| `app.admin.fundroom.ai` | Admin-only login | Active |
| `fundroom.bermudafranchisegroup.com` | Tenant custom domain | Active |
| `darkroom-sable.vercel.app` | Vercel default | Active |

### Domain Routing Rules

- `fundroom.ai` — Marketing site (external, not Vercel)
- `app.fundroom.ai` — Main app. Auth users go to visitor entrance; unauth go to `/signup`
- `app.login.fundroom.ai` — Standard login (`/login`). Front-end access only
- `app.admin.fundroom.ai` — Admin-only portal. LP users blocked. Unauth redirected to `/admin/login`

### Adding Custom Tenant Domains

1. Tenant adds domain in Settings > Domains
2. Platform creates domain via Vercel API (`POST /v10/projects/{projectId}/domains`)
3. Tenant configures DNS (CNAME to `cname.vercel-dns.com`)
4. Daily cron job verifies domain DNS (`POST /api/cron/domains`)
5. Domain status tracked in Team model (`emailDomain`, `emailDomainStatus`)

### Email Domain Setup

Org-branded email domains are configured via Resend:
1. GP opens Settings > Email Domain
2. 4-step wizard: enter domain > DNS records > verify > configure sender
3. DNS records (DKIM, SPF, DMARC) are provisioned via Resend Domains API
4. Domain verification triggers automatic DNS check

---

## Database Setup

### Initial Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations against production DB
npx prisma migrate deploy

# Seed the first tenant (Bermuda Franchise Group)
npx ts-node prisma/seed-bermuda.ts

# Seed platform admin
npx ts-node prisma/seed-platform-admin.ts --set-password
```

### Schema Sync (Non-Destructive)

When migrations are behind (e.g., after merging PRs with schema changes):

```bash
# Preview changes
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url "$SUPABASE_DATABASE_URL"

# Apply missing structure (non-destructive, additive only)
npx prisma db push
```

### Database Health Verification

```bash
# Check via API
curl https://app.fundroom.ai/api/health
# Expected: { "status": "healthy", "database": "up", "storage": { "status": "up" } }

# Detailed DB health (admin only)
curl -H "Cookie: ..." https://app.fundroom.ai/api/admin/db-health
# Returns: primary + backup DB status, latency, table counts
```

### Current Schema Metrics

| Metric | Value |
|--------|-------|
| Models | 117 |
| Enums | 40 |
| Columns | ~1,694 |
| Indexes | ~530 |
| Migrations | 19 |
| Schema lines | ~4,274 |

---

## Deployment Procedures

### Automatic Deployment (Recommended)

Pushes to `main` trigger automatic production deployment via GitHub Actions + Vercel.

1. Merge PR to `main`
2. GitHub Actions Test workflow runs (TypeScript, Jest, lint)
3. Vercel detects push and builds
4. Build: `prisma generate` > `generate-sw-version.js` > `next build`
5. Deploy to production domains

### Manual Deployment

```bash
# Via Vercel CLI
vercel --prod

# Via Vercel API (redeploy latest)
curl -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "darkroom", "target": "production"}'
```

### Environment Variable Updates

After changing Vercel environment variables, redeploy to apply:

```bash
# Trigger redeployment
curl -X POST "https://api.vercel.com/v13/deployments" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -d '{"name": "darkroom", "target": "production"}'
```

Secrets set via Vercel API are stored as `"sensitive"` type and appear empty in GET responses (encrypted).

### Pre-Deployment Checklist

- [ ] `npm run typecheck` passes (0 TypeScript errors)
- [ ] `npm test` passes (5,066+ tests)
- [ ] No `.env` files or secrets in commit
- [ ] Database migrations applied to production
- [ ] Prisma client regenerated if schema changed
- [ ] Documentation updated (CLAUDE.md, README.md)
- [ ] `npm audit` shows 0 vulnerabilities

---

## Rollback Procedures

### Vercel Instant Rollback

Vercel keeps previous deployments. To rollback:

1. Go to Vercel Dashboard > darkroom > Deployments
2. Find the last known-good deployment
3. Click "..." > "Promote to Production"

### Via API

```bash
# List recent deployments
curl "https://api.vercel.com/v6/deployments?projectId=$VERCEL_PROJECT_ID&limit=10" \
  -H "Authorization: Bearer $VERCEL_TOKEN"

# Promote a specific deployment
curl -X POST "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/promote/$DEPLOYMENT_ID" \
  -H "Authorization: Bearer $VERCEL_TOKEN"
```

### Database Rollback

Prisma migrations are forward-only in production. For schema rollback:

1. Create a new migration that reverses the changes
2. Test migration locally
3. Apply to production via `prisma migrate deploy`

For data-level rollback, Supabase provides point-in-time recovery (PITR) for Pro plans.

---

## Health Checks

### Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/health` | Public | DB + Redis + Storage + Email status |
| `GET /api/admin/deployment-readiness` | Admin | 30+ pre-flight checks |
| `GET /api/admin/launch-health` | Admin | Full platform health |
| `GET /api/admin/db-health` | Admin | Primary + backup DB health |

### Expected Health Response

```json
{
  "status": "healthy",
  "version": "0.9.13",
  "timestamp": "2026-02-20T12:00:00.000Z",
  "uptime": 3600,
  "services": {
    "database": { "status": "up", "latency_ms": 12 },
    "redis": { "status": "up", "latency_ms": 3, "backend": "upstash_redis" },
    "storage": { "status": "up", "provider": "vercel" },
    "email": { "status": "up" }
  }
}
```

**Status values:**
- `healthy` — all services operational
- `degraded` — some non-critical services unavailable (Redis, storage, or email)
- `unhealthy` — database is down (returns HTTP 503)

### External Uptime Monitoring

Configure an external uptime monitoring service (UptimeRobot, Pingdom, Better Uptime, or similar) to poll the public health endpoint:

**URL:** `https://app.fundroom.ai/api/health`
**Method:** `GET`
**Interval:** 60 seconds
**Alert condition:** HTTP status code != 200 OR `status` != `"healthy"`

**Recommended monitors:**
1. **Primary health** — `GET /api/health` every 60s. Alert on HTTP 503 (database down)
2. **Homepage load** — `GET https://app.fundroom.ai` every 5 min. Alert on HTTP != 200
3. **Auth flow** — `GET https://app.fundroom.ai/login` every 5 min. Alert on HTTP != 200

### Deployment Readiness

Before every production deployment, run the pre-flight check:
```
GET /api/admin/deployment-readiness
```
This validates 30+ items including:
- All required environment variables present
- Database connectivity + schema matches (table count)
- Redis connectivity
- Email service (Resend initialized)
- Storage provider configured
- Encryption roundtrip (AES-256 encrypt/decrypt)
- Admin users exist
- Tenant data seeded
- Paywall configuration

### Error Monitoring & Alerting

| Service | Dashboard | Purpose |
|---------|-----------|---------|
| Rollbar | rollbar.com (FundRoom project) | Error tracking + alerting |
| Vercel Analytics | vercel.com/dashboard | Request metrics |
| Tinybird | tinybird.co (fundroomia_workspace) | Server analytics events |
| PostHog | posthog.com (when enabled) | Client-side analytics |

**Rollbar Alert Rules (configure in Rollbar dashboard):**

| Rule | Trigger | Channel |
|------|---------|---------|
| Any 500 error | `level:error` on any new item | Email + Slack (immediate) |
| Critical alert | `level:critical` | PagerDuty + Email (immediate) |
| Auth brute force | `alertCategory:security` > 10 occurrences/min | Slack + Email |
| Database failure | `message:*database*` at `level:critical` | PagerDuty |
| Wire transfer error | `path:*/wire/*` at `level:error` | Email (immediate) |

**Request Logging:**
API requests are logged to Rollbar via `lib/middleware/request-logger.ts` with sampling:
- 100% of errors (4xx, 5xx) logged at `warning` level
- 10% of successful requests logged at `info` level

---

## CORS Configuration

FundRoom uses a dynamic CORS middleware (`lib/middleware/cors.ts`) to validate cross-origin requests.

**How it works:**
- Platform domains (app.fundroom.ai, app.login.fundroom.ai, app.admin.fundroom.ai) are always allowed with credentials
- Additional origins can be added via `CORS_ALLOWED_ORIGINS` env var (comma-separated)
- Setting `CORS_ALLOWED_ORIGINS=*` enables wildcard mode (all origins allowed, credentials disabled)
- API routes that don't match any allowed origin receive no CORS headers (same-origin only)

**Static assets (vercel.json):**
- `/fonts/*` has `Access-Control-Allow-Origin: *` — this is intentional and required per CSS spec for cross-origin font loading (e.g., when custom domains load fonts from the platform CDN). Fonts are non-sensitive public assets.
- No other static asset paths have CORS wildcards.

**Document/blob security:**
- Presigned S3/R2 URLs are generated server-side behind authentication (session or internal API key)
- Document download endpoints never set CORS wildcards
- Signed document URLs are time-limited and scoped to the specific file

**Verification:**
```bash
# Confirm no API routes have CORS wildcards
grep -r "Access-Control-Allow-Origin.*\*" pages/api/ app/api/ lib/ --include="*.ts" | grep -v "test\|__tests__\|node_modules"
# Should return 0 results (only middleware docs mention * as a CORS_ALLOWED_ORIGINS option)
```

---

## Troubleshooting

### Build Failures

**"Cannot find module '@prisma/client'"**
- Run `prisma generate` before `next build`
- Vercel build command already includes this: `prisma generate && ... && next build`

**TypeScript errors after schema change**
- Regenerate Prisma client: `npx prisma generate`
- Check for stale imports referencing removed/renamed fields

**"Both middleware and proxy file detected"**
- Next.js 16 uses `proxy.ts` as middleware entry point
- Delete any `middleware.ts` file — it conflicts with `proxy.ts`

### Database Issues

**"Connection refused" or timeout**
- Verify `SUPABASE_DATABASE_URL` uses session pooler (port 5432)
- Check Supabase dashboard for connection limit
- Ensure IP is allowed in Supabase network settings

**Schema out of sync**
- Run `npx prisma db push` for non-destructive sync
- For migration-managed sync: `npx prisma migrate deploy`

### Storage Issues

**"STORAGE_PROVIDER not set" (health endpoint shows degraded)**
- Set `STORAGE_PROVIDER=vercel` on Vercel
- Set `BLOB_READ_WRITE_TOKEN` for Vercel Blob Storage
- For S3: set `STORAGE_ACCESS_KEY_ID` and `STORAGE_SECRET_ACCESS_KEY`

### Authentication Issues

**Google OAuth not showing**
- Verify `FUNDROOM_GOOGLE_CLIENT_ID` and `FUNDROOM_GOOGLE_CLIENT_SECRET` are set
- Check authorized redirect URIs in Google Cloud Console
- Fallback credentials: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

**Session cookie not persisting**
- Verify `NEXTAUTH_URL` matches the actual domain
- Check `__Secure-` prefix is applied (production only)
- Cookie is SameSite=Lax, Secure, HttpOnly

### Rate Limiting Not Working

- Rate limiting requires Redis (Upstash)
- Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- Without Redis, rate limiting is fail-open (permissive)
