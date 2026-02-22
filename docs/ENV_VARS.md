# FundRoom.ai — Environment Variables Reference

**Last Updated:** February 20, 2026
**Total Variables:** ~200 unique env vars across 20 categories
**Config File:** `.env.example` (copy to `.env` and fill in values)

---

## Quick Start (MVP Minimum Required)

These are the minimum variables needed for a working local development environment:

```bash
# Database
SUPABASE_DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=<64-char-random-string>
NEXTAUTH_URL=http://localhost:3000

# Auth
FUNDROOM_GOOGLE_CLIENT_ID=<google-client-id>
FUNDROOM_GOOGLE_CLIENT_SECRET=<google-client-secret>

# Email
RESEND_API_KEY=re_<your-key>

# Storage
STORAGE_PROVIDER=vercel
BLOB_READ_WRITE_TOKEN=<vercel-blob-token>
STORAGE_ENCRYPTION_KEY=<64-char-hex-string>

# Encryption (5 required salts)
DOCUMENT_ENCRYPTION_SALT=<64-char-hex>
MASTER_ENCRYPTION_KEY=<64-char-hex>
HKDF_STORAGE_SALT=<64-char-hex>
SIGNATURE_VERIFICATION_SALT=<64-char-hex>
AUTH_TOKEN_HASHING_SALT=<64-char-hex>

# Monitoring
ROLLBAR_SERVER_TOKEN=<rollbar-server-token>

# Domain
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# MVP
PAYWALL_BYPASS=true
```

---

## Category Reference

### 1. Database

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `SUPABASE_DATABASE_URL` | **Yes** | Supabase Postgres connection string (session pooler, port 5432) | `postgresql://postgres.[project]:[pw]@aws-0-us-east-1.pooler.supabase.com:5432/postgres` | — |
| `DATABASE_URL` | Fallback | Used if SUPABASE_DATABASE_URL not set | `postgresql://localhost:5432/fundroom` | localhost |
| `REPLIT_DATABASE_URL` | No | Replit Postgres backup database | — | — |
| `BACKUP_DB_ENABLED` | No | Enable/disable backup database writes | `false` | `false` |

**Key files:** `lib/prisma.ts`, `lib/prisma/backup-client.ts`

---

### 2. Authentication

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `NEXTAUTH_SECRET` | **Yes** | JWT signing secret (min 32 chars, recommend 64) | `<random-64-char-string>` | — |
| `NEXTAUTH_URL` | **Yes** | NextAuth callback URL | `https://app.fundroom.ai` | `http://localhost:3000` |
| `FUNDROOM_GOOGLE_CLIENT_ID` | **Yes** | Google OAuth Client ID (FundRoom project, primary) | `123456.apps.googleusercontent.com` | — |
| `FUNDROOM_GOOGLE_CLIENT_SECRET` | **Yes** | Google OAuth Client Secret (FundRoom project) | `GOCSPX-...` | — |
| `GOOGLE_CLIENT_ID` | No | Legacy BFG Google OAuth (fallback) | — | — |
| `GOOGLE_CLIENT_SECRET` | No | Legacy BFG Google OAuth (fallback) | — | — |
| `LINKEDIN_CLIENT_ID` | No | LinkedIn OAuth Client ID | — | — |
| `LINKEDIN_CLIENT_SECRET` | No | LinkedIn OAuth Client Secret | — | — |
| `INTERNAL_API_KEY` | **Yes** | API key for internal service-to-service calls | `<32+ char string>` | — |
| `REVALIDATE_TOKEN` | **Yes** | ISR revalidation token | `<strong-random-string>` | — |
| `AUTH_DEBUG` | No | Enable verbose auth logging (dev only) | `true` | `false` |
| `AUTH_BEARER_TOKEN` | No | Bearer token for Vercel domain management API | — | — |
| `HANKO_API_KEY` | No | Passkey authentication (Hanko) — Phase 2 | — | — |
| `NEXT_PUBLIC_HANKO_TENANT_ID` | No | Hanko tenant ID for passkey UI | — | — |

**Key files:** `lib/auth/auth-options.ts`, `proxy.ts`

---

