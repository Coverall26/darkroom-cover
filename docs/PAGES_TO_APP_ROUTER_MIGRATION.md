# Pages Router → App Router Migration Plan

**Created:** Feb 16, 2026
**Updated:** Feb 19, 2026
**Status:** Phase 1 complete — 99 new App Router route files created (Feb 19, 2026)
**Target:** Complete migration of all 386 Pages Router API routes to App Router

### Migration Log

| Date | Batch | Routes Migrated | Notes |
|------|-------|----------------|-------|
| Feb 18, 2026 | Pre-migration | 5 LP routes | `pending-counts`, `pending-signatures`, `me`, `docs`, `notes` |
| Feb 19, 2026 | LP Batch 1 | 5 LP routes | `register`, `subscribe`, `fund-context`, `fund-details`, `wire-instructions` |
| Feb 19, 2026 | LP Batch 2 | 5 LP routes | `wire-proof`, `onboarding-flow`, `express-interest`, `signing-documents`, `subscription-status` |
| Feb 19, 2026 | LP Batch 3 | 5 LP routes | `kyc`, `staged-commitment`, `bank/connect`, `bank/link-token`, `bank/status` |
| Feb 19, 2026 | LP Batch 4 | 6 LP routes | `investor-profile/[profileId]`, `investor-profile/[profileId]/change-requests`, `documents/upload` |
| Feb 19, 2026 | LP Batch 5 | 6 LP routes | `sign-nda`, `investor-details`, `commitment`, `upload-signed-doc` (deduplicated with existing) |
| Feb 19, 2026 | Admin Batch A | 7 admin routes | `engagement`, `reports`, `reports/export`, `reports/form-d`, `activate-fundroom`, `team-context`, `capital-tracking` |
| Feb 19, 2026 | Admin Batch B | 7 admin routes | `consolidate-teams`, `fix-email-auth`, `reprocess-pdfs`, `form-d-reminders`, `db-health`, `deployment-readiness`, `dashboard-stats` |
| Feb 19, 2026 | Admin Batch C | 7 admin routes | `settings/full`, `settings/update`, `settings/inheritance`, `wire/confirm`, `fund/[id]/pending-actions`, `fund/[id]/pending-details`, `investors/check-lead` |
| Feb 19, 2026 | Admin Batch D | 7 admin routes | `investors/manual-entry`, `investors/bulk-import`, `investors/[investorId]`, `investors/[investorId]/review`, `investors/[investorId]/stage`, `documents/[id]/review`, `test-integrations` |
| Feb 19, 2026 | Admin Batch E | 7 admin routes | `documents/pending-review`, `documents/[docId]/confirm`, `documents/[docId]/reject`, `documents/[docId]/request-reupload`, `documents/upload` (admin), `manual-investment/index`, `manual-investment/[id]` |
| Feb 19, 2026 | Admin Batch F | 7 admin routes | `manual-investment/[id]/proof`, `approvals/pending`, `approvals/[approvalId]/approve`, `approvals/[approvalId]/approve-with-changes`, `approvals/[approvalId]/request-changes`, `profile-completeness` (App Router), `setup-admin` (admin) |
| Feb 19, 2026 | Admin Batch G | 5 admin routes | `investor-profile/[profileId]`, `investor-profile/[profileId]/change-requests`, `signatures/capture`, `documents/[docId]/sign-data`, `documents/[docId]/signed-pdf` |
| Feb 19, 2026 | Admin Batch H | 4 admin routes | `sign/[token]`, `record_click`, `record_view`, `record_video_view` |
| Feb 19, 2026 | Phase 3 (Funds) | 5 fund routes | `funds/[fundId]/settings`, `funds/[fundId]/aggregates`, `teams/[teamId]/funds`, `teams/[teamId]/funds/[fundId]/invite`, `teams/[teamId]/toggle-fundroom-access` |
| Feb 19, 2026 | Phase 4 (Auth) | 11 auth routes | `check-admin`, `check-visitor`, `admin-login`, `register`, `mfa-status`, `setup-admin`, `mfa-verify`, `mfa-setup`, `verify-link`, `lp-token-login`, `admin-magic-verify` |

**Current counts:** Pages Router: 385 (unchanged — old files kept during verification), App Router: 163 (+99 new)
**Test results:** 165 suites, 5,774 tests — all passing

---

## Executive Summary

The FundRoom codebase has **386 Pages Router API routes** (`pages/api/`) and **59 App Router routes** (`app/api/`), representing an incomplete mid-migration state. This document outlines the strategy, priorities, and patterns for completing the migration.

