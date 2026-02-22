# FundRoom.ai — Multi-Tenant SaaS Platform

## CROSS-REFERENCE: CLAUDE.md
> **IMPORTANT:** Always read `CLAUDE.md` before starting any work. It is the canonical source of truth for this project — containing the full implementation status, all session summaries, reference document index, non-negotiable principles, and mandatory documentation update procedures. This file (`replit.md`) is the condensed build guide. Keep both files in sync — any metric or build rule change in one must be reflected in the other.

## Overview
FundRoom.ai is a multi-tenant SaaS platform designed for General Partners (GPs) and startups. Its core purpose is to serve as a central financial infrastructure, streamlining crucial operations such as fundraising, investor onboarding, secure document management, compliance, and capital movement. The platform provides customized workspaces, simplifies investor invitations, and offers optional branding with custom domains, aiming to efficiently connect capital with opportunities.

## User Preferences
- Communication: Simple, everyday language
- Technical level: Non-technical explanations preferred
- Focus: Security and ease of use for investors
- Git remote: `Darkroom4/darkroom` (NOT BermudaClub/darkroom)
- Push method: GitHub API with GITHUB_PAT secret (git push blocked by large file in history)
- Always run `npx tsc --noEmit` before pushing to avoid Vercel build failures

## Demo Credentials (Development/Staging)
- **GP Login:** joe@bermudafranchisegroup.com / FundRoom2026!
- **LP Login:** demo-investor@example.com / Investor2026!
- **Admin Login:** rciesco@fundroom.ai / (see ADMIN_TEMP_PASSWORD secret)
- **Dataroom URL:** /d/bermuda-club-fund

## Showcase Components (Reference for Building)
Located at `components/showcase/` — these are pre-built UI reference components:
- `dashboard-showcase.jsx` (685 lines) — GP Dashboard animated showcase: sidebar nav, stats, tranche chart, investor table, activity feed, notifications
- `fundroom-wizard.jsx` (1,716 lines) — GP Org Setup Wizard reference (V2 canonical is 9 steps at `app/admin/setup/`) + LP Onboarding Wizard (6 steps) with all shared UI components
- `tranche-pricing-chart.jsx` (518 lines) — Interactive tranche pricing visualization with 3 view modes

Full wizard documentation with Claude Code integration prompt: `docs/GP_LP_Wizard_Reference.md`

Use these as **reference patterns** when building production dashboard, wizard, and chart features. They contain the correct UX flows, data structures, and component patterns.

## System Architecture

### Tech Stack
- **Framework**: Next.js 16.x (Pages Router + App Router)
- **Frontend**: React 19, TypeScript 5, Tailwind CSS 3.4, shadcn/ui
- **Database**: PostgreSQL via Prisma 6.x ORM (Supabase primary)
- **Auth**: NextAuth.js v4 (email/password, magic links, Google OAuth, LinkedIn OAuth)
- **Rate Limiting**: Upstash Redis via `@upstash/ratelimit`
- **Error Monitoring**: Rollbar (server + client)
- **Analytics**: Tinybird (server events) + PostHog (client) + Vercel Analytics
- **E-Signature**: FundRoom Sign (native, zero external cost)
- **Deployment**: Vercel (Next.js, Node 22.x, auto-deploy from `main` branch)
- **Testing**: Jest 30 + React Testing Library