### 3. Email (Resend — Primary)

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `RESEND_API_KEY` | **Yes** | Resend API key for transactional email | `re_abc123...` | — |
| `RESEND_FROM_EMAIL` | No | Default from address | `FundRoom <noreply@fundroom.ai>` | `noreply@fundroom.ai` |
| `RESEND_BASE_URL` | No | Override Resend API base URL | — | `https://api.resend.com` |
| `RESEND_CONTACT_BOOK_ID` | No | Resend audience/contact book ID | — | — |
| `RESEND_WEBHOOK_SECRET` | No | Resend webhook signature secret (Svix HMAC) | — | — |
| `EMAIL_PROVIDER` | No | Email provider selector | `resend` | `resend` |
| `EMAIL_DOMAIN` | No | Default email sending domain | `fundroom.ai` | Falls back to `NEXT_PUBLIC_PLATFORM_DOMAIN` |
| `EMAIL_FROM` | No | Default from address | `noreply@fundroom.ai` | `noreply@{domain}` |
| `EMAIL_FROM_NAME` | No | Default sender display name | `FundRoom.ai` | `FundRoom.ai` |
| `VERIFICATION_EMAIL_BASE_URL` | No | Override base URL for email verification links | — | Falls back to `NEXTAUTH_URL` |

**Architecture:**
- Tier 1 (Platform): Always sends from `@fundroom.ai` — auth, billing, onboarding
- Tier 2 (Org-branded): Sends from org's custom domain or falls back to `@fundroom.ai`

**Key files:** `lib/resend.ts`, `lib/providers/email/resend-adapter.ts`, `app/api/webhooks/resend/route.ts`

---

### 4. Email (Unsend — Alternative Provider)

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `UNSEND_API_KEY` | No | Unsend API key (alternative email provider) | — | — |
| `UNSEND_BASE_URL` | No | Unsend API base URL | — | — |
| `UNSEND_CONTACT_BOOK_ID` | No | Unsend contact book ID | — | — |

**Status:** Optional alternative to Resend. Not used in production.

---

### 5. Storage & File Upload

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `STORAGE_PROVIDER` | **Yes** | Storage backend: `vercel`, `s3`, `r2`, `local` | `vercel` | `s3` |
| `STORAGE_ENCRYPTION_KEY` | **Yes** | AES-256 encryption key (64-char hex) | `<64-char-hex>` | — |
| `BLOB_READ_WRITE_TOKEN` | If Vercel | Vercel Blob read/write token | — | — |
| `STORAGE_BUCKET` | If S3 | S3 bucket name | `fundroom-documents` | — |
| `STORAGE_REGION` | If S3 | S3 region | `us-east-1` | — |
| `STORAGE_ACCESS_KEY_ID` | If S3 | S3 access key ID | — | — |
| `STORAGE_ACCESS_KEY` | If S3 | S3 access key (alias for ACCESS_KEY_ID) | — | — |
| `STORAGE_SECRET_ACCESS_KEY` | If S3 | S3 secret key | — | — |
| `STORAGE_ENDPOINT` | If R2 | Custom S3-compatible endpoint (Cloudflare R2) | — | — |
| `STORAGE_LOCAL_PATH` | If local | Local filesystem path | `./.storage` | `./.storage` |
| `STORAGE_DUAL_ENABLED` | No | Enable dual-provider storage (write to both) | `false` | `false` |
| `STORAGE_DUAL_SYNC` | No | Synchronous dual writes | `true` | `true` |
| `NEXT_PUBLIC_UPLOAD_TRANSPORT` | No | Client upload transport method | `vercel` | `vercel` |
| `VERCEL_BLOB_HOST` | No | Custom Vercel Blob host | — | Auto-detected |

**Legacy Storage Aliases (fallback):**

| Variable | Maps To |
|----------|---------|
| `NEXT_PRIVATE_UPLOAD_BUCKET` | `STORAGE_BUCKET` |
| `NEXT_PRIVATE_UPLOAD_REGION` | `STORAGE_REGION` |
| `NEXT_PRIVATE_UPLOAD_ENDPOINT` | `STORAGE_ENDPOINT` |
| `NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID` | `STORAGE_ACCESS_KEY_ID` |
| `NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY` | `STORAGE_SECRET_ACCESS_KEY` |

**Key files:** `lib/storage/`, `pages/api/file/upload-config.ts`

---

