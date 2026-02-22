# FundRoom.ai — Tracking, Monitoring & Error Reporting Architecture

> **Last Updated:** February 10, 2026
> **Status:** Implemented. Vercel Web Analytics + Speed Insights added (Feb 10). PostHog pending key activation.

> **See also:** [`docs/BUG_MONITORING_TOOLS_REPORT.md`](./BUG_MONITORING_TOOLS_REPORT.md) — Complete inventory of all 16 bug monitoring, testing, and debugging tools across the platform.

---

## Overview

FundRoom.ai uses a layered tracking and monitoring system designed for launch readiness. The system combines **Rollbar** for server-side error reporting, **Vercel Web Analytics + Speed Insights** for page-level performance and visitor analytics, **PostHog** for client-side product analytics and failure tracking, and a custom **failure tracker** that automatically captures unhandled errors, API failures, and network issues — all while respecting GDPR cookie consent.

### Vercel Web Analytics & Speed Insights (Added Feb 10)

Integrated via `@vercel/analytics` and `@vercel/speed-insights` packages:
- **App Router**: `<Analytics />` and `<SpeedInsights />` in `app/layout.tsx`
- **Pages Router**: `<Analytics />` and `<SpeedInsights />` in `pages/_app.tsx`
- Speed Insights is auto-enabled via Vercel project settings
- Web Analytics must be enabled in Vercel Dashboard → Project → Analytics → Enable
- Provides: Page views, unique visitors, referrers, top pages, Core Web Vitals (LCP, FID, CLS, TTFB)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                            │
│                                                                     │
│  ┌─────────────────────┐     ┌──────────────────────┐               │
│  │ CookieConsentBanner │────▶│ Cookie Consent State  │               │
│  │ (GDPR compliant)    │     │ (fr_consent cookie)   │               │
│  └─────────────────────┘     └──────────┬───────────┘               │
│                                         │                           │
│  ┌─────────────────────┐     ┌──────────▼───────────┐               │
│  │ TrackingInitializer │────▶│  Failure Tracker      │               │
│  │ (auto-init on load) │     │  - window.onerror     │               │
│  └─────────────────────┘     │  - unhandledrejection │               │
│                              │  - fetch() patching   │               │
│                              └──────────┬───────────┘               │
│                                         │                           │
│  ┌──────────────────────────────────────▼───────────────────────┐   │
│  │              Analytics Events Layer                          │   │
│  │                                                              │   │
│  │  trackFunnel()    → Signup, org creation, LP onboarding     │   │
│  │  trackFailure()   → Errors, API failures, auth failures     │   │
│  │  trackPageView()  → Page views with referrer data           │   │
│  │  trackEvent()     → General engagement events               │   │
│  │                                                              │   │
│  │  Consent check: trackFunnel/trackEvent require consent      │   │
│  │  Legitimate interest: trackFailure fires without consent    │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│                     PostHog (client SDK)                             │
│                     (NEXT_PUBLIC_POSTHOG_KEY)                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        SERVER (Next.js API)                         │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │            reportError() — lib/error.ts                      │   │
│  │                                                              │   │
│  │  Wired into catch blocks of critical API routes:            │   │
│  │                                                              │   │
│  │  AUTH:                                                       │   │
│  │    pages/api/auth/[...nextauth].ts                          │   │
│  │    pages/api/auth/admin-login.ts                            │   │
│  │                                                              │   │
│  │  PAYMENTS:                                                   │   │
│  │    pages/api/lp/subscription/process-payment.ts             │   │
│  │    pages/api/subscriptions/create.ts                        │   │
│  │    pages/api/stripe/webhook.ts                              │   │
│  │                                                              │   │
│  │  DOCUMENTS:                                                  │   │
│  │    pages/api/lp/documents/upload.ts                         │   │
│  │    pages/api/file/replit-upload.ts                          │   │
│  │                                                              │   │
│  │  OPERATIONS:                                                 │   │
│  │    pages/api/webhooks/rollbar.ts                            │   │
│  │    pages/api/sign/[token].ts                                │   │
│  │    pages/api/admin/launch-health.ts                         │   │
│  │    app/api/tracking/consent/route.ts                        │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│                   Rollbar (server SDK)                               │
│                   (ROLLBAR_SERVER_TOKEN)                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     CI/CD (GitHub Actions)                           │
│                                                                     │
│  .github/workflows/production.yml                                   │
│  └── "Notify Rollbar of Deploy" step                               │
│      POST https://api.rollbar.com/api/1/deploy                     │
│      - revision: ${{ github.sha }}                                 │
│      - environment: production                                      │
│      - access_token: ROLLBAR_WRITE_TOKEN                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Build Rules for Tracking Code

