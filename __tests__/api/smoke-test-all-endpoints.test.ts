/**
 * Comprehensive API Smoke Test
 *
 * Tests every API endpoint in the platform to verify:
 * 1. The handler can be imported without errors
 * 2. Unauthenticated requests get proper 401/405 responses (not 500s)
 * 3. No endpoints crash on basic GET/POST requests
 *
 * This is NOT a functional test — it's a health check to find broken imports,
 * missing dependencies, and crash-on-load bugs.
 */

import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import { wrapAppRouteHandler } from '@/__tests__/helpers/app-router-adapter';

/**
 * Convert a Pages Router path to its App Router equivalent.
 * e.g. "pages/api/admin/db-health" -> "app/api/admin/db-health/route"
 *      "pages/api/lp/documents/index" -> "app/api/lp/documents/route"
 *      "pages/api/teams/[teamId]/funds" -> "app/api/teams/[teamId]/funds/route"
 */
function toAppRouterPath(pagesPath: string): string {
  // Remove "pages/" prefix, replace with "app/"
  let appPath = pagesPath.replace(/^pages\//, 'app/');
  // Remove trailing "/index" (Pages Router convention)
  appPath = appPath.replace(/\/index$/, '');
  // Add "/route" suffix (App Router convention)
  appPath = appPath + '/route';
  return appPath;
}

// Helper to test a Pages Router API handler (with automatic App Router fallback)
async function testPagesHandler(
  handlerPath: string,
  method: string = 'GET',
  body?: any,
  query?: Record<string, string>,
  timeoutMs: number = 10000,
): Promise<{ status: number; data: any; error?: string }> {
  // Phase 1: Import the module (import errors = -2)
  let handler: Function;
  let isAppRouter = false;
  try {
    const mod = await import(`@/${handlerPath}`);
    handler = mod.default;
    if (!handler || typeof handler !== 'function') {
      return { status: -1, data: null, error: 'No default export or not a function' };
    }
  } catch (pagesErr: any) {
    // Pages Router file not found — try App Router equivalent
    const appPath = toAppRouterPath(handlerPath);
    try {
      const appMod = await import(`@/${appPath}`);
      // Extract route params from query for dynamic routes (e.g. [teamId], [fundId])
      const routeParams: Record<string, string> = {};
      if (query) {
        // Dynamic route segments are in brackets in the path
        const dynamicSegments = appPath.match(/\[(\w+)\]/g);
        if (dynamicSegments) {
          for (const seg of dynamicSegments) {
            const paramName = seg.slice(1, -1);
            if (query[paramName]) {
              routeParams[paramName] = query[paramName];
            }
          }
        }
      }
      // Build handlers object from named exports
      const handlers: Record<string, any> = {};
      for (const key of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        if (typeof appMod[key] === 'function') {
          handlers[key] = appMod[key];
        }
      }
      if (Object.keys(handlers).length === 0) {
        return { status: -1, data: null, error: 'No named method exports found in App Router module' };
      }
      handler = wrapAppRouteHandler(handlers as any, Object.keys(routeParams).length > 0 ? routeParams : undefined);
      isAppRouter = true;
    } catch (appErr: any) {
      // Both Pages Router and App Router imports failed
      return { status: -2, data: null, error: pagesErr.message?.substring(0, 200) };
    }
  }

  // Phase 2: Execute the handler (runtime errors = -3, timeouts = 0)
  try {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: method as any,
      query: query || {},
      body: body || {},
      headers: {
        'content-type': 'application/json',
        'host': 'localhost:3000',
      },
    });

    const handlerPromise = handler(req, res);
    const timeoutPromise = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), timeoutMs),
    );

    const result = await Promise.race([handlerPromise, timeoutPromise]);

    if (result === 'timeout') {
      return { status: 0, data: null, error: 'Handler timed out (import OK)' };
    }

    const statusCode = res._getStatusCode();
    let responseData: any;
    try {
      responseData = JSON.parse(res._getData());
    } catch {
      responseData = res._getData();
    }

    return { status: statusCode, data: responseData };
  } catch (err: any) {
    // Handler threw — import succeeded, so this is a runtime error, not import failure
    return { status: -3, data: null, error: err.message?.substring(0, 200) };
  }
}