### 6. Monitoring & Analytics

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `ROLLBAR_SERVER_TOKEN` | **Yes** | Rollbar server-side error tracking | `<token>` | — |
| `NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN` | Recommended | Rollbar client-side error tracking | `<token>` | `disabled` |
| `ROLLBAR_READ_TOKEN` | No | Rollbar read access (dashboards) | `<token>` | — |
| `ROLLBAR_WEBHOOK_SECRET` | No | Rollbar webhook signature secret | `<secret>` | — |
| `TINYBIRD_TOKEN` | Recommended | Tinybird server-side analytics | `<token>` | — |
| `TINYBIRD_HOST` | No | Tinybird API host | `https://api.us-west-2.aws.tinybird.co` | US West 2 |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | PostHog client analytics (disabled if not set) | `phc_...` | — |
| `NEXT_PUBLIC_POSTHOG_HOST` | No | PostHog API host | `https://app.posthog.com` | PostHog cloud |
| `NEXT_PUBLIC_POSTHOG_UI_HOST` | No | PostHog UI host (separate from API) | — | Same as `NEXT_PUBLIC_POSTHOG_HOST` |

**Key files:** `lib/rollbar.ts`, `lib/error.ts`, `lib/tracking/server-events.ts`, `lib/posthog.ts`

---

### 7. Billing & Payments (Stripe)

#### SaaS Billing (Team-level)

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `STRIPE_SECRET_KEY` | Phase 2 | Stripe secret key | `sk_live_...` | — |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Phase 2 | Stripe publishable key | `pk_live_...` | — |
| `STRIPE_WEBHOOK_SECRET` | Phase 2 | Stripe SaaS webhook signing secret | `whsec_...` | — |
| `STRIPE_LIST_ID` | No | Stripe Radar fraud prevention list ID | — | — |

**Legacy/migration keys:**

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY_LIVE` | Live key (migration) |
| `STRIPE_SECRET_KEY_OLD` | Old key (migration) |
| `STRIPE_SECRET_KEY_LIVE_OLD` | Old live key (migration) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE` | Live publishable key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_OLD` | Old publishable key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE_OLD` | Old live publishable key |

#### CRM Billing (Organization-level)

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `STRIPE_CRM_PRO_MONTHLY_PRICE_ID` | If CRM billing | CRM Pro $20/mo price ID | `price_...` | — |
| `STRIPE_CRM_PRO_YEARLY_PRICE_ID` | If CRM billing | CRM Pro $200/yr price ID | `price_...` | — |
| `STRIPE_FUNDROOM_MONTHLY_PRICE_ID` | If CRM billing | FundRoom $79/mo price ID | `price_...` | — |
| `STRIPE_FUNDROOM_YEARLY_PRICE_ID` | If CRM billing | FundRoom $790/yr price ID | `price_...` | — |
| `STRIPE_AI_CRM_MONTHLY_PRICE_ID` | If AI add-on | AI CRM add-on $49/mo price ID | `price_...` | — |
| `STRIPE_AI_CRM_YEARLY_PRICE_ID` | If AI add-on | AI CRM add-on $490/yr price ID | `price_...` | — |
| `STRIPE_CRM_WEBHOOK_SECRET` | If CRM billing | CRM-specific webhook secret | `whsec_...` | Falls back to `STRIPE_WEBHOOK_SECRET` |

**Setup:** Run `npx ts-node scripts/setup-stripe-crm-products.ts --live` to create products/prices in Stripe.

**Key files:** `lib/stripe/crm-products.ts`, `lib/billing/crm-billing.ts`, `app/api/billing/`, `app/api/webhooks/stripe-crm/route.ts`

---

### 8. KYC / Identity Verification

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `KYC_PROVIDER` | No | KYC provider selector | `persona` | `persona` |
| `PERSONA_API_KEY` | Phase 2 | Persona API key | `persona_...` | — |
| `PERSONA_TEMPLATE_ID` | Phase 2 | Persona inquiry template (GovID + Selfie) | `itmpl_...` | — |
| `PERSONA_ENVIRONMENT_ID` | Phase 2 | Persona environment ID | — | — |
| `PERSONA_WEBHOOK_SECRET` | Phase 2 | Persona webhook HMAC-SHA256 secret | — | — |

**Other KYC Providers (Phase 2+):**

