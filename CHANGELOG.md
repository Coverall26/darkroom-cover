# Changelog

All notable changes to FundRoom are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- SECURITY.md, CONTRIBUTING.md, CHANGELOG.md (root-level)
- docs/API_REFERENCE.md, docs/DEPLOYMENT.md, docs/ARCHITECTURE.md
- docs/SEC_COMPLIANCE.md, docs/LP_ONBOARDING_FLOW.md

## [0.9.14] - 2026-02-20

**Launch Sprint — Testing Infrastructure, Performance Optimization & Visual Regression (Prompts 10-14)**

### Added
- **Critical Path Integration Tests** (`__tests__/integration/critical-path-integration.test.ts`) — Comprehensive E2E integration test suite covering LP registration, NDA signing, commitment with SEC representations, wire proof upload, GP wire confirmation, GP document review, approval queue, Form D export, and data consistency verification
- **Unit Test Suite: Fund Calculations** (`__tests__/lib/funds/fund-calculations.test.ts`, 29 tests) — AUM calculation, fee computation, snapshot persistence, scheduled calculations, capital call threshold checking/enforcement, threshold notification marking
- **Unit Test Suite: Wire Transfer Processing** (`__tests__/lib/wire-transfer/wire-processing.test.ts`, 11 tests) — Wire proof upload/review, pending proof listing, proof requirement setting, wire instructions CRUD, account number masking
- **Unit Test Suite: RBAC Enforcement** (`__tests__/lib/auth/rbac-enforcement.test.ts`, 18 tests) — Cross-team access denial, unauthenticated access, role hierarchy (OWNER through MEMBER), team ID extraction from query/body, hasRole utility, requireTeamMember, requireGPAccess
- **Unit Test Suite: Encryption Roundtrip** (`__tests__/lib/crypto/encryption-roundtrip.test.ts`, 38 tests) — AES-256-GCM encrypt/decrypt, tax ID encryption idempotency, SSN/EIN masking/validation, document integrity checksums, secure token generation
- **Visual Regression: Critical Flows** (`e2e/visual-critical-flows.spec.ts`, 22 tests) — CRM page (3 viewports), outreach center, fund detail/list, GP wire, GP documents (3 viewports), LP wire instructions (3 viewports), LP docs vault tablet, LP transactions tablet, e-signature error states
- **Visual Regression: Tablet Viewport** — Added iPad Mini tablet project (768×1024) to Playwright config for tablet-specific visual regression testing
- **Memory Cache Utility** (`lib/cache/memory-cache.ts`) — Reusable in-memory cache with TTL support for database query optimization

### Changed
- **Bundle Optimization** — Dynamic imports (`next/dynamic`) for heavy admin components (approvals, audit, CRM, documents), reducing initial JS bundle for faster page loads
- **Database Query Optimization** — Added select clauses to limit fetched columns in fund-dashboard and capital-tracking APIs, pagination guards, memory caching for repeated queries
- **Prisma Connection Hardening** — Enhanced connection pool settings with `connection_limit` parameter in database URL
- **Server Event Tracking** — Added `fund_dashboard_loaded` event to Tinybird analytics

### Fixed
- **36 integration test failures** in critical-path suite — Fixed mock setup for dual auth patterns (`next-auth` + `next-auth/next`), Prisma `$transaction` callback mocks, fire-and-forget promise resolution, and multi-model mock chains
- **Wire transfer test alignment** — Corrected field names (`proofStatus` not `transferStatus`, `proofDocumentKey` not `proofStorageKey`), default pageSize (25 not 20), wire instructions stored as objects not JSON strings
- **Crypto test alignment** — `decryptTaxId` returns original string for non-encrypted input, `createDocumentIntegrityRecord` uses `aes-256-gcm` algorithm, `verifyDocumentChecksum` throws `RangeError` on length mismatch
- **LP bank status test** — Updated mock to include `fundId` field on investor for status lookup
- **Admin fund dashboard** — Fixed TypeScript import for `reportError`, added proper error handling

## [0.9.13] - 2026-02-18

**Production Polish Sprint — 18-prompt build (P1-1 through P3-6)**

