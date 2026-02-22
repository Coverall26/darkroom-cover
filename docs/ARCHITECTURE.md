# Architecture

FundRoom is a multi-tenant, security-first fund operations SaaS platform built on Next.js 16.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                       │
│                                                                         │
│   GP Portal              LP Portal            Public Dataroom           │
│   (app.admin.*)          (app.fundroom.ai)     (app.fundroom.ai/view)   │
│   Fund management,       Onboarding wizard,    Document viewer,         │
│   investor pipeline,     dashboard, wire,      shareable links,         │
│   approvals, settings    docs, e-signature     analytics                │
└───────────┬──────────────────┬────────────────────┬─────────────────────┘
            │                  │                    │
            ▼                  ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     VERCEL EDGE NETWORK                                 │
│   TLS 1.3 │ HSTS │ Security Headers │ DDoS Protection │ CDN            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────────┐
│                     NEXT.JS 16 APPLICATION                              │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  proxy.ts     │  │  App Router   │  │ Pages Router │                  │
│  │  (middleware)  │  │  (app/api/)   │  │ (pages/api/) │                  │
│  │  Domain routing│  │  214 routes   │  │ 379 routes   │                  │
│  │  Auth checks  │  │  New features │  │ Core APIs    │                  │
│  │  CSP headers  │  └──────────────┘  └──────────────┘                  │
│  └──────────────┘                                                       │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      BUSINESS LOGIC (lib/)                       │   │
│  │                                                                  │   │
│  │  auth/          security/       audit/          middleware/       │   │
│  │  17 files       5 files         3 files         7 files          │   │
│  │  NextAuth,      Rate limiting,  Immutable log,  Domain routing,  │   │
│  │  RBAC, paywall  CSRF, anomaly   SHA-256 chain   CSP, CORS       │   │
│  │                                                                  │   │
│  │  crypto/        emails/         providers/      funds/           │   │
│  │  5 files        32 files        19 files        8 files          │   │
│  │  AES-256-GCM,   Tier 1+2 email  KYC, e-sign,   Tranches,       │   │
│  │  PDF encrypt    templates       payments        closes           │   │
│  │                                                                  │   │
│  │  investor/      signature/      storage/        validations/     │   │
│  │  7 files        15+ files       10+ files       20+ files        │   │
│  │  Pipeline,      Flatten PDF,    S3, Blob,       Zod schemas      │   │
│  │  approval       checksum        local                            │   │
│  │                                                                  │   │
│  │  esign/          tier/           crm/            billing/         │   │
│  │  4 files         5 files         8+ files        4 files          │   │
│  │  Envelopes,      CRM tiers,     Contacts,       Stripe CRM,     │   │
│  │  filing, fields  gates, resolve  engagement      checkout         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐   ┌──────────────────┐   ┌──────────────────┐
│   SUPABASE    │   │   STORAGE        │   │   SERVICES       │
│   PostgreSQL  │   │                  │   │                  │
│               │   │   AWS S3 / KMS   │   │   Resend (email) │
│   117 models  │   │   Vercel Blob    │   │   Rollbar (errors)│
│   40 enums    │   │   CloudFront CDN │   │   Tinybird (analytics)│
│   ~1,694 cols │   │                  │   │   Persona (KYC)  │
│   ~530 indexes│   │   Per-org key    │   │   Stripe (billing)│
│               │   │   prefixes       │   │   Upstash (Redis)│
│   Prisma ORM  │   │                  │   │                  │
└───────────────┘   └──────────────────┘   └──────────────────┘
```

---

## Multi-Tenant Isolation

Every tenant (organization) is isolated at the database level. All queries filter by `org_id` or `teamId`.

```
┌─────────────────────────────────────────────────┐
│              ORGANIZATION (Tenant)               │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │   Team    │  │   Fund   │  │ Dataroom │      │
│  │  Members  │  │  Terms   │  │ Documents│      │
│  │  Roles    │  │  Investors│  │  Links   │      │
│  │  Settings │  │  Tranches│  │  Views   │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │         Audit Log (per team)              │   │
│  │   SHA-256 hash chain, immutable           │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  Storage prefix: /{teamId}/{documentId}/         │
│  Email domain: custom domain or @fundroom.ai     │
└─────────────────────────────────────────────────┘
```

**Isolation guarantees**:
- Database: Every query includes `WHERE teamId = ?` or `WHERE orgId = ?`
- Storage: Per-org S3 key prefixes with KMS encryption
- Email: Per-org Resend domains (Tier 2) with fallback to @fundroom.ai (Tier 1)
- Audit: Separate SHA-256 hash chains per team
- Sessions: JWT tokens scoped to user, team membership verified per request

---

## Authentication Flow

```
                    ┌──────────────┐
                    │   User       │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Email /  │ │  Google  │ │  Magic   │
        │ Password │ │  OAuth   │ │  Link    │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │             │             │
             ▼             ▼             ▼
        ┌──────────────────────────────────────┐
        │         NextAuth 4.24                │
        │                                      │
        │  JWT Session Token                   │
        │  __Secure-next-auth.session-token    │
        │  HttpOnly, Secure, SameSite=Lax     │
        └──────────────────┬───────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │         proxy.ts (middleware)         │
        │                                      │
        │  1. Domain routing (which portal?)   │
        │  2. Session validation               │
        │  3. Role check (loginPortal claim)   │
        │  4. CSP headers                      │
        └──────────────────┬───────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  GP      │ │  LP      │ │  Public  │
        │  Portal  │ │  Portal  │ │  Viewer  │
        │ (admin)  │ │ (member) │ │ (token)  │
        └──────────┘ └──────────┘ └──────────┘
