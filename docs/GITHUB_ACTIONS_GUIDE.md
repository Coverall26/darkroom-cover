# GitHub Actions & CI/CD Guide — FundRoom.ai

> **Date**: February 9, 2026
> **Status**: Active — all team members must follow these rules

> **See also:** [`docs/BUG_MONITORING_TOOLS_REPORT.md`](./BUG_MONITORING_TOOLS_REPORT.md) — Section 7 covers CI/CD pipelines for bug detection, and Section 6 covers the full Jest test suite with all 22 test scripts.

## What Happened

On February 6, 2026, **115 GitHub Actions workflow runs** got stuck in "queued" status, completely blocking all builds and deployments. No code could be deployed to production.

### Root Cause

Three issues combined to create the problem:

1. **No concurrency controls** — Every push created new workflow runs, but old ones were never cancelled. They just piled up in an ever-growing queue.

2. **Too many triggers** — Every push to *any* branch triggered 3 separate workflows (Preview Deploy, Tests, Production Deploy). A single PR with 5 commits created 15+ workflow runs.

3. **GitHub Free Plan limits** — The `Darkroom4` account is on GitHub's Free plan, which provides **2,000 minutes/month** for private repos. With so many runs queued, the available runner capacity was exhausted.

### What Was Fixed

- Added **concurrency controls** to all workflows — new runs automatically cancel older runs for the same branch
- **Preview deployments** now only trigger on pull requests (not every branch push)
- **Test workflow** only triggers on `main` branch pushes and PRs to `main`
- Cancelled all 115 stuck runs to clear the backlog

---

## Rules for Working with GitHub Actions

### Rule 1: Never Push Directly to `main`

Always work on a feature branch and create a PR. This keeps the production deployment clean.

```
# Good
git checkout -b fix/my-feature
git push origin fix/my-feature
# Then create a PR on GitHub

# Bad
git push origin main
```

### Rule 2: Squash Your Commits Before Merging

When merging a PR, always use **Squash and Merge**. This creates a single commit on `main`, triggering only one production deployment instead of one per commit.

### Rule 3: Don't Push Rapid-Fire Commits

If you're making multiple changes, batch them into one commit and push once. Every push triggers workflows that consume limited minutes.

```
# Good — one push with everything
git add .
git commit -m "Fix login page and update styles"
git push

# Bad — three separate pushes for small changes
git push  # fix typo
git push  # fix another typo
git push  # update color
```

### Rule 4: Use Draft PRs for Work in Progress

If you're not ready for a review/deploy, mark your PR as **Draft**. This prevents preview deployments from running on every push.

### Rule 5: Cancel Stuck Runs Immediately

If you see runs stuck in "queued" for more than 10 minutes:

1. Go to the repo's **Actions** tab on GitHub
2. Click on each stuck run
3. Click **Cancel workflow run** (top right)

Or ask the team lead to cancel them via the API.

---

## How Our Workflows Work

### Production Deploy (`production.yml`)

- **Triggers on**: Push to `main` only
- **What it does**: Installs deps → Generates Prisma client → Runs tests → Builds on Vercel → Deploys to production → Notifies Rollbar
- **Concurrency**: Only one production deploy runs at a time. If a new push to `main` happens while deploying, the old deploy is cancelled.

### Preview Deploy (`preview.yml`)

- **Triggers on**: Pull requests (opened, updated, reopened)
- **What it does**: Builds a preview deployment on Vercel and comments the preview URL on the PR
- **Concurrency**: One preview per branch. New pushes to the same PR cancel the previous preview build.
- **Does NOT trigger on**: Direct branch pushes (only PRs)

### Tests (`test.yml`)

- **Triggers on**: Push to `main`, PRs targeting `main`
- **What it does**: Runs linter, tests with coverage, TypeScript type checking, and a full build
- **Concurrency**: One test run per branch. New pushes cancel previous test runs.

### Integration Tests (`integration.yml`)

- **Triggers on**: Manual dispatch or weekly schedule (Monday 6 AM UTC)
- **What it does**: Runs Plaid sandbox, Persona sandbox, storage provider, and E2E API tests
- **Not affected by normal pushes** — only runs when manually triggered or on schedule

---

## GitHub Actions Minutes Budget

| Plan | Minutes/Month (Private Repos) | Our Usage |
|------|-------------------------------|-----------|
| Free | 2,000 | Current plan |
| Pro | 3,000 | Recommended upgrade |
| Team | 3,000 | For organizations |

### How Minutes Are Used

- Each workflow run uses minutes from the moment it starts until it finishes
- A typical production deploy takes ~5-8 minutes
- A test run takes ~3-5 minutes
- A preview deploy takes ~5-7 minutes
- **Queued runs do NOT consume minutes** — only running ones do

### Estimated Monthly Usage (After Fix)

With the concurrency controls in place:
- ~30 merges to main/month × 13 min (prod deploy + tests) = ~390 minutes
- ~60 PR updates/month × 5 min (preview) = ~300 minutes
- **Total: ~690 minutes/month** — well within the 2,000 minute free tier

### Before the Fix

- ~30 merges × 3 workflows × 13 min = ~1,170 minutes just for merges
- ~100+ branch pushes × 3 workflows × 8 min = ~2,400+ minutes for branches
- **Total: 3,500+ minutes/month** — exceeding the free tier every month

---

## Troubleshooting

### All runs stuck in "queued"

1. Check if the Actions minutes quota is exhausted (Settings → Billing → Actions)
2. Cancel all queued runs (Actions tab → filter by "queued" → cancel each)
3. Re-trigger only the production deploy if needed

### A build fails

1. Click on the failed run in the Actions tab
2. Expand the failing step to see the error logs
3. Common issues:
   - `npm ci` fails → Run `npm install --legacy-peer-deps` locally and commit the updated `package-lock.json`
   - Prisma generate fails → Check that `prisma/schema.prisma` is valid
   - Type check fails → Run `npx tsc --noEmit` locally and fix errors
   - Tests fail → Run `npm test` locally and fix failures

### Need to deploy urgently but Actions is down

Use the Vercel CLI directly:
```bash
npx vercel --prod
```

---

## Concurrency Configuration Reference

Each workflow file includes a `concurrency` block:

```yaml
concurrency:
  group: <group-name>
  cancel-in-progress: true
```

- `group` defines which runs compete with each other
- `cancel-in-progress: true` means a new run cancels any existing run in the same group

| Workflow | Concurrency Group | Effect |
|----------|------------------|--------|
| Production | `production-deploy` | Only one production deploy at a time, globally |
| Preview | `preview-{branch}` | One preview per branch |
| Tests | `tests-{branch}` | One test run per branch |

---

## Related Documentation

| Document | Coverage |
|----------|----------|
| [`docs/BUG_MONITORING_TOOLS_REPORT.md`](./BUG_MONITORING_TOOLS_REPORT.md) | Complete monitoring/testing/debugging tool inventory |
| [`docs/TRACKING_AND_MONITORING.md`](./TRACKING_AND_MONITORING.md) | Rollbar, PostHog, failure tracker, deploy notifications |
| [`docs/DUAL_DATABASE_SPEC.md`](./DUAL_DATABASE_SPEC.md) | Database health check endpoint |
| `CLAUDE.md` | Project overview with bug monitoring quick reference |

## Contact

- **CI/CD issues**: Check the Actions tab first, then ask in the team channel
- **Urgent deploys**: Use `npx vercel --prod` as a fallback
- **Account billing**: Contact the account owner (Darkroom4 on GitHub)