### Added
- **Production Smoke Test Suite** (`__tests__/deployment/production-smoke.test.ts`) — 20 tests across 8 critical domains: health, LP registration, commitment/wire, GP wire confirmation, SEC Form D export, auth guards, dashboard stats, H-06 response format
- **Deployment Readiness Endpoint** (`pages/api/admin/deployment-readiness.ts`) — Pre-flight checklist with 27 verification tests
- **E2E Email Notification Tests** — Integration tests verifying all email send functions fire correctly from their trigger endpoints
- **Document Template Merge Field Engine** (`lib/documents/merge-field-engine.ts`) — Entity-aware auto-fill for document templates
- **Reports & Analytics** — Wire reconciliation, document metrics, SLA tracking with CSV export
- **Audit Log Dashboard** — Polished viewer with 36 API tests

### Changed
- **GP Dashboard** — Skeleton loading states, empty state illustrations, mode-aware sidebar (GP_FUND/STARTUP/DATAROOM_ONLY), real-time data refresh
- **LP Dashboard** — Investment status banner, skeleton loading, mobile touch targets (44px), fund card progress bars
- **Settings Center** — 6 tab groups, global search/filter, unsaved changes tracking with discard prompt
- **Investor Detail Page** — Summary cards, compliance tab, entity details, investment timeline
- **Responsive Design** — Fixed mobile breakpoints across admin dashboard, investor list, fund detail, settings
- **Accessibility** — WCAG 2.1 AA improvements: ARIA labels, keyboard navigation, focus management, color contrast
- **Performance** — Dynamic imports for heavy components, query limits, AbortController for unmount cleanup
- **Wire Transfer** — Race condition prevention via `$transaction`, input validation tightening
- **Seed Data** — Expanded demo walkthrough data with investors at multiple stages, sample transactions, documents

### Fixed
- Email notification send functions wired to actual API triggers (were dead/disconnected)
- Orphaned email templates deleted
- SEC accreditation expiry enforcement in subscribe endpoint
- Form D export field validation
- Error handling standardization — all 500 responses return generic "Internal server error"
- Admin-login test assertion aligned with error sanitization

### Security
- Error handling final pass ensuring no error message leakage in 500 responses
- SEC compliance verification across LP and admin endpoints

## [0.9.12] - 2026-02-17

**V2 Wizard Completion, Signup Flow Unification, Settings Consolidation, LP Mobile Nav, LP Portal UX Polish**

### Added
- **LP Mobile Bottom Tab Bar** (`components/lp/bottom-tab-bar.tsx`) — Fixed bottom nav for mobile (<768px) with 4 tabs: Home, Docs, Payments, Account. Touch targets 44px, amber badge dots for pending items, iOS safe area support, dark theme matching LP portal
- **LP Layout wrapper** (`app/lp/layout.tsx`) — Shared layout for all LP pages with gradient background, LPHeader (desktop), LPBottomTabBar (mobile), and bottom padding clearance (pb-20 md:pb-0)
- **Viewport meta with safe area** — Added `viewport-fit: cover` to root layout for iOS notch/safe area padding via `env(safe-area-inset-bottom)`
- **Advanced Settings section** in admin settings center — "Advanced Settings" collapsible card with 12 quick links to legacy settings sub-pages (Dataroom Settings, Team Members, API Tokens, Webhooks, Custom Domains, Agreements, Signature Templates, Signature Audit Log, Link Presets, Tags, Data Export/Import, Incoming Webhooks)
- **QuickLink component** in admin settings — Reusable link row with label, description, and ChevronRight icon

