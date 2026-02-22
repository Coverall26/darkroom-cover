# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in FundRoom, please report it responsibly. **Do not open a public GitHub issue for security vulnerabilities.**

### Contact

Email: **security@fundroom.ai**

### What to Include

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any suggested remediation (optional)

### Response Timeline

| Stage | Timeframe |
|-------|-----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Remediation plan | Within 10 business days |
| Fix deployed | Varies by severity (Critical: 24-48h, High: 1 week, Medium: 2 weeks) |

### Scope

The following are in scope for responsible disclosure:

- `app.fundroom.ai` and all platform subdomains
- API endpoints (`/api/*`)
- Authentication and authorization flows
- Data encryption and storage
- Multi-tenant isolation boundaries

The following are **out of scope**:

- Third-party services (Supabase, Vercel, Stripe, Resend, Persona)
- Social engineering attacks
- Denial of service attacks
- Issues requiring physical access

---

## Security Architecture

FundRoom handles SEC-regulated financial data including PII (SSN, EIN), bank details, and investor accreditation records. Security is implemented as defense-in-depth across multiple layers.

### Encryption

#### Data at Rest

| Data Type | Encryption Method | Key Source |
|-----------|------------------|------------|
| SSN / EIN (tax IDs) | AES-256-GCM | `NEXT_PRIVATE_ENCRYPTION_KEY` |
| Bank account numbers | AES-256-GCM | `NEXT_PRIVATE_ENCRYPTION_KEY` |
| Wire instructions | AES-256-GCM | `NEXT_PRIVATE_ENCRYPTION_KEY` |
| API keys / secrets | AES-256-GCM | `NEXT_PRIVATE_ENCRYPTION_KEY` |
| Signed PDFs | AES-256-GCM | `NEXT_PRIVATE_DOCUMENT_PASSWORD_KEY` |
| Database (Supabase) | AES-256 (provider-managed) | Supabase infrastructure |
| S3 objects | AES-256 (KMS-managed) | AWS KMS per-org prefixes |

**Key derivation**: PBKDF2 with 100,000 iterations, 256-bit salt.

#### Data in Transit

- TLS 1.3 enforced on all connections
- HSTS with 2-year max-age, includeSubDomains, and preload
- All cookies use `Secure` flag in production

#### Client-Side Encryption

- Web Crypto API with AES-256-GCM for e-signature data
- Signature images encrypted before upload
- Key derivation via PBKDF2 (100,000 iterations)

#### PDF-Level Encryption

- PDF 2.0 encryption standard via pdf-lib
- User/owner password support
- Permission controls: high-resolution printing allowed, copying and modifying disabled

### Authentication

| Method | Implementation | Location |
|--------|---------------|----------|
| Email / Password | NextAuth CredentialsProvider, bcrypt (12 salt rounds) | `lib/auth/auth-options.ts` |
| Google OAuth | NextAuth GoogleProvider (dual credential support) | `lib/auth/auth-options.ts` |
| Magic Links | Token-based email verification | `pages/api/auth/verify-link.ts` |
| LP One-Time Tokens | 64-char hex, 5-minute expiry, single-use | `pages/api/auth/lp-token-login.ts` |
| WebAuthn / Passkeys | FIDO2 via @github/webauthn-json | `pages/api/passkeys/register.ts` |

**Session management**: NextAuth JWT tokens with `__Secure-` cookie prefix in production. Session cookies are HttpOnly, Secure, SameSite=Lax.

**Admin portal protection** (3 layers):
1. `requireAdminPortalAccess()` checks team membership (OWNER/ADMIN/SUPER_ADMIN)
2. JWT `loginPortal` claim must be "ADMIN"
3. Non-admin users redirected to `/viewer-portal`

### Authorization (RBAC)

| Role | Access Level |
|------|-------------|
| OWNER | Full org access, billing, team management |
| SUPER_ADMIN | All admin functions except billing |
| ADMIN | Fund management, investor management, settings |
| MANAGER | Investor pipeline, document review |
| MEMBER | Read-only dashboard access |

**Multi-tenant isolation**: Every database query filters by `org_id` or `teamId`. Every API route verifies team membership via `withTeamAuth` or `getServerSession` + role check.

### Rate Limiting

Rate limiting is Redis-backed via Upstash (fail-open when Redis unavailable). A 10-tier system protects all 447 API routes.

| Tier | Limiter | Limit | Scope |
|------|---------|-------|-------|
| Blanket (middleware) | `blanketLimiter` | 200 req/min/IP | ALL /api/ routes (proxy.ts safety net) |
| Auth | `authRateLimiter` | 10 req/hour | Auth endpoints (login, verify, register) |
| Strict | `strictRateLimiter` | 3 req/hour | Password setup, MFA enrollment, admin ops |
| MFA Verify | `mfaVerifyRateLimiter` | 5 req/15min | TOTP verification (brute-force protection) |
| Signature | `signatureRateLimiter` | 5 req/15min | E-signature operations |
| Upload | `uploadRateLimiter` | 20 req/min | File upload endpoints |
| API | `apiRateLimiter` | 100 req/min | General LP/tracking endpoints |
| App Router | `appRouterRateLimit` | 100 req/min | App Router standard endpoints |
| App Router Upload | `appRouterUploadRateLimit` | 20 req/min | App Router file upload endpoints |
| Custom Redis | `registrationLimiter` | 5 req/min | LP registration |