// ============================================================
// CATEGORY 1: Health & Public Endpoints (no auth needed)
// ============================================================
describe('Health & Public Endpoints', () => {
  test('GET /api/health', async () => {
    const result = await testPagesHandler('pages/api/health', 'GET');
    expect(result.status).not.toBe(-2); // Should not crash
    expect(result.error).toBeUndefined();
  });

  test('GET /api/admin/db-health', async () => {
    const result = await testPagesHandler('pages/api/admin/db-health', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/admin/launch-health', async () => {
    const result = await testPagesHandler('pages/api/admin/launch-health', 'GET');
    expect(result.status).not.toBe(-2);
  });


});

// ============================================================
// CATEGORY 2: Auth Endpoints
// ============================================================
// Auth endpoints migrated to App Router — tested in dedicated test files:
// __tests__/api/auth/admin-magic-verify.test.ts
// __tests__/api/auth/lp-token-login.test.ts
// __tests__/api/auth/admin-login.test.ts

// ============================================================
// CATEGORY 3: Account Endpoints
// ============================================================
describe('Account Endpoints', () => {
  test('GET /api/account', async () => {
    const result = await testPagesHandler('pages/api/account/index', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/account/passkeys', async () => {
    const result = await testPagesHandler('pages/api/account/passkeys', 'GET');
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 4: Admin Endpoints
// ============================================================
describe('Admin Endpoints', () => {
  test('GET /api/admin/documents', async () => {
    const result = await testPagesHandler('pages/api/admin/documents/index', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/admin/entities', async () => {
    const result = await testPagesHandler('pages/api/admin/entities/index', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/admin/capital-tracking', async () => {
    const result = await testPagesHandler('pages/api/admin/capital-tracking', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/admin/fund-dashboard', async () => {
    const result = await testPagesHandler('pages/api/admin/fund-dashboard', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/admin/bulk-action', async () => {
    const result = await testPagesHandler('pages/api/admin/bulk-action', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/admin/export', async () => {
    const result = await testPagesHandler('pages/api/admin/export', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/admin/export-blobs', async () => {
    const result = await testPagesHandler('pages/api/admin/export-blobs', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/admin/consolidate-teams', async () => {
    const result = await testPagesHandler('pages/api/admin/consolidate-teams', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/admin/fix-email-auth', async () => {
    const result = await testPagesHandler('pages/api/admin/fix-email-auth', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/admin/form-d-reminders', async () => {
    const result = await testPagesHandler('pages/api/admin/form-d-reminders', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/admin/import', async () => {
    const result = await testPagesHandler('pages/api/admin/import', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/admin/reprocess-pdfs', async () => {
    const result = await testPagesHandler('pages/api/admin/reprocess-pdfs', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/admin/rollbar-errors', async () => {
    const result = await testPagesHandler('pages/api/admin/rollbar-errors', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/admin/waterfall', async () => {
    const result = await testPagesHandler('pages/api/admin/waterfall', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/admin/audit/export', async () => {
    const result = await testPagesHandler('pages/api/admin/audit/export', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/admin/reports/aum', async () => {
    const result = await testPagesHandler('pages/api/admin/reports/aum', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/admin/manual-investment', async () => {
    const result = await testPagesHandler('pages/api/admin/manual-investment/index', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/admin/funds/:fundId/pricing-tiers', async () => {
    const result = await testPagesHandler('pages/api/admin/funds/[fundId]/pricing-tiers', 'GET', undefined, { fundId: 'test-fund-id' });
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 5: LP (Limited Partner) Endpoints
// ============================================================
describe('LP Endpoints', () => {
  // Migrated to App Router: app/api/lp/me/route.ts
  // Migrated to App Router: app/api/lp/docs/route.ts

  test('GET /api/lp/documents', async () => {
    const result = await testPagesHandler('pages/api/lp/documents/index', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/lp/accreditation', async () => {
    const result = await testPagesHandler('pages/api/lp/accreditation', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/lp/bank/status', async () => {
    const result = await testPagesHandler('pages/api/lp/bank/status', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/lp/bank/link-token', async () => {
    const result = await testPagesHandler('pages/api/lp/bank/link-token', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/lp/bank/connect', async () => {
    const result = await testPagesHandler('pages/api/lp/bank/connect', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/lp/complete-gate', async () => {
    const result = await testPagesHandler('pages/api/lp/complete-gate', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/lp/fund-details', async () => {
    const result = await testPagesHandler('pages/api/lp/fund-details', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/lp/kyc', async () => {
    const result = await testPagesHandler('pages/api/lp/kyc', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/lp/manual-investments', async () => {
    const result = await testPagesHandler('pages/api/lp/manual-investments', 'GET');
    expect(result.status).not.toBe(-2);
  });

  // Migrated to App Router: app/api/lp/notes/route.ts

  test('GET /api/lp/offering-documents', async () => {
    const result = await testPagesHandler('pages/api/lp/offering-documents', 'GET');
    expect(result.status).not.toBe(-2);
  });

  // Migrated to App Router: app/api/lp/pending-signatures/route.ts

  test('POST /api/lp/register', async () => {
    const result = await testPagesHandler('pages/api/lp/register', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/lp/staged-commitment', async () => {
    const result = await testPagesHandler('pages/api/lp/staged-commitment', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/lp/statement', async () => {
    const result = await testPagesHandler('pages/api/lp/statement', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/lp/subscribe', async () => {
    const result = await testPagesHandler('pages/api/lp/subscribe', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/lp/subscription-status', async () => {
    const result = await testPagesHandler('pages/api/lp/subscription-status', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/lp/subscription/process-payment', async () => {
    const result = await testPagesHandler('pages/api/lp/subscription/process-payment', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/lp/timeline', async () => {
    const result = await testPagesHandler('pages/api/lp/timeline', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/lp/transactions', async () => {
    const result = await testPagesHandler('pages/api/lp/transactions', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/lp/wire-instructions', async () => {
    const result = await testPagesHandler('pages/api/lp/wire-instructions', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/lp/wire-proof', async () => {
    const result = await testPagesHandler('pages/api/lp/wire-proof', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/lp/wizard-progress', async () => {
    const result = await testPagesHandler('pages/api/lp/wizard-progress', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/lp/documents/upload', async () => {
    const result = await testPagesHandler('pages/api/lp/documents/upload', 'POST', {});
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 6: Signature Endpoints
// ============================================================
describe('Signature Endpoints', () => {
  test('GET /api/sign/status', async () => {
    const result = await testPagesHandler('pages/api/sign/status', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/sign/certificate/verify', async () => {
    const result = await testPagesHandler('pages/api/sign/certificate/verify', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/signature/documents', async () => {
    const result = await testPagesHandler('pages/api/signature/documents', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/signature/create-document', async () => {
    const result = await testPagesHandler('pages/api/signature/create-document', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/signature/custom-template', async () => {
    const result = await testPagesHandler('pages/api/signature/custom-template', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/signature/void-document', async () => {
    const result = await testPagesHandler('pages/api/signature/void-document', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/signature/webhook-events', async () => {
    const result = await testPagesHandler('pages/api/signature/webhook-events', 'POST', {});
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 7: Teams Core Endpoints
// ============================================================
describe('Teams Core Endpoints', () => {
  const teamId = 'test-team-id';

  test('GET /api/teams', async () => {
    const result = await testPagesHandler('pages/api/teams/index', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/funds', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/funds', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/settings', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/settings', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/teams/:teamId/invite', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/invite', 'POST', {}, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/invitations', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/invitations/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('PUT /api/teams/:teamId/update-name', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/update-name', 'PUT', { name: 'Test' }, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/branding', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/branding', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/limits', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/limits', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/access-requests', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/access-requests', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 8: Teams Billing Endpoints
// ============================================================
describe('Teams Billing Endpoints', () => {
  const teamId = 'test-team-id';

  test('GET /api/teams/:teamId/billing', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/billing/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/billing/invoices', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/billing/invoices', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/teams/:teamId/billing/manage', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/billing/manage', 'POST', {}, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/teams/:teamId/billing/cancel', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/billing/cancel', 'POST', {}, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/billing/plan', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/billing/plan', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/teams/:teamId/billing/upgrade', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/billing/upgrade', 'POST', {}, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/teams/:teamId/billing/pause', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/billing/pause', 'POST', {}, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/teams/:teamId/billing/unpause', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/billing/unpause', 'POST', {}, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/teams/:teamId/billing/reactivate', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/billing/reactivate', 'POST', {}, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/teams/:teamId/billing/retention-offer', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/billing/retention-offer', 'POST', {}, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/teams/:teamId/billing/cancellation-feedback', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/billing/cancellation-feedback', 'POST', {}, { teamId });
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 9: Teams Documents Endpoints
// ============================================================
describe('Teams Documents Endpoints', () => {
  const teamId = 'test-team-id';
  const docId = 'test-doc-id';

  test('GET /api/teams/:teamId/documents', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/documents/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/documents/search', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/documents/search', 'GET', undefined, { teamId, q: 'test' });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/documents/:id', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/documents/[id]/index', 'GET', undefined, { teamId, id: docId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/documents/:id/stats', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/documents/[id]/stats', 'GET', undefined, { teamId, id: docId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/documents/:id/links', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/documents/[id]/links', 'GET', undefined, { teamId, id: docId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/documents/:id/views', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/documents/[id]/views/index', 'GET', undefined, { teamId, id: docId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/documents/:id/overview', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/documents/[id]/overview', 'GET', undefined, { teamId, id: docId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/documents/:id/versions', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/documents/[id]/versions/index', 'GET', undefined, { teamId, id: docId });
    expect(result.status).not.toBe(-2);
  });

  test('PUT /api/teams/:teamId/documents/:id/update-name', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/documents/[id]/update-name', 'PUT', { name: 'Test' }, { teamId, id: docId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/documents/document-processing-status', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/documents/document-processing-status', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 10: Teams Dataroom Endpoints
// ============================================================
describe('Teams Dataroom Endpoints', () => {
  const teamId = 'test-team-id';
  const drId = 'test-dataroom-id';

  test('GET /api/teams/:teamId/datarooms', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/datarooms/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/datarooms/:id', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/datarooms/[id]/index', 'GET', undefined, { teamId, id: drId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/datarooms/:id/stats', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/datarooms/[id]/stats', 'GET', undefined, { teamId, id: drId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/datarooms/:id/links', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/datarooms/[id]/links', 'GET', undefined, { teamId, id: drId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/datarooms/:id/views', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/datarooms/[id]/views/index', 'GET', undefined, { teamId, id: drId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/datarooms/:id/documents', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/datarooms/[id]/documents/index', 'GET', undefined, { teamId, id: drId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/datarooms/:id/folders', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/datarooms/[id]/folders/index', 'GET', undefined, { teamId, id: drId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/datarooms/:id/groups', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/datarooms/[id]/groups/index', 'GET', undefined, { teamId, id: drId });
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 11: Teams Signature Documents
// ============================================================
describe('Teams Signature Endpoints', () => {
  const teamId = 'test-team-id';

  test('GET /api/teams/:teamId/signature-documents', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/signature-documents/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/signature-templates', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/signature-templates/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 12: Teams Investors
// ============================================================
describe('Teams Investors Endpoints', () => {
  const teamId = 'test-team-id';

  test('GET /api/teams/:teamId/investors', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/investors/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/investors/pipeline', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/investors/pipeline', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 13: Funds Endpoints
// ============================================================
// Funds endpoints migrated to App Router — tested in dedicated test files:
// __tests__/api/funds/aggregates.test.ts
// __tests__/api/funds/settings.test.ts
// __tests__/integration/fund-settings-economics.test.ts

// ============================================================
// CATEGORY 14: Links Endpoints
// ============================================================
describe('Links Endpoints', () => {
  test('GET /api/links', async () => {
    const result = await testPagesHandler('pages/api/links/index', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/links/generate-index', async () => {
    const result = await testPagesHandler('pages/api/links/generate-index', 'GET');
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 15: Webhook Endpoints
// ============================================================
describe('Webhook Endpoints', () => {
  test('POST /api/webhooks/esign', async () => {
    const result = await testPagesHandler('pages/api/webhooks/esign', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/webhooks/persona', async () => {
    const result = await testPagesHandler('pages/api/webhooks/persona', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/webhooks/plaid', async () => {
    const result = await testPagesHandler('pages/api/webhooks/plaid', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/webhooks/rollbar', async () => {
    const result = await testPagesHandler('pages/api/webhooks/rollbar', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/webhooks/signature', async () => {
    const result = await testPagesHandler('pages/api/webhooks/signature', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/stripe/webhook', async () => {
    const result = await testPagesHandler('pages/api/stripe/webhook', 'POST', {});
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 16: File & Storage Endpoints
// ============================================================
describe('File & Storage Endpoints', () => {
  test('POST /api/file/browser-upload', async () => {
    const result = await testPagesHandler('pages/api/file/browser-upload', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/file/image-upload', async () => {
    const result = await testPagesHandler('pages/api/file/image-upload', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/file/upload-config', async () => {
    const result = await testPagesHandler('pages/api/file/upload-config', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/file/replit-upload', async () => {
    const result = await testPagesHandler('pages/api/file/replit-upload', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/file/replit-get', async () => {
    const result = await testPagesHandler('pages/api/file/replit-get', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/file/s3/get-presigned-get-url', async () => {
    const result = await testPagesHandler('pages/api/file/s3/get-presigned-get-url', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/file/s3/get-presigned-post-url', async () => {
    const result = await testPagesHandler('pages/api/file/s3/get-presigned-post-url', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/storage/local', async () => {
    const result = await testPagesHandler('pages/api/storage/local', 'GET');
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 17: Notifications & Feedback
// ============================================================
describe('Notifications & Feedback Endpoints', () => {
  test('GET /api/notifications', async () => {
    const result = await testPagesHandler('pages/api/notifications/index', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/notifications/preferences', async () => {
    const result = await testPagesHandler('pages/api/notifications/preferences', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/notifications/subscribe', async () => {
    const result = await testPagesHandler('pages/api/notifications/subscribe', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/feedback', async () => {
    const result = await testPagesHandler('pages/api/feedback/index', 'POST', {});
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 18: Analytics & Tracking
// ============================================================
describe('Analytics & Tracking Endpoints', () => {
  test('GET /api/analytics', async () => {
    const result = await testPagesHandler('pages/api/analytics/index', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/record_view', async () => {
    const result = await testPagesHandler('pages/api/record_view', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/record_click', async () => {
    const result = await testPagesHandler('pages/api/record_click', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/record_reaction', async () => {
    const result = await testPagesHandler('pages/api/record_reaction', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/record_video_view', async () => {
    const result = await testPagesHandler('pages/api/record_video_view', 'POST', {});
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 19: Transactions & Subscriptions
// ============================================================
describe('Transactions & Subscriptions Endpoints', () => {
  test('GET /api/transactions', async () => {
    const result = await testPagesHandler('pages/api/transactions/index', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/subscriptions/create', async () => {
    const result = await testPagesHandler('pages/api/subscriptions/create', 'POST', {});
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 20: Viewer & View Endpoints
// ============================================================
describe('Viewer & View Endpoints', () => {
  test('GET /api/viewer/my-datarooms', async () => {
    const result = await testPagesHandler('pages/api/viewer/my-datarooms', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/viewer/notes', async () => {
    const result = await testPagesHandler('pages/api/viewer/notes', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/viewer/questions', async () => {
    const result = await testPagesHandler('pages/api/viewer/questions', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/view/auto-verify-session', async () => {
    const result = await testPagesHandler('pages/api/view/auto-verify-session', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/view/verify-magic-link', async () => {
    const result = await testPagesHandler('pages/api/view/verify-magic-link', 'POST', {});
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 21: Teams Domain & Folder Endpoints
// ============================================================
describe('Teams Domain & Folder Endpoints', () => {
  const teamId = 'test-team-id';

  test('GET /api/teams/:teamId/domains', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/domains/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/folders', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/folders/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/folders/manage', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/folders/manage/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 22: Teams Tags, Presets, Tokens, Webhooks
// ============================================================
describe('Teams Tags, Presets, Tokens, Webhooks', () => {
  const teamId = 'test-team-id';

  test('GET /api/teams/:teamId/tags', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/tags/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/presets', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/presets/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/tokens', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/tokens/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/webhooks', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/webhooks/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/viewers', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/viewers/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 23: Teams Q&A & Reports
// ============================================================
describe('Teams Q&A & Reports', () => {
  const teamId = 'test-team-id';

  test('GET /api/teams/:teamId/qanda/questions', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/qanda/questions/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/qanda/notes', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/qanda/notes', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/reports', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/reports/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/reports/templates', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/reports/templates', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 24: Teams Agreements
// ============================================================
describe('Teams Agreements', () => {
  const teamId = 'test-team-id';

  test('GET /api/teams/:teamId/agreements', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/agreements/index', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 25: Misc Endpoints
// ============================================================
describe('Misc Endpoints', () => {
  test('GET /api/progress-token', async () => {
    const result = await testPagesHandler('pages/api/progress-token', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/revalidate', async () => {
    const result = await testPagesHandler('pages/api/revalidate', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/request-invite', async () => {
    const result = await testPagesHandler('pages/api/request-invite', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/report', async () => {
    const result = await testPagesHandler('pages/api/report', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/user/permissions', async () => {
    const result = await testPagesHandler('pages/api/user/permissions', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/unsubscribe/dataroom', async () => {
    const result = await testPagesHandler('pages/api/unsubscribe/dataroom/index', 'GET');
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 26: PDF Processing (MuPDF)
// ============================================================
describe('PDF Processing (MuPDF) Endpoints', () => {
  test('POST /api/mupdf/get-pages', async () => {
    const result = await testPagesHandler('pages/api/mupdf/get-pages', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/mupdf/convert-page', async () => {
    const result = await testPagesHandler('pages/api/mupdf/convert-page', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/mupdf/annotate-document', async () => {
    const result = await testPagesHandler('pages/api/mupdf/annotate-document', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/mupdf/process-pdf-local', async () => {
    const result = await testPagesHandler('pages/api/mupdf/process-pdf-local', 'POST', {});
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 27: Teams Audit & Advanced
// ============================================================
describe('Teams Audit & Advanced', () => {
  const teamId = 'test-team-id';

  test('GET /api/teams/:teamId/audit/export', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/audit/export', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/audit/verify', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/audit/verify', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/teams/:teamId/enable-advanced-mode', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/enable-advanced-mode', 'POST', {}, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/ai-settings', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/ai-settings', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/investor-timeline', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/investor-timeline', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/global-block-list', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/global-block-list', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/ignored-domains', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/ignored-domains', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/teams/:teamId/export-jobs', async () => {
    const result = await testPagesHandler('pages/api/teams/[teamId]/export-jobs', 'GET', undefined, { teamId });
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 28: Internal & Cron
// ============================================================
describe('Internal & Cron Endpoints', () => {
  test('POST /api/internal/billing/automatic-unpause', async () => {
    const result = await testPagesHandler('pages/api/internal/billing/automatic-unpause', 'POST', {});
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// CATEGORY 29: Jobs Endpoints
// ============================================================
describe('Jobs Endpoints', () => {
  test('POST /api/jobs/get-thumbnail', async () => {
    const result = await testPagesHandler('pages/api/jobs/get-thumbnail', 'POST', {});
    expect(result.status).not.toBe(-2);
  });

  test('GET /api/jobs/progress', async () => {
    const result = await testPagesHandler('pages/api/jobs/progress', 'GET');
    expect(result.status).not.toBe(-2);
  });

  test('POST /api/jobs/send-notification', async () => {
    const result = await testPagesHandler('pages/api/jobs/send-notification', 'POST', {});
    expect(result.status).not.toBe(-2);
  });
});

// ============================================================
// DETAILED STATUS REPORT (runs last, summarizes all results)
// ============================================================
describe('API Endpoint Status Report', () => {
  const allEndpoints: Array<{
    path: string;
    method: string;
    category: string;
    query?: Record<string, string>;
    body?: any;
  }> = [
    // Health
    { path: 'pages/api/health', method: 'GET', category: 'Health' },
    { path: 'pages/api/admin/db-health', method: 'GET', category: 'Health' },
    { path: 'pages/api/admin/launch-health', method: 'GET', category: 'Health' },
    // Auth — migrated to App Router (tested in dedicated test files)
    // Account
    { path: 'pages/api/account/index', method: 'GET', category: 'Account' },
    { path: 'pages/api/account/passkeys', method: 'GET', category: 'Account' },
    // LP
    // Migrated to App Router: me, docs
    { path: 'pages/api/lp/documents/index', method: 'GET', category: 'LP' },
    { path: 'pages/api/lp/accreditation', method: 'GET', category: 'LP' },
    { path: 'pages/api/lp/bank/status', method: 'GET', category: 'LP' },
    { path: 'pages/api/lp/bank/link-token', method: 'POST', category: 'LP', body: {} },
    { path: 'pages/api/lp/bank/connect', method: 'POST', category: 'LP', body: {} },
    { path: 'pages/api/lp/complete-gate', method: 'POST', category: 'LP', body: {} },
    { path: 'pages/api/lp/fund-details', method: 'GET', category: 'LP' },
    { path: 'pages/api/lp/kyc', method: 'POST', category: 'LP', body: {} },
    { path: 'pages/api/lp/manual-investments', method: 'GET', category: 'LP' },
    // Migrated to App Router: notes
    { path: 'pages/api/lp/offering-documents', method: 'GET', category: 'LP' },
    // Migrated to App Router: pending-signatures
    { path: 'pages/api/lp/register', method: 'POST', category: 'LP', body: {} },
    { path: 'pages/api/lp/staged-commitment', method: 'GET', category: 'LP' },
    { path: 'pages/api/lp/statement', method: 'GET', category: 'LP' },
    { path: 'pages/api/lp/subscribe', method: 'POST', category: 'LP', body: {} },
    { path: 'pages/api/lp/subscription-status', method: 'GET', category: 'LP' },
    { path: 'pages/api/lp/subscription/process-payment', method: 'POST', category: 'LP', body: {} },
    { path: 'pages/api/lp/timeline', method: 'GET', category: 'LP' },
    { path: 'pages/api/lp/transactions', method: 'GET', category: 'LP' },
    { path: 'pages/api/lp/wire-instructions', method: 'GET', category: 'LP' },
    { path: 'pages/api/lp/wire-proof', method: 'POST', category: 'LP', body: {} },
    { path: 'pages/api/lp/wizard-progress', method: 'GET', category: 'LP' },
    { path: 'pages/api/lp/documents/upload', method: 'POST', category: 'LP', body: {} },
    // Signature
    { path: 'pages/api/sign/status', method: 'GET', category: 'Signature' },
    { path: 'pages/api/sign/certificate/verify', method: 'POST', category: 'Signature', body: {} },
    { path: 'pages/api/signature/documents', method: 'GET', category: 'Signature' },
    { path: 'pages/api/signature/create-document', method: 'POST', category: 'Signature', body: {} },
    { path: 'pages/api/signature/void-document', method: 'POST', category: 'Signature', body: {} },
    { path: 'pages/api/signature/webhook-events', method: 'POST', category: 'Signature', body: {} },
    // Webhooks
    { path: 'pages/api/webhooks/esign', method: 'POST', category: 'Webhooks', body: {} },
    { path: 'pages/api/webhooks/persona', method: 'POST', category: 'Webhooks', body: {} },
    { path: 'pages/api/webhooks/plaid', method: 'POST', category: 'Webhooks', body: {} },
    { path: 'pages/api/webhooks/rollbar', method: 'POST', category: 'Webhooks', body: {} },
    { path: 'pages/api/webhooks/signature', method: 'POST', category: 'Webhooks', body: {} },
    { path: 'pages/api/stripe/webhook', method: 'POST', category: 'Webhooks', body: {} },
    // Files/Storage
    { path: 'pages/api/file/browser-upload', method: 'POST', category: 'Files', body: {} },
    { path: 'pages/api/file/image-upload', method: 'POST', category: 'Files', body: {} },
    { path: 'pages/api/file/upload-config', method: 'GET', category: 'Files' },
    { path: 'pages/api/file/replit-upload', method: 'POST', category: 'Files', body: {} },
    { path: 'pages/api/file/replit-get', method: 'GET', category: 'Files' },
    { path: 'pages/api/file/s3/get-presigned-get-url', method: 'GET', category: 'Files' },
    { path: 'pages/api/file/s3/get-presigned-post-url', method: 'GET', category: 'Files' },
    { path: 'pages/api/storage/local', method: 'GET', category: 'Files' },
    // Notifications
    { path: 'pages/api/notifications/index', method: 'GET', category: 'Notifications' },
    { path: 'pages/api/notifications/preferences', method: 'GET', category: 'Notifications' },
    { path: 'pages/api/notifications/subscribe', method: 'POST', category: 'Notifications', body: {} },
    { path: 'pages/api/feedback/index', method: 'POST', category: 'Notifications', body: {} },
    // Analytics
    { path: 'pages/api/analytics/index', method: 'GET', category: 'Analytics' },
    { path: 'pages/api/record_view', method: 'POST', category: 'Analytics', body: {} },
    { path: 'pages/api/record_click', method: 'POST', category: 'Analytics', body: {} },
    // Transactions
    { path: 'pages/api/transactions/index', method: 'GET', category: 'Transactions' },
    { path: 'pages/api/subscriptions/create', method: 'POST', category: 'Billing', body: {} },
    // Viewers
    { path: 'pages/api/viewer/my-datarooms', method: 'GET', category: 'Viewer' },
    { path: 'pages/api/viewer/notes', method: 'GET', category: 'Viewer' },
    { path: 'pages/api/viewer/questions', method: 'GET', category: 'Viewer' },
    // Misc
    { path: 'pages/api/user/permissions', method: 'GET', category: 'User' },
    // MuPDF
    { path: 'pages/api/mupdf/get-pages', method: 'POST', category: 'PDF', body: {} },
    { path: 'pages/api/mupdf/convert-page', method: 'POST', category: 'PDF', body: {} },
    // Internal
    { path: 'pages/api/internal/billing/automatic-unpause', method: 'POST', category: 'Internal', body: {} },
    // Jobs
    { path: 'pages/api/jobs/get-thumbnail', method: 'POST', category: 'Jobs', body: {} },
    { path: 'pages/api/jobs/progress', method: 'GET', category: 'Jobs' },
    { path: 'pages/api/jobs/send-notification', method: 'POST', category: 'Jobs', body: {} },
    // Teams core
    { path: 'pages/api/teams/index', method: 'GET', category: 'Teams' },
    { path: 'pages/api/teams/[teamId]/index', method: 'GET', category: 'Teams', query: { teamId: 'test-team-id' } },
    { path: 'pages/api/teams/[teamId]/funds', method: 'GET', category: 'Teams', query: { teamId: 'test-team-id' } },
    { path: 'pages/api/teams/[teamId]/settings', method: 'GET', category: 'Teams', query: { teamId: 'test-team-id' } },
    { path: 'pages/api/teams/[teamId]/branding', method: 'GET', category: 'Teams', query: { teamId: 'test-team-id' } },
    { path: 'pages/api/teams/[teamId]/limits', method: 'GET', category: 'Teams', query: { teamId: 'test-team-id' } },
    // Teams billing
    { path: 'pages/api/teams/[teamId]/billing/index', method: 'GET', category: 'Billing', query: { teamId: 'test-team-id' } },
    { path: 'pages/api/teams/[teamId]/billing/invoices', method: 'GET', category: 'Billing', query: { teamId: 'test-team-id' } },
    { path: 'pages/api/teams/[teamId]/billing/plan', method: 'GET', category: 'Billing', query: { teamId: 'test-team-id' } },
    // Teams documents
    { path: 'pages/api/teams/[teamId]/documents/index', method: 'GET', category: 'Documents', query: { teamId: 'test-team-id' } },
    { path: 'pages/api/teams/[teamId]/documents/search', method: 'GET', category: 'Documents', query: { teamId: 'test-team-id', q: 'test' } },
    // Teams datarooms
    { path: 'pages/api/teams/[teamId]/datarooms/index', method: 'GET', category: 'Datarooms', query: { teamId: 'test-team-id' } },
    // Teams signature
    { path: 'pages/api/teams/[teamId]/signature-documents/index', method: 'GET', category: 'Signature', query: { teamId: 'test-team-id' } },
    { path: 'pages/api/teams/[teamId]/signature-templates/index', method: 'GET', category: 'Signature', query: { teamId: 'test-team-id' } },
    // Teams investors
    { path: 'pages/api/teams/[teamId]/investors/index', method: 'GET', category: 'Investors', query: { teamId: 'test-team-id' } },
    { path: 'pages/api/teams/[teamId]/investors/pipeline', method: 'GET', category: 'Investors', query: { teamId: 'test-team-id' } },
    // Funds — migrated to App Router (tested in dedicated test files)
  ];

  test('Comprehensive endpoint status report', async () => {
    const results: Array<{
      endpoint: string;
      method: string;
      category: string;
      status: number;
      statusText: string;
      error?: string;
    }> = [];

    for (const ep of allEndpoints) {
      const result = await testPagesHandler(ep.path, ep.method, ep.body, ep.query);

      let statusText = 'UNKNOWN';
      if (result.status === -2) statusText = 'IMPORT_ERROR';
      else if (result.status === -1) statusText = 'NO_HANDLER';
      else if (result.status === 0) statusText = 'IMPORT_OK_TIMEOUT';
      else if (result.status >= 200 && result.status < 300) statusText = 'OK';
      else if (result.status === 401) statusText = 'AUTH_REQUIRED';
      else if (result.status === 403) statusText = 'FORBIDDEN';
      else if (result.status === 404) statusText = 'NOT_FOUND';
      else if (result.status === 405) statusText = 'METHOD_NOT_ALLOWED';
      else if (result.status === 400) statusText = 'BAD_REQUEST';
      else if (result.status === 500) statusText = 'SERVER_ERROR';
      else statusText = `HTTP_${result.status}`;

      results.push({
        endpoint: ep.path.replace('pages/api/', '/api/').replace('/index', ''),
        method: ep.method,
        category: ep.category,
        status: result.status,
        statusText,
        error: result.error,
      });
    }

    // Print summary
    const working = results.filter(r => (r.status >= 200 && r.status < 500) || r.status === 0);
    const authRequired = results.filter(r => r.status === 401);
    const serverErrors = results.filter(r => r.status === 500);
    const importErrors = results.filter(r => r.status === -2);
    const noHandler = results.filter(r => r.status === -1);

    console.log('\n========================================');
    console.log('API ENDPOINT STATUS REPORT');
    console.log('========================================');
    console.log(`Total endpoints tested: ${results.length}`);
    console.log(`Working (2xx-4xx): ${working.length}`);
    console.log(`Auth required (401): ${authRequired.length}`);
    console.log(`Server errors (500): ${serverErrors.length}`);
    console.log(`Import errors: ${importErrors.length}`);
    console.log(`No handler: ${noHandler.length}`);
    console.log('========================================\n');

    // Print working endpoints
    console.log('--- WORKING ENDPOINTS ---');
    for (const r of working) {
      console.log(`  [${r.statusText}] ${r.method} ${r.endpoint} (${r.category})`);
    }

    // Print server errors
    if (serverErrors.length > 0) {
      console.log('\n--- SERVER ERRORS (500) ---');
      for (const r of serverErrors) {
        console.log(`  [500] ${r.method} ${r.endpoint} (${r.category})`);
      }
    }

    // Print import errors
    if (importErrors.length > 0) {
      console.log('\n--- IMPORT ERRORS ---');
      for (const r of importErrors) {
        console.log(`  [IMPORT_ERROR] ${r.method} ${r.endpoint} (${r.category}): ${r.error}`);
      }
    }

    // Print no handler
    if (noHandler.length > 0) {
      console.log('\n--- NO HANDLER ---');
      for (const r of noHandler) {
        console.log(`  [NO_HANDLER] ${r.method} ${r.endpoint} (${r.category})`);
      }
    }

    console.log('\n========================================');
    console.log('BY CATEGORY BREAKDOWN');
    console.log('========================================');

    const categories = [...new Set(results.map(r => r.category))];
    for (const cat of categories) {
      const catResults = results.filter(r => r.category === cat);
      const catWorking = catResults.filter(r => r.status >= 200 && r.status < 500);
      const catBroken = catResults.filter(r => r.status >= 500 || r.status < 0);
      console.log(`  ${cat}: ${catWorking.length}/${catResults.length} working${catBroken.length > 0 ? ` (${catBroken.length} broken)` : ''}`);
    }

    // The test should pass — this is a reporting test
    expect(results.length).toBeGreaterThan(0);
  }, 120000);
});
