# FundRoom.ai — Complete Master Plan v13

*Code Name: DarkRoom*

**UPDATED v13 — February 10, 2026**

Includes: Marketplace Framework (V2 Pipeline), Updated Payment Strategy, Manual Wire + Proof Upload MVP, Entity Architecture, GP Approval Gates, Fund Receipt Date Tracking, Manual Investor Entry + Bulk Import, Full Implementation Status Audit, Brand Guidelines v1.1, Vercel Analytics, Production Error Fixes, Security Hardening

---

## Table of Contents

1. Platform Overview & Architecture
2. Payment Strategy (Updated v12)
3. Marketplace Framework (V2 Pipeline Built into V1)
4. Phase 1: Discovery → Signup → Verification
5. Phase 2: Organization Setup Wizard (8-Step Redesigned)
6. Phase 3: GP Dashboard — The Command Center
7. Phase 4: Dataroom Creation & Analytics
8. Phase 5: Fund/Raise Creation Wizard
9. Phase 6: The LP Journey (Complete Investor Experience)
10. Phase 7: GP Manages Investments (Pipeline/CRM)
11. Manual Investor Entry & Bulk Import
12. GP Approval Gates & Profile Review
13. Fund Receipt Date Tracking
14. Investing Entity Architecture
15. Document Management & Upload Flows
16. Notification System
17. Reports & Analytics
18. Settings Center & Audit Log
19. Edge Cases & Special Flows
20. Mobile Experience
21. Data Model (Complete)
22. Canonical Objects & Settings Model (Codebase Contract)
23. Pricing / Paywall Logic
24. Build Roadmap & Priority Phases

---

## 1. Platform Overview & Architecture

FundRoom.ai is a secure, modular fund + investor operations platform for GPs (and startups running raises) that turns messy fundraising, onboarding, document sharing, compliance, and money movement into a simple, guided workflow.

### 1.1 Top Priorities (Non-Negotiable)

- **UX/UI simplicity is #1:** Fewer screens, fewer choices per step, guided wizards, opinionated defaults. Modern fintech, not enterprise software.
- **Affordable + scalable via third-party APIs:** Use best-in-class vendors via clean adapters. E-signature is native via FundRoom Sign.
- **Security + compliance foundations built in:** Encrypt sensitive data, strict access controls, audit logs, compliance-friendly workflows.
- **Marketplace-ready architecture:** V1 builds the schema so V2 Marketplace is a frontend layer, not a ground-up rebuild.

### 1.2 Product Modes

Every fund/raise is created in one of two modes:

- **GP FUND mode:** LPA, commitments, capital calls, distributions, K-1s, waterfall calculations.
- **STARTUP mode:** SAFE/priced rounds, cap table, SPA/IRA, vesting schedules.

Mode determines document templates, dashboards, workflows/wizards, and provider adapters.

### 1.3 Multi-Tenant SaaS Rules

- **Tenant isolation:** Every query/write scoped by org_id (no exceptions).
- **RBAC:** OWNER / GP_ADMIN / GP_VIEWER / LP (plus custom roles).
- **Settings inheritance:** org_defaults → fund_overrides → object_overrides. Resolve at runtime.
- **Security baseline:** AES-256 for stored sensitive data. Audit logs for all meaningful actions.

### 1.4 Tech Stack

- Frontend: Next.js 16 App Router + shadcn/ui + Tailwind CSS
- Backend: Next.js API routes + NextAuth (email/password, Google OAuth)
- Database: Prisma ORM + PostgreSQL (Supabase primary + Replit Postgres backup)
- Storage: S3 + CloudFront (KMS-encrypted, per-org prefixes) + Replit Object Storage
- Email: Resend (transactional + notifications, org-branded)
- E-Signature: FundRoom Sign (native, self-hosted, zero external API cost)
- SaaS Billing: Stripe Billing
- Monitoring: Rollbar (server+client) + Vercel Web Analytics (`@vercel/analytics`) + Vercel Speed Insights (`@vercel/speed-insights`) + Tinybird (server events) + PostHog (client)
- Testing: Jest 30 + React Testing Library (103 test files, 555 tests passing)
- CI/CD: GitHub Actions (test, production, preview, integration workflows)
- Deployment MVP: Vercel. Production: AWS ECS Fargate + ALB + Route 53

---