### Changed
- **GP Setup Wizard upgraded to V2 content** — Replaced 3 V1 step files with V2 versions: Step5FundDetails (612→1,072 lines, adds advanced fund settings + SPV + Priced Round governance), Step6LPOnboarding (312→545 lines, adds document template management + drag-drop + notification toggles), Step8Launch (305→651 lines, adds comprehensive review with validation gate + 8-9 summary cards + progress checklist)
- **GP Setup Wizard expanded to 9 steps** — Added Step4TeamInvites (email + role invite management, 136 lines) as step 4. TOTAL_STEPS changed from 8 to 9. Renumbered all switch cases, validation, and DATAROOM_ONLY skip logic (now skips steps 5,6 instead of 4,5)
- **WizardProgress updated to 9 steps** — Added "Team" step with UserPlus icon. DATAROOM_ONLY skip indicators updated to steps 5,6. Min-width increased to 700px for 9 items
- **Signup flow unified to V2 wizard** — `/welcome?type=org-setup` now redirects to `/admin/setup` (was `/org-setup`). New users go through V2 wizard (9 steps, auto-save, modular) instead of V1 monolith
- **V1 org-setup replaced with redirect stub** — `app/(saas)/org-setup/page-client.tsx` reduced from 2,229 lines to 17-line redirect to `/admin/setup`
- **Onboarding-complete fallback redirect** — Changed from `/documents` to `/admin/dashboard`
- **Settings top-level redirect** — `/settings` now redirects to `/admin/settings` (was `/settings/general`) in next.config.mjs
- **LPHeader rewritten as self-contained component** — `components/lp/lp-header.tsx` now uses `useSession`, `usePathname`, `useRouter` internally. 4-tab branded nav (Home, Documents, Transactions, Account). Fetches branding from `/api/lp/fund-context`. Desktop only (`hidden md:flex`), content `max-w-[800px]`
- **LP Layout provides shared gradient + navigation** — All LP child pages inherit gradient background, LPHeader, and LPBottomTabBar from `app/lp/layout.tsx` instead of duplicating them
- **All LP pages standardized to `max-w-[800px]`** — Dashboard (was 7xl), Transactions (was 5xl), Docs (was 4xl), Wire (was 2xl) — consistent narrow content column
- **LP Dashboard progress tracker** — Updated from 4 stages to 5 stages: Applied → NDA Signed → Accredited → Committed → Funded. Uses `completedSet` pattern mapping from investor/investment model data

### Removed
- **5 orphaned V2 duplicate files** — Step5Dataroom.tsx (identical md5 to Step4Dataroom), Step8Integrations.tsx (identical md5 to Step7Integrations), Step6FundDetails.tsx (renamed to Step5FundDetails), Step7LPOnboarding.tsx (renamed to Step6LPOnboarding), Step9Launch.tsx (renamed to Step8Launch)
- **7 orphaned V1 components** — `components/setup/raise-style-step.tsx`, `components/setup/onboarding-settings-step.tsx`, `components/setup/fund-details-step.tsx`, `components/raise/startup-raise-wizard.tsx`, `components/raise/instrument-type-selector.tsx`, `components/raise/startup-raise-terms.tsx`, `components/raise/startup-raise-documents.tsx`
- **2 empty directories** — `components/setup/`, `components/raise/`
- **Duplicate gradient wrappers and inline nav** removed from individual LP pages (dashboard, transactions, docs, wire) — now provided by shared layout

### Fixed
- GP Setup Wizard was importing V1 step files (smaller, fewer features) while V2 files with advanced settings sat orphaned — now uses V2 content throughout
- Step4TeamInvites.tsx existed but was not wired into the wizard — now properly integrated as step 4
- LP navigation links (Documents, Sign) were hidden on mobile (hidden md:flex) — bottom tab bar provides mobile navigation
- New user signup flow reached V1 org-setup monolith instead of V2 modular wizard — now correctly routes to V2
- LP pages had inconsistent max-widths (2xl/4xl/5xl/7xl) — standardized to `max-w-[800px]` matching LPHeader width
- LP Dashboard progress tracker showed 4 wire-centric stages — updated to 5 onboarding-centric stages matching actual LP journey

## [0.9.11] - 2026-02-16

**GP Setup Wizard V1→V2 Final Cleanup — File renames, orphan deletion, review enhancements**

### Added
- Integrations summary card in Step9Launch review (5 active integrations: FundRoom Sign, Secure Storage, Audit Logging, Email, Wire Transfer)
- Expanded startup instrument details in Step9Launch review: SAFE (val cap, discount, type), Convertible Note (interest, maturity), Priced Round (pre-money, liq pref, option pool), SPV (target, carry, mgmt fee)
- Marketplace opt-in badge in Fund Terms review card

### Changed
- Step files renamed to match actual step numbers: `Step4Dataroom→Step5Dataroom`, `Step5FundDetails→Step6FundDetails`, `Step6LPOnboarding→Step7LPOnboarding`, `Step7Integrations→Step8Integrations`, `Step8Launch→Step9Launch`
- Updated all imports in `page.tsx` to match renamed files
- GP Setup Wizard now 9 steps (canonical): Company Info → Branding → Raise Style → Team Invites → Dataroom → Fund Details → LP Onboarding → Integrations → Launch

