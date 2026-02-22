# FundRoom.ai — Session Summary for Claude
## February 9, 2026 — All Changes in Last 4 Hours

**Session scope:** GitHub sync, documentation refresh, domain architecture restructure, production domain routing go-live.

---

## 1. GitHub Sync & Environment Cleanup

**Synced Replit workspace with GitHub** (commit `91bbb0d6`):
- 10 files downloaded and updated via tarball (direct git commands blocked in Replit)
- 1,842 files already in sync

**Database environment variables standardized:**
- `SUPABASE_DATABASE_URL` → primary database (all reads + writes)
- `REPLIT_DATABASE_URL` → backup database (async replication)
- Updated across: `lib/prisma.ts`, `lib/prisma/backup-client.ts`, `pages/api/admin/db-health.ts`, `docs/DUAL_DATABASE_SPEC.md`

**GitHub API token switch:**
- `FUNDROOM_GITHUB_PAT` → suspended as of Feb 9
- All docs and API calls now use `PAT_GITHUB` (renamed from `GITHUB_PAT` — GitHub blocks env vars starting with `GITHUB_`)

---

## 2. Documentation Refresh

**Next.js version corrected** from 14 → 16 across all docs:
- `CLAUDE.md`, `docs/FundRoom_Claude_Code_Handoff.md`, `docs/FundRoom_Master_Plan_v12.md`
- Actual runtime: Next.js 16.1.6

**Handoff doc bumped to v13.** Master Plan noted as v12 content (filename is still `v11.md`).

**All living doc dates updated to Feb 9:**
- `TRACKING_AND_MONITORING.md`, `BUG_MONITORING_TOOLS_REPORT.md`, `GITHUB_ACTIONS_GUIDE.md`, `CLAUDE.md`

---

## 3. Domain Architecture — 4 Production Domains Go Live

This is the biggest change. The platform now has 4 distinct production entry points with specific routing rules.

### Domain Routing Table

| Domain | Purpose | Root (`/`) Behavior | Auth Behavior |
|--------|---------|---------------------|---------------|
| `fundroom.ai` | Marketing site | External (no middleware) | N/A |
| `app.fundroom.ai` | Main application (org signup/setup) | → `/signup` | If already authenticated → redirect to visitor entrance |
| `app.login.fundroom.ai` | Standard org login | → `/login` | Front-end only access. Even admins only see user-facing side. `/admin/login` redirected to `/login` |
| `app.admin.fundroom.ai` | Admin-only login portal | → `/admin/login` | Must be admin (GP/ADMIN role). LP users blocked with `?error=unauthorized`. Unauthenticated → `/admin/login`. No redirect to user front-end |

### Coming-Soon Pages

- **NOT removed** — still accessible at `/coming-soon/login` and `/coming-soon/signup`
- Coming-soon **redirects removed** — `app.fundroom.ai` and `app.login.fundroom.ai` now serve the live app
- Marketing site buttons will link to `app.login.fundroom.ai/coming-soon/login` until public launch
- Owner will manually switch these links when ready to go public

### Key Files Changed

| File | Changes |
|------|---------|
| `lib/constants/saas-config.ts` | Added `ADMIN_DOMAIN` constant (`app.admin.fundroom.ai`), `ADMIN_URL`, `isAdminPortalDomain()` helper, updated `PLATFORM_DOMAINS` array, `getPlatformContext()` now returns `"admin"` context |
| `lib/middleware/domain.ts` | Full rewrite of platform subdomain routing. Added `getToken()` auth checks. 3 distinct routing blocks for app/login/admin domains |
| `proxy.ts` | Updated comments only — `*.fundroom.ai` catch-all already routes to DomainMiddleware |
| `replit.md` | Updated domain architecture section with all 4 domains and routing rules |
| `CLAUDE.md` | Updated implementation status section — "Coming-Soon" section renamed to "Domain Architecture & Routing" |
| `README.md` | Updated Vercel domains list |
| `docs/FundRoom_Claude_Code_Handoff.md` | Added domain architecture changelog entry + feature row in status table |

### Vercel Domain Status