| Provider | Variables |
|----------|-----------|
| Plaid Identity | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_IDV_TEMPLATE_ID`, `PLAID_WEBHOOK_SECRET` |
| Parallel Markets | `PARALLEL_MARKETS_API_KEY`, `PARALLEL_MARKETS_CLIENT_ID`, `PARALLEL_MARKETS_BUSINESS_ID`, `PARALLEL_MARKETS_WEBHOOK_SECRET` |
| VerifyInvestor | `VERIFY_INVESTOR_API_KEY`, `VERIFY_INVESTOR_CLIENT_ID`, `VERIFY_INVESTOR_OFFERING_ID`, `VERIFY_INVESTOR_WEBHOOK_SECRET` |

**Key files:** `lib/providers/kyc/index.ts`, `lib/persona.ts`

---

### 9. Encryption Salts & Keys (Security)

| Variable | Required | Description | Length |
|----------|----------|-------------|--------|
| `DOCUMENT_ENCRYPTION_SALT` | **Yes** | Document encryption (AES-256) | 64-char hex |
| `MASTER_ENCRYPTION_KEY` | **Yes** | Master key derivation | 64-char hex |
| `HKDF_STORAGE_SALT` | **Yes** | HKDF storage key derivation | 64-char hex |
| `SIGNATURE_VERIFICATION_SALT` | **Yes** | E-signature hash verification | 64-char hex |
| `AUTH_TOKEN_HASHING_SALT` | **Yes** | Auth token hashing | 64-char hex |
| `PLAID_TOKEN_ENCRYPTION_SALT` | Phase 2 | Plaid token encryption | 64-char hex |
| `SIGNATURE_VERIFICATION_SECRET` | **Yes** | Signature checksum secret | Falls back to `NEXTAUTH_SECRET` |
| `NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY` | **Yes** | Password-protected document encryption key | Any strong string |
| `NEXT_PRIVATE_VERIFICATION_SECRET` | **Yes** | Email/link verification secret | Any strong string |
| `NEXT_PRIVATE_UNSUBSCRIBE_JWT_SECRET` | **Yes** | JWT secret for unsubscribe links | Any strong string |

**All salts must be unique.** Generate with: `openssl rand -hex 32`

**Key files:** `lib/constants.ts`, `lib/encryption/`, `lib/auth/`

---

### 10. Domain & URL Configuration

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `NEXT_PUBLIC_BASE_URL` | **Yes** | Application base URL | `https://app.fundroom.ai` | `http://localhost:3000` |
| `NEXT_PUBLIC_PLATFORM_DOMAIN` | No | Main platform domain | `fundroom.ai` | `fundroom.ai` |
| `NEXT_PUBLIC_APP_BASE_HOST` | No | App subdomain host | `app.fundroom.ai` | — |
| `NEXT_PUBLIC_APP_DOMAIN` | No | App domain for subdomain routing | `app.fundroom.ai` | — |
| `NEXT_PUBLIC_LOGIN_DOMAIN` | No | Login subdomain | `app.login.fundroom.ai` | — |
| `NEXT_PUBLIC_ADMIN_DOMAIN` | No | Admin subdomain | `app.admin.fundroom.ai` | — |
| `NEXT_PUBLIC_MARKETING_URL` | No | Marketing site URL | `https://fundroom.ai` | `https://fundroom.ai` |
| `NEXT_PUBLIC_PLATFORM_NAME` | No | Platform display name | `FundRoom AI` | `FundRoom AI` |
| `NEXT_PUBLIC_PLATFORM_SUPPORT_EMAIL` | No | Support email | `support@fundroom.ai` | — |
| `NEXT_PUBLIC_PLATFORM_SECURITY_EMAIL` | No | Security contact email | `security@fundroom.ai` | — |
| `NEXT_PUBLIC_PLATFORM_NOREPLY_EMAIL` | No | No-reply email address | `noreply@fundroom.ai` | — |

**Key files:** `proxy.ts`, `lib/middleware/domain.ts`, `lib/constants/saas-config.ts`

---

### 11. E-Signature (FundRoom Sign)

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `ESIGN_PROVIDER` | No | E-signature provider selector | `fundroomsign` | `fundroomsign` |
| `ESIGN_WEBHOOK_SECRET` | No | E-signature webhook secret | — | — |
| `SIGNATURE_WEBHOOK_SECRET` | No | Webhook validation secret | — | — |
| `SIGNATURE_REMINDER_FIRST_DAYS` | No | Days before first signing reminder | `3` | `3` |
| `SIGNATURE_REMINDER_REPEAT_DAYS` | No | Days between repeat reminders | `3` | `3` |
| `SIGNATURE_REMINDER_MAX` | No | Maximum reminders per recipient | `3` | `3` |

**Status:** FundRoom Sign is native (zero external cost). No API key needed.

**Key files:** `lib/signature/`, `lib/esign/`, `pages/api/sign/[token].ts`

---

### 12. Redis & Rate Limiting (Upstash)

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `UPSTASH_REDIS_REST_URL` | Recommended | Redis for rate limiting & caching | `https://xxx.upstash.io` | In-memory fallback |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended | Redis auth token | — | — |