These rules MUST be followed when adding or modifying tracking code:

### Server-Side Events (`publishServerEvent`)
1. **Use `@chronark/zod-bird` SDK** — Never use raw `fetch()` to Tinybird. Always use the typed `publishServerEvent()` from `lib/tracking/server-events.ts`.
2. **Server-only** — `server-events.ts` has `import "server-only"`. It MUST NOT be imported from client components or barrel exports.
3. **No PII** — NEVER pass email addresses, names, IP addresses, or any personally identifiable information to `publishServerEvent`. Use `userId`, `teamId`, `orgId` only.
4. **Fire-and-forget** — NEVER `await` publishServerEvent on the critical path. Call it without `await` so it doesn't block the response.
5. **Import directly** — Import from `@/lib/tracking/server-events` directly, NOT from `@/lib/tracking` (the barrel export).

### Client-Side Events (`trackFunnel`, `trackEvent`, etc.)
1. **Use `useTracking()` hook** — Client components MUST use `const { trackFunnel } = useTracking()` from `@/lib/tracking/use-tracking`. This ensures cookie consent is checked before firing events.
2. **Never call `trackFunnel()` directly** — Do NOT import `trackFunnel` from `@/lib/tracking/analytics-events` in components. Always go through the `useTracking()` hook.
3. **Exception: `trackFailure()`** — Failure events fire without consent (legitimate interest for service reliability). Still use `useTracking()` hook.

### Event Naming Conventions
- Funnel events: `funnel_<action>` (e.g., `funnel_signup_started`, `funnel_first_document_uploaded`)
- `first_*` events fire on every occurrence — deduplication happens at the Tinybird query layer using `min(timestamp)` per teamId.
- Server events use the same naming scheme as client events.

---

## 1. Rollbar Integration

### 1.1 Tokens & Configuration

Three Rollbar tokens are used, each with a different scope:

| Token | Env Variable | Scope | Where Used |
|-------|-------------|-------|------------|
| Client (post_client_item) | `NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN` | Client-side error capture | Browser via Rollbar SDK |
| Server (post_server_item) | `ROLLBAR_SERVER_TOKEN` | Server-side error capture | API routes via `reportError()` |
| Write (write) | `ROLLBAR_WRITE_TOKEN` | Deploy notifications | GitHub Actions CI/CD |

### 1.2 Server-Side Initialization — `lib/rollbar.ts`

The server Rollbar instance is created once as a singleton:

```typescript
const serverToken = process.env.ROLLBAR_POST_SERVER_ITEM_ACCESS_TOKEN || process.env.ROLLBAR_SERVER_TOKEN;

export const serverInstance = new Rollbar({
  accessToken: serverToken || 'disabled',
  enabled: !!serverToken,
  captureUncaught: true,
  captureUnhandledRejections: true,
  environment: process.env.NODE_ENV || 'development',
  codeVersion: process.env.VERCEL_GIT_COMMIT_SHA || process.env.REPL_ID || 'development',
  payload: {
    client: {
      javascript: {
        source_map_enabled: true,
        code_version: codeVersion,
        guess_uncaught_frames: true,
      },
    },
    server: {
      root: 'webpack://fundroom-ai/',
    },
  },
});
```

Key design decisions:
- **Source maps enabled** — Rollbar can decode minified stack traces using the `code_version` tied to the git commit SHA
- **Code version** — Set to the Vercel deploy commit SHA for deploy-aware error grouping
- **Server root** — Set to `webpack://fundroom-ai/` so Rollbar maps source-mapped files correctly

### 1.3 Client-Side Configuration — `lib/rollbar.ts`

The client config has additional safety guards to prevent Rollbar from crashing the app:

```typescript
export const clientConfig: Rollbar.Configuration = {
  accessToken: clientToken || 'disabled',
  enabled: !!clientToken,
  captureIp: 'anonymize',           // GDPR compliance
  autoInstrument: false,             // Disabled — prevents circular reference stack overflows
  maxItems: 10,                      // Only 10 errors per page load
  itemsPerMinute: 5,                 // Rate limiting
  scrubFields: ['password', 'secret', 'token', 'accessToken', 'data', 'session'],
  transform: (payload) => {
    // Safe serialization with circular reference handling
    // Telemetry set to [] to prevent API errors
  },
  checkIgnore: (_isUncaught, args) => {
    // Ignores: stack overflow errors, initialization messages, script errors
  },
};
```