**Key finding:** No critical route path conflicts exist. Both routers can coexist during incremental migration.

---

## Current State (Updated Feb 19, 2026)

| Metric | Pages Router | App Router | Notes |
|--------|-------------|-----------|-------|
| Total routes | 385 | 163 | +99 new App Router routes from migration |
| Estimated LOC | ~60,000 | ~31,000 | ~21,000 new lines added |
| Auth pattern | `getServerSession(req, res, authOptions)` | `getServerSession(authOptions)` | App Router omits req/res |
| Response pattern | `res.status(200).json({})` | `NextResponse.json({}, { status: 200 })` | |
| Method handling | `if (req.method !== "POST")` | Named exports (`export async function POST`) | |
| Rate limiting | 40+ routes | 99 routes | App Router uses `appRouterRateLimit` variants |
| Zod validation | 81 routes | ~15 routes | Zod schemas preserved during migration |

### Route Distribution by Domain (After Migration)

| Domain | Pages Router | App Router (before) | App Router (after) | Migrated |
|--------|-------------|--------------------|--------------------|----------|
| teams/ | 182 | 24 | 27 | +3 (funds, invite, toggle) |
| admin/ | 49 | 1 | 57 | +56 (8 batches) |
| lp/ | 32 | 6 | 33 | +27 (5 batches) |
| auth/ | 12 | 0 | 11 | +11 (Phase 4) |
| funds/ | — | 5 | 7 | +2 (settings, aggregates) |
| links/ | 17 | 0 | 0 | Phase 2 |
| file/ | 13 | 0 | 0 | Phase 2 |
| sign/ | 6 | 0 | 1 | +1 (sign/[token]) |
| signature/ | 6 | 0 | 1 | +1 (capture) |
| documents/ | 7 | 0 | 2 | +2 (sign-data, signed-pdf) |
| webhooks/ | 6 | 1 | 1 | Phase 2 |
| approvals/ | 4 | 0 | 4 | +4 (Batch F) |
| jobs/ | 7 | 0 | 0 | Phase 2 |
| tracking/ | 3 | 0 | 3 | +3 (click, view, video_view) |
| Other | 45 | 27 | 16 | Misc |

**Note:** Pages Router files are NOT deleted — kept during the parallel verification phase. Next.js serves the App Router version when both exist at the same path.

---

## Migration Pattern Reference

### Auth Pattern

```typescript
// BEFORE (Pages Router)
import { getServerSession } from "next-auth/next";
import type { NextApiRequest, NextApiResponse } from "next";
import { authOptions } from "@/lib/auth/auth-options";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });
  // ...
}

// AFTER (App Router)
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/auth-options";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ...
}
```

### Response Pattern

```typescript
// BEFORE
res.status(200).json({ data: result });
res.status(400).json({ error: "Bad request" });
res.status(500).json({ error: "Internal server error" });

// AFTER
return NextResponse.json({ data: result });
return NextResponse.json({ error: "Bad request" }, { status: 400 });
return NextResponse.json({ error: "Internal server error" }, { status: 500 });
```

### Method Handling

```typescript
// BEFORE (single handler with method check)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") { /* ... */ }
  else if (req.method === "POST") { /* ... */ }
  else return res.status(405).json({ error: "Method not allowed" });
}

// AFTER (named exports)
export async function GET(req: NextRequest) { /* ... */ }
export async function POST(req: NextRequest) { /* ... */ }
```

### Body Parsing

```typescript
// BEFORE
const { name, email } = req.body;

// AFTER
const { name, email } = await req.json();
```

### Query Parameters

```typescript
// BEFORE
const { teamId, fundId } = req.query;

// AFTER (dynamic route params)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string; fundId: string }> }
) {
  const { teamId, fundId } = await params;
}

// AFTER (search params)
const { searchParams } = new URL(req.url);
const status = searchParams.get("status");
```

### Headers & Cookies

```typescript
// BEFORE
res.setHeader("X-Custom", "value");
res.setHeader("Set-Cookie", `session=token; Path=/; HttpOnly; Secure; SameSite=Lax`);

// AFTER
const response = NextResponse.json(data);
response.headers.set("X-Custom", "value");

// Cookie with multiple attributes
const cookieParts = [
  `${SESSION_COOKIE_NAME}=${token}`,
  "Path=/",
  "HttpOnly",
  "Secure",
  "SameSite=Lax",
  `Max-Age=${maxAge}`,
];
response.headers.set("Set-Cookie", cookieParts.join("; "));
return response;
```

### Redirect with Cookie