```

**LP-specific auth**: LP registration generates a one-time login token (64-char hex, 5-min expiry). Client exchanges it for a NextAuth JWT session via `/api/auth/lp-token-login`. This avoids the credentials flow entirely, preventing failures when LP already exists with a different password.

---

## Settings Inheritance

Settings cascade from system defaults through organization, team, and fund levels. Each lower level can override the parent.

```
┌─────────────────────────────┐
│  System Defaults             │  Hardcoded in code
│  (baseline for all orgs)     │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│  Organization Defaults       │  OrganizationDefaults model
│  (org-wide policies)         │  Set during Org Setup Wizard
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│  Team Settings               │  Team model fields
│  (team-level overrides)      │  Set in Settings Center
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│  Fund Overrides              │  Fund model + featureFlags
│  (per-fund customization)    │  Set per fund
└─────────────────────────────┘
```

**Resolution**: `lib/settings/resolve.ts` computes effective settings at runtime by merging tiers. The Settings Center UI shows the source tier (color-coded badge) for each setting.

---

## Data Flow: GP Fund Creation

```
GP opens Org Setup Wizard
       │
       ▼
Step 1: Company Info ──► Organization record
       │
Step 2: Branding ──────► OrganizationDefaults (colors, domain)
       │
Step 3: Raise Style ───► Organization.featureFlags.mode
       │                  (GP_FUND / STARTUP / DATAROOM_ONLY)
Step 4: Team Invites ──► TeamMember records + invitation emails
       │
Step 5: Fund Details ──► Fund record + FundAggregate
       │                  (target size, waterfall, hurdle rate)
Step 6: LP Onboarding ─► OrganizationDefaults
       │                  (step config, doc templates, wire info)
Step 7: Dataroom ──────► Dataroom record + DataroomLink
       │
Step 8: Review & Launch ► FundroomActivation (ACTIVE)
                           SecurityPolicy record

       All created in single Prisma $transaction
```

---

## Data Flow: LP Investment

```
LP receives invite email
       │
       ▼
Dataroom View (public)
  │  ?ref= referral tracked
  │
  ▼
"I Want to Invest" button
  │  Checks fund state (NO_FUND / NOT_ACTIVATED / LIVE / PREVIEW)
  │
  ▼
LP Onboarding Wizard (/lp/onboard?fundId=xxx&teamId=yyy)
  │
  ├─► Step 1: Account ──────► POST /api/lp/register → User + Investor
  │                            One-time login token → session
  │
  ├─► Step 2: NDA ──────────► POST /api/lp/sign-nda (audit: IP, UA)
  │
  ├─► Step 3: Accreditation ► POST /api/lp/investor-details
  │     506(c): source of funds, occupation, no-3rd-party-financing
  │
  ├─► Step 4: Entity Details ► POST /api/lp/investor-details
  │     7 entity types with Zod validation
  │     Tax ID encrypted (AES-256)
  │
  ├─► Step 5: Commitment ───► POST /api/lp/commitment
  │     Amount + 8 SEC representations
  │     Creates Investment record
  │
  ├─► Step 6: Sign Documents ► FundRoomSign (split-screen)
  │     Sequential: NDA → Sub Agreement → LPA
  │     POST /api/sign/{token} per document
  │     Auto-flatten PDF + Certificate of Completion
  │     Auto-advance: COMMITTED → DOCS_APPROVED
  │
  └─► Step 7: Fund / Wire ──► Wire instructions display
        Proof upload → Transaction (PROOF_UPLOADED)
        │
        ▼
  GP Confirms Wire ──────────► POST /api/admin/wire/confirm
     Atomic: Transaction.status → COMPLETED
             Investment.fundedAmount updated
             Investment.status → FUNDED
             FundAggregate recalculated
             LP email: wire confirmed