**Why `autoInstrument: false`?** — Rollbar's auto-instrumentation (DOM events, network, console) was causing `RangeError: Maximum call stack size exceeded` due to circular references in Next.js session data. Disabling it and using our custom failure tracker instead solved this completely.

### 1.4 Error Reporting Utility — `lib/error.ts`

A centralized error reporting layer provides multiple utilities:

| Function | Purpose | Used By |
|----------|---------|---------|
| `reportError(error, context)` | Reports an error to Rollbar with metadata | API route catch blocks |
| `reportWarning(message, context)` | Reports a warning-level event | Business logic warnings |
| `reportInfo(message, context)` | Reports an info-level event | Operational logging |
| `handleApiError(res, error, context)` | Reports + sends 500 JSON response (Pages Router) | Legacy API routes |
| `createApiErrorResponse(error, context)` | Reports + returns NextResponse (App Router) | App Router API routes |
| `withPrismaErrorHandling(fn, context)` | Wraps a Prisma operation with error reporting | Database operations |
| `captureException(error)` | Captures and returns UUID for tracking | Error boundary fallbacks |

Each function adds a `timestamp` and accepts arbitrary context metadata:
```typescript
reportError(error, {
  path: "/api/auth/admin-login",
  action: "admin_magic_link",
  userId: session?.user?.id,
});
```

### 1.5 API Routes with Rollbar Error Reporting

The following API routes have `reportError()` wired into their catch blocks:

**Authentication:**
- `pages/api/auth/[...nextauth].ts` — NextAuth callback errors
- `pages/api/auth/admin-login.ts` — Admin magic link errors (2 catch blocks)

**Payments:**
- `pages/api/lp/subscription/process-payment.ts` — LP payment processing errors
- `pages/api/subscriptions/create.ts` — Subscription creation errors
- `pages/api/stripe/webhook.ts` — Stripe webhook processing errors

**Documents:**
- `pages/api/lp/documents/upload.ts` — Document upload errors
- `pages/api/file/replit-upload.ts` — File upload to Replit Object Storage errors

**E-Signature:**
- `pages/api/sign/[token].ts` — E-signature token verification errors

**Operations:**
- `pages/api/webhooks/rollbar.ts` — Rollbar webhook handler errors
- `pages/api/admin/launch-health.ts` — Launch health endpoint errors
- `app/api/tracking/consent/route.ts` — Cookie consent API errors

### 1.6 CI/CD Deploy Notifications

Every production deploy notifies Rollbar via the GitHub Actions workflow:

```yaml
# .github/workflows/production.yml
- name: Notify Rollbar of Deploy
  if: success()
  run: |
    curl -s https://api.rollbar.com/api/1/deploy \
      -F access_token=${{ secrets.ROLLBAR_WRITE_TOKEN }} \
      -F environment=production \
      -F revision=${{ github.sha }} \
      -F local_username=${{ github.actor }} \
      -F comment="Deployed via GitHub Actions" \
      -F status=succeeded
```

This enables Rollbar to:
- Correlate errors with specific deploys
- Show error rates before/after deploys
- Auto-resolve errors that disappear after a deploy

---

## 2. Client-Side Tracking System

### 2.1 Cookie Consent — GDPR Compliance

**File:** `components/tracking/cookie-consent-banner.tsx`

The cookie consent banner appears at the bottom of the page on first visit. Users can:
- **Accept All** — enables analytics, marketing, and preference cookies
- **Reject Non-Essential** — only necessary cookies remain
- **Customize** — granular control over analytics, marketing, and preferences

Consent state is stored in the `fr_cookie_consent` cookie (365-day expiry, URL-encoded JSON) and dispatches a `fr:consent-updated` custom event so other components can react.

**Consent categories:**
| Category | Required | Purpose |
|----------|----------|---------|
| Necessary | Always on | Session, CSRF, consent state |
| Analytics | Opt-in | PostHog page views, engagement |
| Marketing | Opt-in | UTM tracking, attribution |
| Preferences | Opt-in | Theme, language, settings |

