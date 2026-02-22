# FundRoom.ai — Launch Checklist

**Last Updated:** February 20, 2026
**Target:** Production-ready deployment on Vercel

---

## Pre-Launch — Environment

- [ ] All **Critical** env vars set (see `docs/ENV_VARS.md` Production Checklist)
- [ ] `PAYWALL_BYPASS=true` (MVP mode — no Stripe required)
- [ ] `NEXTAUTH_URL` = `https://app.fundroom.ai`
- [ ] `NEXT_PUBLIC_BASE_URL` = `https://app.fundroom.ai`
- [ ] All 5 encryption salts are unique 64-char hex strings
- [ ] `STORAGE_PROVIDER=vercel` with valid `BLOB_READ_WRITE_TOKEN`
- [ ] `RESEND_API_KEY` is live (not test) key with verified `fundroom.ai` domain
- [ ] `FUNDROOM_GOOGLE_CLIENT_ID/SECRET` — redirect URIs include all production domains
- [ ] `ROLLBAR_SERVER_TOKEN` and `NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN` — both set
- [ ] `UPSTASH_REDIS_REST_URL/TOKEN` — production Redis for rate limiting
- [ ] `TINYBIRD_TOKEN` — production workspace for server analytics

---

## Pre-Launch — Security

- [ ] `NEXTAUTH_SECRET` is 64+ chars, cryptographically random
- [ ] All API routes return `{ error: "..." }` (H-06 standard) — never leak `error.message`
- [ ] Rate limiting active on all `/api/` routes (blanket 200/min + per-route tiers)
- [ ] HSTS header enabled (`Strict-Transport-Security: max-age=63072000`)
- [ ] CSP headers configured (`lib/middleware/csp.ts`)
- [ ] CORS restricted to platform domains only
- [ ] No `console.log` of secrets, tokens, or PII in API routes
- [ ] Admin portal requires `OWNER`/`ADMIN`/`SUPER_ADMIN` team role
- [ ] LP portal login verified (email/password + magic link)
- [ ] GP portal login verified (password + magic link)
- [ ] All file uploads restricted: PDF/image types, 25MB max, rate-limited
- [ ] Tax IDs encrypted with AES-256 (`encryptTaxId()`)
- [ ] Wire instructions encrypted with AES-256
- [ ] Cookie `Secure` flag on all cookies
- [ ] No unprotected admin endpoints (all use `requireAdmin()` or `enforceRBAC()`)
- [ ] Cascade deletes are `Restrict` on compliance models (AuditLog, SignatureDocument, Investment)

---

## Pre-Launch — Functional (GP Flow)

- [ ] GP signup → email verify → `/admin/setup` wizard (9 steps)
- [ ] Wizard Step 1: Company info with entity type and EIN (masked)
- [ ] Wizard Step 2: Branding with logo upload and live preview
- [ ] Wizard Step 3: Raise type (GP Fund / Startup / Dataroom Only)
- [ ] Wizard Step 4: Team invites
- [ ] Wizard Step 5: Fund details (economics + wire instructions)
- [ ] Wizard Step 6: LP onboarding (doc templates, accreditation, notifications)
- [ ] Wizard Step 7: Integrations status
- [ ] Wizard Step 8: Review & Launch (validation gate, progress checklist)
- [ ] GP Dashboard loads with stats, pipeline, pending actions
- [ ] Investor pipeline shows 7 stages (Applied → Funded)
- [ ] GP can confirm wire receipts (atomic: Transaction + Investment + FundAggregate)
- [ ] GP can approve/reject/request-changes on documents
- [ ] GP approval queue works (4 actions: approve, approve-with-changes, request-changes, reject)
- [ ] GP can manually add investors (5-step wizard)
- [ ] GP can manage document templates
- [ ] GP reports page loads with metrics and CSV export
- [ ] Settings Center has all 21+ sections across 7 tabs

---

## Pre-Launch — Functional (LP Flow)

- [ ] LP onboarding from dataroom invest button → register → wizard
- [ ] Parameter chain works: dataroom → fund-context → invest → onboard
- [ ] LP Step 1: Account creation (email/password)
- [ ] LP Step 2: NDA agreement
- [ ] LP Step 3: Accreditation (entity type, criteria checkboxes)
- [ ] LP Step 4: Investor details (entity type, tax ID, address)
- [ ] LP Step 5: Commitment (amount, 8 SEC representations)
- [ ] LP Step 6: Funding (wire instructions, proof upload)
- [ ] LP Dashboard shows status tracker (5 stages)
- [ ] LP Docs vault shows documents with status badges
- [ ] LP Transactions page shows wire history
- [ ] LP wire page shows instructions with copy-to-clipboard
- [ ] E-signature signing flow works (FundRoomSign, sequential docs)

