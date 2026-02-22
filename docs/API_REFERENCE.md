# API Reference

FundRoom API route index organized by domain. **Total: ~436 routes** (381 Pages Router + 55 App Router).

All API routes require authentication via `getServerSession()` unless noted otherwise. Team-scoped routes require team membership verified via `withTeamAuth`. Error responses follow the H-06 standard: `{ error: "message" }`.

---

## Table of Contents

- [Authentication](#authentication)
- [LP Onboarding](#lp-onboarding)
- [LP Documents & Signatures](#lp-documents--signatures)
- [LP Wire & Payments](#lp-wire--payments)
- [LP KYC & Timeline](#lp-kyc--timeline)
- [Investor Profile & Approvals](#investor-profile--approvals)
- [Admin: Investor Management](#admin-investor-management)
- [Admin: Document Management](#admin-document-management)
- [Admin: Wire & Transactions](#admin-wire--transactions)
- [Admin: Reports & Analytics](#admin-reports--analytics)
- [Admin: Settings & Configuration](#admin-settings--configuration)
- [Admin: Fund Management](#admin-fund-management)
- [Admin: Tranches & Closes](#admin-tranches--closes)
- [E-Signature](#e-signature)
- [Dataroom](#dataroom)
- [Documents](#documents)
- [Links & Shareable URLs](#links--shareable-urls)
- [Analytics & Tracking](#analytics--tracking)
- [Marketplace](#marketplace)
- [Billing & Subscriptions](#billing--subscriptions)
- [Webhooks](#webhooks)
- [File & Storage](#file--storage)
- [PDF Processing](#pdf-processing)
- [Team Management](#team-management)
- [Org Setup](#org-setup)
- [Health & Config](#health--config)

---

## Authentication

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth/register` | GP user registration (email, password, name) |
| POST | `/api/auth/admin-login` | Admin magic link login |
| POST | `/api/auth/admin-magic-verify` | Verify admin magic link token |
| GET, POST | `/api/auth/check-admin` | Check admin status; magic link setup |
| GET | `/api/auth/check-visitor` | Check visitor (dataroom viewer) status |
| POST | `/api/auth/setup-admin` | Set/change admin password (requires active session) |
| POST | `/api/auth/verify-link` | Verify email magic link token |
| POST | `/api/auth/lp-token-login` | LP one-time login token exchange |
| GET, POST | `/api/auth/[...nextauth]` | NextAuth handler (OAuth, credentials) |
| GET, PATCH | `/api/account` | Get/update user account profile |
| GET, POST, DELETE | `/api/account/passkeys` | Manage WebAuthn passkeys |

**Rate limits**: `authRateLimiter` (10/hr) on login/register, `strictRateLimiter` (3/hr) on setup-admin.

---

## LP Onboarding

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/lp/register` | LP registration (name, email, entity, accreditation) |
| GET | `/api/lp/fund-context` | Get fund details for LP onboarding (Reg D, min investment) |
| POST | `/api/lp/subscribe` | LP commitment subscription to fund |
| GET | `/api/lp/subscription-status` | Get LP subscription status |
| GET | `/api/lp/me` | Get current LP profile |
| GET | `/api/lp/fund-details` | Get detailed fund information |
| GET, PUT, DELETE | `/api/lp/onboarding-flow` | Auto-save/resume wizard progress |
| GET, POST | `/api/lp/staged-commitment` | Get/create staged (tranche-based) commitments |
| GET | `/api/lp/current-tranche` | Get current tranche status |
| POST | `/api/lp/express-interest` | Express interest (lead capture, rate-limited) |
| POST | `/api/lp/accreditation` | Verify accreditation status |
| POST | `/api/lp/sign-nda` | Sign NDA (IP + user-agent audit trail) |
| POST | `/api/lp/investor-details` | Save entity type, tax ID, address |
| POST | `/api/lp/commitment` | Save commitment amount with 8 SEC representations |
| POST | `/api/lp/upload-signed-doc` | Upload externally-signed document |

**Paywall**: Routes returning 402 when `FundroomActivation` not active (bypass via `PAYWALL_BYPASS=true`).

---

## LP Documents & Signatures

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/lp/signing-documents` | List signature documents for LP with progress |
| GET | `/api/lp/pending-signatures` | Get pending signature documents |
| GET | `/api/lp/offering-documents` | Get offering documents (PPM, etc.) |
| GET | `/api/lp/documents` | List LP documents with status |
| POST | `/api/lp/documents/upload` | Upload document (base64) |
| GET | `/api/lp/docs` | Get LP document vault |

---

## LP Wire & Payments

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/lp/wire-instructions` | Get wire instructions for fund |
| POST | `/api/lp/wire-proof` | Upload wire proof (status: PROOF_UPLOADED) |
| GET | `/api/lp/manual-investments` | Get manually-entered investments |
| POST | `/api/lp/subscription/process-payment` | Process payment (Phase 2: ACH/Stripe) |
| GET | `/api/lp/transactions` | Get LP transaction history |

---

## LP KYC & Timeline

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/lp/kyc` | Initiate KYC verification (Persona/Plaid) |
| POST | `/api/lp/bank/link-token` | Get Plaid link token (Phase 2) |
| POST | `/api/lp/bank/connect` | Connect bank account (Phase 2) |
| GET | `/api/lp/bank/status` | Get bank connection status |
| POST | `/api/lp/complete-gate` | Mark onboarding gate complete |
| GET, POST | `/api/lp/notes` | LP notes (investor communications) |
| GET | `/api/lp/timeline` | Get LP activity timeline |
| GET | `/api/lp/statement` | Get LP account statement (Phase 2) |

---

## Investor Profile & Approvals

| Method | Route | Purpose |
|--------|-------|---------|
| GET, PATCH | `/api/investor-profile/{profileId}` | Get/update investor profile |
| GET | `/api/investor-profile/{profileId}/change-requests` | Get profile change requests |
| GET | `/api/approvals/pending` | Get pending investor approvals (GP view) |
| PATCH | `/api/approvals/{approvalId}/approve` | GP approves investor |
| PATCH | `/api/approvals/{approvalId}/approve-with-changes` | GP approves with field edits |
| PATCH | `/api/approvals/{approvalId}/request-changes` | GP requests profile changes |

**Post-approval change detection**: When LP updates fields after approval, `ProfileChangeRequest` records are created instead of applying changes directly.

---

## Admin: Investor Management

| Method | Route | Purpose |
|--------|-------|---------|
| GET, PATCH, DELETE | `/api/admin/investors/{investorId}` | Get/update/delete investor |
| POST | `/api/admin/investors/{investorId}/review` | GP review (approve/reject/request-changes) |
| POST | `/api/admin/investors/{investorId}/upload-document` | GP uploads doc for LP |
| GET | `/api/admin/investors/check-lead` | Check email against dataroom viewers/waitlist |
| POST | `/api/admin/investors/manual-entry` | Create investor via manual entry |
| GET, POST | `/api/admin/investors/bulk-import` | GET: CSV template. POST: import up to 500 rows |
| POST | `/api/admin/bulk-action` | Bulk investor actions (stage changes) |
| GET | `/api/teams/{teamId}/investors` | List investors in pipeline |
| PATCH | `/api/teams/{teamId}/investors/{investorId}/stage` | Update investor stage |
| GET | `/api/teams/{teamId}/investors/pipeline` | Get pipeline counts by stage |
| GET | `/api/admin/engagement` | Get engagement scores (Hot/Warm/Cool) |
| GET, POST, PATCH | `/api/admin/investor-notes` | Investor notes CRUD |
| GET | `/api/admin/dashboard-activity` | Get fund activity feed |
| GET | `/api/admin/fund/{id}/pending-actions` | Get pending action counts |
| GET | `/api/admin/fund/{id}/pending-details` | Get pending action details with inline actions |

---

## Admin: Document Management

| Method | Route | Purpose |
|--------|-------|---------|
| PATCH | `/api/admin/documents/{id}/review` | GP approves/rejects LP document |
| GET | `/api/admin/documents/{id}/download` | Download LP-uploaded document |
| GET | `/api/admin/documents` | List pending LP documents |
| POST | `/api/documents/upload` | Unified LP/GP document upload |
| PATCH | `/api/documents/{docId}/confirm` | GP confirms document |
| PATCH | `/api/documents/{docId}/reject` | GP rejects document |
| PATCH | `/api/documents/{docId}/request-reupload` | GP requests revision |
| GET | `/api/documents/pending-review` | Get documents awaiting GP review |
| GET, POST | `/api/org/{orgId}/document-templates` | List/upload custom doc templates |
| PATCH, DELETE | `/api/org/{orgId}/document-templates/{templateId}` | Update/delete template |
| GET | `/api/org/{orgId}/document-templates/{templateId}/preview` | Get presigned URL for preview |

---

## Admin: Wire & Transactions

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/admin/wire/confirm` | GP confirms wire receipt (atomic: Transaction + Investment + FundAggregate) |
| GET, POST | `/api/teams/{teamId}/wire-transfers` | List/create wire transfers |
| POST | `/api/teams/{teamId}/wire-transfers/bulk` | Bulk wire transfer generation |
| GET, POST, DELETE | `/api/teams/{teamId}/funds/{fundId}/wire-instructions` | Get/set/delete wire instructions |
| GET | `/api/teams/{teamId}/funds/{fundId}/transactions` | List transactions (multi-status filter) |
| GET | `/api/transactions/pending-confirmation` | Get pending wire transactions (GP view) |

---

## Admin: Reports & Analytics

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/admin/reports` | Get fund reports (summary, pipeline, funnel) |
| GET | `/api/admin/reports/export` | Export reports as CSV |
| GET | `/api/admin/reports/aum` | Get assets under management |
| GET | `/api/admin/reports/aum/history` | Get AUM history snapshots |
| GET | `/api/admin/dashboard-stats` | Get dashboard statistics |
| GET | `/api/admin/waterfall` | Get waterfall distribution |
| GET | `/api/admin/capital-tracking` | Get capital calls and distributions |
| GET, POST | `/api/admin/form-d-reminders` | SEC Form D deadline reminders |
| POST | `/api/cron/aum-snapshots` | Cron: capture AUM snapshots |

---

## Admin: Settings & Configuration

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/admin/settings/full` | Get full settings with inheritance tiers |
| GET | `/api/admin/settings/inheritance` | Get settings inheritance map |
| PATCH | `/api/admin/settings/update` | Update settings (7 sections) |
| POST | `/api/admin/activate-fundroom` | Activate FundRoom paywall on team |
| GET | `/api/admin/team-context` | Get team context (mode, funds, org) |
| GET | `/api/admin/db-health` | Check primary + backup DB health |
| POST | `/api/org/{orgId}/setup` | Update org setup wizard progress |

---

## Admin: Fund Management

| Method | Route | Purpose |
|--------|-------|---------|
| GET, PATCH | `/api/admin/fund/{id}` | Get/update fund details |
| GET, POST, PATCH, DELETE | `/api/admin/funds/{fundId}/pricing-tiers` | Manage pricing tiers |
| GET | `/api/funds/{fundId}/aggregates` | Get fund aggregates |
| GET | `/api/funds/{fundId}/settings` | Get fund settings |
| GET | `/api/teams/{teamId}/funds` | List team funds |
| POST | `/api/teams/{teamId}/funds/{fundId}/invite` | Invite investor to fund |
| POST | `/api/funds/create` | Create fund (GP_FUND or STARTUP) |
| POST | `/api/funds/create-startup-raise` | Create startup raise (SAFE/Conv Note/Priced/SPV) |
| GET, PATCH, DELETE | `/api/teams/{teamId}/funds/{fundId}` | Get/update/delete fund |
| GET, POST, PATCH, DELETE | `/api/teams/{teamId}/funds/{fundId}/fees` | Manage fund fees |

---

## Admin: Tranches & Closes

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/teams/{teamId}/funds/{fundId}/tranches` | List/create tranches |
| GET, PATCH | `/api/teams/{teamId}/funds/{fundId}/tranches/{trancheId}` | Get/update tranche status |
| GET, POST | `/api/teams/{teamId}/funds/{fundId}/closes` | List/create fund closes |
| GET, POST | `/api/teams/{teamId}/funds/{fundId}/signature-documents` | List/create fund-linked signature docs |

---

## E-Signature

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/sign/{token}` | Get/submit signature data (rate-limited: GET 30/min, POST 10/min) |
| GET | `/api/sign/status` | Get signature completion status |
| GET | `/api/sign/verify/{token}` | Verify signature token |
| GET | `/api/sign/certificate/{documentId}` | Get certificate of completion |
| GET | `/api/sign/certificate/{documentId}/info` | Get certificate details |
| POST | `/api/sign/certificate/verify` | Verify certificate authenticity |
| GET | `/api/sign/certificate/{documentId}/download` | Download certificate |
| POST | `/api/signatures/capture` | Store base64 signature for reuse |
| POST | `/api/signature/create-document` | Create signature document |
| GET, POST | `/api/signature/documents` | List/create signature documents |
| POST | `/api/signature/custom-template` | Create custom template |
| POST | `/api/signature/void-document` | Void/cancel signature document |
| GET | `/api/documents/{docId}/sign-data` | Get document + fields + auto-fill |
| GET | `/api/documents/{docId}/signed-pdf` | Get signed PDF URL |

**Token-based auth**: `/api/sign/{token}` uses signing tokens instead of session auth for external signers.

**Field types**: SIGNATURE, INITIALS, TEXT, CHECKBOX, DATE_SIGNED, NAME, EMAIL, COMPANY, TITLE, ADDRESS.

---

## Dataroom

### Core CRUD

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/teams/{teamId}/datarooms` | List/create datarooms |
| GET, PUT, PATCH, DELETE | `/api/teams/{teamId}/datarooms/{id}` | Get/update/delete dataroom |
| POST | `/api/teams/{teamId}/datarooms/{id}/duplicate` | Duplicate dataroom |
| GET | `/api/teams/{teamId}/datarooms/{id}/stats` | Get dataroom statistics |

### Documents in Dataroom

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/teams/{teamId}/datarooms/{id}/documents` | List/upload documents |
| GET, PATCH, DELETE | `/api/teams/{teamId}/datarooms/{id}/documents/{docId}` | Get/update/delete |
| POST | `/api/teams/{teamId}/datarooms/{id}/documents/move` | Move documents |
| POST | `/api/teams/{teamId}/datarooms/{id}/download/bulk` | Bulk download as ZIP |

### Folders

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/teams/{teamId}/datarooms/{id}/folders` | List/create folders |
| GET, PUT, DELETE | `/api/teams/{teamId}/datarooms/{id}/folders/{...name}` | Folder hierarchy CRUD |
| POST | `/api/teams/{teamId}/datarooms/{id}/folders/move` | Move folders |
| POST | `/api/teams/{teamId}/datarooms/{id}/reorder` | Reorder documents/folders |

### Groups & Permissions

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/teams/{teamId}/datarooms/{id}/groups` | List/create viewer groups |
| GET, PATCH, DELETE | `/api/teams/{teamId}/datarooms/{id}/groups/{groupId}` | Group CRUD |
| GET, POST | `/api/teams/{teamId}/datarooms/{id}/groups/{groupId}/members` | Manage members |
| PATCH | `/api/teams/{teamId}/datarooms/{id}/groups/{groupId}/permissions` | Update permissions |

### Links & Access

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/teams/{teamId}/datarooms/{id}/links` | List/create public links |
| GET | `/api/teams/{teamId}/datarooms/{id}/viewers` | List viewers |
| GET | `/api/teams/{teamId}/datarooms/{id}/views` | List viewer views |

### Conversations

| Method | Route | Purpose |
|--------|-------|---------|
| PATCH | `/api/teams/{teamId}/datarooms/{id}/conversations/toggle-conversations` | Enable/disable |
| GET, POST | `/api/teams/{teamId}/datarooms/{id}/conversations/{...path}` | Message threads |

---

## Documents

### Core CRUD

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/teams/{teamId}/documents` | List/create documents |
| GET, PUT, PATCH, DELETE | `/api/teams/{teamId}/documents/{id}` | Full CRUD |
| POST | `/api/teams/{teamId}/documents/{id}/duplicate` | Duplicate |
| GET | `/api/teams/{teamId}/documents/{id}/stats` | View statistics |
| GET, POST | `/api/teams/{teamId}/documents/{id}/links` | Share links |
| GET | `/api/teams/{teamId}/documents/search` | Search documents |

### Views & Analytics

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/teams/{teamId}/documents/{id}/views` | List all views |
| GET | `/api/teams/{teamId}/documents/{id}/views/{viewId}/stats` | Single view stats |
| GET | `/api/teams/{teamId}/documents/{id}/views/{viewId}/click-events` | Click analytics |
| POST | `/api/teams/{teamId}/documents/{id}/export-visits` | Export analytics |

### Versions & Annotations

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/teams/{teamId}/documents/{id}/versions` | Version management |
| GET, POST | `/api/teams/{teamId}/documents/{id}/annotations` | Annotation CRUD |
| PATCH, DELETE | `/api/teams/{teamId}/documents/{id}/annotations/{annotId}` | Update/delete |

---

## Links & Shareable URLs

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/links` | List/create share links |
| GET, PUT, PATCH, DELETE | `/api/links/{id}` | Full CRUD |
| GET | `/api/links/{id}/preview` | Get link preview |
| GET | `/api/links/{id}/visits` | Get visit history |
| POST | `/api/links/{id}/duplicate` | Duplicate link |
| PATCH | `/api/links/{id}/archive` | Archive link |
| POST | `/api/links/{id}/request-access` | Viewer requests access |
| POST | `/api/links/{id}/approve-access` | GP approves access |
| GET | `/api/links/download` | Download file via link |

---

## Analytics & Tracking

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/analytics` | Get/record analytics events |
| POST | `/api/record_view` | Record document view (Tinybird) |
| POST | `/api/record_click` | Record click event (Tinybird) |
| POST | `/api/record_video_view` | Record video view (Tinybird) |
| GET, POST | `/api/views` | View tracking with `?ref=` referral |
| GET, POST | `/api/views-dataroom` | Dataroom-specific view tracking |

---

## Marketplace

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/marketplace/browse` | Browse marketplace deals |
| GET, POST | `/api/teams/{teamId}/marketplace/deals` | List/create deals |
| GET, PATCH, DELETE | `/api/teams/{teamId}/marketplace/deals/{dealId}` | Deal CRUD |
| PATCH | `/api/teams/{teamId}/marketplace/deals/{dealId}/stage` | Update deal stage (11 stages) |
| GET, POST | `/api/teams/{teamId}/marketplace/deals/{dealId}/notes` | Deal notes |
| GET, POST | `/api/teams/{teamId}/marketplace/deals/{dealId}/documents` | Deal documents |
| GET, POST | `/api/teams/{teamId}/marketplace/deals/{dealId}/interest` | Deal interest |
| GET, POST | `/api/teams/{teamId}/marketplace/deals/{dealId}/allocations` | Deal allocations |

---

## Billing & Subscriptions

### SaaS Team Billing (existing — `ee/stripe/`)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/subscriptions/create` | Create Stripe subscription |
| GET | `/api/teams/{teamId}/billing` | Get billing info |
| GET | `/api/teams/{teamId}/billing/plan` | Get current plan |
| GET | `/api/teams/{teamId}/billing/invoices` | Get invoices |
| GET, POST | `/api/teams/{teamId}/billing/manage` | Stripe portal redirect |
| POST | `/api/teams/{teamId}/billing/upgrade` | Upgrade plan |
| POST | `/api/teams/{teamId}/billing/downgrade` | Downgrade plan |
| POST | `/api/teams/{teamId}/billing/cancel` | Cancel subscription |

### CRM Billing (new — `app/api/billing/`)

Organization-scoped CRM subscription tiers: FREE ($0), CRM_PRO ($20/mo), FUNDROOM ($79/mo), AI_CRM (+$49/mo add-on).

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| POST | `/api/billing/checkout` | Create Stripe Checkout Session for CRM_PRO or FUNDROOM | Session + ADMIN/OWNER |
| POST | `/api/billing/ai-addon` | Subscribe to or cancel AI CRM add-on (14-day trial) | Session + ADMIN/OWNER |
| POST | `/api/billing/portal` | Create Stripe Billing Portal session | Session + ADMIN/OWNER |

**Config:** `lib/stripe/crm-products.ts` (price IDs from env vars), `lib/billing/crm-billing.ts` (upgrade/downgrade logic)
**Tier resolution:** `lib/tier/crm-tier.ts` (60s cache), `lib/tier/gates.ts` (limit enforcement), `lib/tier/resolver.ts` (unified)
**Setup script:** `npx ts-node scripts/setup-stripe-crm-products.ts [--live]`

---

## Webhooks

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| POST | `/api/webhooks/persona` | Persona KYC results | HMAC-SHA256 |
| POST | `/api/webhooks/plaid` | Plaid bank link (Phase 2) | Token |
| POST | `/api/webhooks/esign` | E-signature events | Token |
| POST | `/api/stripe/webhook` | SaaS billing events | Stripe-Signature |
| POST | `/api/webhooks/stripe-crm` | CRM billing events (checkout, subscription update/delete) | Stripe-Signature (`STRIPE_CRM_WEBHOOK_SECRET`) |

Webhook routes do not use session authentication. They validate via provider-specific signatures.

---

## File & Storage

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/file/upload-config` | Get upload configuration |
| POST | `/api/file/browser-upload` | Browser-side S3 upload |
| POST | `/api/file/image-upload` | Upload image (with resizing) |
| POST | `/api/file/s3/multipart` | S3 multipart upload |
| POST | `/api/file/s3/get-presigned-post-url` | Get presigned POST URL |
| POST | `/api/file/s3/get-presigned-get-url` | Get presigned GET URL |
| POST | `/api/file/notion` | Sync Notion document |
| GET, POST, PATCH, DELETE | `/api/file/tus/{...file}` | TUS resumable upload protocol |

---

## PDF Processing

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/mupdf/get-pages` | Get PDF page count + metadata |
| POST | `/api/mupdf/convert-page` | Convert PDF page to image |
| POST | `/api/mupdf/annotate-document` | Add annotations to PDF (300s timeout) |
| POST | `/api/mupdf/process-pdf-local` | Local PDF processing (300s timeout) |

---

## Team Management

### Members & Invitations

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/teams` | List/create teams |
| GET, PATCH, DELETE | `/api/teams/{teamId}` | Team CRUD |
| POST | `/api/teams/{teamId}/invite` | Invite user to team |
| PATCH | `/api/teams/{teamId}/change-role` | Change member role |
| DELETE | `/api/teams/{teamId}/remove-teammate` | Remove member |

### Domains & Branding

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/teams/{teamId}/domains` | List/add custom domains |
| GET, PATCH, DELETE | `/api/teams/{teamId}/domains/{domain}` | Domain CRUD |
| POST | `/api/teams/{teamId}/domains/{domain}/verify` | Verify domain DNS |
| GET, POST, PATCH, DELETE | `/api/teams/{teamId}/email-domain` | Org email domain config |

### Audit & Security

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/teams/{teamId}/audit/export` | Export audit log with checksums |
| POST | `/api/teams/{teamId}/audit/verify` | Verify audit chain integrity |

### Webhooks & Integrations

| Method | Route | Purpose |
|--------|-------|---------|
| GET, POST | `/api/teams/{teamId}/webhooks` | List/create outgoing webhooks |
| GET, PATCH, DELETE | `/api/teams/{teamId}/webhooks/{id}` | Webhook CRUD |

---

## Org Setup

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/org-setup` | Submit org setup wizard (atomic `$transaction`) |
| POST | `/api/setup` | Save setup wizard progress |
| POST | `/api/setup/complete` | Complete setup (create all records atomically) |
| POST | `/api/setup/upload-logo` | Upload org logo |
| POST | `/api/setup/upload-document` | Upload document during setup |

---

## Health & Config

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/health` | Health check (DB + storage status) |
| GET | `/api/admin/launch-health` | Launch platform health |
| GET | `/api/admin/db-health` | Primary + backup DB health |
| GET | `/api/feature-flags` | Get feature flags per org |
| POST | `/api/cron/domains` | Cron: verify custom domains |
| POST | `/api/cron/audit-retention` | Cron: purge old audit logs |

---

## Common Patterns

### Authentication

All routes (except webhooks and public dataroom views) use:
```typescript
const session = await getServerSession(req, res, authOptions);
if (!session) return res.status(401).json({ error: "Unauthorized" });
```

### Team Scoping

Team-scoped routes verify membership:
```typescript
const { team } = await withTeamAuth(req, res);
// All subsequent queries filter by team.id
```

### Error Responses

| Status | Format | Example |
|--------|--------|---------|
| 400 | `{ error: "Specific validation message" }` | `{ error: "Invalid email format" }` |
| 401 | `{ error: "Unauthorized" }` | Missing/invalid session |
| 402 | `{ error: "Payment required" }` | FundRoom not activated |
| 403 | `{ error: "Forbidden" }` | Insufficient role |
| 404 | `{ error: "Not found" }` | Resource doesn't exist |
| 500 | `{ error: "Internal server error" }` | Always generic (details in Rollbar) |

### Pagination

List endpoints support pagination:
```
?page=1&limit=20
```

Response includes: `{ data: [...], total: number, page: number, limit: number }`
