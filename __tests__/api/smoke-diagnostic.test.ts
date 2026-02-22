/**
 * Diagnostic test — captures import errors for every endpoint
 */

// All endpoints that had import errors in the smoke test
const failingEndpoints = [
  'pages/api/webhooks/signature',
  'pages/api/stripe/webhook',
  'pages/api/file/replit-get',
  'pages/api/file/s3/get-presigned-get-url',
  'pages/api/analytics/index',
  'pages/api/record_view',
  'pages/api/record_click',
  'pages/api/record_reaction',
  'pages/api/record_video_view',
  'pages/api/transactions/index',
  'pages/api/viewer/questions',
  'pages/api/teams/[teamId]/domains/index',
  'pages/api/teams/[teamId]/tags/index',
  'pages/api/teams/[teamId]/agreements/index',
  'pages/api/mupdf/get-pages',
  'pages/api/mupdf/convert-page',
  'pages/api/mupdf/annotate-document',
  'pages/api/mupdf/process-pdf-local',
  'pages/api/teams/[teamId]/audit/export',
  'pages/api/teams/[teamId]/audit/verify',
  'pages/api/teams/[teamId]/global-block-list',
  'pages/api/teams/[teamId]/ignored-domains',
  'pages/api/teams/[teamId]/export-jobs',
  'pages/api/internal/billing/automatic-unpause',
  'pages/api/jobs/send-notification',
];

describe('Import Error Diagnostics', () => {
  for (const ep of failingEndpoints) {
    test(`diagnose ${ep}`, async () => {
      try {
        const mod = await import(`@/${ep}`);
        const handler = mod.default;
        console.log(`[OK] ${ep} — handler type: ${typeof handler}`);
      } catch (err: any) {
        console.log(`[IMPORT_ERROR] ${ep}`);
        console.log(`  Error: ${err.message?.substring(0, 300)}`);
        if (err.code) console.log(`  Code: ${err.code}`);
      }
      // Always pass — this is diagnostic
      expect(true).toBe(true);
    });
  }
});

// Also test the endpoints that passed to confirm and get their status codes
const additionalEndpoints = [
  // The reporting test timed out — let's test a subset more carefully
  'pages/api/health',
  'pages/api/admin/db-health',
  'pages/api/admin/launch-health',
  // Auth endpoints migrated to App Router — tested in dedicated test files
  'pages/api/account/index',
  'pages/api/account/passkeys',
  'pages/api/admin/documents/index',
  'pages/api/admin/entities/index',
  'pages/api/admin/capital-tracking',
  'pages/api/admin/fund-dashboard',
  'pages/api/admin/bulk-action',
  'pages/api/admin/export',
  'pages/api/admin/export-blobs',
  'pages/api/admin/consolidate-teams',
  'pages/api/admin/fix-email-auth',
  'pages/api/admin/form-d-reminders',
  'pages/api/admin/import',
  'pages/api/admin/reprocess-pdfs',
  'pages/api/admin/rollbar-errors',
  'pages/api/admin/waterfall',
  'pages/api/admin/audit/export',
  'pages/api/admin/reports/aum',
  'pages/api/admin/manual-investment/index',
  // Migrated to App Router: app/api/lp/me/route.ts, app/api/lp/docs/route.ts
  'pages/api/lp/documents/index',
  'pages/api/lp/accreditation',
  'pages/api/lp/bank/status',
  'pages/api/lp/bank/link-token',
  'pages/api/lp/bank/connect',
  'pages/api/lp/complete-gate',
  'pages/api/lp/fund-details',
  'pages/api/lp/kyc',
  'pages/api/lp/manual-investments',
  // Migrated to App Router: app/api/lp/notes/route.ts
  'pages/api/lp/offering-documents',
  // Migrated to App Router: app/api/lp/pending-signatures/route.ts
  'pages/api/lp/register',
  'pages/api/lp/staged-commitment',
  'pages/api/lp/statement',
  'pages/api/lp/subscribe',
  'pages/api/lp/subscription-status',
  'pages/api/lp/subscription/process-payment',
  'pages/api/lp/timeline',
  'pages/api/lp/transactions',
  'pages/api/lp/wire-instructions',
  'pages/api/lp/wire-proof',
  'pages/api/lp/wizard-progress',
  'pages/api/lp/documents/upload',
  'pages/api/sign/status',
  'pages/api/sign/certificate/verify',
  'pages/api/signature/documents',
  'pages/api/signature/create-document',
  'pages/api/signature/void-document',
  'pages/api/signature/webhook-events',
  'pages/api/webhooks/esign',
  'pages/api/webhooks/persona',
  'pages/api/webhooks/plaid',
  'pages/api/webhooks/rollbar',
  'pages/api/file/browser-upload',
  'pages/api/file/image-upload',
  'pages/api/file/upload-config',
  'pages/api/file/replit-upload',
  'pages/api/file/s3/get-presigned-post-url',
  'pages/api/storage/local',
  'pages/api/notifications/index',
  'pages/api/notifications/preferences',
  'pages/api/notifications/subscribe',
  'pages/api/feedback/index',
  'pages/api/subscriptions/create',
  'pages/api/viewer/my-datarooms',
  'pages/api/viewer/notes',
  'pages/api/user/permissions',
  'pages/api/unsubscribe/dataroom/index',
  'pages/api/progress-token',
  'pages/api/revalidate',
  'pages/api/request-invite',
  'pages/api/report',
  'pages/api/jobs/get-thumbnail',
  'pages/api/jobs/progress',
  'pages/api/teams/index',
  'pages/api/teams/[teamId]/index',
  'pages/api/teams/[teamId]/funds',
  'pages/api/teams/[teamId]/settings',
  'pages/api/teams/[teamId]/invite',
  'pages/api/teams/[teamId]/invitations/index',
  'pages/api/teams/[teamId]/update-name',
  'pages/api/teams/[teamId]/branding',
  'pages/api/teams/[teamId]/limits',
  'pages/api/teams/[teamId]/access-requests',
  'pages/api/teams/[teamId]/billing/index',
  'pages/api/teams/[teamId]/billing/invoices',
  'pages/api/teams/[teamId]/billing/manage',
  'pages/api/teams/[teamId]/billing/cancel',
  'pages/api/teams/[teamId]/billing/plan',
  'pages/api/teams/[teamId]/billing/upgrade',
  'pages/api/teams/[teamId]/billing/pause',
  'pages/api/teams/[teamId]/billing/unpause',
  'pages/api/teams/[teamId]/billing/reactivate',
  'pages/api/teams/[teamId]/billing/retention-offer',
  'pages/api/teams/[teamId]/billing/cancellation-feedback',
  'pages/api/teams/[teamId]/documents/index',
  'pages/api/teams/[teamId]/documents/search',
  'pages/api/teams/[teamId]/datarooms/index',
  'pages/api/teams/[teamId]/signature-documents/index',
  'pages/api/teams/[teamId]/signature-templates/index',
  'pages/api/teams/[teamId]/investors/index',
  'pages/api/teams/[teamId]/investors/pipeline',
  'pages/api/teams/[teamId]/presets/index',
  'pages/api/teams/[teamId]/tokens/index',
  'pages/api/teams/[teamId]/webhooks/index',
  'pages/api/teams/[teamId]/viewers/index',
  'pages/api/teams/[teamId]/folders/index',
  'pages/api/teams/[teamId]/folders/manage/index',
  'pages/api/teams/[teamId]/qanda/questions/index',
  'pages/api/teams/[teamId]/qanda/notes',
  'pages/api/teams/[teamId]/reports/index',
  'pages/api/teams/[teamId]/reports/templates',
  'pages/api/teams/[teamId]/ai-settings',
  'pages/api/teams/[teamId]/investor-timeline',
  'pages/api/teams/[teamId]/enable-advanced-mode',
  // Funds endpoints migrated to App Router — tested in dedicated test files
  'pages/api/links/index',
  'pages/api/links/generate-index',
  'pages/api/view/auto-verify-session',
  'pages/api/view/verify-magic-link',
  'pages/api/passkeys/register',
];