```typescript
// BEFORE (Pages Router)
res.setHeader("Set-Cookie", cookieString);
res.redirect(302, "/dashboard");

// AFTER (App Router)
const baseUrl = process.env.NEXTAUTH_URL || "https://app.fundroom.ai";
const response = NextResponse.redirect(new URL("/dashboard", baseUrl), 302);
response.headers.set("Set-Cookie", cookieParts.join("; "));
return response;
```

### Rate Limiting (App Router)

```typescript
// BEFORE (Pages Router)
import { authRateLimiter } from "@/lib/security/rate-limiter";
const allowed = await authRateLimiter(req, res);
if (!allowed) return; // 429 already sent

// AFTER (App Router)
import { appRouterAuthRateLimit } from "@/lib/security/rate-limiter";
const blocked = await appRouterAuthRateLimit(req);
if (blocked) return blocked; // blocked is NextResponse(429)
```

### Webhook Raw Body

```typescript
// BEFORE (Pages Router)
export const config = { api: { bodyParser: false } };
const rawBody = await buffer(req);

// AFTER (App Router)
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  // verify signature with rawBody
}
```

---

## Migration Phases

### Phase 1: Core Domain Migration ✅ COMPLETE (Feb 19, 2026)

99 new App Router route files created across 4 domains:

**LP Routes (27 files, 5 batches):**
- Batch 1: `register`, `subscribe`, `fund-context`, `fund-details`, `wire-instructions`
- Batch 2: `wire-proof`, `onboarding-flow`, `express-interest`, `signing-documents`, `subscription-status`
- Batch 3: `kyc`, `staged-commitment`, `bank/connect`, `bank/link-token`, `bank/status`
- Batch 4: `investor-profile/[profileId]`, `investor-profile/[profileId]/change-requests`, `documents/upload`
- Batch 5: `sign-nda`, `investor-details`, `commitment`, `upload-signed-doc` (deduplicated with existing)

**Admin Routes (56 files, 8 batches A-H):**
- Batch A: `engagement`, `reports`, `reports/export`, `reports/form-d`, `activate-fundroom`, `team-context`, `capital-tracking`
- Batch B: `consolidate-teams`, `fix-email-auth`, `reprocess-pdfs`, `form-d-reminders`, `db-health`, `deployment-readiness`, `dashboard-stats`
- Batch C: `settings/full`, `settings/update`, `settings/inheritance`, `wire/confirm`, `fund/[id]/pending-actions`, `fund/[id]/pending-details`, `investors/check-lead`
- Batch D: `investors/manual-entry`, `investors/bulk-import`, `investors/[investorId]`, `investors/[investorId]/review`, `investors/[investorId]/stage`, `documents/[id]/review`, `test-integrations`
- Batch E: `documents/pending-review`, `documents/[docId]/confirm`, `documents/[docId]/reject`, `documents/[docId]/request-reupload`, `documents/upload` (admin), `manual-investment/index`, `manual-investment/[id]`
- Batch F: `manual-investment/[id]/proof`, `approvals/pending`, `approvals/[approvalId]/approve`, `approvals/[approvalId]/approve-with-changes`, `approvals/[approvalId]/request-changes`, `profile-completeness`, `setup-admin`
- Batch G: `investor-profile/[profileId]`, `investor-profile/[profileId]/change-requests`, `signatures/capture`, `documents/[docId]/sign-data`, `documents/[docId]/signed-pdf`
- Batch H: `sign/[token]`, `record_click`, `record_view`, `record_video_view`

**Fund Routes (5 files, Phase 3):**
- `funds/[fundId]/settings`, `funds/[fundId]/aggregates`, `teams/[teamId]/funds`, `teams/[teamId]/funds/[fundId]/invite`, `teams/[teamId]/toggle-fundroom-access`

**Auth Routes (11 files, Phase 4):**
- Simple: `check-admin`, `check-visitor`, `admin-login`, `register`, `mfa-status`, `setup-admin`
- MFA: `mfa-verify`, `mfa-setup`
- Cookie/redirect: `verify-link`, `lp-token-login`, `admin-magic-verify`

**Key patterns applied across all routes:**
- App Router rate limiting via `appRouterRateLimit`, `appRouterAuthRateLimit`, `appRouterStrictRateLimit`, `appRouterMfaRateLimit`, `appRouterUploadRateLimit`
- RBAC via `enforceRBACAppRouter`, `requireAdminAppRouter`, `requireTeamMemberAppRouter`
- `export const dynamic = "force-dynamic"` on all route files
- `reportError()` in all catch blocks
- `{ error: }` response format (H-06 standard)
- Audit logging preserved from Pages Router versions

