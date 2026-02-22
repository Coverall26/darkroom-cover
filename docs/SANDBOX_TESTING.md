# FundRoom.ai — Sandbox Testing & Webhook Simulation Guide

**Last Updated:** February 15, 2026

This guide covers sandbox configuration, test credentials, webhook simulation, and test infrastructure for all external services integrated into FundRoom.ai.

---

## Quick Start: Local Development Without Production Keys

For development without production API keys, set these environment variables:

```bash
# Minimal sandbox config
PLAID_ENV=sandbox
PERSONA_ENVIRONMENT=sandbox
STORAGE_PROVIDER=local
PAYWALL_BYPASS=true
BACKUP_DB_ENABLED=false
```

This enables local development with sandbox APIs, local filesystem storage, no paywall enforcement, and no backup database writes.

---

## 1. Plaid (Bank Connectivity — Phase 2)

**Status:** Phase 2 feature. Bank linking endpoints return 503 in MVP. Manual wire transfer is the MVP payment method.

### Environment Variables
```bash
PLAID_CLIENT_ID=                      # Plaid app ID (from Plaid Dashboard)
PLAID_SECRET=                         # Plaid API secret
PLAID_ENV=sandbox                     # sandbox | development | production
PLAID_ENVIRONMENT=sandbox             # Alternative env var name (some adapters)
PLAID_IDV_TEMPLATE_ID=                # Identity Verification template
PLAID_WEBHOOK_URL=                    # Webhook URL for Plaid events
PLAID_WEBHOOK_SECRET=                 # Webhook signature secret
PLAID_TOKEN_ENCRYPTION_KEY=           # Token encryption (falls back to NEXTAUTH_SECRET)
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/plaid.ts` | Plaid client initialization, token encryption (AES-256-GCM) |
| `lib/providers/kyc/plaid-identity-adapter.ts` | KYC provider adapter (Identity Verification) |
| `pages/api/lp/bank/link-token.ts` | Link token endpoint — **disabled (503)** |
| `pages/api/lp/bank/status.ts` | Bank status polling (Phase 2) |
| `pages/api/lp/bank/connect.ts` | Account connection (Phase 2) |
| `pages/api/webhooks/plaid.ts` | Webhook handler (JWT-signed verification) |

### Sandbox Test Credentials
- **Test user:** `user_good` / `pass_good` (in Plaid Link)
- **Test bank:** Any institution in sandbox mode returns test data
- **Sandbox base URL:** `https://sandbox.plaid.com`

### Token Encryption
Plaid tokens are encrypted at rest using AES-256-GCM:
```
Key derivation: crypto.scryptSync(PLAID_TOKEN_ENCRYPTION_KEY || NEXTAUTH_SECRET, 'salt', 32)
Format: {iv}:{authTag}:{encrypted} (hex-encoded)
```

---

## 2. Persona (KYC/AML Verification)

**Status:** Production-ready. Used for LP identity verification and 506(c) accreditation.

### Environment Variables
```bash
PERSONA_API_KEY=                      # API key (from Persona Dashboard)
PERSONA_ENVIRONMENT=sandbox           # sandbox | production
PERSONA_ENVIRONMENT_ID=               # Embedded flow environment ID
PERSONA_TEMPLATE_ID=                  # KYC template ID (e.g., itmpl_ GovID + Selfie)
PERSONA_WEBHOOK_SECRET=               # HMAC-SHA256 webhook secret
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/persona.ts` | Persona client, webhook verification (HMAC-SHA256) |
| `lib/providers/kyc/persona-adapter.ts` | KYC provider adapter |
| `pages/api/webhooks/persona.ts` | Webhook handler (raw body parsing) |

### Sandbox Behavior
- API base: `https://api.withpersona.com/api/v1`
- Sandbox inquiries don't charge credits
- Use Persona Dashboard sandbox to trigger test webhook events
- `isPersonaConfigured()` returns `true` when `API_KEY` and `TEMPLATE_ID` are both set

### Webhook Events Handled
| Event | Action |
|-------|--------|
| `inquiry.completed` | Mark KYC as approved |
| `inquiry.approved` | Mark KYC as approved |
| `inquiry.declined` | Mark KYC as declined |
| `inquiry.expired` | Mark KYC as expired |
| `inquiry.failed` | Mark KYC as failed |
| `inquiry.transitioned` | Log status transition |