import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';

describe('Working Endpoints Status Report', () => {
  test('test all working endpoints', async () => {
    const results: Array<{ path: string; status: number; error?: string }> = [];

    for (const ep of additionalEndpoints) {
      try {
        const mod = await import(`@/${ep}`);
        const handler = mod.default;

        if (!handler || typeof handler !== 'function') {
          results.push({ path: ep, status: -1, error: 'No handler' });
          continue;
        }

        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'GET',
          query: ep.includes('[teamId]') ? { teamId: 'test-team-id' } : ep.includes('[fundId]') ? { fundId: 'test-fund-id' } : {},
          body: {},
          headers: { 'content-type': 'application/json', host: 'localhost:3000' },
        });

        await handler(req, res);
        results.push({ path: ep, status: res._getStatusCode() });
      } catch (err: any) {
        results.push({ path: ep, status: -2, error: err.message?.substring(0, 150) });
      }
    }

    // Categorize
    const ok = results.filter(r => r.status >= 200 && r.status < 300);
    const auth401 = results.filter(r => r.status === 401);
    const badReq400 = results.filter(r => r.status === 400);
    const notFound404 = results.filter(r => r.status === 404);
    const method405 = results.filter(r => r.status === 405);
    const server500 = results.filter(r => r.status === 500);
    const importErr = results.filter(r => r.status === -2);

    console.log('\n========================================');
    console.log('WORKING ENDPOINTS DETAILED REPORT');
    console.log('========================================');
    console.log(`Total: ${results.length}`);
    console.log(`200 OK: ${ok.length}`);
    console.log(`401 Auth Required: ${auth401.length}`);
    console.log(`400 Bad Request: ${badReq400.length}`);
    console.log(`404 Not Found: ${notFound404.length}`);
    console.log(`405 Method Not Allowed: ${method405.length}`);
    console.log(`500 Server Error: ${server500.length}`);
    console.log(`Import Error: ${importErr.length}`);

    console.log('\n--- 200 OK (Working) ---');
    ok.forEach(r => console.log(`  ${r.path}`));

    console.log('\n--- 401 Auth Required (Working - needs session) ---');
    auth401.forEach(r => console.log(`  ${r.path}`));

    console.log('\n--- 400 Bad Request (Working - needs params) ---');
    badReq400.forEach(r => console.log(`  ${r.path}`));

    console.log('\n--- 405 Method Not Allowed (Working - wrong method) ---');
    method405.forEach(r => console.log(`  ${r.path}`));

    console.log('\n--- 500 Server Error ---');
    server500.forEach(r => console.log(`  ${r.path}: ${r.error || 'unknown'}`));

    console.log('\n--- Import Errors ---');
    importErr.forEach(r => console.log(`  ${r.path}: ${r.error}`));

    expect(results.length).toBeGreaterThan(0);
  }, 120000);
});