### Removed
- 7 orphaned V1 components with zero imports: `components/setup/raise-style-step.tsx`, `components/setup/onboarding-settings-step.tsx`, `components/setup/fund-details-step.tsx`, `components/raise/startup-raise-wizard.tsx`, `components/raise/instrument-type-selector.tsx`, `components/raise/startup-raise-terms.tsx`, `components/raise/startup-raise-documents.tsx`
- Empty directories: `components/setup/`, `components/raise/`

## [0.9.10] - 2026-02-15

**Gap Analysis Verification — Schema Fixes, Advanced Fund Settings, Full Codebase Audit**

### Added
- `Organization.relatedPersons` (Json) — Form D Section 3 related persons data (executive officers, directors, promoters)
- `Investor.accreditationDocumentIds` (String[]) — 506(c) third-party verification document references
- Advanced Fund Settings in V2 GP Wizard (`Step5FundDetails.tsx`): GP Commitment, Investment Period, Recycling Provisions, Key Person Clause, No-Fault Divorce Threshold, Preferred Return Method, Clawback Provision, Management Fee Offset — collapsed section
- WizardData type extended with 9 new advanced fund fields + defaults
- `setup/complete` API persistence for all advanced fund settings (gpCommitmentAmount, gpCommitmentPct, investmentPeriodYears, recyclingEnabled, keyPersonEnabled, keyPersonName, noFaultDivorceThreshold, preferredReturnMethod, clawbackProvision, mgmtFeeOffsetPct)
- Migration `20260215_add_schema_gap_fields` for new schema fields