### 2.2 Tracking Initializer

**File:** `components/tracking/tracking-initializer.tsx`

A zero-UI React component that runs once on mount:
```typescript
export function TrackingInitializer() {
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    initFailureTracking();
  }, []);
  return null;
}
```

Wired into both routing layers:
- **App Router:** `app/providers.tsx`
- **Pages Router:** `pages/_app.tsx`

### 2.3 Failure Tracker — Automatic Error Capture

**File:** `lib/tracking/failure-tracker.ts`

Runs on the client and automatically captures:

1. **Unhandled JS errors** — `window.addEventListener("error", ...)`
2. **Unhandled promise rejections** — `window.addEventListener("unhandledrejection", ...)`
3. **API failures** — Patches `window.fetch` to monitor all HTTP responses with status >= 400
4. **Network errors** — Detects offline, timeout, and DNS resolution failures

**Deduplication:** Uses a circular buffer with 5-second window to prevent duplicate error reports.

**Loop prevention:** Tracking/analytics endpoints are excluded from fetch monitoring:
```typescript
function isTrackingEndpoint(url: string): boolean {
  return url.includes("/ingest") || url.includes("/api/tracking") || ...;
}
```

**Named failure trackers** for specific domains:
| Function | Tracks |
|----------|--------|
| `trackClientError()` | JS errors (message, stack, component) |
| `trackApiFailure()` | API errors (endpoint, method, status, duration) |
| `trackAuthFailure()` | Auth failures (type, email) |
| `trackPaymentFailure()` | Payment errors (provider, error, teamId) |
| `trackUploadFailure()` | Upload errors (fileType, fileSize, error) |
| `trackIntegrationError()` | Third-party integration errors |
| `trackCSPViolation()` | Content Security Policy violations |
| `trackRenderError()` | React component render errors |
| `trackNetworkError()` | Network connectivity issues |

### 2.4 Analytics Events Layer

**File:** `lib/tracking/analytics-events.ts`

Typed event definitions with three categories:

**Funnel Events** (14 events) — track user progression:
```
funnel_signup_started → funnel_signup_completed → funnel_org_created →
funnel_team_created → funnel_fund_created → funnel_first_document_uploaded →
funnel_first_link_shared → funnel_first_dataroom_created →
funnel_first_investor_added → funnel_upgrade_started → funnel_upgrade_completed
```

LP onboarding funnel:
```
funnel_lp_onboarding_started → funnel_lp_nda_signed →
funnel_lp_kyc_completed → funnel_lp_commitment_made
```

**Engagement Events** (11 events) — track feature usage:
```
page_viewed, session_started, session_ended, feature_used,
search_performed, document_viewed, dataroom_visited,
settings_changed, export_requested, notification_clicked, help_accessed
```

**Failure Events** (9 events) — track errors (documented above)

### 2.5 User Flow Tracking Integration

Tracking calls added to critical authentication flows:

**Investor Login** (`app/(auth)/login/page-client.tsx`):
- `trackFunnel("funnel_signup_started")` — on successful magic link send
- `trackFailure("auth_failure", {type: "login"})` — on auth URL error
- `trackFailure("auth_failure", {type: "unauthorized"})` — on access denied

**Organization Signup** (`app/(saas)/signup/page-client.tsx`):
- `trackFunnel("funnel_signup_started")` — on successful verification email
- `trackFailure("auth_failure", {type: "login"})` — on email send failure

**LP Sign-in** (`components/auth/lp-signin.tsx`):
- `trackFunnel("funnel_lp_onboarding_started")` — on successful magic link
- `trackFailure("auth_failure", {type: "login"})` — on sign-in failure

### 2.6 GDPR Consent Model

The tracking system respects consent in two tiers:

| Tracking Type | Requires Consent? | Reason |
|---------------|-------------------|--------|
| `trackEvent()` / `trackFunnel()` | Yes — requires analytics consent | User behavior data |
| `trackFailure()` | No — legitimate interest | Service reliability, no PII captured |
| `trackPageView()` | Yes — requires analytics consent | User navigation data |
| Rollbar server-side | No | Server-side error monitoring, no cookies |

---

## 3. Tracking Cookie Middleware

**File:** `lib/middleware/tracking.ts`