**Architecture:** All `/api/` routes are protected by blanket 200 req/min/IP rate limit via Upstash Redis in `proxy.ts`. Falls back to in-memory rate limiting if Redis is not configured.

**Key files:** `lib/redis.ts`, `lib/security/rate-limiter.ts`, `proxy.ts`

---

### 13. Cron & Background Jobs

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `QSTASH_TOKEN` | No | Upstash QStash for scheduled jobs | — | — |
| `QSTASH_CURRENT_SIGNING_KEY` | No | QStash webhook signing key (current) | — | — |
| `QSTASH_NEXT_SIGNING_KEY` | No | QStash webhook signing key (next rotation) | — | — |
| `CRON_SECRET` | No | Secret for authenticating cron job requests | — | — |

**Key files:** `lib/cron/index.ts`, `app/api/cron/`

---

### 14. Vercel Deployment

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `VERCEL_TOKEN` | No | Vercel API access token | — | — |
| `VERCEL_ORG_ID` | No | Vercel team/org ID | `team_UhYGRc30...` | — |
| `VERCEL_PROJECT_ID` | No | Vercel project ID | `prj_TrkpUM6U...` | — |
| `PROJECT_ID_VERCEL` | No | Vercel project ID (domain management) | — | — |
| `TEAM_ID_VERCEL` | No | Vercel team ID (domain management) | — | — |
| `VERCEL` | Auto-set | Set to `"1"` when running on Vercel | `1` | — |
| `NEXT_PUBLIC_VERCEL_ENV` | Auto-set | Vercel environment (production/preview/development) | `production` | — |

**Key files:** Vercel dashboard, `vercel.json`, `lib/domains.ts`

---

### 15. AI & OpenAI

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `AI_INTEGRATIONS_OPENAI_API_KEY` | No | OpenAI API key for CRM AI features | `sk-...` | — |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | No | OpenAI API base URL override | — | `https://api.openai.com/v1` |

**Features:** AI email drafts, AI insights, daily digest, engagement analysis. Uses GPT-4o-mini. Gated behind `hasAiFeatures` tier flag.

**Key files:** `lib/ai/crm-prompts.ts`, `app/api/ai/`

---

### 16. Document Conversion

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `NEXT_PRIVATE_CONVERSION_BASE_URL` | No | Document conversion service URL (e.g., Gotenberg) | — | — |
| `NEXT_PRIVATE_CONVERT_API_URL` | No | Alternative conversion API URL | — | — |
| `NEXT_PRIVATE_CONVERT_API_KEY` | No | Conversion API key | — | — |
| `NEXT_PRIVATE_INTERNAL_AUTH_TOKEN` | No | Internal auth token for conversion service | — | — |

**Key files:** `lib/documents/`, `pages/api/file/`

---

### 17. Admin Configuration

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `DEFAULT_ADMIN_EMAIL` | No | Default platform admin email | `rciesco@fundroom.ai` | `rciesco@fundroom.ai` |
| `DEFAULT_GP_EMAIL` | No | Default GP email for LP notifications | — | — |
| `ADMIN_TEMP_PASSWORD` | No | Temp password for seeded admin user | — | — |
| `ADMIN_SEED_PASSWORD` | No | Seed script admin password | — | — |
| `AUDIT_LOG_RETENTION_DAYS` | No | Audit log retention (days) | `2555` | `2555` (~7 years, SEC compliance) |

**Key files:** `lib/constants/admins.ts`, `prisma/seed-bermuda.ts`, `prisma/seed-platform-admin.ts`

---

### 18. Feature Flags

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `PAYWALL_BYPASS` | **MVP** | Bypass paywall checks (set `true` for MVP) | `true` | — |
| `BACKUP_DB_ENABLED` | No | Enable backup database writes | `false` | `false` |
| `AUTH_DEBUG` | No | Verbose auth logging (dev only) | `false` | `false` |
| `SKIP_ENV_VALIDATION` | No | Skip Next.js env validation | `false` | `false` |
| `ENFORCE_CSP` | No | Enforce CSP (true=enforce, false=report-only) | `false` | `false` |

---

### 19. Content Security Policy

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `CSP_EMBED_ALLOWED_ORIGINS` | No | Allowed iframe embed origins (comma-separated) | `https://example.com` | — |
| `CSP_EMBED_ALLOW_ALL` | No | Allow all embed origins (not recommended) | `false` | `false` |
| `CORS_ALLOWED_ORIGINS` | No | Additional CORS allowed origins (comma-separated) | — | Platform domains only |

**Key files:** `lib/middleware/csp.ts`, `lib/middleware/cors.ts`