All domains verified and live on Vercel project `prj_TrkpUM6UHrGWQUY8SPHvASmM8BCA`:
- `fundroom.ai` ✓
- `app.fundroom.ai` ✓
- `app.login.fundroom.ai` ✓
- `app.admin.fundroom.ai` ✓ (newly added)
- `fundroom.bermudafranchisegroup.com` ✓ (legacy Vercel domain — remove from Vercel after confirming `app.fundroom.ai` handles all traffic)

### Security: Admin Domain Protection

The admin domain (`app.admin.fundroom.ai`) has three layers of protection:
1. **Unauthenticated users** — redirected to `/admin/login` with `?next=` param for return path
2. **LP users (non-admin)** — redirected to `/admin/login?error=unauthorized` (no redirect loop — login page always passes through)
3. **Admin users (GP/ADMIN role)** — allowed through to all admin pages

---

## 4. GitHub Commits (Chronological)

| Commit | Description |
|--------|-------------|
| `de739c82` | Feb 9 documentation refresh — version updates, token fix, changelog |
| `41600be3` | Fix Next.js 14 → 16 in Master Plan v12 |
| `89305a8b` | Add app.admin.fundroom.ai domain + remove coming-soon redirects |
| `ec69991a` | Fix redirect loop and enforce auth on admin domain |
| `c7eab55d` | Documentation updates: domain architecture docs + Feb 9 session summary |

---

## 5. Environment & Secrets Status

| Secret | Status |
|--------|--------|
| `PAT_GITHUB` | Active (renamed from `GITHUB_PAT` — GitHub blocks env vars starting with `GITHUB_`) |
| `FUNDROOM_GITHUB_PAT` | Removed (was suspended account) |
| `GITHUB_TOKEN` | Removed (was invalid/bad credentials) |
| `VERCEL_TOKEN` | Active, 24 chars (newly added this session) |
| `SUPABASE_DATABASE_URL` | Active (primary DB) |
| `BACKUP_DB_ENABLED` | Set to `false` (backup writes disabled) |

---

---

## 6. Integration Audit & Secrets Migration (Feb 9, evening session)

Comprehensive audit and migration of all 20 external service integrations. Every service tested and verified.

### Services Migrated to FundRoom Accounts

| Service | What Changed | New Secrets | Notes |
|---------|-------------|-------------|-------|
| **Rollbar** | Migrated to new FundRoom Rollbar account | `ROLLBAR_READ_TOKEN`, `ROLLBAR_SERVER_TOKEN`, `NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN` | All 3 tokens replaced |
| **Tinybird** | Connected to `fundroomia_workspace` (US West 2) | `TINYBIRD_TOKEN` | New empty workspace; datasources auto-created on first event |
| **Google OAuth** | Migrated to FundRoom AI Google Cloud project | `FUNDROOM_GOOGLE_CLIENT_ID`, `FUNDROOM_GOOGLE_CLIENT_SECRET` | BFG credentials kept as fallback |
| **Persona KYC** | Full setup: API + webhook + template | `PERSONA_API_KEY`, `PERSONA_FUNDROOM_KYC_HOOK`, `PERSONA_TEMPLATE_ID` | Template: KYC GovID + Selfie (`itmpl_*`) |
| **Stripe** | Webhook configured (BFG account, temporary) | `STRIPE_BFG_WEBHOOK_SECRET` | 5 events configured; code supports future `STRIPE_WEBHOOK_SECRET` |

### Google OAuth Dual Credential System

| Credential Set | Google Cloud Project | Priority | Env Vars |
|---------------|---------------------|----------|----------|
| **Primary** | FundRoom AI | Used first | `FUNDROOM_GOOGLE_CLIENT_ID`, `FUNDROOM_GOOGLE_CLIENT_SECRET` |
| **Fallback** | Bermuda Franchise Group (BFG) | Used only if primary missing | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

Code: `lib/auth/auth-options.ts` checks `FUNDROOM_GOOGLE_CLIENT_*` first, falls back to `GOOGLE_CLIENT_*`.
Remove BFG credentials once all redirect URIs confirmed on FundRoom project.

### Security Hardening

- CORS wildcard `Access-Control-Allow-Origin: *` removed from all API routes (same-origin only)
- Webhook routes (`/api/webhooks/*`) have no CORS headers (server-to-server)
- `Permissions-Policy` header restricts camera, microphone, geolocation
- Middleware `decodeURIComponent` wrapped in try-catch for malformed URLs

