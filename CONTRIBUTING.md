# Contributing to FundRoom

## Getting Started

### Prerequisites

- Node.js 22.x
- npm (included with Node.js)
- PostgreSQL access (Supabase or local)
- Git

### Local Setup

```bash
# Install dependencies
npm install --legacy-peer-deps

# Copy environment variables
cp .env.example .env
# Fill in required values (see docs/DEPLOYMENT.md for env var guide)

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Seed development data
npx ts-node prisma/seed-bermuda.ts

# Start development server
npm run dev
```

---

## Branch Naming

Use descriptive branch names with the following prefixes:

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feature/` | New features | `feature/lp-dashboard-export` |
| `fix/` | Bug fixes | `fix/wire-proof-status` |
| `security/` | Security fixes | `security/rate-limit-auth` |
| `refactor/` | Code refactoring | `refactor/approval-pipeline` |
| `docs/` | Documentation only | `docs/api-reference` |
| `test/` | Test additions/fixes | `test/investor-review-e2e` |

Branch from `main` for all work. Delete branches after merge.

---

## Commit Conventions

Write clear, descriptive commit messages. Use the imperative mood.

### Format

```
<type>: <short description>

<optional body with details>
```

### Types

| Type | Use Case |
|------|----------|
| `feat` | New feature |
| `fix` | Bug fix |
| `security` | Security fix |
| `refactor` | Code refactoring (no behavior change) |
| `test` | Adding or updating tests |
| `docs` | Documentation changes |
| `chore` | Build, CI, dependency updates |
| `perf` | Performance improvement |

### Examples

```
feat: add GP approval queue dashboard with inline actions

fix: wire proof status should be PROOF_UPLOADED not PENDING

security: wrap verify-link in $transaction to prevent race condition

test: add 17 tests for manual investor entry API
```

---

## Pull Request Process

### Before Opening a PR

1. **Run the type checker**: `npm run typecheck` (must pass with 0 errors)
2. **Run tests**: `npm test` (must pass all 5,066+ tests)
3. **Check for lint errors**: `npm run lint`
4. **Update documentation** (see Documentation Requirements below)

### PR Format

```markdown
## Summary
- Brief description of what changed and why

## Changes
- List of specific changes made

## Test Plan
- [ ] Tests added/updated for new functionality
- [ ] Existing tests still pass
- [ ] Manual testing steps (if applicable)