```

---

## Data Flow: E-Signature

```
GP Prepares Document
  │
  ├─► Upload PDF (S3/Vercel Blob)
  ├─► Create SignatureDocument (fundId, requiredForOnboarding)
  ├─► Place fields (10 types: SIGNATURE, INITIALS, TEXT, etc.)
  └─► Assign recipients (SignatureRecipient, signingOrder)
       │
       ▼
LP Opens Signing Flow
  │
  ├─► GET /api/lp/signing-documents (filtered by fundId)
  │     Returns documents sorted by type priority
  │
  ├─► FundRoomSign component renders
  │     Left panel (60%): PDF viewer with field overlays
  │     Right panel (40%): auto-filled fields + SignatureCapture
  │
  ├─► LP draws/types/uploads signature
  │     Canvas-based (PointerEvents for touch)
  │     3 modes: Draw, Type (cursive fonts), Upload (PNG/JPG)
  │
  ├─► ESIGN/UETA consent modal → confirm
  │
  └─► POST /api/sign/{token}
       │
       ▼
  Server Processing
  │
  ├─► Validate all required fields signed
  ├─► Flatten signatures onto PDF (pdf-lib)
  │     Embeds images + text at coordinates
  │     Adds Certificate of Completion page
  │
  ├─► Generate SHA-256 checksum
  ├─► Encrypt signed PDF (AES-256)
  ├─► Store: signedFileUrl, signedFileType, signedAt
  ├─► Update SignatureDocument status → COMPLETED
  │
  ├─► Check: all requiredForOnboarding docs signed?
  │     Yes → advanceInvestorOnSigningComplete()
  │           Investment.status: COMMITTED → DOCS_APPROVED
  │           Send investor approved email
  │
  └─► Auto-advance to next unsigned document
```

## Data Flow: Standalone Envelope Signing (Phase 2)

```
GP Creates Envelope (any document, not just fund onboarding)
  │
  ├─► POST /api/esign/envelopes
  │     Upload PDF, add recipients (SIGNER/CC/CERTIFIED_DELIVERY)
  │     Choose signing mode: SEQUENTIAL / PARALLEL / MIXED
  │     Set email subject, message, expiry, reminders
  │
  ├─► POST /api/esign/envelopes/{id}/send
  │     DRAFT → SENT
  │     Notifies first group (sequential) or all (parallel)
  │     Recipients get unique signing tokens
  │
  └─► Signer opens signing link (token-based, no auth needed)
       │
       ├─► GET /api/esign/sign?token=xxx
       │     Validates token, checks signing order eligibility
       │     Returns canSign: true/false based on mode + order
       │     Marks recipient as VIEWED on first access
       │
       ├─► POST /api/esign/sign
       │     Records signature + ESIGN/UETA consent (SHA-256 hash)
       │     Updates recipient status → SIGNED
       │     Auto-creates CRM Contact for signer
       │
       └─► advanceSigningOrder()
            │
            ├─► Sequential/Mixed: unlock next order group
            │     Next recipients get SENT status
            │
            └─► All signers done? → COMPLETED
                 │
                 └─► autoFileEnvelopeDocument()
                      ├─► Org Vault: /Signed Documents/YYYY-MM/{title}_signed.pdf
                      ├─► Contact Vault × N: auto-provision vault + magic link
                      └─► Email Filing × all: immutable audit record
```

**Key Prisma Models:** `Envelope` → `EnvelopeRecipient` (1:N), `ContactVault` (1:1 per Contact), `DocumentFiling` (audit trail)

---

## Paywall Architecture

```
┌─────────────────────────────────────────────────────┐
│                    FREE TIER                         │
│                                                      │
│  Dataroom CRUD        Document sharing               │
│  Public viewer        Analytics                      │
│  Shareable links      Express interest               │
│  (No FundroomActivation required)                    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                    PAID TIER                         │
│                (FundroomActivation)                   │
│                                                      │
│  LP Registration      Staged Commitments             │
│  E-Signature          Wire Proof Upload              │
│  LP Onboarding        LP Dashboard (fund features)   │
│                                                      │
│  Check: PAYWALL_BYPASS=true → allow all              │
│         FundroomActivation (team or fund) → allow    │
│         Neither → 402 Payment Required               │
└─────────────────────────────────────────────────────┘