### Permanently Removed Secrets

| Secret | Reason |
|--------|--------|
| `FUNDROOM_GITHUB_PAT` | Account suspended |
| `GITHUB_TOKEN` | Invalid/bad credentials |
| `PERSONA_CLIENT_ID` | Not a valid Persona field |
| `ROLLBAR_WRITE_TOKEN` | Not needed (new account uses read + server + client) |

### GitHub Repository Confirmed

- **Correct repo**: `Darkroom4/darkroom` (NOT `BermudaClub/darkroom`)
- **Token**: `PAT_GITHUB` — full repo access (renamed from `GITHUB_PAT`)
- Local git remote may still point to `BermudaClub/darkroom`; push via GitHub API

---

## 7. Logo & Branding Migration (Feb 9)

All logos replaced from legacy Bermuda Franchise Group (BFG) branding to new FundRoom AI branding.

**New logo files** (all PNG with transparent backgrounds, in `public/_static/`):
| File | Description | Use Case |
|------|-------------|----------|
| `fundroom-logo-white.png` | FundRoom AI icon + white text | Dark backgrounds (coming-soon pages, LP login, dark mode) |
| `fundroom-logo-black.png` | FundRoom AI icon + black text | Light backgrounds (register, sidebar light mode, dataroom) |
| `fundroom-icon.png` | Standalone FundRoom icon only | Favicon, collapsed sidebar, small UI elements |

**Removed old BFG files:**
- `fundroom-icon-white.png`, `fundroom-icon-black.png` (BFG icons)
- `fundroom-logo-white.svg`, `fundroom-logo-black.svg` (BFG SVG logos)

**Files updated (8 total):**
1. `app/coming-soon/login/page.tsx` — Replaced broken external CDN URL with local `fundroom-logo-white.png`
2. `app/coming-soon/signup/page.tsx` — Same fix
3. `components/sidebar/app-sidebar.tsx` — Updated icon + logo references (both light/dark modes)
4. `app/hub/page-client.tsx` — Updated logo references (both light/dark modes)
5. `components/view/dataroom/nav-dataroom.tsx` — Updated default banner image
6. `app/(auth)/lp/login/page-client.tsx` — Updated white logo reference
7. `app/(auth)/register/page-client.tsx` — Updated black logo reference
8. `lib/constants/saas-config.ts` — Updated `PLATFORM_BRANDING` config paths

---

## 9. LP Auth Cookie Fix (Feb 9, late session)

**Critical bug found and fixed:** 4 LP API endpoints were completely broken because they read cookies that were never set anywhere in the codebase.

### The Problem

| Endpoint | Cookie Read | Cookie Set Anywhere? | Result |
|----------|------------|---------------------|--------|
| `pages/api/lp/kyc.ts` | `fundroom-investor-id` | NO | Always 401 |
| `pages/api/lp/bank/status.ts` | `lp-session` | NO | Always 401 |
| `pages/api/lp/bank/link-token.ts` | `lp-session` | NO | Always 401 |
| `pages/api/lp/bank/connect.ts` | `lp-session` | NO | Always 401 |

These cookies were remnants of an earlier auth design that was abandoned. All other 18+ LP endpoints had already been migrated to NextAuth `getServerSession`, but these 4 were missed.

### The Fix

All 4 endpoints now use the standard `getServerSession` pattern:

```typescript
const session = await getServerSession(req, res, authOptions);
if (!session?.user?.email) return res.status(401).json({ message: "Not authenticated" });

const user = await prisma.user.findUnique({
  where: { email: session.user.email },
  include: { investorProfile: { select: { id: true } } },
});
const investorId = user?.investorProfile?.id;
```

### Additional Fixes in kyc.ts

- Fixed 2 `logAuditEvent()` calls that used wrong field names:
  - `action` → `eventType` (correct: `KYC_INITIATED`, `KYC_COMPLETED`)
  - `objectType` → `resourceType` (correct: `"Investor"`)
  - `objectId` → `resourceId`
  - `action` metadata key renamed to `requestAction` to avoid field name conflict

### Impact