---

### 20. Internal Notifications & Webhooks

| Variable | Required | Description | Example | Default |
|----------|----------|-------------|---------|---------|
| `PPMK_SLACK_WEBHOOK_URL` | No | Slack webhook for internal alerts | — | — |
| `PPMK_STORE_WEBHOOK_URL` | No | Store webhook for events | — | — |
| `PPMK_TRIAL_SLACK_WEBHOOK_URL` | No | Slack webhook for trial events | — | — |
| `WEBHOOK_SECRET` | No | LP investor update webhook secret | — | — |
| `EDGE_CONFIG` | No | Vercel Edge Config connection string | — | — |
| `EDGE_CONFIG_ID` | No | Vercel Edge Config ID | — | — |

---

## Production Deployment Checklist

### Critical (Must Set)
- [ ] `SUPABASE_DATABASE_URL` — points to production Postgres
- [ ] `NEXTAUTH_SECRET` — cryptographically strong (64+ chars)
- [ ] `NEXTAUTH_URL` — matches production domain (`https://app.fundroom.ai`)
- [ ] `NEXT_PUBLIC_BASE_URL` — matches `NEXTAUTH_URL`
- [ ] `FUNDROOM_GOOGLE_CLIENT_ID/SECRET` — FundRoom Google Cloud project
- [ ] `RESEND_API_KEY` — active key with verified domain
- [ ] `ROLLBAR_SERVER_TOKEN` — FundRoom Rollbar account
- [ ] `INTERNAL_API_KEY` — strong random string (32+ chars)
- [ ] `STORAGE_PROVIDER` — `vercel` for Vercel deployment
- [ ] `STORAGE_ENCRYPTION_KEY` — unique 64-char hex
- [ ] All 5 encryption salts — unique 64-char hex strings each
- [ ] `NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY` — strong encryption key
- [ ] `NEXT_PRIVATE_VERIFICATION_SECRET` — strong secret
- [ ] `NEXT_PRIVATE_UNSUBSCRIBE_JWT_SECRET` — strong JWT secret

### High (Recommended)
- [ ] `UPSTASH_REDIS_REST_URL/TOKEN` — production rate limiting
- [ ] `TINYBIRD_TOKEN` — server analytics
- [ ] `NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN` — client error tracking
- [ ] `PAYWALL_BYPASS=true` — MVP launch (change to `false` when Stripe ready)

### CRM Billing (When Ready)
- [ ] Run `npx ts-node scripts/setup-stripe-crm-products.ts --live`
- [ ] Set all 6 `STRIPE_*_PRICE_ID` env vars from script output
- [ ] Set `STRIPE_CRM_WEBHOOK_SECRET` from Stripe dashboard
- [ ] Register `/api/webhooks/stripe-crm` as webhook endpoint

### Verify After Deploy
- [ ] Health endpoint returns `healthy`: `GET /api/health`
- [ ] All 4 services up: database, redis, storage, email
- [ ] Database connection works: `GET /api/admin/db-health`
- [ ] Deployment readiness passes: `GET /api/admin/deployment-readiness`
- [ ] Google OAuth login works
- [ ] Email sending works (test via signup flow)
- [ ] File upload works (test via dataroom)

---

## Generating Secrets

```bash
# Generate NEXTAUTH_SECRET (64 chars)
openssl rand -base64 48

# Generate encryption salt (64-char hex = 256 bits)
openssl rand -hex 32

# Generate API key (32 chars)
openssl rand -base64 24

# Generate all 5 required salts at once
for salt in DOCUMENT_ENCRYPTION MASTER_ENCRYPTION HKDF_STORAGE SIGNATURE_VERIFICATION AUTH_TOKEN_HASHING; do
  echo "${salt}_SALT=$(openssl rand -hex 32)"
done

# Generate encryption keys
echo "STORAGE_ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY=$(openssl rand -base64 32)"
echo "NEXT_PRIVATE_VERIFICATION_SECRET=$(openssl rand -base64 32)"
echo "NEXT_PRIVATE_UNSUBSCRIBE_JWT_SECRET=$(openssl rand -base64 32)"
```

---

## See Also

- `.env.example` — Full template with all variables and placeholder values
- `docs/DEPLOYMENT.md` — Vercel deployment guide with env var checklist
- `docs/SANDBOX_TESTING.md` — Provider sandbox/test credentials
- `docs/LAUNCH_CHECKLIST.md` — Pre-launch verification checklist
- `docs/RUNBOOK.md` — Operational runbook