GP Activation:
  Org Setup Wizard completion → FundroomActivation (ACTIVE)
  OR: POST /api/admin/activate-fundroom
  Stripe Checkout → webhook → FundroomActivation
```

### CRM Billing Tiers (Organization-scoped)

```
┌─────────────────────────────────────────────────────┐
│  CRM TIER MODEL (Organization.subscriptionTier)      │
│                                                      │
│  FREE ($0)        → 20 contacts, 10 e-sig/mo        │
│  CRM_PRO ($20/mo) → Unlimited contacts, 25 e-sig/mo │
│  FUNDROOM ($79/mo) → Everything unlimited            │
│  AI_CRM (+$49/mo) → AI add-on (14-day trial)        │
│                                                      │
│  Tier resolution: lib/tier/crm-tier.ts (60s cache)   │
│  Gate enforcement: lib/tier/gates.ts                 │
│  Billing logic:   lib/billing/crm-billing.ts         │
│  Stripe config:   lib/stripe/crm-products.ts         │
│  APIs:            app/api/billing/                    │
│  Webhook:         app/api/webhooks/stripe-crm/       │
└─────────────────────────────────────────────────────┘

Subscription Lifecycle:
  FREE → Checkout → CRM_PRO or FUNDROOM (immediate)
  Upgrade: CRM_PRO → FUNDROOM (proration, immediate)
  Downgrade: FUNDROOM → CRM_PRO (end of period)
  Cancel: Any → FREE (end of period)
  AI CRM: Subscribe (trial) → Cancel (period end) → Deleted (webhook)

Separate from SaaS team billing (ee/stripe/).
Events identified by metadata.system === "crm".
```

---

## Email Architecture

```
┌─────────────────────────────────────────────────────┐
│  TIER 1 — Platform (@fundroom.ai)                    │
│                                                      │
│  Authentication: verification, magic links           │
│  Billing: invoices, plan changes                     │
│  Onboarding: welcome, trials                         │
│  Compliance: Form D reminders                        │
│                                                      │
│  Always from: noreply@fundroom.ai                    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  TIER 2 — Org-Branded (custom domain or fallback)    │
│                                                      │
│  Investor: welcome, approved, rejected, changes      │
│  Wire: instructions, confirmed, proof lifecycle      │
│  Documents: review, uploaded                         │
│  Dataroom: notifications, views                      │
│  E-Signature: signing requests, completion           │
│  Team: invitations                                   │
│                                                      │
│  From: configured org domain                         │
│  Fallback: @fundroom.ai if no custom domain          │
└─────────────────────────────────────────────────────┘