- **KYC verification**: Investors can now start and resume Persona KYC flows
- **Bank linking**: Investors can now connect bank accounts via Plaid for ACH payments
- **Auth consistency**: ALL LP endpoints now use the same authentication pattern — no custom cookies

---

## 10. Platform-Wide API Audit (Feb 9, PR #53)

RBAC standardization across 12 admin/fund/team API endpoints. Consistent `withTeamAuth` patterns, TypeScript fixes, and error handling normalization.

---

## 11. Fund-Aware LP Onboarding & Investor Invites (Feb 9, PR #58)

| Change | Details |
|--------|---------|
| Investor Invite System | `app/api/teams/[teamId]/funds/[fundId]/invite.ts` + `components/admin/invite-investors-modal.tsx` — GP invites investors to specific funds |
| Fund-Aware LP Onboarding | LP onboarding now scoped to specific fund from invite link |
| Google OAuth Dual Credentials | `FUNDROOM_GOOGLE_CLIENT_*` primary, `GOOGLE_CLIENT_*` fallback in `lib/auth/auth-options.ts` |
| Enhanced Seed Data | `prisma/seed-bermuda.ts` — password support, admin membership |
| .env.example | Full documentation of all environment variables |

---

## 12. API Smoke Tests (Feb 9, PR #57)

158 comprehensive endpoint smoke tests added in `__tests__/api/`.

---

## 13. Deep Security Audit & Hardening (Feb 9, Replit Agent session)

Systematic review of entire codebase by Replit Agent. Found and fixed 5 issues:

### TypeScript Fixes (2)
| File | Issue | Fix |
|------|-------|-----|
| `lib/email/domain-service.ts` | `region` parameter typed as `string` but Resend expects specific union | Added `DomainRegion` type alias matching Resend's union type |
| `package.json` | `@octokit/rest` imported in `lib/integrations/github.ts` but not installed | Installed as dependency |

### Security Fixes (3)
| File | Issue | Fix |
|------|-------|-----|
| `pages/api/teams/[teamId]/documents/[id]/video-analytics.ts` | 500 responses returned `error.message` and `error.stack` to clients | Removed error details from response body; kept server-side logging |
| `pages/api/file/notion/index.ts` | Completely unauthenticated — anyone could fetch Notion pages | Added `getServerSession` check |
| `pages/api/progress-token.ts` | Completely unauthenticated — anyone could generate processing tokens | Added `getServerSession` check |

**Commits:** `09a31b5` (TypeScript + security fixes)

**Observations for future work:**
- ~188 `console.log` statements in API routes (cleanup opportunity)
- Some endpoints still return `error.message` in 500s (lower risk)
- `progress-token` and Notion proxy check session but not resource-level ownership

---

## 14. Admin Password Login (Feb 9, PR #59 + security fix)

Claude added email/password login for admin users. Replit Agent reviewed PR #59 after merge and found a critical security vulnerability.

### What Claude Built (PR #59)
| Change | Files |
|--------|-------|
| CredentialsProvider | `lib/auth/auth-options.ts` — bcrypt password validation, 12 salt rounds |
| Admin Login Page | `app/admin/login/page-client.tsx` — toggle between password and magic-link modes |
| Setup Admin Endpoint | `pages/api/auth/setup-admin.ts` — POST to set/change admin password |
| User.password Field | `prisma/schema.prisma` — `password String?` on User model |
| Platform Admin Seed | `prisma/seed-platform-admin.ts` — bootstrap admin with optional `--set-password` |
| Default Admin Email | `lib/constants/admins.ts` — changed to `rciesco@fundroom.ai` |

### Critical Security Fix (Replit Agent)

**Vulnerability:** The `/api/auth/setup-admin` endpoint was **unauthenticated**. Anyone who knew an admin email address could set their password before the admin did — a privilege escalation path.

**Fix (commit `3ed128ba`):**
- Added `getServerSession` check — must be logged in
- Endpoint now uses session email only (ignores email in request body)
- Users can only set their own password
- Still requires admin team membership (OWNER/ADMIN/SUPER_ADMIN)

**Admin portal protection is now 3 layers:**
1. `requireAdminPortalAccess()` checks admin team membership
2. JWT `loginPortal` claim must be `"ADMIN"` (not `"VISITOR"`)
3. Non-admin users redirected to `/viewer-portal`

