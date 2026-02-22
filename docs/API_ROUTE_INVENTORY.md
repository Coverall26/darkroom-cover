# FundRoom API Route Inventory

> **Generated:** 2026-02-20 (updated)
> **Total Routes:** 593 (379 Pages Router + 214 App Router)
>
> During the Pages Router to App Router migration (Phase 1 complete Feb 19, 2026),
> many routes exist in BOTH routers. The App Router version is canonical; Pages Router
> versions are kept during the verification phase and will be deleted once confirmed stable.

## Legend

| Marker | Meaning |
|--------|---------|
| `[AUTH: YES]` | Route requires authentication (session, RBAC, API token, or admin check) |
| `[AUTH: EE]` | Auth is handled inside the `ee/` enterprise edition handler (confirmed YES) |
| `[AUTH: CRON]` | Protected by Vercel cron secret or Upstash signature verification |
| `[AUTH: BEARER]` | Uses Bearer token / API key verification (not session-based) |
| `[AUTH: NO]` | No authentication required (public route) |
| `[RATE: YES]` | Explicit per-route rate limiter applied |
| `[RATE: NO]` | No per-route rate limiter (blanket 200 req/min/IP middleware still applies) |
| `[SCOPE: team]` | Team-scoped (requires team membership) |
| `[SCOPE: org]` | Organization-scoped |
| `[SCOPE: user]` | User-scoped (own data only) |
| `[SCOPE: public]` | Public access |
| `[SCOPE: admin]` | Platform admin only |
| `[SCOPE: cron]` | Cron/scheduled job |

**Note on blanket rate limiting:** All `/api/` routes are protected by blanket middleware
rate limiting (200 req/min/IP via `proxy.ts` + Upstash Redis) regardless of per-route limiter.

---

## Table of Contents