### Key Architectural Decisions
- **Domain Architecture**: Host-based routing (`proxy.ts`) supporting marketing, main application, admin portal, login portal, and custom-branded organization portals.
- **Dual-Database Architecture**: Primary Supabase Postgres with Replit Postgres as an async hot backup, managed by a Prisma extension chain. `BACKUP_DB_ENABLED=false` for production.
- **Multi-Tenancy**: Data is hierarchically organized (`Organization` -> `Team` -> `Fund/Raise` -> `User`) and all data rows are scoped by `org_id`.
- **Operating Modes**: Supports GP FUND (LPA-based), STARTUP (SAFE/priced rounds), and DATAROOM_ONLY (free tier).
- **Authentication**: NextAuth.js with JWT sessions and `requireAdminAccess` guards.
- **Branding**: Supports FundRoom-only branding and dynamic custom branding for organization portals based on the domain. Platform assets in `public/_static/` and `public/icons/fundroom/`; customer assets stored in cloud storage (S3/Vercel Blob) via `Brand` model. Branding data is deliberately duplicated between Organization (org-wide defaults) and Brand (team-specific overrides) for architecture rationale.
- **Settings Inheritance**: `org_defaults` -> `fund_overrides` -> `object_overrides` resolved at runtime.

### Technical Implementations
- **Encryption**: AES-256 field-level encryption for sensitive data.
- **E-Signature**: Native FundRoom Sign with audit trails, certificate generation, PDF flattening, sequential signing, and ESIGN/UETA consent.
- **Wire Confirmation**: Atomic `prisma.$transaction` for GP wire receipt confirmation; LP proof-of-payment upload with GP review.
- **Investor Entity Architecture**: 7 entity types with Zod validation, dynamic forms, and per-entity accreditation criteria.
- **Document Upload & GP Review**: LP uploads compliance documents; GP approves/rejects/requests revision.
- **Regulation D Compliance**: Exemption selector, Form D tracking with amendment reminders and JSON/CSV export.
- **SEC Compliance**: Bad Actor 506(d) certification, 8 investor representations, 506(c) enhanced accreditation, immutable SHA-256 hash-chained audit log.
- **Audit Logging**: Prisma extension for immutable, hash-chained organization and signature audit logs.
- **Storage**: Supports multiple providers including S3, Vercel Blob, Replit Object Storage, and local storage, with dual-provider capability.
- **Rate Limiter**: Redis-backed, fail-open, 10-tier rate limiting system protecting all API routes via blanket middleware and per-route limiters.
- **Custom Domain Middleware**: Handles routing for custom domains, bypassing dataroom rewrite logic for authentication and API routes.
- **Error Reporting**: `reportError` utility for consistent logging; all HTTP 500 responses return generic "Internal server error" with full error sanitization.
- **Cookie Security**: All cookies have `Secure` flag in production; session cookie centralized.
- **Cascade Delete Safety**: Financial and compliance models use `onDelete: Restrict` to prevent accidental data loss.
- **Paywall**: Implements feature gating with 4-level bypass. Datarooms are free; LP onboarding, e-signature, commitments, and wire confirmation require activation.
- **RBAC**: 6 roles (OWNER, SUPER_ADMIN, ADMIN, MANAGER, MEMBER, LP) with `enforceRBAC()`/`requireAdmin()` middleware.
- **GP Setup Wizard (V2)**: 9-step modular wizard located at `app/admin/setup/`.

### Recent Changes (Feb 21, 2026)
- **Document Template HTML Merge Field System**: 23 merge field tags, template renderer, entity auto-fill, default NDA/Sub Agreement HTML templates, DocumentTemplate model + migration.
- **Funding Round/Tranche wizard**: Dual-mode UI for startup planned rounds and GP fund pricing tiers (Step 6).
- **Pages Router cleanup**: 86 orphaned Pages Router API files removed (migrated to App Router).
- **App Router adapter**: New test helper `__tests__/helpers/app-router-adapter.ts` for testing App Router endpoints.
- **FundingStructurePreview chart**: Interactive tranche pricing visualization component.
- **Schema migration**: 4 new fields -- Fund: `investmentCompanyExemption`, `useOfProceeds`, `salesCommissions`; Organization: `productMode`.
- **Completion API**: Persists all new fields (productMode, relatedPersons, previousNamesList, SEC fields).