---

## 15. GitHub Commits (Late Session, Chronological)

| Commit | PR | Description |
|--------|----|-------------|
| `aff2e33` | #53 | Platform-wide API audit — type errors, RBAC consistency |
| `9b194db` | #57 | 158-endpoint API smoke tests |
| `90ccc84` | #56 | Email migration merge |
| `764b5dd` | #55 | Multi-tenant email domain system |
| `7e92af9` | #54 | Tranche data persistence — InvestmentTranche + FundClose models |
| `08ae50f` | #58 | Fund-aware LP onboarding, investor invite system, OAuth + seed |
| `09a31b5` | — | Deep security audit — TS errors, auth hardening (Replit Agent) |
| `a4c8a74` | #59 | Admin password login (Claude) |
| `3ed128b` | — | Security fix: require authentication for setup-admin (Replit Agent) |

---

## 16. BFG Reference Removal (Feb 9, late session — commit `bcea74f3`)

Removed all 15 hardcoded `bermudafranchisegroup.com` and `bffund.com` references from the platform framework. Replaced with env-driven, generic alternatives.

### Changes Made (14 files across middleware, API routes, UI, config)

| Area | What Changed | New Approach |
|------|-------------|--------------|
| **Platform URL validation** | `agreements/download.ts` — removed `bffund.com/view/` hardcoded check | Host-aware validation using `NEXT_PUBLIC_APP_BASE_HOST` + `NEXTAUTH_URL` |
| **Links API** | `pages/api/links/index.ts`, `pages/api/links/[id]/index.ts` — removed hardcoded domain stripping | Env-driven `NEXT_PUBLIC_PLATFORM_DOMAIN` with `fundroom.ai` fallback |
| **CSP** | `lib/middleware/csp.ts` — removed `*.bermudafranchisegroup.com` from all 4 sections | Only `*.fundroom.ai` remains |
| **Domain routing** | `lib/middleware/domain.ts` — removed BFG-specific tenant redirect block | Generic redirect for all custom domains |
| **Image config** | `next.config.mjs` — removed 3 BFG image domain patterns | Removed entirely |
| **Domain cron** | `app/api/cron/domains/route.ts` — removed `bffund.com` from exclusion list | Only `fundroom.ai` excluded |
| **Domain validation** | `add-domain-modal.tsx`, `domains/index.ts` — removed `bffund`/`bermudafranchise` checks | Only reserve `"fundroom"` |
| **UI placeholders** | 4 component files — "Bermuda" → "Acme Capital Group" | Generic example company |
| **Schema comments** | `prisma/schema.prisma` — updated examples | Generic `acmecapital.com` |
| **Production env** | `.replit` env vars | Updated to `app.fundroom.ai` |

### Remaining Bermuda References (Correct)
- `prisma/seed-bermuda.ts` — first tenant seed data
- `lib/constants.ts` — Bermuda ISO country code (BM)
- `__tests__/*` — test fixtures

### Branch Cleanup
- Deleted branch `claude/setup-admin-account-gKh7s` (merged into main)

### Commits
| Commit | Description |
|--------|-------------|
| `bcea74f3` | Remove hardcoded BFG references, env-driven platform URL validation |
| `7f3c339a` | Documentation: add BFG removal to CLAUDE.md implementation status |

---

## 17. Vercel Production Environment Configuration (Feb 9, late session)

Critical production environment fix: 15+ environment variables were missing or misconfigured on Vercel, causing the health endpoint to report "degraded" and Google OAuth to be unavailable.

### Issues Found

| Issue | Root Cause | Impact |
|-------|-----------|--------|
| Health reporting "degraded" | `STORAGE_PROVIDER` not set on Vercel | Health endpoint returned degraded status, storage check failed |
| Google OAuth missing | `FUNDROOM_GOOGLE_CLIENT_ID` and `FUNDROOM_GOOGLE_CLIENT_SECRET` not set on Vercel | Google login button not visible in auth providers |
| Auth URL misconfigured | `NEXTAUTH_URL` and `NEXT_PUBLIC_BASE_URL` set to empty strings on Vercel | Auth callbacks and URL resolution could fail silently |
| Rollbar tokens wrong names | Vercel had `ROLLBAR_DARKROOM_SERVER_TOKEN_1770381976` instead of `ROLLBAR_SERVER_TOKEN` | Error monitoring silently disabled |
| Database URL missing | `SUPABASE_DATABASE_URL` not set (code prefers it over `DATABASE_URL`) | Prisma may have fallen back to wrong connection string |