1. [Auth Routes](#1-auth-routes)
2. [LP (Investor) Routes](#2-lp-investor-routes)
3. [GP (Admin) Routes](#3-gp-admin-routes)
4. [Fund Routes](#4-fund-routes)
5. [Document & Signature Routes](#5-document--signature-routes)
6. [Billing & Subscription Routes](#6-billing--subscription-routes)
7. [CRM & Contact Routes](#7-crm--contact-routes)
8. [Outreach Routes](#8-outreach-routes)
9. [AI Routes](#9-ai-routes)
10. [Marketplace Routes](#10-marketplace-routes)
11. [Dataroom Routes](#11-dataroom-routes)
12. [Team Management Routes](#12-team-management-routes)
13. [Webhook Routes](#13-webhook-routes)
14. [Cron / Scheduled Job Routes](#14-cron--scheduled-job-routes)
15. [File & Storage Routes](#15-file--storage-routes)
16. [Health & Utility Routes](#16-health--utility-routes)
17. [Tracking & Analytics Routes](#17-tracking--analytics-routes)
18. [Notification Routes](#18-notification-routes)
19. [Viewer & Link Routes](#19-viewer--link-routes)
20. [Setup / Onboarding Routes](#20-setup--onboarding-routes)
21. [Team Documents & Folders](#21-team-documents--folders)
22. [Other Routes](#22-other-routes)

---

## 1. Auth Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| ALL | `pages/api/auth/[...nextauth]` | NO | NO | public | NextAuth handler (login, callback, session, signout) |
| POST | `app/api/auth/admin-login` | YES | YES (auth) | public | Admin portal magic-link or password login |
| GET | `app/api/auth/admin-magic-verify` | NO | YES (auth) | public | Verify admin magic-link token and set session cookie |
| POST | `app/api/auth/check-admin` | YES | YES (auth) | user | Check if current user has admin team role |
| POST | `app/api/auth/check-visitor` | YES | YES (auth) | user | Check if current user has visitor/LP portal access |
| POST | `app/api/auth/lp-token-login` | NO | YES (auth) | public | One-time token exchange for LP session after registration |
| POST,PUT,DELETE | `app/api/auth/mfa-setup` | YES | YES (strict) | user | Enable/disable TOTP MFA for current user |
| GET | `app/api/auth/mfa-status` | YES | YES (api) | user | Check MFA enrollment status |
| POST | `app/api/auth/mfa-verify` | YES | YES (mfa) | user | Verify TOTP code (5 req/15min brute-force protection) |
| POST | `app/api/auth/register` | NO | YES (auth) | public | User registration with password and email verification |
| POST | `app/api/auth/setup-admin` | YES | YES (strict) | user | Set/change admin password (requires active session) |
| POST | `app/api/auth/verify-link` | NO | YES (auth) | public | Verify magic-link email token and create session |
| POST | `pages/api/passkeys/register` | YES | NO | user | Register WebAuthn passkey for current user |

---

## 2. LP (Investor) Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `app/api/lp/accreditation` | YES | YES | user | Get/submit LP accreditation status |
| POST | `app/api/lp/accreditation-audit` | YES | YES | user | Submit accreditation audit trail entry |
| POST | `app/api/lp/bank/connect` | NO | NO | public | Plaid bank connect (returns 503 - Phase 2) |
| POST | `app/api/lp/bank/link-token` | NO | NO | public | Plaid link token (returns 503 - Phase 2) |
| GET | `app/api/lp/bank/status` | NO | NO | public | Plaid bank status (returns 503 - Phase 2) |
| GET | `app/api/lp/capital-calls` | YES | YES | user | List capital calls for authenticated LP |
| POST | `app/api/lp/commitment` | YES | YES | user | Submit investment commitment with SEC representations |
| POST | `app/api/lp/complete-gate` | YES | YES | user | Mark onboarding gate as complete |
| GET | `app/api/lp/current-tranche` | YES | YES | user | Get current active tranche for LP investment |
| GET | `app/api/lp/docs` | YES | YES | user | List LP documents (vault) |
| GET | `app/api/lp/documents` | YES | YES | user | List LP documents (alternate endpoint) |
| POST | `app/api/lp/documents/upload` | YES | YES (upload) | user | Upload LP document (proof, signed doc) |
| POST | `app/api/lp/express-interest` | NO | YES | public | Express interest in fund (lead capture) |
| GET | `app/api/lp/fund-context` | NO | YES | public | Get fund context for LP onboarding (fundId, teamId, mode) |
| GET | `app/api/lp/fund-details` | YES | YES | user | Get detailed fund info for authenticated LP |
| POST | `app/api/lp/investor-details` | YES | YES | user | Submit entity type and tax ID for LP profile |
| GET,POST | `app/api/lp/kyc` | YES | YES | user | Get KYC status / initiate KYC verification |
| GET | `app/api/lp/manual-investments` | YES | YES | user | List manual investments for LP |
| POST | `app/api/lp/manual-investments/[investmentId]/proof` | NO | YES (upload) | public | Upload wire proof for manual investment |
| GET | `app/api/lp/me` | YES | YES | user | Get authenticated LP profile summary |
| POST | `app/api/lp/notes` | YES | YES | user | Create viewer note from LP portal |
| GET | `app/api/lp/offering-documents` | YES | YES | user | List offering documents for LP fund |
| GET,PUT,DELETE | `app/api/lp/onboarding-flow` | YES | YES | user | Get/update/delete LP onboarding auto-save state |
| GET | `app/api/lp/pending-counts` | YES | YES | user | Get pending action counts for LP bottom tab badges |
| GET | `app/api/lp/pending-signatures` | YES | YES | user | List pending signature documents for LP |
| POST | `app/api/lp/register` | NO | YES (registration) | public | LP registration (user + investor profile + one-time token) |
| POST | `app/api/lp/sign-nda` | YES | YES | user | Accept NDA with IP and user-agent audit trail |
| GET | `app/api/lp/signing-documents` | YES | YES | user | List signature documents assigned to LP |
| GET,POST | `app/api/lp/staged-commitment` | YES | YES | user | Get/create staged commitment with tranches |
| GET | `app/api/lp/statement` | YES | YES | user | Get LP investment statement data |
| POST | `app/api/lp/subscribe` | YES | YES (strict) | user | Subscribe to fund (commitment + SEC reps + paywall) |
| GET | `app/api/lp/subscription-status` | YES | YES | user | Get LP subscription/commitment status |
| POST | `app/api/lp/subscription/process-payment` | YES | YES (strict) | user | Process LP payment (wire/staged) |
| GET | `app/api/lp/timeline` | YES | YES | user | Get LP activity timeline |
| GET | `app/api/lp/transactions` | YES | YES | user | List LP transactions |
| POST | `app/api/lp/upload-signed-doc` | YES | YES (upload) | user | Upload externally signed document |
| POST | `app/api/lp/webhooks/investor-updates` | NO | NO | public | Inbound webhook for external investor updates |
| GET | `app/api/lp/wire-instructions` | YES | YES | user | Get wire instructions for LP fund |
| GET | `app/api/lp/wire-instructions/[fundId]` | NO | YES | public | Get wire instructions for specific fund |
| POST | `app/api/lp/wire-proof` | YES | YES (upload) | user | Upload wire proof of payment |
| GET,PUT | `app/api/lp/wizard-progress` | YES | YES | user | Get/update LP onboarding wizard progress |
| ALL | `pages/api/investor-profile/[profileId]` | YES | NO | user | Get/update investor profile (entity, tax, address) |
| ALL | `pages/api/investor-profile/[profileId]/change-requests` | YES | NO | user | List change requests for investor profile |

---

## 3. GP (Admin) Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| POST | `app/api/admin/activate-fundroom` | YES | NO | team | Activate FundRoom for team |
| GET | `app/api/admin/audit/export` | YES | NO | team | Export audit log entries (CSV/JSON) |
| POST | `app/api/admin/bulk-action` | YES | NO | team | Execute bulk actions on investors/documents |
| GET,POST | `app/api/admin/bulk-send` | YES | NO | team | Bulk send emails/notifications |
| GET | `app/api/admin/capital-tracking` | YES | NO | team | Capital tracking with tranche details |
| GET | `app/api/admin/compliance-status` | YES | YES | team | Compliance status dashboard data |
| POST | `app/api/admin/consolidate-teams` | YES | NO | team | Consolidate empty teams for user |
| GET | `app/api/admin/dashboard-activity` | YES | NO | team | Recent dashboard activity feed |
| GET | `app/api/admin/dashboard-stats` | YES | NO | team | Dashboard summary stats (investors, AUM) |
| GET | `app/api/admin/db-health` | YES | NO | admin | Primary/backup database health and latency |
| GET | `app/api/admin/deployment-readiness` | YES | NO | admin | Pre-flight deployment checklist |
| GET | `app/api/admin/documents` | YES | NO | team | List all LP documents for admin review |
| GET | `app/api/admin/documents/[id]/download` | YES | NO | team | Download LP document by ID |
| POST | `app/api/admin/documents/[id]/review` | YES | NO | team | Review LP document (approve/reject/revision) |
| POST | `app/api/admin/documents/upload-for-investor` | YES | NO | team | GP uploads document on behalf of LP |
| GET | `app/api/admin/engagement` | YES | NO | team | Engagement scores (fund or individual) |
| GET,POST | `app/api/admin/entities` | YES | NO | team | List/create legal entities |
| GET,PATCH,DELETE | `app/api/admin/entities/[id]` | YES | NO | team | Get/update/delete legal entity |
| GET,PUT | `app/api/admin/entities/[id]/config` | YES | NO | team | Get/update entity configuration |
| GET,POST | `app/api/admin/export` | YES | NO | team | Export data (investors, transactions) |
| GET,POST | `app/api/admin/export-blobs` | YES | NO | team | Export blob storage data |
| POST | `app/api/admin/fix-email-auth` | YES | NO | admin | Fix email auth records (admin tool) |
| GET,POST | `app/api/admin/form-d-reminders` | YES | NO | team | Get/schedule Form D filing reminders |
| GET | `app/api/admin/fund-dashboard` | YES | NO | team | Fund dashboard overview data |
| GET | `app/api/admin/fund/[id]` | YES | NO | team | Fund detail for admin |
| GET | `app/api/admin/fund/[id]/pending-actions` | YES | NO | team | Pending action counts (wires, docs, reviews) |
| GET | `app/api/admin/fund/[id]/pending-details` | YES | NO | team | Pending action details with inline resolution |
| GET,POST,PATCH,DELETE | `app/api/admin/funds/[fundId]/pricing-tiers` | YES | NO | team | CRUD pricing tiers for fund |
| POST | `app/api/admin/import` | YES | NO | team | Import data (CSV/JSON) |
| GET,POST | `app/api/admin/investor-notes` | YES | NO | team | Get/create investor notes |
| GET | `app/api/admin/investors/[investorId]` | YES | NO | team | Investor detail (profile, investments, docs) |
| POST | `app/api/admin/investors/[investorId]/review` | YES | NO | team | Review investor (4 actions) |
| POST | `app/api/admin/investors/[investorId]/upload-document` | YES | NO | team | Upload document for investor |
| GET,POST | `app/api/admin/investors/bulk-import` | YES | NO | team | CSV template / bulk import investors |
| GET | `app/api/admin/investors/check-lead` | YES | NO | team | Check email for lead matching |
| POST | `app/api/admin/investors/manual-entry` | YES | NO | team | Manual investor entry (5-step persistence) |
| GET | `app/api/admin/launch-health` | YES | NO | admin | Launch readiness health check |
| GET,POST | `app/api/admin/manual-investment` | YES | NO | team | List/create manual investments |
| GET,PUT,DELETE | `app/api/admin/manual-investment/[id]` | YES | NO | team | Get/update/delete manual investment |
| GET,PATCH | `app/api/admin/platform/settings` | YES | NO | admin | Get/update platform-wide settings |
| GET | `app/api/admin/profile-completeness` | YES | YES | team | Marketplace profile completeness score |
| GET | `app/api/admin/reports` | YES | NO | team | Reports summary (pipeline, funnel, metrics) |
| GET | `app/api/admin/reports/aum` | YES | NO | team | AUM report |
| GET,POST | `app/api/admin/reports/aum/history` | YES | NO | team | AUM historical snapshots |
| GET | `app/api/admin/reports/export` | YES | NO | team | Export reports as CSV |
| GET | `app/api/admin/reports/form-d` | YES | NO | team | SEC Form D data export (CSV/JSON) |
| GET | `app/api/admin/reports/operational` | YES | NO | team | Operational reports (wire reconciliation, SLA) |
| POST | `app/api/admin/reprocess-pdfs` | YES | NO | admin | Reprocess PDF documents |
| GET | `app/api/admin/rollbar-errors` | YES | NO | admin | Recent Rollbar error summary |
| GET | `app/api/admin/session-info` | YES | YES | user | Current session info |
| GET | `app/api/admin/settings/full` | YES | NO | team | Full settings hydration (org, team, fund, tiers) |
| PATCH | `app/api/admin/settings/update` | YES | NO | team | Update settings per-section with cascade |
| GET,POST | `app/api/admin/signature-reminders` | YES | NO | team | Get/send signature reminders |
| GET | `app/api/admin/team-context` | YES | NO | team | Team context (teamId, orgId, mode, funds) |
| GET | `app/api/admin/transactions` | YES | NO | team | List all transactions for team |
| GET | `app/api/admin/waterfall` | YES | NO | team | Waterfall distribution calculation |
| POST | `app/api/admin/wire/confirm` | YES | YES (strict) | team | GP confirms wire receipt (atomic) |

**Pages Router only (approvals):**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| ALL | `pages/api/approvals/pending` | YES | NO | team | List pending investor approvals |
| ALL | `pages/api/approvals/[approvalId]/approve` | YES | NO | team | Approve investor profile |
| ALL | `pages/api/approvals/[approvalId]/approve-with-changes` | YES | NO | team | Approve investor with field edits |
| POST | `pages/api/approvals/[approvalId]/request-changes` | YES | NO | team | Request changes on investor profile |

**Pages Router only (document review):**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| ALL | `pages/api/documents/[docId]/confirm` | YES | NO | team | GP confirms/approves LP document |
| ALL | `pages/api/documents/[docId]/reject` | YES | NO | team | GP rejects LP document |
| ALL | `pages/api/documents/[docId]/request-reupload` | YES | NO | team | GP requests document re-upload |
| ALL | `pages/api/documents/pending-review` | YES | NO | team | List documents pending GP review |
| POST | `pages/api/documents/upload` | YES | YES (upload) | team | Unified document upload (LP + GP) |

---

## 4. Fund Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| POST | `app/api/funds/create` | YES | NO | team | Create new fund (GP_FUND mode) |
| POST | `app/api/funds/create-startup-raise` | YES | NO | team | Create startup raise (SAFE/Conv/Priced/SPV) |
| GET | `app/api/funds/[fundId]/aggregates` | YES | YES | team | Fund aggregate data (committed, funded) |
| GET,PATCH | `app/api/funds/[fundId]/settings` | YES | YES | team | Get/update fund-level settings |
| GET | `app/api/fund-settings/[fundId]` | YES | NO | team | Fund settings by fund ID |
| GET | `app/api/fund-settings/funds` | YES | NO | team | List fund settings for all team funds |
| POST | `app/api/fund-settings/update` | YES | NO | team | Update fund settings |
| GET | `app/api/teams/[teamId]/funds` | YES | NO | team | List all funds for team |
| GET,PATCH | `app/api/teams/[teamId]/funds/[fundId]` | YES | NO | team | Get/update fund detail |
| POST | `app/api/teams/[teamId]/funds/[fundId]/invite` | YES | NO | team | Invite investor to specific fund |
| GET,POST | `app/api/teams/[teamId]/funds/[fundId]/capital-calls` | YES | YES | team | List/create capital calls |
| GET,PATCH,DELETE | `app/api/teams/[teamId]/funds/[fundId]/capital-calls/[callId]` | YES | YES | team | Get/update/delete capital call |
| POST | `app/api/teams/[teamId]/funds/[fundId]/capital-calls/[callId]/send` | YES | YES | team | Send capital call to investors |
| GET | `app/api/teams/[teamId]/funds/[fundId]/capital-calls/[callId]/responses` | YES | YES | team | List capital call responses |
| POST | `app/api/teams/[teamId]/funds/[fundId]/capital-calls/[callId]/responses/[responseId]/confirm` | YES | YES | team | Confirm capital call response |
| GET,POST | `app/api/teams/[teamId]/funds/[fundId]/closes` | YES | NO | team | List/create fund closes |
| GET,PATCH | `app/api/teams/[teamId]/funds/[fundId]/fees` | YES | NO | team | Get/update fund fees |
| GET,POST | `app/api/teams/[teamId]/funds/[fundId]/signature-documents` | YES | NO | team | List/create fund signature docs |
| GET,PATCH | `app/api/teams/[teamId]/funds/[fundId]/tranches/[trancheId]` | YES | NO | team | Get/update tranche detail |
| GET | `app/api/teams/[teamId]/funds/[fundId]/tranches` | YES | NO | team | List fund tranches with filters |
| GET | `app/api/teams/[teamId]/funds/[fundId]/transactions` | YES | NO | team | List fund transactions |
| GET,POST,DELETE | `app/api/teams/[teamId]/funds/[fundId]/wire-instructions` | YES | NO | team | CRUD wire instructions for fund |

**Pages Router fund routes (legacy):**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| ALL | `pages/api/teams/[teamId]/funds` | YES | NO | team | List/create funds |
| POST | `pages/api/teams/[teamId]/funds/[fundId]/invite` | YES | NO | team | Invite investor to fund |
| ALL | `pages/api/teams/[teamId]/investors/index` | YES | NO | team | List investors for team |
| ALL | `pages/api/teams/[teamId]/investors/pipeline` | YES | NO | team | Get investor pipeline stages |
| GET,POST | `pages/api/teams/[teamId]/investors/[investorId]/stage` | YES | NO | team | Get/update investor stage |
| ALL | `pages/api/teams/[teamId]/investor-timeline` | YES | NO | team | Investor timeline config |
| ALL | `pages/api/transactions/pending-confirmation` | YES | NO | team | List pending wire confirmations |
| GET,POST | `pages/api/transactions/index` | YES | NO | team | List/create transactions |
| POST | `pages/api/transactions/[id]/process` | YES | NO | team | Process transaction |

---

## 5. Document & Signature Routes

**E-Signature (Pages Router):**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `pages/api/sign/[token]` | NO | YES (signature) | public | Get signing page / submit signatures (token auth) |
| ALL | `pages/api/sign/certificate/[documentId]` | YES | YES | team | Get signature certificate |
| ALL | `pages/api/sign/certificate/[documentId]/info` | YES | YES | team | Get signature certificate info |
| ALL | `pages/api/sign/certificate/verify` | NO | YES | public | Verify signature certificate hash |
| ALL | `pages/api/sign/status` | YES | NO | team | Get signing status for document |
| ALL | `pages/api/sign/verify/[token]` | NO | YES | public | Verify signing token validity |
| ALL | `pages/api/signature/certificate/[documentId]/download` | YES | NO | team | Download signed PDF certificate |
| POST | `pages/api/signature/create-document` | YES | NO | team | Create signature document (API token auth) |
| ALL | `pages/api/signature/custom-template` | YES | NO | team | Manage custom signature templates |
| ALL | `pages/api/signature/documents` | YES | NO | team | List signature documents |
| POST | `pages/api/signature/void-document` | YES | NO | team | Void/cancel signature document |
| ALL | `pages/api/signature/webhook-events` | YES | NO | team | List signature webhook events |
| POST | `pages/api/signatures/capture` | YES | NO | user | Store base64 signature for reuse |
| ALL | `pages/api/documents/[docId]/sign-data` | YES | NO | team | Document + fields + auto-fill for signing |
| ALL | `pages/api/documents/[docId]/signed-pdf` | YES | NO | team | Get signed PDF URL |

**Org Document Templates (App Router):**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `app/api/org/[orgId]/document-templates` | YES | NO | org | List/upload document templates |
| DELETE | `app/api/org/[orgId]/document-templates/[templateId]` | YES | NO | org | Delete document template |
| GET | `app/api/org/[orgId]/document-templates/[templateId]/preview` | YES | NO | org | Preview template (presigned URL) |

**Team Signature Documents (Pages Router):**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `pages/api/teams/[teamId]/signature-documents/index` | YES | NO | team | List/create team signature documents |
| GET,PUT,DELETE | `pages/api/teams/[teamId]/signature-documents/[documentId]/index` | YES | NO | team | Get/update/delete signature document |
| PUT | `pages/api/teams/[teamId]/signature-documents/[documentId]/fields` | YES | NO | team | Update signature field placements |
| POST | `pages/api/teams/[teamId]/signature-documents/[documentId]/send` | YES | NO | team | Send document to recipients |
| POST | `pages/api/teams/[teamId]/signature-documents/[documentId]/remind` | YES | NO | team | Send signing reminder |
| POST | `pages/api/teams/[teamId]/signature-documents/[documentId]/correct` | YES | NO | team | Correct document fields |
| ALL | `pages/api/teams/[teamId]/signature-documents/[documentId]/download` | YES | NO | team | Download signature document |
| ALL | `pages/api/teams/[teamId]/signature-documents/[documentId]/audit-log` | YES | NO | team | Signature document audit log |
| POST | `pages/api/teams/[teamId]/signature-documents/bulk` | YES | NO | team | Bulk create signature documents |
| GET,POST | `pages/api/teams/[teamId]/signature-templates/index` | YES | NO | team | List/create signature templates |
| GET,PUT,PATCH,DELETE | `pages/api/teams/[teamId]/signature-templates/[templateId]/index` | YES | NO | team | CRUD signature template |
| POST | `pages/api/teams/[teamId]/signature-templates/[templateId]/use` | YES | NO | team | Create document from template |
| ALL | `pages/api/teams/[teamId]/signature-audit/export` | YES | NO | team | Export signature audit log |

**Standalone Envelope E-Signature (App Router):**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| POST | `app/api/esign/envelopes` | YES | YES (api) | team | Create standalone envelope with recipients |
| GET | `app/api/esign/envelopes` | YES | YES (api) | team | List envelopes for team |
| GET | `app/api/esign/envelopes/[id]` | YES | YES (api) | team | Get envelope detail with recipients |
| PATCH | `app/api/esign/envelopes/[id]` | YES | YES (api) | team | Update draft envelope |
| POST | `app/api/esign/envelopes/[id]/send` | YES | YES (api) | team | Send envelope to recipients |
| POST | `app/api/esign/envelopes/[id]/remind` | YES | YES (api) | team | Send reminder to pending signers |
| POST | `app/api/esign/envelopes/[id]/decline` | NO | YES (signature) | public | Decline signing (token auth) |
| POST | `app/api/esign/envelopes/[id]/void` | YES | YES (api) | team | Void/cancel envelope |
| GET | `app/api/esign/envelopes/[id]/status` | YES | YES (api) | team | Get signing status and progress |
| GET | `app/api/esign/sign` | NO | YES (signature) | public | Authenticate signer by token |
| POST | `app/api/esign/sign` | NO | YES (signature) | public | Record signer completion |
| GET | `app/api/esign/filings` | YES | YES (api) | team | Get document filing history |

---

## 6. Billing & Subscription Routes

**CRM Billing (App Router):**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| POST | `app/api/billing/checkout` | YES | YES | team | Stripe checkout for CRM tier upgrade |
| POST | `app/api/billing/ai-addon` | YES | YES | team | Subscribe/cancel AI CRM add-on |
| POST | `app/api/billing/portal` | YES | YES | team | Stripe billing portal session |
| GET | `app/api/billing/usage` | YES | NO | team | Billing usage metrics |
| GET | `app/api/tier` | YES | NO | team | Resolved org tier with billing status |

**SaaS Billing (Pages Router, EE-delegated):**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET | `pages/api/teams/[teamId]/billing/index` | YES | NO | team | Get billing status |
| ALL | `pages/api/teams/[teamId]/billing/invoices` | YES | NO | team | List billing invoices |
| POST | `pages/api/teams/[teamId]/billing/manage` | YES | NO | team | Manage billing (portal) |
| GET | `pages/api/teams/[teamId]/billing/plan` | YES | NO | team | Get current billing plan |
| POST | `pages/api/teams/[teamId]/billing/upgrade` | YES | NO | team | Upgrade billing plan |
| ALL | `pages/api/teams/[teamId]/billing/cancel` | EE | NO | team | Cancel subscription (ee/ has auth) |
| ALL | `pages/api/teams/[teamId]/billing/cancellation-feedback` | EE | NO | team | Cancellation feedback (ee/ has auth) |
| ALL | `pages/api/teams/[teamId]/billing/pause` | EE | NO | team | Pause subscription (ee/ has auth) |
| ALL | `pages/api/teams/[teamId]/billing/reactivate` | EE | NO | team | Reactivate subscription (ee/ has auth) |
| ALL | `pages/api/teams/[teamId]/billing/retention-offer` | EE | NO | team | Retention offer (ee/ has auth) |
| ALL | `pages/api/teams/[teamId]/billing/unpause` | EE | NO | team | Unpause subscription (ee/ has auth) |
| POST | `pages/api/subscriptions/create` | YES | NO | team | Create subscription |
| ALL | `pages/api/teams/[teamId]/limits` | EE | NO | team | Team usage limits (ee/ has auth) |
| ALL | `pages/api/teams/[teamId]/tier` | YES | NO | team | Team tier info |
| ALL | `pages/api/teams/[teamId]/esig-usage` | YES | YES | team | E-signature usage stats |
| ALL | `pages/api/internal/billing/automatic-unpause` | NO | NO | cron | Internal auto-unpause |

---

## 7. CRM & Contact Routes

**App Router Contacts:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `app/api/contacts` | YES | YES | team | List/create contacts (CRM role enforced) |
| GET,PATCH,DELETE | `app/api/contacts/[id]` | YES | YES | team | Get/update/delete contact |
| GET,POST | `app/api/contacts/[id]/notes` | YES | YES | team | Get/add contact notes |
| PUT | `app/api/contacts/[id]/status` | YES | YES | team | Update contact status |
| PUT | `app/api/contacts/[id]/follow-up` | YES | YES | team | Set/clear follow-up date |
| GET,POST | `app/api/contacts/[id]/engagement` | YES | YES | team | Engagement breakdown / recalculation |
| POST | `app/api/contacts/import` | YES | YES | team | Import contacts from CSV |
| POST | `app/api/contacts/recalculate-engagement` | YES | YES | team | Bulk recalculate scores (MANAGER role) |

**Pages Router Contacts (team-scoped):**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `pages/api/teams/[teamId]/contacts/index` | YES | YES | team | List/create team contacts |
| ALL | `pages/api/teams/[teamId]/contacts/[contactId]` | YES | YES | team | Get/update/delete team contact |
| ALL | `pages/api/teams/[teamId]/contacts/[contactId]/activities` | YES | YES | team | Contact activities |
| GET,POST | `pages/api/teams/[teamId]/contacts/[contactId]/notes` | YES | YES | team | Contact notes (team-scoped) |

**CRM Role:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| PATCH | `app/api/teams/[teamId]/crm-role` | YES | YES | team | Update member CRM role (OWNER only) |

---

## 8. Outreach Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `app/api/outreach/sequences` | YES | YES | team | List/create email sequences |
| GET,PATCH,DELETE | `app/api/outreach/sequences/[id]` | YES | YES | team | Get/update/delete sequence |
| POST,DELETE | `app/api/outreach/sequences/[id]/enroll` | YES | YES | team | Enroll/unenroll in sequence |
| GET,POST | `app/api/outreach/templates` | YES | YES | team | List/create email templates |
| GET,PATCH,DELETE | `app/api/outreach/templates/[id]` | YES | YES | team | Get/update/delete template |
| POST | `app/api/outreach/send` | YES | YES | team | Send individual email |
| POST | `app/api/outreach/bulk` | YES | YES | team | Bulk send emails |
| GET,POST | `app/api/outreach/follow-ups` | YES | YES | team | List/create follow-up reminders |
| GET | `app/api/outreach/track/open` | NO | NO | public | Email open tracking pixel |
| GET,POST | `app/api/outreach/unsubscribe` | NO | NO | public | Email unsubscribe page/handler |

---

## 9. AI Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| POST | `app/api/ai/draft-email` | YES | YES | team | AI email drafting (GPT-4o-mini) |
| GET | `app/api/ai/insights` | YES | YES | team | AI pipeline/contact insights |
| GET | `app/api/ai/digest` | YES | YES | team | AI daily digest with 7 metrics |

---

## 10. Marketplace Routes

**Public:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET | `app/api/marketplace/browse` | NO | NO | public | Browse marketplace listings |
| GET | `app/api/marketplace/public` | NO | YES | public | Public fund listings (paginated) |
| POST | `app/api/marketplace/waitlist` | NO | YES | public | Marketplace waitlist signup |
| GET,POST | `app/api/marketplace/listings/[listingId]` | NO | NO | public | Get/update marketplace listing |

**Team Deal Pipeline:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `app/api/teams/[teamId]/marketplace/deals` | YES | NO | team | List/create deals |
| GET,PATCH,DELETE | `app/api/teams/[teamId]/marketplace/deals/[dealId]` | YES | NO | team | Get/update/delete deal |
| POST | `app/api/teams/[teamId]/marketplace/deals/[dealId]/stage` | YES | NO | team | Update deal stage |
| GET,POST | `app/api/teams/[teamId]/marketplace/deals/[dealId]/activities` | YES | NO | team | Deal activity log |
| GET,POST,PATCH | `app/api/teams/[teamId]/marketplace/deals/[dealId]/allocations` | YES | NO | team | Deal allocations |
| GET,POST,PATCH,DELETE | `app/api/teams/[teamId]/marketplace/deals/[dealId]/documents` | YES | NO | team | Deal documents |
| GET,POST,PATCH | `app/api/teams/[teamId]/marketplace/deals/[dealId]/interest` | YES | NO | team | Deal interest |
| POST,PATCH | `app/api/teams/[teamId]/marketplace/deals/[dealId]/listing` | YES | NO | team | Create/update deal listing |
| GET,POST,PATCH,DELETE | `app/api/teams/[teamId]/marketplace/deals/[dealId]/notes` | YES | NO | team | Deal notes |
| GET | `app/api/teams/[teamId]/marketplace/pipeline` | YES | NO | team | Deal pipeline summary |

---

## 11. Dataroom Routes

**Dataroom CRUD:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `pages/api/teams/[teamId]/datarooms/index` | YES | NO | team | List/create datarooms |
| GET,PATCH,DELETE | `pages/api/teams/[teamId]/datarooms/[id]/index` | YES | NO | team | Get/update/delete dataroom |
| POST | `pages/api/teams/[teamId]/datarooms/[id]/duplicate` | YES | NO | team | Duplicate dataroom |
| POST | `pages/api/teams/[teamId]/datarooms/create-from-folder` | YES | NO | team | Create from folder |
| POST | `pages/api/teams/[teamId]/datarooms/generate-ai-structure` | YES | NO | team | AI-generate structure |
| POST | `pages/api/teams/[teamId]/datarooms/generate-ai` | YES | NO | team | AI-generate content |
| ALL | `pages/api/teams/[teamId]/datarooms/generate` | EE | NO | team | Generate dataroom (ee/) |
| POST | `pages/api/teams/[teamId]/datarooms/trial` | YES | NO | team | Create trial dataroom |

**Dataroom Documents:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `pages/api/teams/[teamId]/datarooms/[id]/documents/index` | YES | NO | team | List/add documents |
| PATCH,DELETE | `pages/api/teams/[teamId]/datarooms/[id]/documents/[documentId]/index` | YES | NO | team | Update/remove document |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/documents/[documentId]/stats` | YES | NO | team | Document-level stats |
| PATCH | `pages/api/teams/[teamId]/datarooms/[id]/documents/move` | YES | NO | team | Move document |
| POST | `pages/api/teams/[teamId]/datarooms/[id]/download/bulk` | YES | NO | team | Bulk download |
| POST | `pages/api/teams/[teamId]/datarooms/[id]/reorder` | YES | NO | team | Reorder documents |
| POST | `pages/api/teams/[teamId]/datarooms/[id]/generate-index` | YES | NO | team | Generate index |
| POST | `pages/api/teams/[teamId]/datarooms/[id]/calculate-indexes` | YES | NO | team | Calculate indexes |
| ALL | `pages/api/teams/[teamId]/datarooms/[id]/apply-template` | EE | NO | team | Apply template (ee/) |

**Dataroom Folders:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `pages/api/teams/[teamId]/datarooms/[id]/folders/index` | YES | NO | team | List/create folders |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/folders/[...name]` | YES | NO | team | Get folder by path |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/folders/documents/[...name]` | YES | NO | team | Folder documents by path |
| PATCH | `pages/api/teams/[teamId]/datarooms/[id]/folders/move` | YES | NO | team | Move folder |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/folders/parents/[...name]` | YES | NO | team | Parent folders |
| PUT | `pages/api/teams/[teamId]/datarooms/[id]/folders/manage/index` | YES | NO | team | Rename folder |
| DELETE | `pages/api/teams/[teamId]/datarooms/[id]/folders/manage/[folderId]/index` | YES | NO | team | Delete folder |
| POST | `pages/api/teams/[teamId]/datarooms/[id]/folders/manage/[folderId]/dataroom-to-dataroom` | YES | NO | team | Copy folder between datarooms |

**Dataroom Groups & Permissions:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `pages/api/teams/[teamId]/datarooms/[id]/groups/index` | YES | NO | team | List/create viewer groups |
| GET,PATCH,DELETE | `pages/api/teams/[teamId]/datarooms/[id]/groups/[groupId]/index` | YES | NO | team | Get/update/delete group |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/groups/[groupId]/export-visits` | YES | NO | team | Export group visits |
| ALL | `pages/api/teams/[teamId]/datarooms/[id]/groups/[groupId]/invite` | EE | NO | team | Invite to group (ee/) |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/groups/[groupId]/links` | YES | NO | team | List group links |
| POST | `pages/api/teams/[teamId]/datarooms/[id]/groups/[groupId]/members/index` | YES | NO | team | Add member |
| DELETE | `pages/api/teams/[teamId]/datarooms/[id]/groups/[groupId]/members/[memberId]` | YES | NO | team | Remove member |
| POST | `pages/api/teams/[teamId]/datarooms/[id]/groups/[groupId]/permissions` | YES | NO | team | Set permissions |
| ALL | `pages/api/teams/[teamId]/datarooms/[id]/groups/[groupId]/uninvited` | EE | NO | team | Uninvited members (ee/) |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/groups/[groupId]/views/index` | YES | NO | team | List group views |
| GET,POST | `pages/api/teams/[teamId]/datarooms/[id]/permission-groups/index` | YES | NO | team | List/create permission groups |
| GET,PUT,PATCH,DELETE | `pages/api/teams/[teamId]/datarooms/[id]/permission-groups/[permissionGroupId]` | YES | NO | team | CRUD permission group |
| POST | `pages/api/teams/[teamId]/datarooms/[id]/apply-permissions` | YES | NO | team | Apply permissions |

**Dataroom Stats, Views, Branding:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST,PUT,DELETE | `pages/api/teams/[teamId]/datarooms/[id]/branding` | YES | NO | team | CRUD branding |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/stats` | YES | NO | team | Aggregate stats |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/views-count` | YES | NO | team | View count |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/viewers/index` | YES | NO | team | List viewers |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/views/index` | YES | NO | team | List views |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/views/[viewId]/custom-fields` | YES | NO | team | View custom fields |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/views/[viewId]/history` | YES | NO | team | View history |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/views/[viewId]/user-agent` | YES | NO | team | View user-agent |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/export-visits` | YES | NO | team | Export visits |
| GET | `pages/api/teams/[teamId]/datarooms/[id]/links` | YES | NO | team | List dataroom links |

**Dataroom Conversations & FAQs (EE):**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| ALL | `pages/api/conversations/[[...conversations]]` | EE | NO | team | Conversations (ee/) |
| ALL | `pages/api/teams/[teamId]/datarooms/[id]/conversations/[[...conversations]]` | EE | NO | team | Dataroom conversations (ee/) |
| ALL | `pages/api/teams/[teamId]/datarooms/[id]/conversations/toggle-conversations` | EE | NO | team | Toggle conversations (ee/) |
| ALL | `pages/api/teams/[teamId]/datarooms/[id]/faqs/index` | EE | NO | team | FAQs (ee/) |
| ALL | `pages/api/teams/[teamId]/datarooms/[id]/faqs/[faqId]` | EE | NO | team | FAQ detail (ee/) |

**Dataroom Quick Add & Invites:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| POST | `pages/api/teams/[teamId]/datarooms/[id]/quick-add/index` | YES | NO | team | Quick-add document |
| POST | `pages/api/teams/[teamId]/datarooms/[id]/quick-add/invite` | YES | NO | team | Quick invite |
| POST | `pages/api/teams/[teamId]/datarooms/[id]/ensure-quick-add` | YES | NO | team | Ensure quick-add group |
| POST | `pages/api/teams/[teamId]/datarooms/[id]/users/index` | YES | NO | team | Add user |
| ALL | `pages/api/teams/[teamId]/datarooms/[id]/links/[linkId]/invite` | EE | NO | team | Invite via link (ee/) |

---

## 12. Team Management Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `pages/api/teams/index` | YES | NO | user | List/create teams |
| GET,DELETE | `pages/api/teams/[teamId]/index` | YES | NO | team | Get/delete team |
| POST | `pages/api/teams/[teamId]/invite` | YES | NO | team | Invite user to team |
| PUT | `pages/api/teams/[teamId]/change-role` | YES | NO | team | Change member role |
| DELETE | `pages/api/teams/[teamId]/remove-teammate` | YES | NO | team | Remove team member |
| GET,DELETE | `pages/api/teams/[teamId]/invitations/index` | YES | NO | team | List/cancel invitations |
| GET | `pages/api/teams/[teamId]/invitations/accept` | YES | NO | team | Accept invitation |
| PUT | `pages/api/teams/[teamId]/invitations/resend` | YES | NO | team | Resend invitation |
| GET | `pages/api/teams/[teamId]/access-requests` | YES | NO | team | List access requests |
| GET,POST,PATCH,DELETE | `app/api/teams/[teamId]/email-domain` | YES | NO | team | CRUD email domain config |
| POST | `app/api/teams/[teamId]/email-domain/verify` | YES | NO | team | Verify email domain DNS |
| GET,PATCH | `app/api/teams/[teamId]/fundroom-activation` | YES | NO | team | Get/update FundRoom activation |
| PUT | `app/api/teams/[teamId]/toggle-fundroom-access` | YES | NO | team | Toggle FundRoom access |
| GET,POST,PUT,DELETE | `pages/api/teams/[teamId]/branding` | YES | NO | team | CRUD team branding |
| GET | `pages/api/teams/[teamId]/settings` | YES | NO | team | Get team settings |
| PATCH | `pages/api/teams/[teamId]/update-name` | YES | NO | team | Update team name |
| PATCH | `pages/api/teams/[teamId]/update-advanced-mode` | YES | NO | team | Toggle advanced mode |
| ALL | `pages/api/teams/[teamId]/enable-advanced-mode` | YES | NO | team | Enable advanced mode |
| PATCH | `pages/api/teams/[teamId]/update-encryption-settings` | YES | NO | team | Update encryption settings |
| PATCH | `pages/api/teams/[teamId]/update-replicate-folders` | YES | NO | team | Toggle folder replication |
| GET,PUT | `pages/api/teams/[teamId]/global-block-list` | YES | NO | team | Get/update email block list |
| GET,PUT | `pages/api/teams/[teamId]/ignored-domains` | YES | NO | team | Get/update ignored domains |
| GET,POST,DELETE | `pages/api/teams/[teamId]/tokens/index` | YES | NO | team | CRUD API tokens |
| GET,POST,DELETE | `pages/api/teams/[teamId]/incoming-webhooks/index` | YES | NO | team | CRUD incoming webhooks |
| GET,POST | `pages/api/teams/[teamId]/webhooks/index` | YES | NO | team | List/create outgoing webhooks |
| GET,PATCH,DELETE | `pages/api/teams/[teamId]/webhooks/[id]/index` | YES | NO | team | CRUD outgoing webhook |
| GET | `pages/api/teams/[teamId]/webhooks/[id]/events` | YES | NO | team | Webhook delivery events |
| GET,POST | `pages/api/teams/[teamId]/presets/index` | YES | NO | team | List/create link presets |
| GET,PUT,DELETE | `pages/api/teams/[teamId]/presets/[id]` | YES | NO | team | CRUD link preset |
| GET,POST | `pages/api/teams/[teamId]/tags/index` | YES | NO | team | List/create tags |
| PUT,DELETE | `pages/api/teams/[teamId]/tags/[id]/index` | YES | NO | team | Update/delete tag |
| GET,PATCH | `pages/api/teams/[teamId]/ai-settings` | YES | NO | team | AI settings |
| GET | `pages/api/teams/[teamId]/workflow-links` | YES | NO | team | Workflow link config |
| POST | `pages/api/teams/[teamId]/audit/export` | YES | NO | team | Export team audit log |
| ALL | `pages/api/teams/[teamId]/audit/verify` | YES | NO | team | Verify audit chain integrity |
| GET | `pages/api/teams/[teamId]/reports/index` | YES | NO | team | List generated reports |
| POST | `pages/api/teams/[teamId]/reports/generate` | YES | NO | team | Generate report |
| POST,PUT,DELETE | `pages/api/teams/[teamId]/reports/templates` | YES | NO | team | CRUD report templates |
| GET,POST | `pages/api/teams/[teamId]/export-jobs` | YES | NO | team | List/create export jobs |
| GET,PATCH,DELETE | `pages/api/teams/[teamId]/export-jobs/[exportId]` | YES | NO | team | CRUD export job |
| POST | `pages/api/teams/[teamId]/export-jobs/[exportId]/send-email` | YES | NO | team | Email export results |
| POST | `pages/api/teams/[teamId]/manual-investments/[investmentId]/proof` | YES | NO | team | GP upload proof |
| GET,POST,PATCH | `app/api/teams/[teamId]/offering` | YES | NO | team | CRUD offering page config |
| GET | `app/api/teams/[teamId]/wire-transfers` | YES | NO | team | List wire transfers |
| GET,POST | `app/api/teams/[teamId]/wire-transfers/bulk` | YES | NO | team | Bulk wire operations |

**Q&A:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET | `pages/api/teams/[teamId]/qanda/questions/index` | YES | NO | team | List questions |
| POST | `pages/api/teams/[teamId]/qanda/questions/[questionId]/reply` | YES | NO | team | Reply to question |
| PATCH | `pages/api/teams/[teamId]/qanda/questions/[questionId]/status` | YES | NO | team | Update question status |
| GET | `pages/api/teams/[teamId]/qanda/notes` | YES | NO | team | List Q&A notes |

---

## 13. Webhook Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| POST | `pages/api/stripe/webhook` | NO | NO | public | Stripe SaaS webhook (signature verified) |
| POST | `app/api/webhooks/stripe-crm` | NO | NO | public | Stripe CRM webhook (signature verified) |
| POST | `app/api/webhooks/resend` | NO | NO | public | Resend email webhook (Svix signature) |
| POST | `pages/api/webhooks/persona` | NO | NO | public | Persona KYC webhook (HMAC-SHA256) |
| POST | `pages/api/webhooks/plaid` | NO | NO | public | Plaid webhook (Phase 2) |
| POST | `pages/api/webhooks/esign` | NO | NO | public | E-signature event webhook |
| POST | `pages/api/webhooks/signature` | NO | NO | public | Signature completion webhook |
| POST | `pages/api/webhooks/rollbar` | NO | NO | public | Rollbar error webhook |
| ALL | `app/api/webhooks/callback` | NO | NO | public | Generic webhook callback |
| POST | `pages/api/webhooks/services/[...path]/index` | NO | YES | public | Service-specific webhook router |

---

## 14. Cron / Scheduled Job Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `app/api/cron/audit-retention` | CRON | NO | cron | Purge expired audit logs |
| POST | `app/api/cron/aum-snapshots` | CRON | NO | cron | Daily AUM snapshots |
| GET,POST | `app/api/cron/crm-digest` | CRON | NO | cron | CRM daily digests |
| POST | `app/api/cron/domains` | CRON | NO | cron | Verify custom domain DNS |
| GET,POST | `app/api/cron/sequences` | CRON | NO | cron | Process outreach sequences |
| GET,POST | `app/api/cron/signature-reminders` | CRON | NO | cron | Signature reminders |

**Pages Router Jobs:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| ALL | `pages/api/jobs/get-thumbnail` | YES | NO | team | Generate document thumbnail |
| ALL | `pages/api/jobs/progress` | BEARER | NO | team | Job progress polling (token auth) |
| ALL | `pages/api/jobs/send-conversation-new-message-notification` | NO | NO | public | Conversation notification (internal) |
| ALL | `pages/api/jobs/send-conversation-team-member-notification` | EE | NO | team | Team member notification (ee/) |
| POST | `pages/api/jobs/send-dataroom-new-document-notification` | BEARER | NO | team | New doc notification (API key) |
| POST | `pages/api/jobs/send-notification` | BEARER | NO | team | Send notification (API key) |
| ALL | `pages/api/jobs/send-pause-resume-notification` | EE | NO | team | Pause/resume notification (ee/) |

---

## 15. File & Storage Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| ALL | `pages/api/file/browser-upload` | YES | YES (upload) | team | Upload via Vercel Blob |
| ALL | `pages/api/file/image-upload` | YES | NO | team | Upload image file |
| POST | `pages/api/file/notion/index` | YES | NO | team | Proxy Notion page content |
| POST | `pages/api/file/replit-get-proxy` | YES | NO | team | Proxy Replit storage retrieval |
| POST | `pages/api/file/replit-get` | BEARER | NO | team | Get from Replit (Bearer auth) |
| POST | `pages/api/file/replit-upload` | YES | NO | team | Upload to Replit storage |
| POST | `pages/api/file/s3/get-presigned-get-url-proxy` | YES | NO | team | Proxy presigned S3 GET URL |
| POST | `pages/api/file/s3/get-presigned-get-url` | BEARER | NO | team | Presigned S3 GET URL (Bearer) |
| POST | `pages/api/file/s3/get-presigned-post-url` | YES | NO | team | Presigned S3 POST URL |
| POST | `pages/api/file/s3/multipart` | YES | NO | team | S3 multipart upload |
| ALL | `pages/api/file/tus/[[...file]]` | YES | NO | team | TUS resumable upload (auth) |
| POST | `pages/api/file/tus-viewer/[[...file]]` | NO | NO | public | TUS upload (viewer, dataroom session) |
| ALL | `pages/api/file/upload-config` | YES | NO | team | Upload configuration |
| ALL | `pages/api/storage/local` | NO | NO | public | Local storage handler |

---

## 16. Health & Utility Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| ALL | `pages/api/health` | NO | NO | public | Health check (database + storage) |
| GET | `app/api/help` | NO | NO | public | Help/documentation endpoint |
| GET | `app/api/feature-flags` | YES | NO | team | Feature flags for team |
| GET | `app/api/og` | NO | NO | public | Open Graph image generator |
| GET | `app/api/offering/[slug]` | NO | NO | public | Offering page data by slug |
| ALL | `pages/api/revalidate` | NO | NO | public | ISR revalidation |
| ALL | `pages/api/progress-token` | YES | YES | team | Progress tracking token |

---

## 17. Tracking & Analytics Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| ALL | `pages/api/analytics/index` | YES | NO | team | Analytics data (views, engagement) |
| POST | `pages/api/record_click` | NO | YES | public | Record link click |
| POST | `pages/api/record_reaction` | NO | YES | public | Record document reaction |
| POST | `pages/api/record_video_view` | NO | YES | public | Record video view |
| POST | `pages/api/record_view` | NO | YES | public | Record document/page view |
| POST | `app/api/views` | YES | YES | team | Record authenticated view |
| POST | `app/api/views-dataroom` | YES | YES | team | Record authenticated dataroom view |
| GET,POST | `app/api/tracking/consent` | NO | NO | public | GDPR cookie consent |
| POST | `app/api/csp-report` | NO | NO | public | CSP violation report receiver |

---

## 18. Notification Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,PATCH | `pages/api/notifications/index` | YES | NO | user | List/mark-read notifications |
| GET,PUT | `pages/api/notifications/preferences` | YES | NO | user | Get/update notification prefs |
| POST,DELETE | `pages/api/notifications/subscribe` | YES | NO | user | Subscribe/unsubscribe push |
| GET,PATCH | `app/api/user/notification-preferences` | YES | YES | user | Notification preferences (12 toggles) |
| GET | `app/api/sse` | YES | NO | team | Server-Sent Events stream |
| GET | `pages/api/unsubscribe/dataroom/index` | NO | YES | public | Unsubscribe from dataroom notifications |

---

## 19. Viewer & Link Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET | `pages/api/viewer/my-datarooms` | YES | NO | user | Viewer's accessible datarooms |
| POST | `pages/api/viewer/notes` | NO | NO | public | Create viewer note (viewId in body) |
| POST | `pages/api/viewer/questions` | NO | NO | public | Submit viewer question (viewId in body) |
| POST | `pages/api/view/auto-verify-session` | YES | NO | user | Auto-verify viewer session |
| POST | `pages/api/view/verify-magic-link` | NO | YES | public | Verify viewer magic link |
| POST | `pages/api/report` | NO | NO | public | Submit abuse report (Redis dedup) |
| POST | `pages/api/request-invite` | YES | YES | user | Request invitation to resource |
| POST | `pages/api/links/index` | YES | NO | team | Create shareable link |
| GET,PUT,DELETE | `pages/api/links/[id]/index` | YES | NO | team | Get/update/delete link |
| POST | `pages/api/links/[id]/approve-access` | YES | NO | team | Approve access request |
| PUT | `pages/api/links/[id]/archive` | YES | NO | team | Archive/unarchive link |
| POST | `pages/api/links/[id]/duplicate` | YES | NO | team | Duplicate link |
| POST | `pages/api/links/[id]/preview` | YES | NO | team | Generate link preview |
| POST | `pages/api/links/[id]/request-access` | NO | NO | public | Request access to link |
| GET | `pages/api/links/[id]/visits` | YES | NO | team | List link visits |
| ALL | `pages/api/links/[id]/annotations` | NO | NO | public | Get link annotations |
| ALL | `pages/api/links/[id]/documents/[documentId]` | NO | NO | public | Get link document |
| ALL | `pages/api/links/[id]/documents/[documentId]/annotations` | NO | NO | public | Document annotations |
| GET | `pages/api/links/domains/[...domainSlug]` | NO | NO | public | Resolve custom domain link |
| POST | `pages/api/links/download/index` | NO | NO | public | Download linked document |
| POST | `pages/api/links/download/bulk` | NO | NO | public | Bulk download via link |
| POST | `pages/api/links/download/dataroom-document` | NO | NO | public | Download dataroom doc via link |
| POST | `pages/api/links/download/dataroom-folder` | NO | NO | public | Download dataroom folder via link |
| POST | `pages/api/links/generate-index` | NO | NO | public | Generate index for linked dataroom |
| DELETE | `pages/api/teams/[teamId]/links/[id]/index` | YES | NO | team | Delete team link |

---

## 20. Setup / Onboarding Routes

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `app/api/setup` | YES | NO | user | Save GP wizard step progress |
| POST | `app/api/setup/complete` | YES | NO | user | Complete GP setup wizard (atomic) |
| POST | `app/api/setup/upload-logo` | YES | NO | user | Upload org logo during setup |
| POST | `app/api/setup/upload-document` | YES | NO | user | Upload doc template during setup |

---

## 21. Team Documents & Folders

**Documents:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `pages/api/teams/[teamId]/documents/index` | YES | NO | team | List/create documents |
| GET,PUT,PATCH,DELETE | `pages/api/teams/[teamId]/documents/[id]/index` | YES | YES | team | CRUD document |
| POST | `pages/api/teams/[teamId]/documents/[id]/add-to-dataroom` | YES | NO | team | Add to dataroom |
| POST | `pages/api/teams/[teamId]/documents/[id]/advanced-mode` | YES | NO | team | Toggle advanced mode |
| GET,POST | `pages/api/teams/[teamId]/documents/[id]/annotations/index` | YES | NO | team | CRUD annotations |
| GET,PUT,DELETE | `pages/api/teams/[teamId]/documents/[id]/annotations/[annotationId]` | YES | NO | team | CRUD annotation |
| POST | `pages/api/teams/[teamId]/documents/[id]/annotations/[annotationId]/images` | YES | NO | team | Annotation image upload |
| POST | `pages/api/teams/[teamId]/documents/[id]/change-orientation` | YES | NO | team | Change orientation |
| ALL | `pages/api/teams/[teamId]/documents/[id]/check-notion-accessibility` | YES | NO | team | Check Notion accessibility |
| POST | `pages/api/teams/[teamId]/documents/[id]/duplicate` | YES | NO | team | Duplicate document |
| GET | `pages/api/teams/[teamId]/documents/[id]/export-visits` | YES | NO | team | Export visit data |
| GET | `pages/api/teams/[teamId]/documents/[id]/links` | YES | NO | team | List document links |
| ALL | `pages/api/teams/[teamId]/documents/[id]/overview` | YES | NO | team | Document overview |
| ALL | `pages/api/teams/[teamId]/documents/[id]/preview-data` | YES | NO | team | Preview data |
| GET | `pages/api/teams/[teamId]/documents/[id]/stats` | YES | NO | team | Document stats |
| ALL | `pages/api/teams/[teamId]/documents/[id]/toggle-dark-mode` | YES | NO | team | Toggle dark mode |
| ALL | `pages/api/teams/[teamId]/documents/[id]/toggle-download-only` | YES | NO | team | Toggle download-only |
| POST | `pages/api/teams/[teamId]/documents/[id]/update-name` | YES | NO | team | Update name |
| ALL | `pages/api/teams/[teamId]/documents/[id]/update-notion-url` | YES | NO | team | Update Notion URL |
| POST | `pages/api/teams/[teamId]/documents/[id]/versions/index` | YES | NO | team | Create version |
| ALL | `pages/api/teams/[teamId]/documents/[id]/video-analytics` | YES | NO | team | Video analytics |
| GET | `pages/api/teams/[teamId]/documents/[id]/views-count` | YES | NO | team | View count |
| ALL | `pages/api/teams/[teamId]/documents/[id]/views/[viewId]/click-events` | YES | NO | team | View click events |
| GET | `pages/api/teams/[teamId]/documents/[id]/views/[viewId]/custom-fields` | YES | NO | team | View custom fields |
| GET | `pages/api/teams/[teamId]/documents/[id]/views/[viewId]/stats` | YES | NO | team | View stats |
| GET | `pages/api/teams/[teamId]/documents/[id]/views/[viewId]/user-agent` | YES | NO | team | View user-agent |
| ALL | `pages/api/teams/[teamId]/documents/[id]/views/[viewId]/video-stats` | YES | NO | team | Video view stats |
| GET | `pages/api/teams/[teamId]/documents/[id]/views/index` | YES | NO | team | List views |
| POST | `pages/api/teams/[teamId]/documents/agreement` | YES | NO | team | Create agreement |
| ALL | `pages/api/teams/[teamId]/documents/document-processing-status` | NO | NO | public | Processing status |
| PATCH | `pages/api/teams/[teamId]/documents/move` | YES | NO | team | Move document |
| GET | `pages/api/teams/[teamId]/documents/search` | YES | NO | team | Search documents |
| POST | `pages/api/teams/[teamId]/documents/update` | YES | NO | team | Update metadata |

**Folders:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `pages/api/teams/[teamId]/folders/index` | YES | NO | team | List/create folders |
| GET | `pages/api/teams/[teamId]/folders/[...name]` | YES | NO | team | Get folder by path |
| GET | `pages/api/teams/[teamId]/folders/documents/[...name]` | YES | NO | team | Folder documents |
| PATCH | `pages/api/teams/[teamId]/folders/move` | YES | NO | team | Move folder |
| GET | `pages/api/teams/[teamId]/folders/parents/[...name]` | YES | NO | team | Parent folders |
| PUT | `pages/api/teams/[teamId]/folders/manage/index` | YES | NO | team | Rename folder |
| DELETE | `pages/api/teams/[teamId]/folders/manage/[folderId]/index` | YES | NO | team | Delete folder |
| POST | `pages/api/teams/[teamId]/folders/manage/[folderId]/add-to-dataroom` | YES | NO | team | Add folder to dataroom |

**Viewers & Domains:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET | `pages/api/teams/[teamId]/viewers/index` | YES | NO | team | List viewers |
| POST | `pages/api/teams/[teamId]/viewers/check-access` | YES | NO | team | Check viewer access |
| GET,DELETE | `pages/api/teams/[teamId]/viewers/[id]/index` | YES | NO | team | Get/delete viewer |
| PUT | `pages/api/teams/[teamId]/views/[id]/archive` | YES | NO | team | Archive view |
| GET,POST | `pages/api/teams/[teamId]/domains/index` | YES | NO | team | List/create domains |
| PATCH,DELETE | `pages/api/teams/[teamId]/domains/[domain]/index` | YES | NO | team | Update/delete domain |
| GET | `pages/api/teams/[teamId]/domains/[domain]/verify` | YES | NO | team | Verify domain DNS |

**Agreements:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| GET,POST | `pages/api/teams/[teamId]/agreements/index` | YES | NO | team | List/create agreements |
| PUT | `pages/api/teams/[teamId]/agreements/[agreementId]/index` | YES | NO | team | Update agreement |
| POST | `pages/api/teams/[teamId]/agreements/[agreementId]/download` | YES | NO | team | Download agreement |

---

## 22. Other Routes

**Account & User:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| PATCH | `pages/api/account/index` | YES | YES | user | Update account settings |
| GET,DELETE | `pages/api/account/passkeys` | YES | NO | user | List/delete passkeys |
| ALL | `pages/api/user/permissions` | YES | NO | user | Get user permissions |

**Branding (Public):**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| ALL | `pages/api/branding/manifest` | NO | NO | public | PWA manifest (tenant-branded) |
| ALL | `pages/api/branding/tenant` | NO | NO | public | Tenant branding data |

**Feedback:**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| POST | `pages/api/feedback/index` | NO | YES | public | Submit feedback (20/60s rate limit) |

**PDF Processing (internal):**

| Method(s) | Route Path | Auth | Rate | Scope | Description |
|-----------|-----------|------|------|-------|-------------|
| POST | `pages/api/mupdf/annotate-document` | NO | NO | public | Annotate PDF (internal) |
| POST | `pages/api/mupdf/convert-page` | NO | NO | public | Convert PDF page (internal) |
| POST | `pages/api/mupdf/get-pages` | NO | NO | public | Get PDF page count (internal) |
| POST | `pages/api/mupdf/process-pdf-local` | NO | NO | public | Process PDF locally (internal) |

---

## Summary Statistics

| Category | Count |
|----------|-------|
| **Total Routes** | **585** |
| Pages Router | 379 |
| App Router | 206 |
| | |
| **Auth: YES** (session/RBAC) | ~460 |
| **Auth: EE** (enterprise handler) | ~16 |
| **Auth: CRON** (cron secret) | 6 |
| **Auth: BEARER** (API key) | ~5 |
| **Auth: NO** (public) | ~98 |
| | |
| **Rate Limited (per-route)** | ~150 |
| **Not Rate Limited (per-route)** | ~435 |
| **Blanket Rate Limited (middleware)** | ALL /api/ routes (200 req/min/IP) |

### Rate Limiter Tiers

| Tier | Config | Applied To |
|------|--------|-----------|
| Blanket (middleware) | 200 req/min/IP | ALL /api/ routes |
| `authRateLimiter` | 10 req/hr | Auth endpoints |
| `strictRateLimiter` | 3 req/hr | Payment, wire confirm, subscribe |
| `mfaVerifyRateLimiter` | 5 req/15min | MFA verification |
| `signatureRateLimiter` | 5 req/15min | E-signature endpoints |
| `uploadRateLimiter` | 20 req/min | File upload endpoints |
| `apiRateLimiter` | 100 req/min | Standard endpoints |
| `registrationLimiter` | 5 req/min | LP registration |
| `appRouterRateLimit` | 100 req/min | App Router standard |
| `appRouterUploadRateLimit` | 20 req/min | App Router uploads |

### Auth Coverage by Router

| Router | Total | With Auth | Without Auth | Coverage |
|--------|-------|-----------|--------------|----------|
| Pages Router | 379 | ~319 (84%) | ~60 (16%) | Good |
| App Router | 206 | ~185 (90%) | ~21 (10%) | Good |

### Security Notes

1. **EE-delegated routes:** Routes marked `AUTH: EE` delegate to `ee/features/` or `ee/limits/`
   handlers that contain their own `getServerSession()` checks.

2. **Cron routes:** Protected by Vercel `CRON_SECRET` or Upstash QStash signature verification.

3. **Bearer token routes:** File and job endpoints use `Authorization: Bearer <token>` for
   server-to-server communication.

4. **Webhook routes:** Use cryptographic signature verification (HMAC-SHA256, Svix, Stripe).

5. **Public viewer routes:** `viewer/notes` and `viewer/questions` use `viewId` from request
   body as proof of access.

6. **Multi-tenant isolation:** All `teams/[teamId]` routes validate team membership via
   `withTeamAuth`, `enforceRBAC`, or `authenticateGP`.

7. **Dual-router migration:** Phase 1 migrated 99 routes (Feb 19). Both versions coexist.
   See `docs/PAGES_TO_APP_ROUTER_MIGRATION.md`.