### Recent Changes (Feb 17-20, 2026)
- **Transaction.fundId FK**: Added proper foreign key constraint from Transaction to Fund (was plain String without FK). Migration `20260216_add_transaction_fund_fk`.
- **PlatformSettings model**: New singleton model for platform-wide configuration (paywall enforcement, maintenance mode, registration toggle). Migration `20260216_add_platform_settings`.
- **Platform paywall toggle**: `GET/PATCH /api/admin/platform/settings` -- owner-only endpoint for DB-driven paywall control (replaces env-only PAYWALL_BYPASS).
- **Per-org activation management**: `GET/PATCH /api/teams/[teamId]/fundroom-activation` -- owner-only endpoint for suspend/deactivate/reactivate actions.
- **Paywall middleware upgrade**: Now checks 4 bypass levels (env var -> platform DB -> time-limited bypass -> per-org activation). 60-second in-memory cache for platform settings. `clearPlatformSettingsCache()` export. `getActivationStatus()` helper for UI.
- **Deep Project Review verification**: GP Setup Wizard V2 confirmed production-ready (17 files, 5,094 lines, zero issues).

### Recent Changes (Feb 16, 2026 -- Earlier)
- **GP Setup Wizard V1->V2 Final Cleanup**: Deleted 7 orphaned V1 components, renamed step files to match step numbers, added missing review content (Integrations card, startup instrument details, marketplace opt-in badge).
- **V1->V2 Merge Verification**: All 12 V2 wizard files reviewed, 128/129 checklist items verified, 4 issues found and fixed.
- **Deep Project Review**: Comprehensive review doc at `docs/DEEP_PROJECT_REVIEW_FEB16_2026.md`.

### Critical Notes for Development
- **Middleware:** `proxy.ts` is the ONLY middleware entry point. Do NOT create `middleware.ts` -- Next.js 16 will crash.
- **Prisma:** Run `npx prisma generate` after any schema changes before TypeScript checking.
- **GitHub sync:** Files pushed via GitHub REST API do NOT auto-sync to Replit workspace. Verify local files match remote after pushes.
- **TypeScript check:** Always run `npx tsc --noEmit` before pushing to catch build errors early.

### Platform Metrics (Current -- Feb 22, 2026)
- **Prisma models:** 139+ | **Schema lines:** 5,748+ | **Columns:** ~1,800+ | **Indexes:** 530+ | **Enums:** 90+ | **Migrations:** 29+
- **API routes:** 593+ (Pages Router: 379 + App Router: 214+)
- **GP Setup Wizard:** 14 files, ~5,500+ lines (9 step components + 3 shared + layout + page at `app/admin/setup/` + 4 APIs at `app/api/setup/`)
- **CRM Billing:** 15 files, ~4,700 lines (8 libraries + 4 API routes + 1 webhook + 1 script + 1 test)
- **E-Signature Shared Drive:** 15 files, ~3,500 lines (4 lib/esign/ + 9 app/api/esign/ + schema: 5 models, 6 enums)
- **Document Templates:** 5 new files (merge-fields.ts, template-renderer.ts, autofill.ts, 2 HTML templates)
- **Test files:** 182 | **Total tests:** 5,201+ across 182 suites
- **TypeScript errors:** 0 | **npm vulnerabilities:** 0
- **Feature completion:** ~99%+

## External Dependencies
- **Email**: Resend (2-tier: platform @fundroom.ai + org-branded)
- **KYC**: Persona (adapter built, self-acknowledge for MVP)
- **ACH**: Plaid (Phase 2 -- manual wire for MVP)
- **Analytics**: Tinybird, PostHog, Vercel Analytics
- **Billing**: Stripe (Phase 2 -- using PAYWALL_BYPASS for MVP launch)
- **Error Monitoring**: Rollbar (3 tokens: read, server, client)
- **Authentication**: Google OAuth (dual credentials: FundRoom primary, BFG fallback)
- **Deployment/Hosting**: Vercel (5 production domains, API access via VERCEL_TOKEN)
- **Storage**: S3 + CloudFront (primary), Vercel Blob (Vercel deploys), Replit Object Storage (dev)
