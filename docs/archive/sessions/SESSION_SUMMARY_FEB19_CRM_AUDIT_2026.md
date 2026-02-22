# Session Summary — Feb 19, 2026: CRM Build-Readiness Audit Sprint

## Overview

7-gap remediation sprint ensuring all CRM billing, contact auto-capture, webhook handling, and tier enforcement are production-ready. All gaps resolved, comprehensive test coverage added, all 324 CRM tests passing across 10 suites.

## Gaps Resolved

### Gap 1: PendingContact Fallback in Auto-Capture Flows

**Problem:** Auto-capture functions (`captureFromSigningEvent`, `captureFromDataroomView`, `captureFromLPRegistration`, `captureFromExpressInterest`) did not handle `ContactLimitError` — when a FREE-tier org hits the 20-contact cap, `upsertContact()` saves the viewer as a `PendingContact` and throws `ContactLimitError`. Without catching this, the error would be reported to Rollbar as a real error (it's expected behavior).

**Fix:** All 4 auto-capture functions now catch `ContactLimitError` silently (return without reporting), while regular errors still route to `reportError()`.

**Files modified:**
- `lib/crm/contact-upsert-job.ts` — Added `ContactLimitError` import and `instanceof` checks in catch blocks

### Gap 2: Stripe CRM Webhook Handlers (invoice events + subscription.created)

**Problem:** The CRM webhook handler (`app/api/webhooks/stripe-crm/route.ts`) was missing handlers for `invoice.payment_failed`, `invoice.paid`, and `customer.subscription.created` events.

**Fix:** Implemented all 3 handlers:

- **`invoice.payment_failed`**: Resolves `orgId` from invoice metadata or subscription metadata (via Stripe API lookup). Sets organization `subscriptionStatus` to `PAST_DUE`. Invalidates tier cache. Publishes `crm_payment_failed` analytics event. Logs `CRM_PAYMENT_FAILED` audit event with invoice ID, amount due, and attempt count.

- **`invoice.paid`**: Same orgId resolution pattern. Only clears `PAST_DUE` → `ACTIVE` (doesn't touch ACTIVE or other statuses). Invalidates tier cache. Publishes `crm_payment_recovered` analytics event. Logs `CRM_PAYMENT_RECOVERED` audit event.

- **`customer.subscription.created`**: Safety net for subscriptions created outside checkout flow (via Stripe API/dashboard). Handles base plans (CRM_PRO/FUNDROOM) and AI_CRM add-on with trial support. Sets appropriate organization fields. Invalidates tier cache. Logs audit event with `source: "direct_api"`.

**Files modified:**
- `app/api/webhooks/stripe-crm/route.ts` — Added 3 handler functions (~220 lines)
- `lib/audit/audit-logger.ts` — Added `CRM_PAYMENT_FAILED` and `CRM_PAYMENT_RECOVERED` to `AuditEventType`

### Gap 3: Contact→InvestorProfile Linking in LP Registration

**Problem:** LP registration endpoints created users and investor profiles but never captured a CRM Contact record, breaking the GP's unified CRM view.

**Fix:** Both LP register endpoints (Pages Router and App Router) now call `captureFromLPRegistration()` after user creation. Resolves `teamId` from request body or fund lookup. Passes `investorId`, `firstName`, `lastName`, `phone`, `fundId` for full contact enrichment. Wrapped in try-catch so CRM capture failure never fails registration.

**Files modified:**
- `pages/api/lp/register.ts` — Added CRM capture block with try-catch
- `app/api/lp/register/route.ts` — Same CRM capture block with try-catch

### Gaps 4-7: Verified Already Complete

- **Gap 4** (Dataroom email gate → Contact): `captureFromDataroomView()` already wired. ContactLimitError handling added via Gap 1.
- **Gap 5** (Prisma schema CRM models): Contact, ContactActivity, ContactNote, PendingContact, EsigUsageRecord, EsigUsage all present. 121 models, 59 enums.
- **Gap 6** (Tier-aware CRM page): Full CRM page at `app/admin/crm/` with tier-based feature gating, contact CRUD, pipeline views, engagement scoring.
- **Gap 7** (Settings Center billing + CRM preferences): `billing-crm.tsx` (598 lines), `crm-preferences.tsx` (345 lines), billing usage API, tier API all production-ready.

## Bug Fixes

1. **`publishServerEvent` field name** — `invoiceId` does not exist in the ServerEvent Zod schema (`lib/tracking/server-events.ts`). Changed to `source` in both `invoice.payment_failed` and `invoice.paid` handlers.

2. **`ContactLimitError` test mock** — Test file mocked `@/lib/crm/contact-service` but didn't export `ContactLimitError`, breaking `instanceof` checks. Fixed by using `jest.requireActual()` to preserve the real class.

3. **Non-blocking CRM capture** — CRM capture in LP register called `prisma.fund.findUnique()` inside the main try block. When fund lookup failed, it bubbled up to the outer catch returning 500 instead of 200. Wrapped in its own try-catch.

## Test Coverage Added

### New Test File: `__tests__/api/webhooks/stripe-crm-invoices.test.ts` (18 tests)

| Describe Block | Tests | Coverage |
|---------------|-------|----------|
| `invoice.payment_failed` | 5 | orgId from metadata, orgId from subscription, non-CRM sub, no orgId, subscription retrieve failure |
| `invoice.paid` | 5 | PAST_DUE→ACTIVE recovery, no change for ACTIVE, no orgId, sub metadata fallback, no change for CANCELED |
| `customer.subscription.created` | 6 | Base plan (CRM_PRO), AI_CRM with trial, non-CRM sub, missing orgId, unknown price, customer as object |
| Signature verification | 2 | Verification failure, missing header |

### Extended Test File: `__tests__/lib/crm/contact-upsert-job.test.ts` (+5 tests, 26 total)

| Test | Assertion |
|------|-----------|
| captureFromSigningEvent + ContactLimitError | Resolves silently, reportError NOT called |
| captureFromDataroomView + ContactLimitError | Resolves silently, reportError NOT called |
| captureFromLPRegistration + ContactLimitError | Resolves silently, reportError NOT called |
| captureFromExpressInterest + ContactLimitError | Resolves silently, reportError NOT called |
| Regular error handling | reportError IS called for non-ContactLimitError |

## Metrics

- **Files changed:** 7 modified + 1 new test file + 1 new session summary + CLAUDE.md update
- **Insertions:** ~501 lines of production code + ~350 lines of tests
- **CRM test suites:** 10 | **CRM tests:** 324 (all passing)
- **TypeScript errors in modified files:** 0