The middleware (called from `proxy.ts`) appends tracking cookies on every response:
- `fr_vid` — Persistent visitor ID (UUID, 2-year expiry)
- `fr_sid` — Session ID (30-minute sliding expiry)
- `fr_ss` — Session start timestamp (30-minute expiry)
- `fr_did` — Device ID (2-year expiry)
- `fr_utm` — UTM parameters (30-day expiry)
- `fr_ref` — Referrer URL (30-day expiry)
- `fr_lp` — Landing page (30-day expiry)

These cookies are only set after consent is given, except for the session ID which is classified as necessary.

---

## 4. Launch Health Endpoint

**File:** `pages/api/admin/launch-health.ts`

Admin-only endpoint (`GET /api/admin/launch-health`) that returns:

```json
{
  "status": "healthy|degraded|critical",
  "healthScore": 0-100,
  "healthFactors": {
    "hasUsers": 20,
    "hasDocuments": 15,
    "hasLinks": 15,
    "hasRecentViews": 20,
    "lowErrorRate": 15,
    "hasActiveTeams": 15
  },
  "metrics": {
    "users": { "total": N, "new24h": N, "new7d": N },
    "resources": { "teams": N, "documents": N, "links": N, "datarooms": N },
    "activity": { "views24h": N, "views7d": N, "views30d": N },
    "errors": { "auditErrors24h": N }
  }
}
```

---

## 5. Environment Variables Required

| Variable | Required For | Status |
|----------|-------------|--------|
| `NEXT_PUBLIC_ROLLBAR_CLIENT_TOKEN` | Client-side Rollbar | Configured |
| `ROLLBAR_SERVER_TOKEN` | Server-side Rollbar | Configured |
| `ROLLBAR_WRITE_TOKEN` | CI/CD deploy notifications | Configured (GitHub Actions) |
| `NEXT_PUBLIC_POSTHOG_KEY` | Client-side analytics | **NOT SET — all client analytics disabled** |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog API endpoint | Not set |

---

## 6. Server-Side Event Tracking (Tinybird)

**File:** `lib/tracking/server-events.ts`

Server-side events are sent to Tinybird using the `@chronark/zod-bird` SDK. Events are typed with a Zod schema and published via a datasource endpoint.

```typescript
import { publishServerEvent } from "@/lib/tracking/server-events";

// Fire-and-forget — no await
publishServerEvent("funnel_invitation_accepted", {
  userId,
  teamId,
});
```

**Available fields:**
| Field | Type | Description |
|-------|------|-------------|
| `event_name` | string (required) | Event name (auto-set) |
| `timestamp` | string (required) | ISO timestamp (auto-set) |
| `userId` | string | The acting user's ID |
| `teamId` | string | Team context |
| `orgId` | string | Organization context |
| `portal` | string | "admin" or "lp" |
| `method` | string | Auth method (e.g., "email", "google") |
| `source` | string | Event source |
| `dealId` | string | Marketplace deal ID |
| `investorId` | string | Investor ID |
| `plan` | string | Subscription plan |
| `priceId` | string | Stripe price ID |
| `errorType` | string | Error classification |
| `declineCode` | string | Payment decline code |

**Server events currently in use:**
| Event | File | Purpose |
|-------|------|---------|
| `funnel_signup_completed` | `lib/auth/auth-options.ts` | User signs in via email/OAuth |
| `funnel_lp_onboarding_started` | `pages/api/auth/[...nextauth].ts` | LP portal sign-in |
| `funnel_invitation_accepted` | `pages/api/teams/[teamId]/invitations/accept.ts` | Team invite accepted |
| `funnel_upgrade_completed` | `ee/stripe/webhooks/checkout-session-completed.ts` | Stripe subscription activated |
| `funnel_payment_failure` | `pages/api/stripe/webhook.ts` | Payment fails |

---

## 7. File Reference