---

## Pre-Launch — Functional (Dataroom)

- [ ] Dataroom creation wizard works
- [ ] Public viewer renders documents
- [ ] Shareable links with password/expiry/email gate
- [ ] NDA/agreement gate enforced when `enableAgreement=true`
- [ ] Analytics tracking (page views, downloads, engagement scoring)
- [ ] Custom domain support
- [ ] Watermark overlay

---

## Pre-Launch — Performance

- [ ] `next build` completes without errors
- [ ] `npx tsc --noEmit` reports 0 TypeScript errors
- [ ] Database connection pool configured (`connection_limit=10`, `pool_timeout=20`)
- [ ] Prisma client generated from latest schema
- [ ] Heavy components use `React.lazy()` + `Suspense`
- [ ] Images use `next/image` with proper sizing
- [ ] No N+1 query patterns in critical API routes
- [ ] Skeleton loaders on all pages (no spinner-only states)

---

## Pre-Launch — Monitoring

- [ ] Health endpoint returns `healthy`: `GET /api/health`
- [ ] All 4 services up: database, redis, storage, email
- [ ] Deployment readiness passes: `GET /api/admin/deployment-readiness`
- [ ] Rollbar receiving errors (test with deliberate error)
- [ ] Tinybird receiving funnel events (check funnel_events datasource)
- [ ] External uptime monitor configured (BetterUptime/Pingdom/UptimeRobot)
  - URL: `https://app.fundroom.ai/api/health`
  - Method: GET
  - Interval: 60 seconds
  - Alert: status != 200 OR `status` != `"healthy"`
- [ ] Rollbar alert rules configured:
  - Critical level → PagerDuty/Slack (immediate)
  - Error spike (>10/min) → Slack
  - Security category → Slack + email

---

## Pre-Launch — Data

- [ ] Bermuda seed data loaded (`npx ts-node prisma/seed-bermuda.ts`)
- [ ] Platform admin created (`rciesco@fundroom.ai`)
- [ ] Demo LP accounts created (`demo-investor@example.com / Investor2026!`)
- [ ] Demo GP account works (`joe@bermudafranchisegroup.com / FundRoom2026!`)
- [ ] FundroomActivation record exists (ACTIVE) for Bermuda team
- [ ] PlatformSettings record exists (`paywallEnforced: false`)

---

## Pre-Launch — Accessibility & UX

- [ ] WCAG 2.1 AA: All interactive elements have ARIA labels
- [ ] Touch targets ≥ 44px on mobile
- [ ] iOS zoom prevention (16px input font)
- [ ] `prefers-reduced-motion` respected (animations disabled)
- [ ] Error boundaries on all critical flows (LP onboarding, GP setup, signing)
- [ ] Empty states on all list pages (investors, documents, approvals, CRM)
- [ ] Dark mode consistent across LP portal

---

## Post-Launch — Day 1 Verification

- [ ] Smoke test all 3 login portals:
  - `app.fundroom.ai` — GP login
  - `app.login.fundroom.ai` — standard login
  - `app.admin.fundroom.ai` — admin login
- [ ] Create a new GP org through the wizard end-to-end
- [ ] Create a dataroom and share a link
- [ ] Complete LP onboarding as a test investor
- [ ] Verify wire proof upload → GP confirmation → LP funded flow
- [ ] Check Rollbar for any new errors
- [ ] Check Tinybird for funnel events firing
- [ ] Verify email delivery (signup verification, investor welcome)
- [ ] Monitor health endpoint for first 24 hours

---

## Post-Launch — Week 1

- [ ] Review Rollbar error trends
- [ ] Check database latency via `/api/admin/db-health`
- [ ] Review rate limiting logs (any legitimate users blocked?)
- [ ] Verify audit log retention working
- [ ] Review GP feedback from first real usage
- [ ] Plan Phase 2 features (Stripe ACH, Persona KYC, Marketplace)

---

## See Also

- `docs/ENV_VARS.md` — Complete environment variable reference
- `docs/DEPLOYMENT.md` — Vercel deployment procedures
- `docs/RUNBOOK.md` — Operational runbook for common tasks
- `docs/SEC_COMPLIANCE.md` — SEC compliance requirements
- `SECURITY.md` — Security policy