### Webhook Signature Verification
```
Header: persona-signature
Algorithm: HMAC-SHA256 with timing-safe comparison
Secret: PERSONA_WEBHOOK_SECRET
```

### Simulating Persona Webhooks
```bash
# Generate HMAC signature
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$PERSONA_WEBHOOK_SECRET" | awk '{print $2}')

# Send test webhook
curl -X POST http://localhost:5000/api/webhooks/persona \
  -H "persona-signature: $SIGNATURE" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "attributes": {
        "name": "inquiry.completed",
        "payload": {
          "data": {
            "id": "inq_test123",
            "attributes": {
              "status": "completed",
              "reference-id": "user123"
            }
          }
        }
      }
    }
  }'
```

---

## 3. Stripe (Platform Billing — Phase 2)

**Status:** MVP uses manual wire transfer. Stripe Billing integration is Phase 2. Currently `PAYWALL_BYPASS=true` skips all paywall checks.

### Environment Variables
```bash
STRIPE_SECRET_KEY=sk_test_...         # Test mode key (starts with sk_test_)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...  # Test publishable key
STRIPE_WEBHOOK_SECRET=whsec_...       # Webhook signing secret
STRIPE_BFG_WEBHOOK_SECRET=            # Legacy BFG account (temporary)
```

### Key Files
| File | Purpose |
|------|---------|
| `pages/api/stripe/webhook.ts` | Webhook handler (raw body, signature verification) |
| `ee/stripe/webhooks/` | Event-specific handlers (checkout, subscription, invoice) |
| `lib/auth/paywall.ts` | Paywall middleware (`requireFundroomActive()`) |

### Webhook Events Handled
| Event | Handler |
|-------|---------|
| `checkout.session.completed` | `checkoutSessionCompleted()` |
| `customer.subscription.updated` | `customerSubscriptionUpdated()` |
| `customer.subscription.deleted` | `customerSubscriptionDeleted()` |
| `payment_intent.payment_failed` | `processPaymentFailure()` |
| `invoice.upcoming` | `invoiceUpcoming()` |

### Test Cards
| Card Number | Behavior |
|-------------|----------|
| `4242 4242 4242 4242` | Always succeeds (Visa) |
| `4000 0000 0000 0002` | Always declines |
| `4000 0025 0000 3155` | Requires 3D Secure |
| CVC: any 3 digits | Expiry: any future date |