### Environment Variables Fixed on Vercel

| Variable | Action | Value Set |
|----------|--------|-----------|
| `NEXTAUTH_URL` | Recreated (was empty string) | `https://app.fundroom.ai` |
| `NEXT_PUBLIC_BASE_URL` | Recreated (was empty string) | `https://app.fundroom.ai` |
| `NEXT_PUBLIC_APP_BASE_HOST` | Added (missing) | `app.fundroom.ai` |
| `NEXT_PUBLIC_PLATFORM_DOMAIN` | Added (missing) | `fundroom.ai` |
| `BACKUP_DB_ENABLED` | Added (missing) | `false` |
| `RESEND_FROM_EMAIL` | Added (missing) | `noreply@fundroom.ai` |
| `STORAGE_PROVIDER` | Added (missing) | `vercel` |
| `SUPABASE_DATABASE_URL` | Added (missing) | Supabase connection string (secret) |
| `FUNDROOM_GOOGLE_CLIENT_ID` | Added (missing) | FundRoom Google Cloud client ID (secret) |
| `FUNDROOM_GOOGLE_CLIENT_SECRET` | Added (missing) | FundRoom Google Cloud client secret (secret) |
| `NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY` | Added (missing) | Document encryption key (secret) |
| `NEXT_PRIVATE_VERIFICATION_SECRET` | Added (missing) | Verification secret (secret) |
| `STORAGE_ENCRYPTION_KEY` | Added (missing) | AES-256 encryption key (secret) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Added (missing) | Stripe publishable key (secret) |
| `STRIPE_BFG_WEBHOOK_SECRET` | Added (missing) | Stripe webhook secret (secret) |
| `PERSONA_TEMPLATE_ID` | Added (missing) | Persona KYC template ID (secret) |
| `PERSONA_WEBHOOK_SECRET` | Added (missing) | Persona webhook secret (secret) — Replit secret name is `PERSONA_FUNDROOM_KYC_HOOK` |
| `TINYBIRD_TOKEN` | Added (missing) | Tinybird analytics token (secret) |
| `ROLLBAR_SERVER_TOKEN` | Recreated (wrong name) | Rollbar server token (secret) |
| `NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN` | Recreated (wrong name) | Rollbar client token (secret) |
| `ROLLBAR_READ_TOKEN` | Recreated (wrong name) | Rollbar read token (secret) |

### Rollbar Token Name Correction

Old (incorrect) names deleted from Vercel:
- `ROLLBAR_DARKROOM_SERVER_TOKEN_1770381976`
- `ROLLBAR_DARKROOM_CLIENT_TOKEN_1770381976`
- `ROLLBAR_DARKROOM_READ_TOKEN_1770381976`

Replaced with correct names matching code expectations:
- `ROLLBAR_SERVER_TOKEN`
- `NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN`
- `ROLLBAR_READ_TOKEN`

### STORAGE_PROVIDER on Vercel

The platform uses `STORAGE_PROVIDER=vercel` for production (Vercel Blob Storage). The health endpoint (`pages/api/health.ts`) checks this value — without it, the storage check fails and the platform reports "degraded" health status.

**Important:** `.env.example` shows `STORAGE_PROVIDER=s3` for self-hosted setups, but for Vercel deployment the value must be `vercel`.

### Vercel API Behavior Notes

- All secrets created via the Vercel REST API are stored as `"sensitive"` type regardless of the `type` specified in the request
- Sensitive values appear as empty strings in API GET responses (this is expected — they are encrypted)
- To verify a secret is set, check for its existence in the response, not its value
- Redeployment is required after adding/changing environment variables — existing running instances do not pick up changes

### Deployment IDs