sendEmail()    → Tier 1 (lib/resend.ts)
sendOrgEmail() → Tier 2 (lib/resend.ts, resolves org domain from DB)
```

---

## Audit Trail Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                    IMMUTABLE AUDIT LOG                              │
│                                                                    │
│  Entry N-2          Entry N-1           Entry N                    │
│  ┌─────────┐       ┌─────────┐        ┌─────────┐                │
│  │ hash: H₁│──────►│prevH: H₁│───────►│prevH: H₂│                │
│  │ seq: 1  │       │ hash: H₂│        │ hash: H₃│                │
│  │ event   │       │ seq: 2  │        │ seq: 3  │                │
│  │ data    │       │ event   │        │ event   │                │
│  └─────────┘       │ data    │        │ data    │                │
│                    └─────────┘        └─────────┘                │
│                                                                    │
│  Algorithm: SHA-256                                                │
│  Isolation: Separate chains per team                               │
│  Genesis: 64-char zero hash                                        │
│  Verification: GET /api/teams/:teamId/audit/verify                 │
│  Export: POST /api/teams/:teamId/audit/export (with checksums)     │
│  Retention: 1-10 years (configurable, default 7 for SEC)           │
│                                                                    │
│  60+ event types: DOCUMENT_*, INVESTOR_*, SUBSCRIPTION_*,          │
│  FUND_*, ACCREDITATION_*, KYC_*, etc.                              │
└────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
/home/user/darkroom/
│
├── app/                      Next.js App Router
│   ├── api/                  214 App Router API routes
│   │   ├── esign/            9 standalone e-signature routes
│   ├── (auth)/               Auth pages (login, signup, verify)
│   ├── (saas)/               SaaS pages (org setup, onboarding)
│   ├── admin/                GP admin portal
│   │   ├── setup/            8-step GP wizard (V2)
│   │   ├── investors/        Pipeline, manual entry, bulk import
│   │   ├── approvals/        Approval queue
│   │   ├── documents/        LP doc review + template management
│   │   ├── fund/             Fund detail + wire + documents
│   │   ├── settings/         Settings center
│   │   └── reports/          Analytics + CSV export
│   ├── lp/                   LP portal
│   │   ├── onboard/          7-step onboarding wizard
│   │   ├── dashboard/        LP dashboard
│   │   ├── docs/             Document vault
│   │   └── wire/             Wire instructions + proof
│   ├── sign/                 E-signature pages
│   └── view/                 Dataroom public viewer
│
├── pages/api/                379 Pages Router API routes
│   ├── admin/                GP management APIs
│   ├── auth/                 Authentication
│   ├── lp/                   LP onboarding + portal
│   ├── sign/                 E-signature
│   ├── teams/[teamId]/       Team-scoped operations
│   ├── documents/            Document management
│   ├── approvals/            Approval workflow
│   └── webhooks/             Third-party webhooks
│
├── components/               539 React components
│   ├── admin/                GP dashboard components
│   ├── lp/                   LP onboarding + portal
│   ├── esign/                FundRoomSign (consolidated signing)
│   ├── signature/            Signature capture + PDF viewer
│   ├── setup/                Wizard step components
│   ├── raise/                Startup raise wizard
│   ├── approval/             GP approval queue
│   ├── onboarding/           LP onboarding steps
│   ├── documents/            Document management
│   ├── emails/               Email templates (React Email)
│   └── ui/                   shadcn/ui component library
│
├── lib/                      354 files — business logic
│   ├── auth/                 Authentication + authorization (17 files)
│   ├── security/             Rate limiting, CSRF, anomaly detection
│   ├── audit/                Immutable audit logging
│   ├── middleware/            Domain routing, CSP, CORS
│   ├── crypto/               AES-256 encryption
│   ├── emails/               32 email sender functions
│   ├── providers/            KYC, e-sign, payments adapters
│   ├── signature/            PDF flattening, checksums
│   ├── storage/              S3, Vercel Blob, local
│   ├── funds/                Tranche lifecycle
│   ├── investor/             Approval pipeline
│   ├── validations/          Zod schemas
│   ├── settings/             Inheritance resolution
│   ├── tier/                 CRM tier resolution + gates (5 files)
│   ├── billing/              CRM upgrade/downgrade logic
│   ├── stripe/               CRM product/price config
│   └── esign/                Standalone envelope system (4 files)
│       ├── envelope-service.ts    Envelope CRUD + lifecycle (561 lines)
│       ├── field-types.ts         16 field types + validation (489 lines)
│       ├── document-filing-service.ts  Org/contact vault filing (568 lines)
│       └── signing-session.ts     Token auth + signing flow (479 lines)
│
├── prisma/                   Database
│   ├── schema.prisma         137 models, 89 enums, ~5,670 lines
│   ├── migrations/           28 migrations
│   ├── seed-bermuda.ts       First tenant seed
│   └── seed-platform-admin.ts
│
├── __tests__/                167 test files, 5,873+ tests
│   ├── api/                  API route tests
│   ├── lib/                  Library unit tests
│   ├── e2e/                  End-to-end flows
│   └── integration/          Integration tests
│
├── ee/                       Enterprise features (131 files)
│   ├── features/             Billing, conversations, templates
│   └── stripe/               Stripe integration
│
├── docs/                     31+ documentation files
└── .github/workflows/        CI/CD (test, prod, preview, integration)
```

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js | 16.1.6 |
| Runtime | Node.js | 22.x |
| Language | TypeScript | Strict mode |
| UI | React + shadcn/ui + Tailwind CSS | 19.2 / 3.4 |
| Database | PostgreSQL (Prisma ORM) | Prisma 6.19 |
| Auth | NextAuth | 4.24 |
| Email | Resend + React Email | 6.5 / 5.0 |
| E-Signature | FundRoom Sign (native) | pdf-lib 1.17 |
| Storage | AWS S3 / Vercel Blob | KMS encrypted |
| Monitoring | Rollbar + Tinybird + PostHog | Server + client |
| Testing | Jest + React Testing Library | Jest 30 |
| Hosting | Vercel | Serverless |
| CI/CD | GitHub Actions | 4 workflows |