## Documentation
- [ ] CLAUDE.md implementation status updated
- [ ] Other affected docs updated (list which ones)
```

### Review Checklist

- [ ] No `console.log` statements left in production code (gated behind `AUTH_DEBUG` is acceptable)
- [ ] All API catch blocks call `reportError()` and return generic error messages
- [ ] Multi-tenant isolation: queries filter by `teamId`/`orgId`
- [ ] RBAC checks on all admin routes (OWNER/ADMIN/SUPER_ADMIN)
- [ ] No secrets or PII in error responses or logs
- [ ] Input validation via Zod on all API endpoints
- [ ] Audit logging on all mutations via `logAuditEvent()`

---

## Code Style

### General

- TypeScript strict mode. No `any` types without justification.
- Prefer functional patterns over classes.
- Use Zod for all input validation.
- Use Prisma ORM for all database operations. No raw SQL.

### File Organization

```
lib/           → Business logic, utilities, services
components/    → React components (organized by domain)
pages/api/     → Pages Router API routes (legacy, majority of routes)
app/api/       → App Router API routes (new routes go here)
app/           → Next.js pages and layouts
__tests__/     → Jest tests (mirror source structure)
ee/            → Enterprise features
prisma/        → Schema, migrations, seeds
docs/          → Documentation
```

### API Route Patterns

**Pages Router** (existing routes):
```typescript
import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Business logic here
    return res.status(200).json({ data });
  } catch (error) {
    reportError(error as Error);
    console.error("Handler failed:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
```

**App Router** (new routes):
```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { reportError } from "@/lib/error";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Business logic here
    return NextResponse.json({ data });
  } catch (error) {
    reportError(error as Error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

### Error Response Standard (H-06)

All error responses use `{ error: "message" }` format. Never `{ message: "..." }`.

- **4xx errors**: Specific, user-facing messages
- **5xx errors**: Always `"Internal server error"` (details go to Rollbar)
- **Never** expose `error.message`, `error.stack`, or Zod validation details in responses

### Component Patterns

- Use shadcn/ui components from `components/ui/`
- Follow brand colors from `FundRoom_Brand_Guidelines.md`
- Mobile-first: touch targets >= 44px, text-base on mobile (prevents iOS zoom)
- Dark mode support: use `dark:` Tailwind variants

---

## Testing Requirements

### What Needs Tests

- All new API routes (at minimum: method enforcement, auth check, happy path, error case)
- Business logic in `lib/` (unit tests)
- Complex components with user interaction (React Testing Library)

### Running Tests

```bash
npm test                  # Run all tests
npm run test:api          # API tests only
npm run test:lib          # Library tests only
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

### Test File Location

Mirror the source structure under `__tests__/`:
```
lib/funds/tranches.ts          → __tests__/lib/funds/tranches.test.ts
pages/api/lp/register.ts       → __tests__/api/lp/register.test.ts
app/api/funds/create/route.ts  → __tests__/api/funds/create.test.ts
```

### Mock Patterns

Global Prisma mock is configured in `jest.setup.ts`. Add new model mocks there when needed:
```typescript
// jest.setup.ts
prisma.newModel = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
};
```

---

## Documentation Requirements

**Every code change must include corresponding documentation updates.** This is a mandatory part of the PR process.

### Checklist

1. **`CLAUDE.md` Implementation Status**: Add new features to the appropriate section with file paths and notes
2. **`CLAUDE.md` Reference Documents**: Add new docs to the reference list if applicable
3. **`docs/FundRoom_Claude_Code_Handoff.md`**: Add dated changelog entry
4. **`README.md`**: Update architecture tree and metrics if structure changed
5. **Domain-specific docs**: Update relevant docs in `/docs/` (database, monitoring, CI/CD, etc.)

### When to Update

- During the same commit as the code change (preferred)
- At minimum, before the end of the session
- Never defer documentation to "later"

---

## Database Changes

### Schema Modifications

1. Edit `prisma/schema.prisma`
2. Create migration: `npx prisma migrate dev --name descriptive_name`
3. Regenerate client: `npx prisma generate`
4. Update seed scripts if needed (`prisma/seed-bermuda.ts`)
5. Document new models/fields in `CLAUDE.md`

### Migration Naming

Use snake_case with descriptive names:
```
20260215_add_org_setup_fields
20260214_add_investor_entity_fields
20260213_add_lp_onboarding_settings
```

### Schema Rules

- Every table must have `createdAt` and `updatedAt`
- Use `onDelete: Restrict` for financial records (investments, transactions, audit logs, signature documents)
- Use `onDelete: Cascade` only for non-critical data
- Add composite indexes for common query patterns
- Encrypt sensitive fields (SSN, EIN, bank details) with AES-256

---

## Security Guidelines

- Never return `error.message` or `error.stack` to clients
- Always call `reportError()` in catch blocks
- Use `getServerSession()` for authentication (not custom cookies)
- Validate all inputs with Zod schemas
- Filter all queries by `teamId`/`orgId` for multi-tenant isolation
- Rate limit auth endpoints and sensitive operations
- Log all mutations via `logAuditEvent()`
- Never commit `.env` files or secrets
- Run `npm audit` periodically (target: 0 vulnerabilities)

---

## CI/CD

GitHub Actions runs 4 workflows:

| Workflow | Trigger | Checks |
|----------|---------|--------|
| Test | PR to main | TypeScript, Jest, lint |
| Production | Push to main | Full build + deploy to Vercel |
| Preview | PR branch | Preview deployment |
| Integration | Manual | End-to-end tests |

PRs must pass the Test workflow before merge. See `docs/GITHUB_ACTIONS_GUIDE.md` for debugging CI failures.