| Deployment | ID | Purpose |
|-----------|-----|---------|
| First redeployment | `dpl_Hx4k9GJ9PwDddyYMLteQmpV9LMsn` | Applied initial env var batch |
| Second redeployment | `dpl_CVMFX3msTRwQdnfshmzHxBWztvYx` | Applied STORAGE_PROVIDER addition |

### Post-Fix Verification

| Check | Before | After |
|-------|--------|-------|
| Health endpoint | `{"status":"degraded"}` | `{"status":"healthy","checks":{"database":{"status":"up","latencyMs":725},"storage":{"status":"up","provider":"vercel"}}}` |
| Auth providers | `credentials`, `linkedin`, `email` (3) | `credentials`, `google`, `linkedin`, `email` (4) |
| `app.fundroom.ai` | HTTP 200 | HTTP 200 |
| `app.login.fundroom.ai` | HTTP 200 | HTTP 200 |
| `app.admin.fundroom.ai` | HTTP 200 | HTTP 200 |
| Security headers | Present | Present (`Permissions-Policy`, `Strict-Transport-Security`, `X-Frame-Options`) |

---

## 18. Error Leakage Security Fix (Feb 10, commit `e291598`)

Continued security hardening from the deep code review. Fixed error message leakage in 11 API endpoints that were returning internal error details to clients.

### Files Fixed

| # | File | Was Leaking | Now Returns |
|---|------|-------------|-------------|
| 1 | `pages/api/file/image-upload.ts` | `(error as Error).message` | "Upload failed" |
| 2 | `pages/api/file/browser-upload.ts` | `(error as Error).message` | "Upload failed" |
| 3 | `pages/api/file/s3/get-presigned-get-url.ts` | Raw error object in JSON | "Internal server error" |
| 4 | `pages/api/record_click.ts` | Zod `result.error.message` | "Invalid request body" |
| 5 | `pages/api/record_view.ts` | Zod `result.error.message` | "Invalid request body" |
| 6 | `pages/api/record_video_view.ts` | Zod `result.error.message` | "Invalid request body" |
| 7 | `pages/api/analytics/index.ts` | Zod `error.message` + `error.issues` | "Invalid request parameters" |
| 8 | `pages/api/teams/[teamId]/documents/[id]/update-notion-url.ts` | Zod validation details | "Invalid Notion URL" |
| 9 | `pages/api/links/download/index.ts` | Watermarking API internal errors | "Error downloading document" |

### Test Update

| File | Change |
|------|--------|
| `__tests__/api/lp/subscription/process-payment.test.ts` | Updated expectations from raw error messages to "Internal server error" |

**Result:** All 555 tests passing. Server-side logging preserved for debugging.

**Low-priority items noted:** `pages/api/test-error.ts` has no auth (could spam Rollbar), ~37 additional files still have `error.message` in responses (see `docs/DEEP_CODE_REVIEW_FEB9.md`).

---

## 19. Vercel Deployment Warning Fixes (Feb 10, commit `1a09136`)

Cleaned up Vercel build configuration to eliminate deployment warnings.

### Changes

| File | Change | Why |
|------|--------|-----|
| `vercel.json` | Removed `memory` settings from all 6 function configs | Deprecated on Active CPU billing — Vercel ignores them and logs a warning |
| `package.json` | Changed `engines.node` from `>=22` to `22.x` | Prevents Vercel auto-upgrading to unstable Node.js 24.x |
| Vercel project settings | Updated Node.js version from `24.x` to `22.x` | Eliminates "engines override" mismatch warning |

### Build Warning Status (After Fix)

| Warning | Status |
|---------|--------|
| ~~`memory` setting deprecated~~ | **RESOLVED** — removed from vercel.json |
| ~~Node.js version mismatch~~ | **RESOLVED** — project settings updated to match package.json |
| `Please use the legacy build in Node.js environments` | **KNOWN** — third-party dependency, harmless, cannot fix without replacing library |

### Verification

- Deployment `darkroom-13gk2qrrv-bffi.vercel.app` — **READY**
- Health: **healthy** (database up, storage up/vercel)
- Auth providers: credentials, google, linkedin, email (4) — **Note:** LinkedIn is listed but non-functional (no credentials configured, see Section 20)
- All 3 domains returning HTTP 200

---

## 20. LinkedIn OAuth Investigation (Feb 10)