**Exempt from blanket limiting:** `/api/health`, `/api/webhooks/*`, `/api/stripe/webhook`, `/api/cron/*`, `/api/jobs/*`.

### Security Headers

Applied globally via `vercel.json`:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), microphone=(), geolocation=()
```

**Content Security Policy** is configured in `lib/middleware/csp.ts` with allowlists for Rollbar, PostHog, Tinybird, and Vercel Analytics.

**Dynamic CORS** validates origins against platform domains. Credentials are only allowed with explicit origin matching.

### Additional Security Controls

| Control | Implementation |
|---------|---------------|
| CSRF protection | Token validation via `lib/security/csrf.ts` |
| Bot protection | Vercel Bot ID via `lib/security/bot-protection.ts` |
| Anomaly detection | Suspicious activity detection via `lib/security/anomaly-detection.ts` |
| Input validation | Zod schemas on all API endpoints |
| Error sanitization | All 500 responses return generic messages; details logged server-side to Rollbar |
| SQL injection | Prisma ORM parameterized queries (no raw SQL) |

---

## Audit Trail

All mutations are audit logged with the following data:

- `teamId` (multi-tenant isolation)
- `userId` (actor)
- `eventType` (one of 60+ defined event types)
- `resourceType` and `resourceId` (what was affected)
- `ip` and `userAgent` (request origin)
- `timestamp` (ISO 8601)
- `metadata` (JSON, event-specific details)

### Immutable Audit Log

For SEC 506(c) compliance, the audit log implements SHA-256 hash chaining:

- Each entry contains `previousHash` and `currentHash`
- Hash chains are isolated per team (multi-tenant)
- Sequence numbers are monotonically increasing BigInt values
- Chain integrity is verifiable via `GET /api/teams/:teamId/audit/verify`
- Export with integrity checksums via `POST /api/teams/:teamId/audit/export`
- Configurable retention: 1-10 years (default 7 years for SEC compliance)

### Audit Event Types

Categories include: document lifecycle (viewed, downloaded, signed, completed), subscription events, accreditation verification, capital calls and distributions, investor management (CRUD, review, approval), KYC/AML, bank linking, authentication events, certificate generation, fund operations, and settings changes.

---

## Data Classification

| Classification | Examples | Encryption | Retention |
|---------------|----------|------------|-----------|
| **Restricted** | SSN, EIN, bank account numbers, API keys | AES-256-GCM at rest + TLS in transit | Per org policy |
| **Confidential** | Investor profiles, commitment amounts, fund terms | Database encryption (Supabase) + TLS | 7+ years (SEC) |
| **Internal** | Audit logs, analytics, team settings | Database encryption | Configurable (1-10 years) |
| **Public** | Dataroom links (with access controls), marketing content | TLS in transit | N/A |

---

## Compliance

### SEC Regulations

- **Rule 506(b)**: Up to 35 non-accredited investors, no general solicitation
- **Rule 506(c)**: Accredited investors only, general solicitation allowed, verification required
- **Regulation A+**: Tier 1 ($20M) / Tier 2 ($75M)
- **Rule 504**: Up to $10M in 12 months
- **Form D**: Data capture fields mapped in schema, deadline reminders via email

### E-Signature Compliance

- **ESIGN Act**: Electronic consent records, signature audit trail
- **UETA**: Consent confirmation modal with legal language
- **SHA-256 checksums** on all signed documents
- **Certificate of Completion** embedded in flattened PDFs

### Data Protection

- GDPR cookie consent banner with tracking opt-in/opt-out
- No PII in analytics events (Tinybird server events are fire-and-forget, no PII)
- Client-side tracking respects cookie consent state

---

## Infrastructure Security

| Layer | Provider | Security Features |
|-------|----------|-------------------|
| Hosting | Vercel | Edge network, DDoS protection, automatic TLS |
| Database | Supabase (PostgreSQL) | Row-level security, encrypted at rest, connection pooling |
| Storage | AWS S3 + CloudFront | KMS encryption, per-org key prefixes, signed URLs |
| Email | Resend | DKIM/SPF/DMARC, org-branded domains |
| Monitoring | Rollbar | Server + client error tracking (no PII in payloads) |
| DNS | Cloudflare (via Vercel) | DNS-level DDoS protection |

### Environment Variables

108 environment variables are documented in `.env.example`. Secrets are stored in Vercel environment variables (encrypted, never exposed in GET responses). The `PAYWALL_BYPASS` flag is for MVP development only and must be removed before production launch.

---

## Incident Response

1. **Detection**: Rollbar alerts, anomaly detection, audit log monitoring
2. **Triage**: Assess severity (Critical/High/Medium/Low) and blast radius
3. **Containment**: Rate limiting escalation, session invalidation, API key rotation
4. **Remediation**: Deploy fix, verify via automated tests (5,066+ tests)
5. **Post-mortem**: Document in session summary, update security controls

---

## Dependencies

Security-relevant dependencies are regularly audited via `npm audit`. As of Feb 18, 2026: **10 moderate vulnerabilities** (all in eslint/ajv dev toolchain — not shipped to production).

Key security dependencies:
- `bcrypt` (password hashing, 12 salt rounds)
- `@upstash/ratelimit` (Redis-backed rate limiting — 10-tier system covering all 447 API routes)
- `next-auth` (authentication framework)
- `zod` (input validation)
- `pdf-lib` (PDF manipulation, no external API calls)
- `rollbar` (error monitoring)