## 2. Payment Strategy (Updated v12)

### 2.1 Phased Approach

| Phase | Provider | ACH Fee | Monthly | Notes |
|---|---|---|---|---|
| MVP (Launch Week) | Manual Wire + Proof Upload | $0 | $0 | LP sees wire instructions, uploads proof, GP confirms receipt |
| Phase 2 (Month 1-2) | Stripe ACH Direct Debit | 0.8% ($5 cap) | $0 | Financial Connections replaces Plaid Link |
| Phase 3 (Scale 20+ LPs) | Moov | $0.25-0.40 flat | $500 min | Flat fee saves on large transfers |

**Key Decision:** Skip Plaid for money movement. Use Stripe Financial Connections for bank account linking/verification if needed.

### 2.2 MVP Wire Flow (Launch Week)

1. LP reaches Funding step in onboarding wizard
2. LP sees complete wiring instructions (bank name, account #, routing #, SWIFT/BIC, reference/memo format)
3. LP initiates wire from their bank
4. LP uploads proof of wire (screenshot/PDF) to platform
5. GP receives notification: "Wire confirmation uploaded by [LP Name]"
6. GP reviews proof, clicks "Confirm Receipt" with date received, amount, bank reference
7. System updates: LP status → Funded, raise totals updated, LP receives confirmation email
8. All dates tracked separately: initiated_date, proof_uploaded_date, funds_received_date, funds_cleared_date, confirmed_by, confirmed_at

---

## 3. Marketplace Framework (V2 Pipeline Built into V1)

### 3.1 The Vision

FundRoom V2 adds a Funding Marketplace where GPs and startups list their raises for accredited investors to browse and invest. Turns FundRoom from a SaaS tool into a network/platform.

### 3.2 Business Model

| Model | How It Works | Who Chooses This |
|---|---|---|
| Pay to List | GP pays flat monthly fee ($99-499/mo). Keeps 100% of capital. | Established GPs |
| Revenue Share | Free listing. FundRoom takes 1-2% of capital committed via marketplace referrals. | Startups and emerging managers |

### 3.3 V1 Framework Hooks (Build Now)

#### 3.3.1 New Database Tables (Create Empty, Ready for V2)

**MarketplaceListing:** id, org_id, fund_id, raise_id, title, short_description (280 char), long_description, category, key_terms_json, min_investment, target_return_range, listing_status, fee_model, visibility, featured, slug (unique), created_at, updated_at.

**MarketplaceWaitlist:** id, email (unique), name, investor_type, investment_preferences_json, source, created_at.

**MarketplaceEvent:** id, listing_id, event_type, actor_user_id, ip, user_agent, metadata_json, created_at.

#### 3.3.2 Fields Added to Existing Tables

**Organization — add:** public_name, public_description, public_website, public_sector, public_geography, marketplace_fee_model_preference, marketplace_terms_accepted.

**Fund/Raise — add:** marketplace_opt_in, marketplace_status, marketplace_listing_id.

**InvestorProfile — add:** marketplace_account, investment_preferences_json.

**Commitment — add:** referral_source, referral_marketplace_listing_id, marketplace_fee_applicable, marketplace_fee_percent, marketplace_fee_amount, marketplace_fee_status.

**ViewerEvent — add:** source_context (DIRECT|MARKETPLACE|EMBED|API), marketplace_listing_id.

#### 3.3.3 URL Referral Tracking (Build Now)

- Direct share default: `yourorg.fundroom.ai/d/slug?ref=direct`
- GP email invite: `?ref=invite&inv=inviteId`
- Marketplace: `?ref=marketplace&listing=listingId`
- Embed/API: `?ref=embed` or `?ref=api`

Capture ref on ViewerEvent at email gate, persist through session, write to Commitment.referral_source.

---

## 4. Phase 1: Discovery → Signup → Verification

### Screen 1: Homepage (fundroom.ai)

Clean, modern fintech landing page. ONE dominant CTA: "Get Started — Free". Secondary nav link: "Sign In". Below fold: three value prop cards, social proof, "How It Works" (3 steps), pricing info. Marketplace V1: Secondary CTA for investor waitlist.

### Screen 2: Signup Page (/signup)

Centered card, minimal form. Email + Password (strength indicator) or Google/LinkedIn OAuth. No company details here. Password: 8+ chars, one number, one special char with real-time validation.

### Screen 3: Email Verification

"Check your email" with envelope icon, quick-launch buttons, "Resend" link, "Enter code manually" option. On verification → immediately redirected to Organization Setup Wizard.

---

## 5. Phase 2: Organization Setup Wizard (Redesigned)

One continuous flow. GP configures everything, previews, and only pays when they flip the switch.

### Progress Bar

`[1. Company Info] → [2. Branding + Profile] → [3. Raise Style] → [4. Dataroom Setup] → [5. Fund Details] → [6. LP Onboarding] → [7. Integrations] → [8. Preview & Launch]`

Steps 1-4: FREE & ACTIVE. Steps 5-8: FREE TO CONFIGURE, PAY TO ACTIVATE.

Every step has opinionated defaults pre-filled.

### Step 1: Company Information

- Company / Organization Legal Name — required
- Entity Type — dropdown: LLC / Corporation / LP / GP Entity / Trust / Other
- EIN — masked input, encrypted AES-256
- Business Address: Street, City, State, ZIP, Country (default: US)
- Primary Contact: Name (pre-filled), Email (pre-filled), Phone

### Step 2: Branding + Company Profile

- Logo Upload — drag-drop (optional, FundRoom logo fallback)
- Brand Colors — primary color picker + hex input (default: navy #1e293b)
- Custom Domain — yourorg.fundroom.ai default
- Email Sender Identity
- **Company Profile subsection (Marketplace V2):** Short Description (280 char), Sector, Geography, Website URL, Founded Year
- **Advanced (collapsed):** Typography preset, "Powered by FundRoom" note

### Step 3: What Kind of Raise?

- **Card A — "GP / LP Fund":** LPA, commitments, capital calls, distributions, K-1s
- **Card B — "Startup Capital Raise":** SAFE, convertible notes, priced rounds, cap table
- **Card C — "Just a Dataroom for Now":** Skips steps 5-6. Free-tier entry point.

If A or B: Unit/Share Price + Minimum Investment config.

### Step 4: Dataroom Setup (FREE — Goes Live Immediately)

- **Part A — Create & Upload:** Name, drag-drop upload, file list with reorder/rename/delete
- **Part B — Policies:** Require email (ON), Dynamic watermark (ON), Password (OFF), Link expiration 30 days, Downloads (OFF), Printing (OFF), "I Want to Invest" button (ON if fund configured)
- **Part C — Shareable Link:** Auto-generated with ?ref=direct, Copy button, QR code, custom slug
- **Advanced (collapsed):** Domain restrictions, disclaimers, invitation-only mode

### Step 5: Fund / Raise Details (Paywall to Activate)

**GP Fund Mode:** Fund Name, Target Raise + Currency, Min Commitment, Management Fee % (2%), Carry % (20%), Term (10 + 2), Waterfall (European/American), Hurdle Rate % (8%).

**Startup Mode:** Round Name, Target, Min Investment, Instrument (SAFE/Convertible/Priced), SAFE terms or Priced terms, Option Pool % (10%).

**Marketplace section (collapsed, Coming Soon):** Opt-in checkbox.

### Step 6: LP Onboarding Settings

Onboarding steps checklist (all ON): Account Creation, NDA E-Signature, Accredited Self-Ack, Investor Type, Commitment + Doc Signing, Funding Instructions.

**Document Templates:** NDA, Subscription Agreement, LPA/SAFE — FundRoom templates or upload custom. Allow LP external upload (ON). Allow GP upload for LP (ON).

**Wiring Instructions:** Bank Name, Account Name, Account Number, Routing Number, SWIFT/BIC, Special instructions.

**Notifications:** Email LP on step completion (ON), Email GP on new commitment (ON), Email GP on wire upload (ON).

### Step 7: Integrations + Compliance

Active by default: FundRoom Sign, Secure Storage, Audit Logging, Email Notifications, Manual Wire. Optional: KYC/AML, Stripe ACH, QuickBooks, K-1 automation.

### Step 8: Preview & Launch

- **Section A — Setup Summary:** Compact cards with [Edit] links
- **Section B — Preview as Visitor:** Opens full experience with PREVIEW watermark
- **Section C — Launch Controls:** Dataroom: LIVE. Fundroom: Requires subscription to activate.

---

## 6. Phase 3: GP Dashboard — The Command Center

### Layout

Persistent sidebar: Dashboard, Datarooms, Funds, Investors, Documents, Transactions, Reports, Settings, Audit Log, Billing, Help.

Top bar: Breadcrumb, notification bell, user avatar dropdown.

### Empty State

Welcome banner + dataroom link copy + Fundroom activate CTA. Stats row (4 cards): Dataroom Views, Emails Captured, Commitments, Total Funded. Three action cards: Share Dataroom, View Pipeline, Fund Progress.

### Active State

Real-time stats. Raise Progress Bar (Committed lighter, Funded darker). Activity Feed. Upcoming Actions (pending wires, stalled LPs, docs needing confirmation).

---

## 7. Phase 4: Dataroom Creation & Analytics

### Creation Wizard

Step 1: Name & Upload. Step 2: Policies (pre-filled from org defaults). Step 3: Share Link with ?ref=direct.

### Analytics Dashboard

Summary: total views, unique visitors, avg dwell, emails captured, downloads. Visitor table: email, pages viewed, time, engagement score (🔴 Hot 15+ / 🟡 Warm 5-14 / 🔵 Cool 1-4), "Invite to Fund" action. Page-level heatmap bars.

---

## 8. Phase 5: Fund/Raise Creation Wizard

Step 1: Mode Selection (GP Fund or Startup). Step 2: Core Details + mode-specific fields. Step 3: Document Templates. Step 4: Review & Create → Status "Raising".

---

## 9. Phase 6: The LP Journey

### Screen 9: LP Lands on Dataroom (/d/[slug])

Branded document viewer. Email capture gate. PDF viewer with watermark. "I Want to Invest →" button (top-right or floating). "Powered by FundRoom" branding. ViewerEvent tracking.

### "I Want to Invest" Button States

- State 1 — No Fundroom: "Express Interest" (lead capture)
- State 2 — Configured, not paid: "I Want to Invest" → "Opening soon" message
- State 3 — LIVE: Launches LP Onboarding Wizard
- State 4 — Preview mode: PREVIEW watermark, no real data

### LP Onboarding Wizard (6 Steps)

**Step 1: Create Account** — Email (pre-filled), Name, Password, OAuth, verification.

**Step 2: NDA E-Signature** — PDF viewer + FundRoom Sign. Stored as Document type: NDA.

**Step 3: Accredited Investor Self-Ack** — Checkbox with SEC Rule 501 language. Stored on InvestorProfile.

**Step 4: Investor Type (Entity Architecture)** — Five cards: Individual, LLC, Trust, 401k/IRA, Other. Each collects specific fields (see Section 14).

**Step 5: Commitment + Document Signing**
- Part A: Investment Amount with live calculation
- Part B: Auto-filled document review & sign via FundRoom Sign
- Alternative: Upload Externally Signed → Pending GP Confirmation

**Step 6: Funding Instructions**
- Option A: Wire Transfer — complete instructions, [Copy All], upload wire confirmation
- Option B: Pay Later / Contact GP

Submit → "Committed — Pending Funding"

### LP Dashboard

Status tracker, Documents Vault, Transaction History, Notifications, Secure Messaging to GP.

---

## 10. Phase 7: GP Manages Investments (Pipeline/CRM)

### Pipeline Table

Columns: Name/Email, Status (Lead/Onboarding/Committed/Funded/Stalled/Declined), Engagement Score, Commitment Amount, Investor Type, Last Active, Actions.

Tabs: All | Leads | Onboarding | Committed | Funded. Bulk actions.

### Engagement Score

- Page views: 1 point per unique page
- Dwell time: 1 point per 30 seconds
- Return visits: 3 points
- Downloads: 2 points
- 🔴 Hot (15+), 🟡 Warm (5-14), 🔵 Cool (1-4)

### Individual Investor Profile

Tabs: Overview, Documents (confirm/re-upload), Transactions, Communications, Activity Log.

### GP Wire Receipt Confirmation

Enter: amount, date received, bank reference, notes. Checkbox: "I confirm funds received." → LP status → Funded, raise totals updated.

---

## 11. Manual Investor Entry & Bulk Import

### Manual Investor Wizard (5 Steps)

Step 1 — Basic Info: Name, Email, Phone, Lead Source. Email lead matching.
Step 2 — Investor Details: Entity architecture + accreditation recording.
Step 3 — Commitment: Fund, amount, date, special terms, funding status.
Step 4 — Documents: Upload signed docs per type. Auto-confirmed since GP uploading.
Step 5 — Review & Save: Summary + vault access option.

### Bulk Import

Download CSV/Excel template → fill → upload → auto-column mapping → validation → import. Post-import bulk doc upload.

---

## 12. GP Approval Gates & Profile Review

- **Option A — Approve All:** One-click. LP status → Confirmed. LP notified.
- **Option B — Approve with Changes:** GP edits inline. Originals in audit log.
- **Option C — Request Changes:** GP flags fields. LP re-submits. Back to queue.

**Post-Approval Changes:** LP updates → old value active, new value "Pending Review" → GP approves/rejects.

---

## 13. Fund Receipt Date Tracking

| Field | Description |
|---|---|
| initiated_date | When LP initiated payment |
| proof_uploaded_date | When proof uploaded to platform |
| funds_received_date | **THE LEGAL DATE** — when GP confirms funds in account |
| funds_cleared_date | When funds fully cleared |
| confirmed_by | user_id of GP who confirmed |
| confirmed_at | Timestamp of GP confirmation |

All financial reports use funds_received_date as canonical date.

---

## 14. Investing Entity Architecture

The User logs in; the InvestorProfile (entity) holds the investment. Five entity paths:

### Individual
Full legal name, SSN (encrypted), physical address (NO PO Boxes), mailing address, phone.

### LLC
LLC Legal Name, EIN, State/Date of Formation, Tax Classification, address, Authorized Signer, Operating Agreement upload.

### Trust
Trust Legal Name, Type, EIN or grantor SSN, Date Established, State, address, Trustee info, Trust Agreement upload.

### 401k/IRA
Account Type, Account Title (FBO [Name]), Custodian details, Account Holder info, SSN, Custodian co-sign, document uploads.

### Other Entity
Entity Legal Name, Type, EIN, Formation details, Tax Classification, Authorized Signer, Formation Documents upload.

### PO Box Validation
Reject: "PO Box", "P.O.", "PMB", "HC" + numbers, "General Delivery". Physical street required.

### Auto-Fill Mapping
Entity data → Subscription Agreement, LPA, SAFE, SPA: Investor Name, Type, Tax ID, Address, Signer, Amount, Units, Fund Name, GP Entity, dates.

---

## 15. Document Management & Upload Flows

### Document Sources
- Signed in platform (FundRoom Sign)
- Uploaded by LP (externally signed)
- Uploaded by GP (on LP's behalf)
- Generated by system

### GP Upload for LP
Investor profile → Documents → [+ Upload Document]: Type dropdown, drag-drop, Date Signed, Notes, Confirmation checkbox. Appears in LP vault immediately.

### Bulk Document Actions
Generate Missing Document Report. Send Bulk Document Request with direct vault upload links.

---

## 16. Notification System

### Email Notifications (Resend, org-branded)

**To LP:** Verify email, NDA signed, commitment recorded, wire confirmed, new document in vault, capital call notice, distribution notice, action needed.

**To GP:** New email captured, new LP started onboarding, new commitment, wire upload, LP stalled (7-day inactivity).

All emails use org branding. "Powered by FundRoom" in footer (removable $50/mo).

### In-App Notifications
Bell icon with unread count. Click → navigate. "Mark all as read".

---

## 17. Reports & Analytics

- **Raise Summary:** committed vs funded vs target, LP breakdown, timeline, PDF/CSV export
- **Investor Activity:** engagement metrics, conversion funnel, drop-off analysis
- **Financial (GP Fund):** capital call history, distributions, IRR/ROI, TVPI/DPI/RVPI
- **Compliance/Audit:** complete audit trail export, verification records, SEC exam prep

---

## 18. Settings Center & Audit Log

### Settings Center (/gp/admin/settings)
Sections: Company Information, Branding, Raise Configuration, Dataroom Defaults, LP Onboarding Defaults, Integrations, Security, Compliance, Billing. Collapsible cards, per-section Save.

### Audit Log (/gp/admin/audit)
Filterable table: Timestamp, Actor, Action, Object, IP, Details. Export: CSV/JSON/ZIP.

---

## 19. Edge Cases & Special Flows

- **LP leaves, comes back:** Auto-saved. "Welcome back." GP sees "Stalled".
- **LP invests in multiple funds:** Skip Account/NDA/Entity. Go to Commitment.
- **GP manually adds investor:** Full wizard. LP gets vault email.
- **Docs signed outside platform:** LP uploads (Pending GP), GP uploads (auto-confirmed).
- **Fund terms updated mid-raise:** New commitments only. Existing locked.
- **Dataroom without fund:** "Express Interest" lead capture only.
- **Commitment amount changes:** Request → GP approves → new docs → re-sign.
- **GP declines investor:** Reason + notes → LP notified → vault adjusted.

---

## 20. Mobile Experience

**LP Mobile (Critical):** Single column wizard, full-width fields, 44px+ touch targets, full-screen signature pad, swipeable document viewer, pinch-to-zoom.

**GP Mobile (Secondary):** Stacked cards, scrollable tables, key actions available.

---

## 21. Data Model (Complete — Updated v12)

*All tables include org_id. Every mutation writes audit_event. Every webhook is idempotent.*

### Organization (updated v12)
id, name, mode, legal_name, entity_type, ein_encrypted, business_address_json, primary_contact fields, fundroom_status, subscription_id, branding_json, security_policy_json, defaults JSONs. PUBLIC: public_name, public_description, public_website, public_sector, public_geography, public_founded_year. MARKETPLACE: marketplace_fee_model_preference, marketplace_terms_accepted.

### Investor (updated v12)
*(Referred to as "InvestorProfile" in early specs; actual Prisma model is `Investor`.)*
id, org_id, user_id, investor_type, entity_legal_name, ein_encrypted, ssn_encrypted, tax_classification, formation fields, address fields, signer fields, custodian fields (IRA/401k), accreditation fields, approval fields, metadata fields, marketplace fields.

### Document (updated v12)
id, org_id, fund_id, investor_profile_id, type, storage_key, filename, status, upload_source, uploaded_by, confirmation fields, signatures_json.

### Transaction (updated v12)
id, org_id, fund_id, investor_profile_id, commitment_id, type, amount, currency. Dates: initiated_date, proof_uploaded_date, funds_received_date (THE LEGAL DATE), funds_cleared_date. Confirmation fields. Variance fields. Status. Provider fields.

### Investment (updated v12)
*(Referred to as "Commitment" in early specs; actual Prisma model is `Investment`.)*
id, org_id, fund_id, investor_profile_id, amount, units_shares, status, commitment_date, special_terms. Referral fields. Marketplace fee fields.

### Other Tables
Fund, Dataroom, Link *(spec: ShareLink)*, PageView/Reaction *(spec: ViewerEvent)*, MarketplaceListing, User, UserTeam *(spec: Membership)*, AuditLog *(spec: AuditEvent)*, OrganizationIntegrationCredential *(spec: IntegrationCredential)*, Webhook, SignatureDocument, SignatureRecipient, SignatureField, SignatureTemplate, Deal, DealInterest, DealAllocation, Entity, BankLink, CapitalCall, Distribution, Viewer, ViewerGroup.

*Note: Some models from early specs (MarketplaceWaitlist, MarketplaceEvent, ProfileChangeRequest, BulkImportJob, FundroomActivation, FeatureFlag, WebhookEvent) have not been implemented. See `prisma/schema.prisma` (109 models) for the complete current schema.*

---

## 22. Canonical Objects & Settings Model

### Settings & Provisioning
org_defaults → raise/fund overrides → object overrides. No duplicated blobs. Compute at runtime.

Utilities: `resolveOrgDefaults()`, `resolveEffectiveDataroomConfig()`, `promoteDefaultsJob()`.

### Branding Rule
"Powered by FundRoom" default in two locations. Removable: $50/month.

### Referral Tracking
All links default ?ref=direct. Marketplace: ?ref=marketplace&listing=[id]. Captured → persisted → written to Commitment.referral_source.

---

## 23. Pricing / Paywall Logic

| Feature | Free | Paid |
|---|---|---|
| Dataroom (unlimited docs) | ✅ | ✅ |
| Shareable links + analytics | ✅ | ✅ |
| Email capture + lead pipeline | ✅ | ✅ |
| Engagement scoring | ✅ | ✅ |
| "Express Interest" lead capture | ✅ | ✅ |
| Fund/Raise configuration | ✅ (configure) | ✅ (active) |
| "I Want to Invest" live button | ❌ | ✅ |
| LP onboarding wizard | ❌ | ✅ |
| E-signature on investment docs | ❌ | ✅ |
| Commitment tracking | ❌ | ✅ |
| LP secure vaults | ❌ | ✅ |
| Wire confirmation flow | ❌ | ✅ |
| Investor CRM/Pipeline (full) | ❌ | ✅ |
| Custom domain | +$10/mo | +$10/mo |
| Remove FundRoom branding | +$50/mo | +$50/mo |

---

## 24. Build Roadmap & Priority Phases

### Phase 1: Core MVP (Launch Week) — STATUS: COMPLETE (Feb 8, 2026)

All Phase 1 features implemented and functional:

| Feature | Status | Key Files |
|---------|--------|-----------|
| Auth + Signup (email/password, Google OAuth) | **DONE** | `pages/api/auth/[...nextauth].ts` |
| Org Setup Wizard (8 steps) | **DONE** | `app/(saas)/org-setup/page-client.tsx` |
| Dataroom (CRUD, viewer, links, analytics) | **DONE** | `app/datarooms/`, `app/view/` |
| Fund Creation (mode selector, details) | **DONE** | Fund model + creation API |
| LP Onboarding (6 steps) | **DONE** | `app/lp/onboard/page-client.tsx` |
| FundRoom Sign (native e-signature) | **DONE** | `app/sign/`, `components/sign/` |
| Manual Wire + Proof Upload | **DONE** | `lib/wire-transfer/`, email templates |
| Manual Doc Upload + GP Confirmation | **DONE** | Upload modal, review API, email notifications |
| GP Approval Gates | **DONE** | `pages/api/teams/[teamId]/investors/[investorId]/stage.ts` |
| LP Dashboard | **DONE** | `app/lp/dashboard/page-client.tsx` |
| GP Dashboard + Pipeline | **DONE** | `app/admin/`, `components/admin/` |
| Manual Investor Entry | **DONE** | Investor create API + pipeline tab |
| Marketplace Schema (V2 prep) | **DONE** | Full deal pipeline (11 stages), allocations, listings |
| Audit Logging | **DONE** | 39 events, SHA-256 hash-chained, immutable |
| Tracking + Monitoring (18 tools) | **DONE** | Rollbar, Tinybird, PostHog, Vercel Web Analytics, Vercel Speed Insights |
| Email Notifications | **DONE** | 7 email templates via Resend |
| Dual-Database Backup | **DONE** | Supabase + Replit Postgres |
| CI/CD Pipeline | **DONE** | 4 GitHub Actions workflows |
| KYC Provider System | **DONE** | 3 adapter stubs (Parallel Markets, Plaid, VerifyInvestor) |
| Brand Guidelines v1.1 | **DONE** | Logo PNGs across all portals, brand colors, icon assets |
| Error Leakage Security Fix | **PARTIAL** | 11/48 endpoints fixed, 37 remaining |
| Production Error Fixes | **DONE** | Rollbar errors: TypeError, render error, hydration, code cleanup |
| Vercel Deployment Optimization | **DONE** | Node.js pinned 22.x, no deprecated settings, zero actionable warnings |
| Vercel Web Analytics + Speed Insights | **DONE** | Code integrated in both routers; Web Analytics requires manual enable in Vercel Dashboard |
| Login Portal UI Updates | **DONE** | Dynamic titles per domain, center-aligned left sections, new tagline |
| Platform Tagline Update | **DONE** | "Connecting Capital and Opportunity." across all portals and config |

### Phase 2: Capital Flows + Stripe ACH (Weeks 2-4)
Stripe ACH, Financial Connections, Engagement scoring CRM, Capital Call Wizard, Bulk import, Basic reporting, Waterfall Engine, Cap Table v1.

### Phase 3: Marketplace V2 + Advanced (Weeks 4-8)
Marketplace launch, LP accounts, Revenue collection, Persona KYC, Tax/accounting integrations, Moov evaluation.

### Phase 4: Scale + Enterprise (Weeks 8+)
Featured listings, Secondary transfers, SSO, Advanced RBAC, SEC exports, Per-tenant DB, Deal sourcing tools.

---

*— END OF MASTER PLAN v13 —*