### Local Webhook Testing (Stripe CLI)
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Forward webhooks to local server
stripe listen --forward-to localhost:5000/api/stripe/webhook

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.upcoming
```

---

## 4. Resend (Transactional Email)

**Status:** Production. Two-tier architecture: Tier 1 (platform @fundroom.ai) + Tier 2 (org-branded or fallback).

### Environment Variables
```bash
RESEND_API_KEY=re_...                 # Resend API key
RESEND_FROM_EMAIL=FundRoom <noreply@fundroom.ai>
EMAIL_DOMAIN=fundroom.ai
```

### Key Files
| File | Purpose |
|------|---------|
| `lib/resend.ts` | `sendEmail()` (Tier 1) + `sendOrgEmail()` (Tier 2) |
| `lib/email/domain-service.ts` | Org domain management via Resend API |
| `components/emails/` | 10+ React email templates |

### Test Email Address
```
delivered@resend.dev    # Always succeeds (Resend sandbox address)
```

### Email Tiers
| Tier | Sender | Use Cases |
|------|--------|-----------|
| **Tier 1** (Platform) | `@fundroom.ai` | Auth, billing, onboarding, verification |
| **Tier 2** (Org-branded) | Org domain or `@fundroom.ai` fallback | Investor comms, wire/proof, e-signature, dataroom |

---

## 5. Storage Providers

**Status:** Multi-provider abstraction. Local filesystem for development, Vercel Blob for production.

### Environment Variables
```bash
STORAGE_PROVIDER=local                # local | s3 | r2 | vercel | replit
STORAGE_BUCKET=fundroom-documents     # Bucket name (S3/R2)
STORAGE_REGION=us-east-1              # AWS region
STORAGE_ACCESS_KEY_ID=                # AWS access key
STORAGE_SECRET_ACCESS_KEY=            # AWS secret key
STORAGE_ENCRYPTION_KEY=               # AES-256 (64-char hex)
STORAGE_LOCAL_PATH=./.storage         # Local filesystem path
BLOB_READ_WRITE_TOKEN=               # Vercel Blob token
NEXT_PUBLIC_UPLOAD_TRANSPORT=local    # Client-side transport
```

### Provider Selection
| Provider | Env Value | Best For |
|----------|-----------|----------|
| Local filesystem | `local` | Development/testing |
| AWS S3 | `s3` | Self-hosted production |
| Cloudflare R2 | `r2` | Edge-optimized production |
| Vercel Blob | `vercel` | Vercel deployments (current production) |
| Replit Object Storage | `replit` | Replit development fallback |

### Key Files
| File | Purpose |
|------|---------|
| `lib/storage/providers/index.ts` | Provider factory with caching |
| `lib/storage/providers/local-provider.ts` | Local filesystem storage |
| `lib/storage/providers/s3-provider.ts` | S3/R2 storage |
| `lib/storage/providers/vercel-provider.ts` | Vercel Blob storage |
| `lib/storage/providers/dual-provider.ts` | Primary + backup dual-write |

---

## 6. Tinybird (Server Analytics)

**Status:** Production. Fire-and-forget event publishing (non-blocking).

### Environment Variables
```bash
TINYBIRD_TOKEN=                       # API token
TINYBIRD_HOST=https://api.us-west-2.aws.tinybird.co  # Default host
```

### Datasources
| Datasource | Purpose |
|------------|---------|
| `page_views__v3` | Document page view analytics |
| `webhook_events__v1` | Webhook delivery tracking |
| `video_views__v1` | Video playback events |
| `click_events__v1` | Document link clicks |
| `signature_events__v1` | E-signature audit events |
| `pm_click_events__v1` | Marketing click tracking |

### Key Files
| File | Purpose |
|------|---------|
| `lib/tinybird/publish.ts` | Event publishing methods |
| `lib/tinybird/pipes.ts` | Pre-built analytics query pipes |
| `lib/tinybird/README.md` | Setup guide for new pipes |

---

## 7. Rollbar (Error Monitoring)

**Status:** Production. Automatically disabled in test environment.

### Environment Variables
```bash
ROLLBAR_SERVER_TOKEN=                 # Server-side read/write token
NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN=     # Client-side public token
ROLLBAR_READ_TOKEN=                   # Read-only token (dashboards)
```

### Test Behavior
- Automatically disabled when `JEST_WORKER_ID` is set
- No mock required — `reportError()` calls silently no-op in tests
- Development mode: Verbose logging enabled

### Key Files
| File | Purpose |
|------|---------|
| `lib/rollbar.ts` | Server + client Rollbar instances |
| `lib/error.ts` | `reportError()`, `handleApiError()` — all API routes instrumented |

---

## 8. PostHog (Client Analytics — Optional)

**Status:** Disabled by default. Enable by setting `NEXT_PUBLIC_POSTHOG_KEY`.

### Environment Variables
```bash
NEXT_PUBLIC_POSTHOG_KEY=              # API key (leave empty to disable)
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

### Key File
`lib/posthog.ts` — Returns `null` when key is not set. Client-side only.

---

## 9. Google OAuth (Dual Credential System)

### Environment Variables
```bash
# Primary (FundRoom project — use this going forward)
FUNDROOM_GOOGLE_CLIENT_ID=
FUNDROOM_GOOGLE_CLIENT_SECRET=

# Fallback (BFG legacy — remove after migration)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### Conditional Registration
OAuth providers are only registered when credentials are configured. The login/signup pages use `getProviders()` to dynamically render OAuth buttons. No buttons appear if credentials are missing.

### Key File
`lib/auth/auth-options.ts` — Lines 31-35 implement `FUNDROOM_GOOGLE_CLIENT_*` primary with `GOOGLE_CLIENT_*` fallback.

---

## 10. Test Infrastructure

### Running Tests
```bash
# All tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# Specific test suites
npm run test:sign          # E-signature tests
npm run test:auth          # Auth tests
npm run test:api           # All API tests
npm run test:lib           # Library tests
npm run test:providers     # KYC provider tests