### Fixed
- Form D export API (`form-d.ts`) — removed `phone` from User select query (field doesn't exist on User model; phone is on Organization)
- Form D export now uses `Organization.relatedPersons` when populated, with fallback to team admins
- `regulationDExemption` comment in schema updated to include all 4 exemption types

### Changed
- Schema lines: 4,235 → 4,276
- Test count: 5,095 → 5,191 (136 suites)
- Platform completion: ~98% → ~99% (all P0-P2 items verified complete or Phase 2/3)

## [0.9.9] - 2026-02-15

**Gap Analysis Completion Sprint + RBAC Migration + Form D Export + GP Notifications**

### Added
- SEC Form D data export endpoint (`GET /api/admin/reports/form-d`) — JSON and CSV output mapping to SEC Form D sections (OMB 3235-0076), investor counts by accreditation method, filing deadlines, fund economics
- GP commitment notification email — Tier 2 org-branded email to GP admins when LP commits (`gp-new-commitment.tsx`, `send-gp-commitment-notification.ts`)
- GP wire proof upload notification email — Tier 2 org-branded email to GP admins when LP uploads wire proof (`gp-wire-proof-uploaded.tsx`, `send-gp-wire-proof-notification.ts`)
- Fire-and-forget GP notification wiring in `subscribe.ts` and `wire-proof.ts`

### Changed
- Migrated 9 critical admin routes to centralized `enforceRBAC()`/`requireAdmin()` middleware (engagement, reports, reports/export, activate-fundroom, settings/update, form-d-reminders, documents/confirm, documents/reject, documents/request-reupload, pending-review)
- RBAC follow-up item severity downgraded from Medium to Low (remaining routes use functionally equivalent inline auth)
- Platform completion estimate updated to ~98%

---

## [0.9.8] - 2026-02-15

**GP Onboarding Wizard V2 + Security Hardening** (~14 hours, 25 new files, 5,515 lines)

### Added
- GP Setup Wizard V2 at `/admin/setup` — 8 modular steps with auto-save (3s debounce)
  - Step 1: Company Info (entity type, EIN with Bad Actor 506(d) cert)
  - Step 2: Branding (logo, colors, custom domain, live preview)
  - Step 3: Raise Style (GP Fund / Startup / Dataroom Only + Reg D)
  - Step 4: Dataroom (name, policies, shareable link)
  - Step 5: Fund Details (GP economics or startup instrument terms + wire instructions)
  - Step 6: LP Onboarding (step config, drag-reorder, doc templates, notifications)
  - Step 7: Integrations (active services, compliance settings)
  - Step 8: Launch (review summary, progress checklist, activation)
- 4 LP API routes (App Router): sign-nda, investor-details, commitment, upload-signed-doc
- GP Investor Review page (999 lines) with approve/reject/revision actions
- LP onboard dynamic route (`/lp/onboard/[fundId]`)
- Dedicated document reject endpoint (`/api/documents/{docId}/reject`)
- Session cookie centralization (`lib/constants/auth-cookies.ts`)
- Prisma migration: 27 new fields (Organization, Fund, OrganizationDefaults)

### Changed
- Wire proof status: `PENDING` changed to `PROOF_UPLOADED` for clearer LP-to-GP handoff
- All GP dashboard queries updated to include `PROOF_UPLOADED` in status filters
- Fund transactions API now supports multiple status values via `getAll("status")`
- SEC exemption expansion: added Regulation A+ and Rule 504 to selectors
- OnboardingSettingsStep: Preview button now functional, file upload notes updated
- Dark mode fixes: DocumentTemplateManager, ExternalDocUpload, GPDocReview, GPDocUpload
- ExternalDocUpload: document type includes "SAFE / SPA" label for startup raises

### Fixed
- Verify-link race condition: wrapped user upsert + token consumption in `$transaction()`
- Engagement API multi-tenant bypass: investors with no fund now require direct team linkage
- Silent error swallowing: 11 `.catch(() => {})` replaced with `reportError()` across document and wire endpoints
- FundingStep wire instructions: added `fundId` query param for multi-fund scoping + AbortController cleanup

### Security
- Session cookie name centralized (eliminates 6 duplicate computations)
- Verify-link atomicity fix prevents concurrent token reuse
- Engagement scoring API enforces team access for all investor lookups

---

## [0.9.7] - 2026-02-14

**Investor Entity Architecture + Wire Transfer MVP + Manual Entry Rewrite** (6+ hours, 13 commits, 18 new files)

### Added
- Investor Entity Architecture: 7 entity types (Individual, Joint, Trust/Estate, LLC/Corporation, Partnership, IRA/Retirement, Charity/Foundation) with dynamic forms, Zod validation, SEC-compliant accreditation criteria per type
- Wire Transfer Payment MVP: FundingStep component (22KB) with wire instructions display, proof upload, copy-to-clipboard, pay-later option
- Manual Document Upload + GP Confirmation: ExternalDocUpload, GPDocReview, GPDocUpload components + 4 API routes
- GP/LP SEC Compliance: 506(c) enhanced accreditation (source of funds, occupation), 8 investor representations with timestamps
- Manual Investor Entry Wizard rewrite: 5-step wizard with lead matching, payment persistence, document upload, FundAggregate sync
- FundTypeSelector: card-based visual fund type selection + PATCH fund endpoint
- Regulation D Exemption Selector: 506(b), 506(c), Reg A+, Rule 504
- Document Template Manager: admin integration with preview, upload, and fund-mode awareness
- Deep repository analysis document (`docs/DEEP_REPO_ANALYSIS_FEB14_2026.md`)
- Prisma migration: investor entity fields, SEC compliance fields, GP document types
- 6 composite indexes for common query patterns

### Fixed
- Role type error in fund route (Prisma `Role[]` type mismatch)
- EntityFormState type error in LP onboarding
- npm audit: 0 vulnerabilities (fixed markdown-it ReDoS, qs arrayLimit bypass)
- INITIALS PDF flattening: now uses `field.value` instead of `recipient.signatureImage`
- Next.js 16 middleware conflict: deleted `middleware.ts` (proxy.ts is the entry point)
- 3 missing component files synced from GitHub

### Changed
- Dev dependencies moved to `devDependencies` (reduces production bundle)
- Org-setup API error responses standardized to `{ error: }` format
- Empty file cleanup: removed `app/api/conversations/api/conversations-route.ts`

---

## [0.9.6] - 2026-02-13

**FundRoomSign E-Signature + GP Approval Queue + Startup Raise Wizard** (3 sessions)

### Added
- FundRoomSign consolidated e-signature component (1,266 lines): split-screen signing with PDF viewer + auto-filled fields + signature capture (Draw/Type/Upload)
- GP Approval Queue dashboard (1,039 lines): tabs (All/Pending/Approved/Rejected/Changes Requested), 4 approval actions with modals, side-by-side change comparison
- Startup Raise Wizard: 4-step instrument selector (SAFE, Convertible Note, Priced Equity, SPV) with dynamic term forms
- Raise Style Selection: 3-card selector in Org Setup Wizard Step 3 with skip logic for Dataroom Only mode
- LP Onboarding Settings step: 5 collapsible sections (steps config, doc templates, wire, notifications, compliance)
- Document Template Manager with 13 document types, merge fields, custom upload
- One-time login token system for LP registration gap fix
- Subscribe API auto-heal for NDA/accreditation false rejections

### Fixed
- LP Registration auth gap: one-time token replaces unreliable credentials flow
- Subscribe API: defensive auto-heal checks OnboardingFlow before rejecting
- Dataroom → Invest → LP parameter chain: fund-team validation, multi-fund disambiguation
- Production DB schema sync: 8 missing tables, 36+ missing columns aligned
- signedFileUrl column added to SignatureDocument (was only in metadata JSON)
- GP pending actions: inline resolution with quick-wire-confirm modal
- LP document upload E2E: ProofUploadCard uses presigned URL flow

### Changed
- Org Setup Wizard reduced from 9 to 8 steps (Wire + Compliance consolidated into LP Onboarding)
- ee/features error standardization: 41 responses across 15 files (H-06 third pass, ~333 files total)
- Prisma schema: +11 OrganizationDefaults columns, signedFileUrl/signedFileType/signedAt on SignatureDocument

---

## [0.9.5] - 2026-02-12

**Mobile LP Audit + Paywall Logic + Settings Center** (full day session)

### Added
- Paywall logic: free dataroom vs paid FundRoom with `FundroomActivation` model
- Org Setup Wizard V11: entity type, EIN (masked), business address, company profile, fund economics
- Settings Center: 7 collapsible sections with per-section save, dirty tracking, inheritance tier badges
- DOCS_APPROVED investor stage (7th stage between COMMITTED and FUNDED)
- Pending Actions API + inline action card on GP fund overview
- Mobile LP Onboarding audit: touch targets >= 44px, iOS zoom prevention, camera capture, responsive signature pad

### Fixed
- 3 test assertion fixes (error sanitization alignment + PR #90 pricing tier logic)
- 59 TypeScript errors from PR #90 merge (Prisma client regeneration)
- LinkedIn OAuth conditional rendering (buttons only shown when credentials configured)
- Auth error messages standardized across all login pages

### Changed
- Error response standardization second pass: 175 missed responses across 63 files
- Rollbar test noise fix for code audit marathon merge (65 files)

---

## [0.9.4] - 2026-02-11

**Gap Analysis Sprint + Document Signing Pipeline** (3 sessions)

### Added
- Password Strength Indicator with 5-rule checker
- User Registration API (bcrypt, Zod, rate-limited, audit logged)
- Engagement Scoring System (Hot/Warm/Cool tiers, weighted scoring)
- "I Want to Invest" button with 4-state machine
- GP Approval Gates API (approve, approve-with-changes, request-changes, reject)
- Reports & Analytics page with CSV export
- Manual Investor Entry Wizard (5 steps) + Bulk Import (CSV, up to 500 rows)
- RBAC middleware (`lib/auth/rbac.ts`)
- Express Interest API with rate-limited lead capture
- MarketplaceWaitlist and MarketplaceEvent models
- Org Setup Wizard complete (8 steps, mode selector)
- Dataroom `?ref=` referral tracking (end-to-end)
- Settings Inheritance API + visual UI
- SignatureDocument fund association (`fundId`, `requiredForOnboarding`)
- Auto-advance on signing completion (COMMITTED → DOCS_APPROVED)
- Fund Signature Documents API and GP Fund Documents tab

### Changed
- Platform completion: ~70-75% → ~90-95%

---

## [0.9.3] - 2026-02-10

**Security Hardening + E-Signature Pipeline + Custom Branding**

### Added
- PDF Signature Viewer with 10 field types
- Flatten-signature-onto-PDF pipeline (pdf-lib, Certificate of Completion)
- Sequential Signing Flow (NDA → Sub Ag → LPA → Side Letter priority)
- LP Onboarding auto-save/resume (OnboardingFlow model, 3s debounce)
- LP Onboarding document signing step (Step 6)
- GP Wire Confirmation workflow (atomic Transaction + Investment update)
- Wire Confirmed email (Tier 2, org-branded)
- Multi-tenant email domain system (Resend Domains API)
- Email domain setup wizard (4-step)

### Fixed
- 48 API routes: error leakage fixed (generic 500 responses)
- 165 API routes: `reportError()` added to all catch blocks
- 16 final endpoint sanitization (100% complete)
- requireAdminAccess() role check (was allowing any team member)
- AuditLog cascade → Restrict (protects SEC compliance records)
- authenticateGP() now includes SUPER_ADMIN
- isAdminEmail() replaced with DB-backed isUserAdminAsync()
- Dynamic CORS middleware (replaced broken static CORS)

### Security
- Rate limiting on auth endpoints (10/hr auth, 3/hr password setup)
- HSTS header added (63072000 max-age, includeSubDomains, preload)
- Vercel memory settings removed (deprecated on Active CPU billing)
- Node.js pinned to 22.x (prevents auto-upgrade to 24.x)

---

## [0.9.2] - 2026-02-09

**Domain Architecture + Integration Audit + Fund-Aware LP Onboarding**

### Added
- Domain routing: 4 platform subdomains with host-based middleware
- 20-service integration test (all passing)
- Fund-aware LP onboarding (scoped to specific fund from invite)
- Investor invite system (GP → LP via email)
- Admin password login (NextAuth CredentialsProvider, bcrypt)
- 158-endpoint API smoke tests
- Tranche data persistence (InvestmentTranche + FundClose models)
- Platform-wide API audit (12 endpoints, RBAC standardization)
- LP auth cookie fix (4 endpoints migrated from orphan cookies to getServerSession)

### Fixed
- BFG reference removal (platform is now fully env-driven)
- Vercel production environment: 15+ missing env vars configured
- Google OAuth restored (was missing credentials on Vercel)
- 48 files: error leakage in 500 responses
- Notion proxy + progress-token: authentication added
- Deep code review fixes (input bounds, Prisma schema hardening, org scoping)

### Changed
- Naming migration: BFFund → FundRoom (codebase-wide)
- 6 encryption salts updated for FundRoom branding

---

## [0.9.1] - 2026-02-08

**Foundation + Core MVP**

### Added
- Prisma schema: 117 models, 40 enums, ~4,274 lines
- NextAuth authentication (email/password, Google OAuth, magic links)
- RBAC middleware (OWNER / SUPER_ADMIN / ADMIN / MANAGER / MEMBER)
- Audit logging (39 event types, SHA-256 hash-chained immutable log)
- Settings inheritance (org_defaults → fund_overrides → object_overrides)
- Entity architecture (Individual/LLC/Trust/401k-IRA/Other)
- Bermuda tenant seed (full production-ready: org, team, fund, users)
- GP Setup Flow (signup → verify → org setup wizard → dashboard)
- Dataroom system (CRUD, public viewer, shareable links, analytics)
- FundRoom Sign (native e-signature, HTML5 Canvas, pdf-lib)
- LP Journey (6-step onboarding, dashboard, document vault, wire page)
- Manual Document Upload + GP Confirmation
- GP Management Tools (pipeline, investor profiles, fund wire config)
- Wire Transfer & Proof system
- Email notifications (investor welcome, approved, wire, document review)
- KYC provider system (Persona, Plaid, Parallel Markets, VerifyInvestor)
- Marketplace framework (V2 pipeline, 11-stage deals)
- Monitoring (Rollbar, Tinybird, PostHog, GDPR consent)
- CI/CD (GitHub Actions: test, production, preview, integration)

---

## Version Legend

| Version | Status | Date |
|---------|--------|------|
| 0.9.12 | Current | 2026-02-17 |
| 0.9.7 | Released | 2026-02-14 |
| 0.9.6 | Released | 2026-02-13 |
| 0.9.5 | Released | 2026-02-12 |
| 0.9.4 | Released | 2026-02-11 |
| 0.9.3 | Released | 2026-02-10 |
| 0.9.2 | Released | 2026-02-09 |
| 0.9.1 | Released | 2026-02-08 |
| 1.0.0 | Target | Launch week |
