# FundRoom AI

[![Tests](https://github.com/Darkroom4/darkroom/actions/workflows/test.yml/badge.svg)](https://github.com/Darkroom4/darkroom/actions/workflows/test.yml)
[![Deploy](https://github.com/Darkroom4/darkroom/actions/workflows/production.yml/badge.svg)](https://github.com/Darkroom4/darkroom/actions/workflows/production.yml)

A comprehensive 506(c) fund GP/LP management suite designed to streamline investor relations and compliance. Built for fund managers who need secure document sharing, self-hosted e-signature capabilities, personalized investor portals, and integrated KYC/AML verification.

## Features

### Core Platform
- **Shareable Links:** Share your documents securely by sending a custom link
- **Custom Branding:** Add a custom domain and your own branding
- **Analytics:** Gain insights through document tracking and page-by-page analytics
- **Self-hosted:** Host it yourself and customize it as needed
- **Paywall Logic:** Free datarooms forever; FundRoom features (LP onboarding, e-signature, commitments, wire confirmation) gated behind `FundroomActivation` record with `PAYWALL_BYPASS` env var for MVP launch

### LP Fundroom Portal
Personalized investor experience with comprehensive fund management:

- **Unique Fundroom Dashboard:** Each LP gets a personalized dashboard showing their investments, commitments, distributions, and capital calls with real-time updates
- **Multi-Step Onboarding:** Guided flow from account creation through NDA signature, accreditation, entity details, document upload, to funding
- **Subscription Modal:** Unit-based pricing with multi-tier blended pricing, Review→Sign flow, and server-side amount validation
- **Per-LP Document Vault:** Secure storage for signed subscription agreements, K-1s, and investor-specific documents
- **Bank Account Linking:** Plaid integration for ACH capital calls and distributions (Phase 2)
- **Real-time Updates:** 30-second auto-refresh polling with manual refresh buttons

### E-Signature (FundRoom Sign)
Fully self-hosted e-signature solution with no external dependencies:

- Custom React drag-and-drop field placement
- Multi-recipient workflows (Signer, Viewer, Approver)
- Sequential signing with configurable order
- Bulk sending and reusable templates
- Detailed audit trails with embedded PDF signatures using pdf-lib
- **FundRoomSign consolidated LP signing component** — split-screen experience with PDF viewer (left) + auto-filled investor fields + signature capture (right), 3 capture modes (draw/type/upload), ESIGN/UETA compliance, multi-document queue with auto-advance

### Document Template Management
GP-configurable document templates for LP onboarding:

- **Mode-aware document lists:** GP Fund mode (NDA, LPA, Subscription Agreement, PPM, Side Letter, Investor Questionnaire) and Startup mode (SAFE, Convertible Note, SPA, IRA, Voting Agreement, ROFR, Board Consent)
- **Default + Custom templates:** FundRoom provides default templates; GPs can upload custom PDFs/DOCX files (25MB max)
- **Template preview:** Dark-themed modal viewer with zoom controls and page navigation
- **Drag-drop upload:** Progress bar, file type validation, presigned URL upload via `putFile()`
- **Merge fields display:** Shows auto-fill fields (investor_name, investment_amount, fund_name, etc.) per document type
- **Instrument-aware filtering:** Startup mode dynamically shows required docs based on instrument type (SAFE, Convertible Note, Priced Equity, SPV)

### Admin/GP Dashboard
Comprehensive fund management tools:

- Fund settings with NDA gate toggling
- Financial aggregates (Total Raised, Distributed, Commitments)
- Recharts visualizations
- Bulk action wizard for capital calls and distributions
- Dual Threshold System: Initial Closing Threshold vs Full Authorized Amount
- Form D compliance tracking with amendment reminders
- Entity Mode toggle (FUND vs STARTUP) for Phase 3 expansion
- **GP Approval Queue** — Dedicated dashboard with tabs (All/Pending/Approved/Rejected/Changes Requested), inline field editing for approve-with-changes, side-by-side change request comparison, pending badge counts
- **Manual Investor Entry** — 5-step wizard with lead matching (email blur checks dataroom views + marketplace waitlist), installment payment tracking, enhanced accreditation recording (self-cert/third-party/min-invest/pending), date-signed per document
- **Document Review System** — GP reviews LP-uploaded documents (approve/reject/request revision), side-by-side comparison for re-uploads, GP can upload documents on behalf of LP
- **Wire Transfer Confirmation** — GP dashboard for confirming wire receipts, viewing proof-of-payment uploads, and marking transactions as completed
- **Fund Type Selector** — Card-based visual selector for fund types (VC, PE, Real Estate, etc.) with PATCH endpoint for updating fund details
- **Regulation D Exemption Selector** — SEC exemption dropdown: Rule 506(b), Rule 506(c), Regulation A+ (Tier 1/Tier 2), Rule 504

### Investor Entity Architecture
Comprehensive entity type system supporting all SEC-recognized investor categories:

- **7 Entity Types:** Individual, Joint, Trust/Estate, LLC/Corporation, Partnership, IRA/Retirement, Charity/Foundation
- **Dynamic Forms:** Entity-specific fields (authorized signer, trustee info, plan custodian, etc.)
- **Tax ID Collection:** SSN/EIN with input masking and encrypted storage (AES-256)
- **Per-Entity Accreditation:** SEC-compliant accreditation criteria checkboxes tailored to each entity type
- **Zod Validation:** Discriminated union schemas validating all 7 entity types

### Wire Transfer & Payment (MVP)
Manual wire transfer flow for capital movements:

- **LP-Facing:** Wire instructions display (bank, routing, account, reference), proof-of-payment upload (drag-drop), payment status tracking with auto-polling
- **GP-Facing:** Pending wire confirmation dashboard, proof document review, one-click receipt confirmation
- **ACH:** Placeholder for Phase 2 Stripe/Plaid integration

### Document Upload & GP Confirmation
Full document lifecycle for LP compliance documents:

- **LP Upload:** Drag-drop upload (PDF/DOCX/JPG/PNG, 25MB max), document type selection, status tracking
- **GP Review:** Approve/reject/request revision with inline editing, side-by-side comparison for re-uploads
- **GP Upload for LP:** GPs can upload documents on behalf of investors
- **Status Flow:** `UPLOADED_PENDING_REVIEW` → `APPROVED` / `REJECTED` / `REVISION_REQUESTED`

## 506(c) Compliance

This platform is designed for SEC Rule 506(c) compliant private offerings:

### Accredited Investor Verification
- **Self-Certification Wizard:** 4-checkbox accreditation flow with SEC-compliant criteria
- **KYC/AML Verification:** Persona API integration (iframe embed, post-NDA/pre-subscription)
- **Comprehensive Audit Trail:** Every investor action is logged with timestamps, IP addresses, and user agents

### Compliance Features
- Form D filing date tracking and annual amendment reminders
- State notice requirements tracking
- View audit logging with IP address, geolocation, device info, and session tracking
- Accreditation status tracking (PENDING, VERIFIED, SELF_CERTIFIED, EXPIRED)

### LP Onboarding Wizard (7 Steps)
1. **Account Creation** — Email, password, name (one-time login token bypasses credential conflicts)
2. **NDA Signing** — NDA document review + signature (if enabled by GP)
3. **Accreditation** — Self-certification with entity-type-specific criteria; 506(c) enhanced: no third-party financing, source of funds, occupation
4. **Investor Entity Details** — 7 entity types (Individual, Joint, Trust/Estate, LLC/Corporation, Partnership, IRA/Retirement, Charity/Foundation) with dynamic forms, tax ID masking, authorized signer
5. **Commitment** — Units, amount, 8 SEC investor representations (accredited cert, principal, read docs, risk, restricted securities, AML/OFAC, tax, independent advice)
6. **Sign Documents** — Sequential signing flow (NDA → Subscription Agreement → LPA → Side Letter) via FundRoomSign
7. **Email Verification** — Verify email for portal access

**Wire instructions + proof upload handled via FundingStep component (separate from onboarding wizard)**

### GP Org Setup Wizard V2 (9 Steps) — `/admin/setup`
Modular 9-step wizard with `useWizardState` hook, auto-save (3s debounce), and skip logic for DATAROOM_ONLY mode:

1. **Company Info** — Legal name, entity type, EIN (AES-256 encrypted, masked XX-XXXXXXX), Bad Actor 506(d) certification, business address, phone
2. **Branding** — Logo upload, brand colors (primary/secondary/accent), custom domain, email sender, company profile (description, sector, geography, website, founded year), live preview
3. **Raise Style** — GP/LP Fund, Startup Capital Raise, or Just a Dataroom. Regulation D exemption selector (506(b), 506(c), Reg A+, Rule 504). Unit price + min investment config. DATAROOM_ONLY skips Steps 5-6
4. **Dataroom** — Dataroom name, description, default policies (download, watermark, NDA gate), shareable link generation
5. **Fund Details** — GP Fund: fund name, type (VC/PE/RE/Hedge/FoF/Search), target, waterfall (European/American), hurdle rate, term/extension, management fee, carry, wire instructions (AES-256). Startup: instrument type (SAFE/Conv Note/Priced/SPV) with dynamic terms
6. **LP Onboarding** — 5 sections: Onboarding Steps (drag-reorder), Document Templates (upload/default/preview), Accreditation method (Self-Cert/Third-Party/Min-Invest/Persona), Notification preferences (6 toggles), Wiring Instructions
7. **Integrations** — Active service status indicators (Resend, Stripe, Persona, Tinybird, Rollbar), compliance settings (MFA, session timeout, audit retention)
8. **Launch** — Summary review of all steps, setup progress checklist, activation status, "Launch Organization" button

### GP Investor Review Page — `/admin/investors/[id]/review`
Full investor review dashboard (999 lines): profile summary card (entity type, accreditation, contact), commitment details with funding status, document vault with approve/reject/request-revision actions, timeline of all investor actions, 4 approval actions (Approve/Approve with Changes/Request Changes/Reject), side-by-side change request comparison

## Tech Stack

- [Next.js 16](https://nextjs.org/) – Framework (Hybrid Pages/App Router)
- [React 19](https://react.dev/) – UI Library
- [TypeScript](https://www.typescriptlang.org/) – Language
- [Tailwind CSS](https://tailwindcss.com/) – Styling
- [shadcn/ui](https://ui.shadcn.com) – UI Components
- [Prisma](https://prisma.io) – ORM [![Made with Prisma](https://made-with.prisma.io/dark.svg)](https://prisma.io)
- [PostgreSQL](https://www.postgresql.org/) – Database
- [NextAuth.js](https://next-auth.js.org/) – Authentication
- [Tinybird](https://tinybird.co) – Real-time Analytics
- [Resend](https://resend.com) – Transactional Email
- [Persona](https://withpersona.com) – KYC/AML Verification
- [Plaid](https://plaid.com) – Bank Connectivity
- [Stripe](https://stripe.com) – Platform Billing
- [Rollbar](https://rollbar.com) – Error Monitoring
- **Multi-Provider Storage** – AWS S3, Cloudflare R2, or local filesystem (migrating from Replit Object Storage)

## Payment Architecture

| Service | Purpose | Flow |
|---------|---------|------|
| **Manual Wire** | Capital movements (MVP) | Wire instructions + proof upload + GP confirmation |
| **Plaid** | ACH transfers (Phase 2) | Capital calls (LP → Fund), Distributions (Fund → LP) |
| **Stripe** | Platform billing | Subscription fees (not capital movements) |

## Getting Started

### Prerequisites
- Node.js 22+
- PostgreSQL database
- Required API keys (see Environment Variables)

### Installation

```bash
# Install dependencies
npm install

# Set up database
npx prisma db push

# Seed database (optional)
npx prisma db seed

# Start development server
npm run dev
```

### Environment Variables

```env
# Core (Prisma prefers SUPABASE_DATABASE_URL over DATABASE_URL)
SUPABASE_DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...

# Email
RESEND_API_KEY=...

# KYC/AML (sandbox mode available)
PERSONA_API_KEY=...
PERSONA_ENVIRONMENT=sandbox  # sandbox or production

# Bank Connectivity (sandbox mode available)
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox  # sandbox, development, or production

# Payments
STRIPE_SECRET_KEY=...
STRIPE_PUBLISHABLE_KEY=...

# Analytics
TINYBIRD_TOKEN=...

# E-Signature (defaults to native FundRoom Sign)
ESIGN_PROVIDER=fundroomsign  # fundroomsign, dropboxsign, docusign, pandadoc
ESIGN_WEBHOOK_SECRET=...

# Error Monitoring
ROLLBAR_SERVER_TOKEN=...
NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN=...
```

For complete environment setup, see the Environment Variables section above.

## Demo Credentials (Development/Staging)

| Role | Email | Password |
|------|-------|----------|
| GP (Fund Manager) | joe@bermudafranchisegroup.com | FundRoom2026! |
| LP (Investor) | demo-investor@example.com | Investor2026! |
| Admin | rciesco@fundroom.ai | (see ADMIN_TEMP_PASSWORD secret) |

- **Dataroom URL:** `/d/bermuda-club-fund`
- **Seed script:** `npx ts-node prisma/seed.ts` (creates Bermuda Club Fund I + demo users)

## Documentation

| Document | Description |
|----------|-------------|
| [replit.md](replit.md) | Project overview, architecture, and current state |
| [NAMING_MIGRATION.md](docs/NAMING_MIGRATION.md) | BFFund → FundRoom naming migration history and rules |
| [DUAL_DATABASE_SPEC.md](docs/DUAL_DATABASE_SPEC.md) | Supabase (primary) + Replit Postgres (backup) architecture |
| [BUG_MONITORING_TOOLS_REPORT.md](docs/BUG_MONITORING_TOOLS_REPORT.md) | All 16 monitoring, testing, and debugging tools |
| [TRACKING_AND_MONITORING.md](docs/TRACKING_AND_MONITORING.md) | Tracking, monitoring, and error reporting architecture |
| [GITHUB_ACTIONS_GUIDE.md](docs/GITHUB_ACTIONS_GUIDE.md) | CI/CD pipeline setup and concurrency rules |
| [FundRoom_Brand_Guidelines.md](docs/FundRoom_Brand_Guidelines.md) | Brand identity, colors, typography, and voice |
| [FundRoom_Master_Plan_v13.md](docs/FundRoom_Master_Plan_v13.md) | Full product specification v13 (24 sections) |
| [FundRoom_Claude_Code_Handoff.md](docs/FundRoom_Claude_Code_Handoff.md) | Claude Code build handoff spec |
| [FundRoom_Raise_Types_Research.md](docs/FundRoom_Raise_Types_Research.md) | Complete fundraising structures & capital flow reference — SAFE, Conv Notes, Priced Rounds, SPVs, GP/LP fund types, waterfalls, metrics, document matrix |
| [Raise_Wizard_LP_Onboarding_Components.md](docs/Raise_Wizard_LP_Onboarding_Components.md) | Component inventory & integration guide for Raise Creation Wizard, LP Onboarding Wizard, Org Setup Wizard (8 steps), and Startup Raise Wizard |
| [Claude_Code_Build_GP_LP_Wizards.md](docs/Claude_Code_Build_GP_LP_Wizards.md) | Build instructions for GP Onboarding Wizard (8 steps) + LP Onboarding Wizard (7 steps) with SEC compliance |
| [GP_LP_Wizard_Reference.md](docs/GP_LP_Wizard_Reference.md) | Production-ready GP/LP React Wizard reference (1,754 lines) with all SEC compliance flows |
| [FundRoom_MVP_Reference.md](docs/FundRoom_MVP_Reference.md) | Standalone MVP reference (42 files, 6,089 lines) — complete GP/LP flows, 8-step wizard, FundRoom Sign, SEC compliance, seed data. Use as reference only. |
| [FundRoom_Gap_Analysis.md](docs/FundRoom_Gap_Analysis.md) | Master Plan vs Current Build gap analysis (~96-97% complete) |
| [CODEBASE_REVIEW_FEB13_2026.md](docs/CODEBASE_REVIEW_FEB13_2026.md) | Comprehensive codebase review: architecture, security, feature completion |
| [DEEP_REPO_ANALYSIS_FEB14_2026.md](docs/DEEP_REPO_ANALYSIS_FEB14_2026.md) | Deep repository analysis: build config, schema integrity, remaining items |
| [SESSION_SUMMARY_FEB13_AM_2026.md](docs/SESSION_SUMMARY_FEB13_AM_2026.md) | Feb 13 AM: LP auth fix, subscribe guard, DB sync, startup wizard, LP settings, 11 features |
| [SESSION_SUMMARY_FEB14_2026.md](docs/SESSION_SUMMARY_FEB14_2026.md) | Feb 14 session: Entity Architecture, Wire MVP, Doc Upload, SEC compliance, 13 commits |
| [SESSION_SUMMARY_FEB15_2026.md](docs/SESSION_SUMMARY_FEB15_2026.md) | Feb 15 session: GP Wizard V2 (25 files), LP APIs, GP Review, security hardening, 6 commits |
| [DATABASE_SETUP.md](docs/DATABASE_SETUP.md) | Database setup, migrations, seeding, dual-DB architecture, encryption, troubleshooting |
| [SANDBOX_TESTING.md](docs/SANDBOX_TESTING.md) | Sandbox config, test credentials, webhook simulation, Jest test infrastructure |
| [ERROR_RESPONSE_STANDARDIZATION_PLAN.md](docs/ERROR_RESPONSE_STANDARDIZATION_PLAN.md) | H-06 error response standardization across ~333 files |

## Testing

The project includes comprehensive E2E tests covering all phases:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- --testPathPattern="phase1"
```

### Test Coverage
- **5,873+ tests** across 177+ test suites (all passing, 0 TypeScript errors)
- Phase 1: LP/Visitor dataroom access, onboarding, subscriptions
- Phase 2: Admin/GP dashboard, bulk actions, fund management
- Phase 3: Cross-side interactions, edge cases, compliance stress tests

### Sandbox & Development Testing

For development without production API keys:

```bash
PLAID_ENV=sandbox
PERSONA_ENVIRONMENT=sandbox
STORAGE_PROVIDER=local
```

See **[docs/SANDBOX_TESTING.md](docs/SANDBOX_TESTING.md)** for complete sandbox configuration, test credentials, webhook simulation, and test infrastructure details.

## Database Schema

The Prisma schema is located at `prisma/schema.prisma` with **137 models** (~5,670 lines, ~1,800 columns, 530+ indexes, 89 enums, ~593 API routes) organized by domain:

- **Core**: User, Team, Account, Session, Brand, Domain
- **LP Portal**: Investor, Fund, Investment, CapitalCall, Distribution, Transaction
- **CRM & Billing**: Contact, EsigUsageRecord, EsigUsage (CRM tier enforcement)
- **Documents**: Document, DocumentVersion, DocumentPage, Folder
- **Datarooms**: Dataroom, DataroomDocument, DataroomFolder, DataroomBrand
- **Access Control**: Link, Viewer, ViewerGroup, PermissionGroup, AccessRequest
- **E-Signatures**: SignatureDocument, SignatureRecipient, SignatureField, SignatureTemplate, SignatureAuditLog
- **Compliance**: AuditLog, AccreditationAck
- **Banking**: BankLink, Transaction

See **[docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md)** for complete database setup, Prisma configuration, migration workflow, seed scripts, dual-database architecture, and troubleshooting.

## Roadmap

### Phase 1 (MVP) - Complete
- Core LP onboarding with NDA gate
- Accredited investor self-certification wizard
- Fundroom dashboard with investment tracking
- Self-hosted e-signature (FundRoom Sign)
- Dual threshold system (Initial Closing vs Full Authorized)
- Form D compliance tracking
- Multi-provider storage abstraction (S3, R2, local)
- Error monitoring with Rollbar

### Phase 2 - Complete
- **Provider Interface Abstraction** - All vendors abstracted behind interfaces (`lib/providers/`)
- **Feature Flag System** - Hierarchical config inheritance Org → Team → Fund (`lib/feature-flags/`)
- Plaid-powered ACH transfers with webhook-driven compliance logging
- Bulk capital call and distribution wizards
- Advanced analytics and AUM reporting with fee deductions
- Entity fee/tier configuration (management fees, carried interest, hurdle rates)
- Real-time wizard progress tracking
- Mobile viewport optimization

### Phase 3 - Mostly Complete
- ✅ **GP Onboarding Wizard V2** — Modular 8-step wizard at `/admin/setup` (25 files, 5,515 lines) with `useWizardState` hook, auto-save, Bad Actor 506(d) cert, skip logic
- ✅ **GP Investor Review** — Full review dashboard (999 lines) with 4 approval actions, document vault, timeline
- ✅ **STARTUP mode** — Startup Raise Wizard (SAFE, Convertible Note, Priced Equity, SPV) with dynamic terms
- ✅ **Organization Setup Wizard** — Complete 8-step wizard with V11 schema fields
- ✅ **Mode Toggle** (GP FUND vs STARTUP vs DATAROOM_ONLY) — Card selector in wizard Step 3
- ✅ **Investor Entity Architecture** — 7 entity types with SEC accreditation criteria
- ✅ **Settings Center** — Full UI with 7 sections and inheritance tier badges
- ✅ **Paywall Logic** — Free dataroom vs paid FundRoom features
- Planned: Vesting schedules, equity grants, share class management, secondary transfers

### CI/CD Pipeline - Fully Operational (February 2026)
All GitHub Actions workflows are fixed and automated:

| Workflow | Purpose | Trigger |
|----------|---------|---------|
| `test.yml` | Tests, linting, type-checking | Push to main, PRs targeting main |
| `production.yml` | Vercel production deployment | Main branch push |
| `preview.yml` | PR preview deployments | Pull requests |
| `integration.yml` | Sandbox API tests (Plaid, Persona) | Weekly schedule |

Configuration: Node.js 22, Prisma client generation, React 19 compatibility

## Deployment

### Vercel (Primary)
FundRoom AI is deployed on Vercel Pro. The platform uses host-based middleware routing for multi-tenant domain handling.

- **Team**: `team_UhYGRc30tmOLJuxfGViNKwhz` (BFFI)
- **Project**: `prj_TrkpUM6UHrGWQUY8SPHvASmM8BCA`
- **Domains**:
  - `fundroom.ai` — Marketing site
  - `app.fundroom.ai` — Main application (org signup/setup, visitor entrance for authenticated users)
  - `app.login.fundroom.ai` — Standard org login (front-end only access, even for admins)
  - `app.admin.fundroom.ai` — Admin-only login portal (must be admin to enter, no redirect to user front-end)
- **Build**: `vercel-build` script handles SW version → Prisma migrate → Next.js build
- **Node.js**: 22.x runtime
- **Storage**: `STORAGE_PROVIDER=vercel` (Vercel Blob Storage) — required for healthy status on Vercel deployments
- **Health**: `GET /api/health` — returns `{"status":"healthy"}` with database and storage checks

#### Critical Vercel Environment Variables

These must be set on Vercel for the platform to function correctly:

| Variable | Value | Why |
|----------|-------|-----|
| `NEXTAUTH_URL` | `https://app.fundroom.ai` | Auth callbacks, redirect URIs |
| `NEXT_PUBLIC_BASE_URL` | `https://app.fundroom.ai` | Client-side URL resolution |
| `NEXT_PUBLIC_APP_BASE_HOST` | `app.fundroom.ai` | Host-aware URL validation |
| `NEXT_PUBLIC_PLATFORM_DOMAIN` | `fundroom.ai` | Links API domain stripping |
| `STORAGE_PROVIDER` | `vercel` | Health check + storage provider selection |
| `SUPABASE_DATABASE_URL` | (secret) | Primary DB — code prefers this over `DATABASE_URL` |
| `BACKUP_DB_ENABLED` | `false` | Kill switch for Replit backup writes |
| `RESEND_FROM_EMAIL` | `noreply@fundroom.ai` | Default sender for platform emails |

All secrets (OAuth, encryption keys, Stripe, Persona, Tinybird, Rollbar) must also be set — see `.env.example` for the complete list.

```bash
# Storage Provider Configuration
STORAGE_PROVIDER=s3|r2|local|vercel  # Storage backend (use 'vercel' on Vercel deployments)
STORAGE_BUCKET=my-bucket          # S3/R2 bucket name
STORAGE_REGION=us-east-1          # AWS region
STORAGE_ENDPOINT=https://...      # Custom endpoint (for R2/MinIO)
STORAGE_ACCESS_KEY_ID=xxx         # AWS access key
STORAGE_SECRET_ACCESS_KEY=xxx     # AWS secret key
STORAGE_ENCRYPTION_KEY=xxx        # AES-256 key (64-char hex)
```

### Replit (Development)
The project is actively developed on Replit alongside Vercel deployment. Replit provides the development environment, backup database (Replit Postgres), and Object Storage. Config files: `.replit`, `replit.md`, `proxy.ts`.

### Docker
```bash
# Build image
docker build -t fundroom-ai .

# Run container
docker run -p 3000:3000 --env-file .env fundroom-ai
```

## Architecture

```
├── app/                      # Next.js App Router (primary — new routes go here)
│   ├── (auth)/              # Auth pages (login, verify)
│   ├── (saas)/              # SaaS signup flows
│   ├── (ee)/                # Enterprise edition pages
│   ├── admin/               # GP admin dashboard
│   ├── api/                 # App Router API routes
│   ├── coming-soon/         # Pre-launch splash pages (signup, login)
│   ├── dashboard/           # Main dashboard
│   ├── datarooms/           # Dataroom management
│   ├── documents/           # Document management
│   ├── hub/                 # Hub page
│   ├── lp/                  # LP (investor) portal pages
│   ├── settings/            # Settings pages (19 sub-sections)
│   ├── sign/                # E-signature pages
│   └── view/                # Public document/dataroom viewer
├── pages/                    # Legacy Pages Router (being migrated to app/)
│   ├── api/                 # REST API endpoints (13 subdirectories)
│   ├── _app.tsx             # Pages Router app wrapper
│   └── _document.tsx        # Document template
├── components/               # React components (~45 subdirectories)
│   ├── ui/                  # shadcn/ui primitives
│   ├── admin/               # GP admin components (pipeline, sidebar, pending-docs)
│   ├── approval/            # GP approval queue dashboard (GPApprovalQueue)
│   ├── datarooms/           # Dataroom components
│   ├── documents/           # Document components (ExternalDocUpload, GPDocReview, GPDocUpload, DocumentTemplateManager)
│   ├── emails/              # React Email templates (51+ templates)
│   ├── esign/               # FundRoomSign consolidated LP signing component
│   ├── lp/                  # LP portal components (accreditation, staged commitment, proof upload)
│   ├── onboarding/          # LP onboarding step components (InvestorTypeStep, FundingStep)
│   ├── raise/               # Startup raise wizard (InstrumentTypeSelector, terms, documents)
│   ├── setup/               # Org Setup Wizard steps (RaiseStyleStep, OnboardingSettingsStep, FundDetailsStep)
│   ├── signature/           # E-signature components (PDF viewer, sequential signing)
│   └── view/                # Viewer components (invest button, dataroom view)
├── lib/                      # Shared utilities (~50 subdirectories)
│   ├── providers/           # Vendor adapters (analytics, email, kyc, esign, payments)
│   ├── audit/               # Compliance audit logging (39+ event types, immutable hash chain)
│   ├── auth/                # Auth helpers (RBAC, paywall, admin guard)
│   ├── crypto/              # Encryption utilities (AES-256)
│   ├── email/               # Email domain service (Resend domain management)
│   ├── billing/             # CRM billing utilities (upgrade, downgrade, reactivate)
│   ├── crm/                 # CRM contact service (upsert, promotion, unified investors)
│   ├── engagement/          # Engagement scoring system (Hot/Warm/Cool tiers)
│   ├── esign/               # Standalone envelope e-signature (envelope, signing, filing, field types)
│   ├── featureFlags/        # Feature flag system (hierarchical resolution)
│   ├── funds/               # Fund management logic (tranches, closes)
│   ├── investors/           # Investor advancement logic (doc approval, signing complete)
│   ├── marketplace/         # Marketplace auth + analytics
│   ├── middleware/           # Middleware (CSP, domain routing, rate limiting, CORS)
│   ├── signature/           # E-signature logic (flatten-pdf, checksum, encryption)
│   ├── stripe/              # CRM Stripe product config and price IDs
│   ├── storage/             # Multi-provider storage (S3, R2, Vercel Blob, local)
│   ├── tier/                # CRM tier resolution + pay gates (FREE/CRM_PRO/FUNDROOM)
│   ├── tinybird/            # Analytics pipes and publish endpoints
│   ├── validations/         # Zod schemas (fund-types, investor-entity, startup-raise)
│   └── prisma.ts            # Database client (prefers SUPABASE_DATABASE_URL)
├── ee/                       # Enterprise Edition
│   ├── features/            # EE feature implementations
│   ├── limits/              # Usage/plan limits
│   ├── stripe/              # Stripe billing integration
│   └── emails/              # EE email templates
├── prisma/
│   ├── schema.prisma        # 5,670 lines, 137 models, 89 enums
│   └── migrations/          # Database migrations (28+)
├── __tests__/                # Test suite (5,873+ tests)
│   ├── api/                 # API route tests
│   ├── lib/                 # Utility tests
│   ├── e2e/                 # End-to-end tests
│   └── phase1/              # Phase 1 feature tests
├── public/                   # Static assets, service worker, manifest
├── .github/workflows/        # CI/CD (test, production, preview, integration)
└── scripts/                  # Build utilities
```