| File | Purpose |
|------|---------|
| `lib/rollbar.ts` | Rollbar SDK initialization (client + server configs) |
| `lib/error.ts` | Error reporting utilities (`reportError`, `handleApiError`, etc.) |
| `lib/tracking/analytics-events.ts` | Typed event definitions and tracking functions |
| `lib/tracking/server-events.ts` | Server-side Tinybird event publishing (zod-bird SDK) |
| `lib/tracking/use-tracking.ts` | React hook for consent-aware client-side tracking |
| `lib/tracking/failure-tracker.ts` | Automatic client-side error/failure capture |
| `lib/tracking/cookie-consent.ts` | Consent preferences parsing/serialization |
| `lib/tracking/tracking-cookies.ts` | Visitor/session/UTM cookie management |
| `lib/middleware/tracking.ts` | Middleware for appending tracking cookies |
| `components/tracking/cookie-consent-banner.tsx` | GDPR cookie consent UI |
| `components/tracking/tracking-initializer.tsx` | Failure tracking auto-initialization |
| `app/providers.tsx` | App Router — mounts TrackingInitializer + CookieConsentBanner |
| `pages/_app.tsx` | Pages Router — mounts TrackingInitializer + CookieConsentBanner |
| `pages/api/admin/launch-health.ts` | Launch readiness health check endpoint |
| `app/api/tracking/consent/route.ts` | Server-side consent recording API |
| `.github/workflows/production.yml` | CI/CD with Rollbar deploy notification |

---

## 8. Testing

Test files for the tracking system:

| Test File | Covers |
|-----------|--------|
| `__tests__/lib/tracking/analytics-events.test.ts` | Event tracking functions, consent checks |
| `__tests__/lib/tracking/cookie-consent.test.ts` | Consent parsing, serialization, preferences |
| `__tests__/lib/tracking/failure-tracker.test.ts` | Error capture, dedup, fetch patching |
| `__tests__/lib/tracking/tracking-cookies.test.ts` | Cookie generation, UTM extraction |
| `__tests__/lib/tracking/middleware-tracking.test.ts` | Middleware cookie attachment |

---

## 9. Content Security Policy (CSP)

**File:** `lib/middleware/csp.ts`

The CSP explicitly allows Rollbar and PostHog domains:

**script-src:** `'self' 'unsafe-inline' 'unsafe-eval' fundroom.ai *.fundroom.ai *.bermudafranchisegroup.com *.posthog.com eu.posthog.com api.rollbar.com *.rollbar.com js.stripe.com *.plaid.com *.persona.com`

**connect-src:** `'self' *.posthog.com eu.posthog.com api.rollbar.com *.rollbar.com *.fundroom.ai *.bermudafranchisegroup.com api.stripe.com *.plaid.com api.tinybird.co ...`

Custom domains (e.g., `fundroom.bermudafranchisegroup.com`) require explicit CSP allowlisting because `'self'` only covers the requesting domain, not the asset-serving domain (`fundroom.ai`).

---

## 10. Rollbar Admin API

**File:** `pages/api/admin/rollbar-errors.ts`

Admin-only endpoint for programmatically querying Rollbar errors without leaving the app:

| Query | Purpose |
|-------|---------|
| `GET /api/admin/rollbar-errors?type=items` | List active errors with count, severity, first/last seen |
| `GET /api/admin/rollbar-errors?type=items&level=warning` | Filter by severity level |
| `GET /api/admin/rollbar-errors?type=occurrences&itemId=N` | Drill into stack traces for a specific error |
| `GET /api/admin/rollbar-errors?environment=staging` | Filter by environment |

Requires `ROLLBAR_READ_TOKEN` environment variable and admin role (`OWNER`, `ADMIN`, or `SUPER_ADMIN`).

---

## 11. Security Monitoring

Two additional systems monitor for suspicious activity. See `docs/BUG_MONITORING_TOOLS_REPORT.md` for full details.

### Anomaly Detection (`lib/security/anomaly-detection.ts`)

Detects: multiple IPs per user, rapid location changes, excessive requests, unusual access times, suspicious user agents. CRITICAL alerts block requests and log to audit.

### Rate Limiting (`lib/security/rate-limiter.ts`)

Four pre-configured limiters (signature: 5/15min, auth: 10/hr, API: 100/min, strict: 3/hr). Sets `X-RateLimit-*` response headers. Violations logged to audit.

---

## 12. Related Documentation

| Document | Coverage |
|----------|----------|
| [`docs/BUG_MONITORING_TOOLS_REPORT.md`](./BUG_MONITORING_TOOLS_REPORT.md) | Complete inventory of all 16 monitoring/testing/debugging tools |
| [`docs/DUAL_DATABASE_SPEC.md`](./DUAL_DATABASE_SPEC.md) | Backup database health check endpoint |
| [`docs/GITHUB_ACTIONS_GUIDE.md`](./GITHUB_ACTIONS_GUIDE.md) | CI/CD pipeline debugging and troubleshooting |
| `CLAUDE.md` | Project overview with bug monitoring quick reference |