# CI mode (coverage + exit)
npm run test:ci
```

### Test Configuration
| Setting | Value |
|---------|-------|
| Framework | Jest 30 + React Testing Library |
| Timeout | 30 seconds per test |
| Test files | `**/__tests__/**/*.test.{ts,tsx}` |
| Coverage thresholds | RBAC: 80%, Wire confirm: 75%, LP register: 70% |

### Test Environment Variables (jest.setup.ts)
```javascript
process.env.NEXTAUTH_SECRET = 'test-secret';
process.env.NEXTAUTH_URL = 'http://localhost:5000';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.PERSONA_API_KEY = 'test-persona-key';
process.env.PERSONA_TEMPLATE_ID = 'test-template-id';
process.env.SIGNATURE_VERIFICATION_SECRET = 'test-signature-verification-secret-key-32chars';
process.env.STORAGE_ENCRYPTION_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
process.env.NEXT_PUBLIC_BASE_URL = 'http://localhost:3000';
```

### Global Mocks (jest.setup.ts — 402 lines)
| Mock | Purpose |
|------|---------|
| `@/lib/prisma` | All Prisma models with CRUD + $transaction |
| `next-auth` | `getServerSession` returns mock session |
| `@/lib/redis` | Rate limiter with `__mockRateLimitFn` export |
| `@/lib/resend` | `sendEmail()` + `sendOrgEmail()` stubs |
| `stripe` | Webhook constructor mock |
| `resend` | Email client mock |
| ESM modules | `notion-client`, `mupdf`, `@vercel/edge-config` |

### Rate Limiter Testing
Rate limiting is mocked globally with a controllable mock function:

```javascript
// In test file:
const { __mockRateLimitFn } = jest.requireMock('@/lib/redis');

// Allow all requests (default)
__mockRateLimitFn.mockResolvedValue({ success: true, remaining: 29 });

// Simulate rate limit exceeded
__mockRateLimitFn.mockResolvedValueOnce({ success: false, remaining: 0 });
```

### Current Test Metrics (Feb 15, 2026)
| Metric | Value |
|--------|-------|
| Test files | 141 |
| Test suites | 132 |
| Total tests | 5,095+ |
| TypeScript errors | 0 |
| npm vulnerabilities | 0 |

---

## 11. Webhook Simulation Guide

### Stripe (Recommended: CLI)
```bash
# Install and authenticate
brew install stripe/stripe-cli/stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:5000/api/stripe/webhook

# Trigger specific events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger payment_intent.payment_failed
```

### Persona (Dashboard or curl)
Use the Persona Dashboard sandbox to trigger test webhooks, or simulate manually:

```bash
BODY='{"data":{"attributes":{"name":"inquiry.completed","payload":{"data":{"id":"inq_test","attributes":{"status":"completed","reference-id":"user123"}}}}}}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$PERSONA_WEBHOOK_SECRET" | awk '{print $2}')

curl -X POST http://localhost:5000/api/webhooks/persona \
  -H "persona-signature: $SIG" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

### Plaid (Sandbox Dashboard)
Plaid webhooks are JWT-signed (ES256) — simplest to trigger via Plaid Dashboard sandbox:
1. Go to Plaid Dashboard > Webhooks
2. Select sandbox environment
3. Choose webhook type (TRANSFER, AUTH, ITEM)
4. Send test event

---

## 12. Complete Environment Variable Reference

For the full list of ~108 environment variables with categories and descriptions, see `.env.example`.

### Minimum Required for Development
```bash
# Database (one of these)
SUPABASE_DATABASE_URL=postgresql://...    # Or
DATABASE_URL=postgresql://...

# Auth
NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=http://localhost:5000

# Storage
STORAGE_PROVIDER=local

# Paywall bypass (for MVP)
PAYWALL_BYPASS=true

# Backup (disabled)
BACKUP_DB_ENABLED=false
```

### Full Production Setup
See `.env.example` for all 108 variables with descriptions.