### Phase 2: Remaining Domains (Not Yet Started)

Remaining ~222 Pages Router routes to migrate:

| Domain | Routes | Priority | Notes |
|--------|--------|----------|-------|
| teams/ (non-fund) | ~155 | High | Largest batch — datarooms, documents, links, investors, settings |
| links/ | 17 | Medium | Shareable link CRUD and analytics |
| file/ | 13 | Medium | File upload/download handlers |
| sign/ | 5 | Medium | Remaining e-signature routes |
| signature/ | 5 | Medium | Signature template management |
| documents/ | 5 | Medium | Document CRUD and annotations |
| webhooks/ | 5 | Low | Stripe, Persona, Resend webhooks |
| jobs/ | 7 | Low | Background job handlers |
| Other | ~10 | Low | Misc routes (health, analytics, cron) |

### Phase 3: Cleanup (After Full Migration)

- Delete all migrated `pages/api/` files
- Remove `pages/_document.tsx`, `pages/_app.tsx`, `pages/404.tsx` if App Router equivalents exist
- Update all import paths
- Verify zero orphaned files
- Update test imports if needed

---

## Per-Route Migration Checklist

For each route being migrated:

- [ ] Create App Router file at corresponding path with `route.ts`
- [ ] Convert `NextApiRequest/NextApiResponse` → `NextRequest/NextResponse`
- [ ] Convert `res.status().json()` → `NextResponse.json()`
- [ ] Convert `req.body` → `await req.json()`
- [ ] Convert `req.query` → `await params` or `searchParams`
- [ ] Convert method checks → named export functions
- [ ] Convert auth: `getServerSession(req, res, authOptions)` → `getServerSession(authOptions)`
- [ ] Preserve all Zod validation schemas
- [ ] Preserve all `reportError()` calls
- [ ] Preserve all audit logging
- [ ] Ensure `{ error: }` response format
- [ ] Add rate limiting if security-sensitive
- [ ] Test with existing test suite
- [ ] Verify no import cycle issues
- [ ] Delete Pages Router version after verification

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Breaking auth during migration | Critical | Migrate auth routes first with comprehensive testing |
| Webhook signature verification | High | Test Stripe/Persona webhooks with raw body parsing |
| Route conflicts during coexistence | Medium | Verified: no conflicts exist (different file patterns) |
| Missing rate limiting in new routes | Medium | Add rate limiting as part of each migration batch |
| Test coverage gaps | Medium | Run full test suite after each batch |

---

## Success Criteria

- 0 routes remaining in `pages/api/`
- All 386+ routes migrated to `app/api/`
- 100% `{ error: }` response format
- Rate limiting on all auth/payment/upload routes
- Zero breaking changes to API behavior
- All tests passing
- Zero TypeScript errors

---

## Notes & Lessons Learned

- **Next.js 16 proxy.ts:** `proxy.ts` is the middleware entry point. Do NOT create `middleware.ts`.
- **NextAuth compatibility:** App Router uses `getServerSession(authOptions)` without `req/res` params.
- **Parallel coexistence:** Pages Router and App Router can coexist as long as no path conflicts exist. When both exist at the same path, Next.js serves the App Router version.
- **Cookie handling in App Router:** `res.setHeader("Set-Cookie", ...)` becomes `response.headers.set("Set-Cookie", cookieParts.join("; "))`. Build cookie string manually with parts array.
- **Redirect in App Router:** `res.redirect(302, url)` becomes `NextResponse.redirect(new URL(path, baseUrl), 302)`. Can combine with Set-Cookie header on the redirect response.
- **Rate limiting:** Pages Router uses `authRateLimiter(req, res)` (writes 429 directly). App Router uses `appRouterAuthRateLimit(req)` which returns `NextResponse | null`. Pattern: `const blocked = await appRouterAuthRateLimit(req); if (blocked) return blocked;`
- **Prisma transaction typing:** Transaction callback parameter: `async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0])`
- **RBAC helpers:** `lib/auth/rbac.ts` has App Router variants: `enforceRBACAppRouter()`, `requireAdminAppRouter()`, `requireTeamMemberAppRouter()`, `requireGPAccessAppRouter()` — return `RBACResult | NextResponse`.
- **Pages Router files NOT deleted:** Kept during verification phase. Can be removed after confirming App Router versions work identically in production.
- **Phase 2+ priority:** This migration is not blocking MVP launch. The platform functions correctly with the current mixed-router architecture.