**Finding:** LinkedIn OAuth provider is registered in `lib/auth/auth-options.ts` but has **no credentials configured**. `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` do not exist in any environment (Replit secrets or Vercel env vars). No LinkedIn developer app has been created under the fundroom.ai domain.

**Impact:** LinkedIn appears in the `/api/auth/providers` response and on the registration page, but any actual sign-in attempt would fail. The provider is non-functional.

**Root cause:** Unlike Google OAuth (which uses a conditional `...(googleClientId && googleClientSecret ? [GoogleProvider(...)] : [])` pattern), the LinkedIn provider is always registered regardless of whether credentials exist.

**Fix planned (Feb 11):** Make LinkedIn conditional like Google — only register the provider when `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` are set.

---

## 22. Portal Branding Completion (Feb 10)

Completed logo implementation across all remaining portals. Previously, several pages still used generic Lucide `Building2` icons or text placeholders instead of the actual FundRoom AI logo assets.

### Changes Made (5 files)

| Page / Component | Before | After |
|---|---|---|
| **Investor Login** (`app/(auth)/login/page-client.tsx`) | Building2 Lucide icon | `fundroom-logo-white.png` (header) + `fundroom-icon.png` (showcase panel) |
| **Admin Login** (`app/admin/login/page-client.tsx`) | Building2 Lucide icon | `fundroom-logo-white.png` (header) + `fundroom-icon.png` (showcase panel) |
| **Signup** (`app/(saas)/signup/page-client.tsx`) | Building2 Lucide icon | `fundroom-logo-white.png` (header) |
| **Viewer Portal** (`app/viewer-portal/page-client.tsx`) | "BF" text placeholder | `fundroom-icon.png` (28x28 rounded icon) |
| **Admin Sidebar** (`components/admin/admin-sidebar.tsx`) | Text-only "FundRoom" | `fundroom-icon.png` + text (expanded), icon only (collapsed) |

### Result

All user-facing portals and login pages now display the correct FundRoom AI brand logo (ascending bar chart icon with green-to-blue gradient). No placeholder icons or text remain in any authentication or navigation surface.

### Commits

| Commit | Description |
|---|---|
| `2fe2e245` | Initial logo asset replacement in public/_static/ |
| `be57a0a7` | Replace Building2 placeholder icons with FundRoom AI logos on all portals |

### Brand Guidelines Updated

`docs/FundRoom_Brand_Guidelines.md` updated from v1.0 → v1.1 with complete logo usage reference table and changelog.

---

## 23. What's Next / Open Items

- [ ] **Fix LinkedIn OAuth provider**: Make conditional like Google (only show when credentials exist)
- [ ] **Set up LinkedIn OAuth (if desired)**: Create LinkedIn developer app at developers.linkedin.com, register under fundroom.ai domain, add credentials
- [ ] **Remaining error leakage**: ~37 additional API files still expose `error.message` in responses
- [ ] **Remove test-error endpoint**: `pages/api/test-error.ts` has no auth and could spam Rollbar
- **Test live login flows**: Test a full login/signup flow on `app.login.fundroom.ai` and admin login on `app.admin.fundroom.ai`
- **Test Google OAuth redirect**: Verify Google OAuth works end-to-end with the new FundRoom credentials
- **Marketing site buttons**: Owner will manually update `fundroom.ai` buttons to point to `app.login.fundroom.ai/coming-soon/login` or the live login page.
- **Persona Allowed Domains**: Add `app.fundroom.ai` and `*.fundroom.ai` to Persona Inquiry Template allowed domains for embedded KYC flow.
- **Remove BFG Google OAuth**: Once FundRoom Google Cloud redirect URIs confirmed, remove `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- **FundRoom Stripe Account**: When opened, replace `STRIPE_BFG_WEBHOOK_SECRET` with `STRIPE_WEBHOOK_SECRET` and update Stripe keys.
- **Env var drift prevention**: Maintain a checklist mapping `.env.example` to Vercel production env vars to prevent future drift.
- **Resource-level auth**: progress-token and Notion proxy endpoints check session but don't verify user owns the requested resource.
- **Console.log cleanup**: ~494 console.log statements in API routes — not urgent but reduces noise.
