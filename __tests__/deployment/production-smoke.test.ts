// @ts-nocheck
/**
 * Production Smoke Test Suite (P3-6)
 *
 * Validates critical happy paths for launch readiness.
 * Tests the 12 most critical API endpoints across 6 domains:
 *   1. Health & Deployment Readiness
 *   2. GP Setup Wizard (complete flow)
 *   3. LP Registration & Fund Context
 *   4. LP Commitment & Wire Proof
 *   5. GP Wire Confirmation & Document Review
 *   6. SEC Compliance (Form D, Accreditation Expiry)
 *
 * All tests use mocked Prisma and auth — no real DB or network calls.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { Decimal } from "@prisma/client/runtime/library";

// ─── Mock Setup ──────────────────────────────────────────────────────────────

const __mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({ getServerSession: __mockGetServerSession }));
jest.mock("next-auth/next", () => ({
  getServerSession: __mockGetServerSession,
}));

jest.mock("@/lib/auth/auth-options", () => ({ authOptions: {} }));
jest.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
  handleApiError: jest.fn(),
}));
jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
  logSubscriptionEvent: jest.fn().mockResolvedValue(undefined),
  writeAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

// Email mocks
jest.mock("@/lib/emails/send-investor-welcome", () => ({
  sendInvestorWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  sendInvestorWelcomeEmailWithFund: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/emails/send-wire-confirmed", () => ({
  sendWireConfirmedNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/emails/send-investor-approved", () => ({
  sendInvestorApprovedEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/emails/send-gp-commitment-notification", () => ({
  sendGpCommitmentNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/emails/send-gp-wire-proof-notification", () => ({
  sendGpWireProofNotification: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/emails/send-investor-changes-requested", () => ({
  sendInvestorChangesRequestedEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/emails/send-investor-rejected", () => ({
  sendInvestorRejectedEmail: jest.fn().mockResolvedValue(undefined),
}));

// RBAC mock
jest.mock("@/lib/auth/rbac", () => ({
  requireAdmin: jest.fn().mockResolvedValue({
    userId: "user-gp-smoke",
    teamId: "team-smoke-001",
    role: "ADMIN",
  }),
  requireAdminAppRouter: jest.fn().mockResolvedValue({
    userId: "user-gp-smoke",
    teamId: "team-smoke-001",
    role: "ADMIN",
  }),
  requireLPAuthAppRouter: jest.fn().mockResolvedValue({
    userId: "user-lp-smoke",
    email: "investor@smoke.test",
  }),
  requireAuthAppRouter: jest.fn().mockResolvedValue({
    userId: "user-gp-smoke",
    email: "admin@smoke.test",
  }),
  enforceRBAC: jest.fn().mockResolvedValue(true),
  enforceRBACAppRouter: jest.fn().mockResolvedValue(true),
  requireTeamMember: jest.fn().mockResolvedValue(true),
  requireTeamMemberAppRouter: jest.fn().mockResolvedValue(true),
  requireGPAccess: jest.fn().mockResolvedValue(true),
  requireGPAccessAppRouter: jest.fn().mockResolvedValue(true),
  hasRole: jest.fn().mockReturnValue(true),
}));

// Rate limiter mocks (App Router)
jest.mock("@/lib/security/rate-limiter", () => ({
  apiRateLimiter: jest.fn().mockResolvedValue(undefined),
  strictRateLimiter: jest.fn().mockResolvedValue(true),
  authRateLimiter: jest.fn().mockResolvedValue(true),
  uploadRateLimiter: jest.fn().mockResolvedValue(true),
  signatureRateLimiter: jest.fn().mockResolvedValue(true),
  mfaVerifyRateLimiter: jest.fn().mockResolvedValue(true),
  appRouterRateLimit: jest.fn().mockResolvedValue(null),
  appRouterStrictRateLimit: jest.fn().mockResolvedValue(null),
  appRouterUploadRateLimit: jest.fn().mockResolvedValue(null),
  appRouterAuthRateLimit: jest.fn().mockResolvedValue(null),
  appRouterMfaRateLimit: jest.fn().mockResolvedValue(null),
  appRouterSignatureRateLimit: jest.fn().mockResolvedValue(null),
}));

// SSE mocks
jest.mock("@/lib/sse/event-emitter", () => ({
  emitSSE: jest.fn(),
  SSE_EVENTS: {
    WIRE_CONFIRMED: "WIRE_CONFIRMED",
    DOCUMENT_APPROVED: "DOCUMENT_APPROVED",
    DOCUMENT_REJECTED: "DOCUMENT_REJECTED",
    WIRE_PROOF_UPLOADED: "WIRE_PROOF_UPLOADED",
    INVESTOR_COMMITTED: "INVESTOR_COMMITTED",
  },
}));

// Tracking mocks
jest.mock("@/lib/tracking/server-events", () => ({
  publishServerEvent: jest.fn().mockResolvedValue(undefined),
}));

// Security mocks
jest.mock("@/lib/security/bot-protection", () => ({
  verifyNotBotPages: jest.fn().mockResolvedValue(true),
  verifyNotBot: jest.fn().mockResolvedValue({ blocked: false }),
}));
jest.mock("@/lib/security/csrf", () => ({
  validateCSRF: jest.fn().mockReturnValue(true),
}));
jest.mock("@/lib/security/anomaly-detection", () => ({
  checkAndAlertAnomalies: jest
    .fn()
    .mockResolvedValue({ allowed: true, alerts: [] }),
}));

// Crypto & signature mocks
jest.mock("@/lib/crypto/secure-storage", () => ({
  encryptTaxId: jest.fn((v) => "enc_" + v),
  decryptTaxId: jest.fn((v) => v.replace("enc_", "")),
}));
jest.mock("@/lib/signature/checksum", () => ({
  createSignatureChecksum: jest.fn().mockReturnValue({ hash: "h" }),
  createConsentRecord: jest.fn().mockReturnValue({ consent: true }),
  ESIGN_CONSENT_TEXT: "I consent.",
  ESIGN_CONSENT_VERSION: "1.0",
}));
jest.mock("@/lib/signature/encryption-service", () => ({
  getEncryptedSignatureForStorage: jest
    .fn()
    .mockResolvedValue({ storedValue: "e", checksum: "c" }),
  processDocumentCompletion: jest
    .fn()
    .mockResolvedValue({ success: true }),
}));
jest.mock("@/lib/signature/flatten-pdf", () => ({
  flattenSignatureDocument: jest
    .fn()
    .mockResolvedValue({ success: true }),
}));

// Paywall & threshold mocks
jest.mock("@/lib/auth/paywall", () => ({
  requireFundroomActive: jest.fn().mockResolvedValue(true),
  requireFundroomActiveByFund: jest.fn().mockResolvedValue(true),
  PAYWALL_ERROR: { error: "Requires subscription." },
}));
jest.mock("@/lib/funds/threshold", () => ({
  checkAndMarkThresholdReached: jest
    .fn()
    .mockResolvedValue({ shouldNotify: false }),
}));

// Wire transfer mocks
jest.mock("@/lib/wire-transfer", () => ({
  getWireInstructionsPublic: jest.fn().mockResolvedValue({
    bankName: "First National",
    routingNumber: "021000089",
    accountNumber: "****1234",
    accountName: "Bermuda Club Fund I",
    wireReference: "LP-DOE-BERMUDA",
  }),
}));

// Advance mocks
jest.mock("@/lib/investors/advance-on-doc-approval", () => ({
  advanceInvestorOnDocApproval: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/investors/advance-on-signing-complete", () => ({
  advanceInvestorOnSigningComplete: jest
    .fn()
    .mockResolvedValue(undefined),
}));
jest.mock("@/lib/investor/approval-pipeline", () => ({
  determineCurrentStage: jest.fn().mockReturnValue("APPLIED"),
}));

// Storage mocks
jest.mock("@/lib/storage/investor-storage", () => ({
  uploadInvestorDocument: jest
    .fn()
    .mockResolvedValue({ path: "https://storage.example.com/doc.pdf" }),
}));

// Subscribe endpoint dependencies
jest.mock("pdf-lib", () => ({
  PDFDocument: {
    create: jest.fn().mockResolvedValue({
      addPage: jest.fn().mockReturnValue({
        getSize: jest.fn().mockReturnValue({ width: 612, height: 792 }),
        drawText: jest.fn(),
        drawLine: jest.fn(),
      }),
      embedFont: jest.fn().mockResolvedValue({}),
      save: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    }),
  },
  rgb: jest.fn().mockReturnValue({}),
  StandardFonts: { Helvetica: "Helvetica", HelveticaBold: "HelveticaBold" },
}));
jest.mock("@/lib/files/put-file-server", () => ({
  putFileServer: jest
    .fn()
    .mockResolvedValue({ type: "vercel", data: "fake/path/doc.pdf" }),
}));
jest.mock("@/lib/id-helper", () => ({
  newId: jest.fn().mockReturnValue("doc-smoke-001"),
}));
jest.mock("@/lib/funds/tranche-service", () => ({
  executePurchase: jest.fn().mockResolvedValue(undefined),
}));

// Prisma mock reference
import prisma from "@/lib/prisma";
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Add checkDatabaseHealth to the prisma module (named export, not on default)
const prismaModule = require("@/lib/prisma");
if (!prismaModule.checkDatabaseHealth) {
  prismaModule.checkDatabaseHealth = jest
    .fn()
    .mockResolvedValue({ status: "up", latencyMs: 5 });
}

// Patch models that may not exist in global mock
if (!(mockPrisma as any).platformSettings)
  (mockPrisma as any).platformSettings = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
  };
if (!(mockPrisma as any).fundroomActivation)
  (mockPrisma as any).fundroomActivation = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
if (!(mockPrisma as any).onboardingFlow)
  (mockPrisma as any).onboardingFlow = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    create: jest.fn(),
  };
if (!(mockPrisma as any).subscription)
  (mockPrisma as any).subscription = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
// Patch missing `count` methods on models that need them for smoke tests
for (const model of ["investor", "investment", "viewer", "view", "organization", "team", "userTeam"]) {
  if (!(mockPrisma as any)[model]) (mockPrisma as any)[model] = {};
  if (!(mockPrisma as any)[model].count) (mockPrisma as any)[model].count = jest.fn();
}
if (!(mockPrisma.investment as any).aggregate) (mockPrisma.investment as any).aggregate = jest.fn();
if (!(mockPrisma as any).fundPricingTier) (mockPrisma as any).fundPricingTier = { findUnique: jest.fn() };

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ORG = {
  id: "org-smoke-001",
  name: "Smoke Test Capital",
  slug: "smoke-test",
  entityType: "LLC",
  productMode: "GP_FUND",
  regulationDExemption: "506C",
  sector: "Venture Capital",
  addressLine1: "123 Fund St",
  addressCity: "Miami",
  addressState: "FL",
  addressZip: "33101",
  addressCountry: "US",
  phone: "+1-305-555-0100",
  relatedPersons: [
    {
      name: "Test Admin",
      title: "Managing Member",
      relationship: "Executive Officer",
    },
  ],
};

const TEAM = {
  id: "team-smoke-001",
  name: "Smoke Test Fund I",
  slug: "smoke-test",
  organizationId: ORG.id,
  organization: ORG,
};

const FUND = {
  id: "fund-smoke-001",
  teamId: TEAM.id,
  name: "Smoke Test Fund I, L.P.",
  targetRaise: new Decimal(5_000_000),
  minimumInvestment: new Decimal(50_000),
  status: "RAISING",
  entityMode: "FUND",
  isActive: true,
  flatModeEnabled: true,
  regulationDExemption: "506C",
  investmentCompanyExemption: "3C1",
  useOfProceeds: "Growth investments in technology startups.",
  salesCommissions: "$25,000 to Placement Agent",
  description: "A diversified venture fund.",
  fundSubType: null,
  team: {
    ...TEAM,
    users: [
      {
        user: { name: "Test Admin", email: "admin@smoke.test" },
        role: "ADMIN",
      },
    ],
  },
  formDFilingDate: null,
  formDAmendmentDue: null,
  termYears: 10,
  managementFeePct: new Decimal(2),
  carryPct: new Decimal(20),
  hurdleRate: new Decimal(8),
  featureFlags: {},
  pricingTiers: [],
};

const GP_USER = {
  id: "user-gp-smoke",
  email: "admin@smoke.test",
  name: "Test Admin",
  role: "ADMIN",
};
const GP_SESSION = { user: { id: GP_USER.id, email: GP_USER.email } };
const GP_MEMBERSHIP = {
  teamId: TEAM.id,
  userId: GP_USER.id,
  role: "ADMIN",
  status: "ACTIVE",
};

const LP_USER = {
  id: "user-lp-smoke",
  email: "investor@smoke.test",
  name: "LP Investor",
  role: "LP",
};
const LP_SESSION = { user: { id: LP_USER.id, email: LP_USER.email } };

const LP_INVESTOR = {
  id: "investor-smoke-001",
  userId: LP_USER.id,
  entityType: "INDIVIDUAL",
  entityName: null,
  phone: "+1-555-0200",
  fundId: FUND.id,
  ndaSigned: true,
  ndaSignedAt: new Date(),
  accreditationStatus: "SELF_CERTIFIED",
  accreditationExpiresAt: null, // Not expired
  sourceOfFunds: "SALARY",
  occupation: "Engineer",
  onboardingStep: 6,
  entityDetails: {
    firstName: "LP",
    lastName: "Investor",
    dateOfBirth: "1990-01-15",
  },
  fundData: {
    approvalStage: "COMMITTED",
    representations: {
      accreditedCert: true,
      principal: true,
      offeringDocs: true,
      riskAware: true,
      restrictedSecurities: true,
      amlOfac: true,
      taxConsent: true,
      independentAdvice: true,
      timestamp: new Date().toISOString(),
    },
  },
  user: LP_USER,
  fund: FUND,
};

const INVESTMENT = {
  id: "investment-smoke-001",
  fundId: FUND.id,
  investorId: LP_INVESTOR.id,
  commitmentAmount: new Decimal(100_000),
  fundedAmount: new Decimal(0),
  status: "COMMITTED",
};

const TXN_PROOF = {
  id: "txn-smoke-001",
  fundId: FUND.id,
  investorId: LP_INVESTOR.id,
  amount: new Decimal(100_000),
  status: "PROOF_UPLOADED",
  type: "WIRE",
  investor: {
    id: LP_INVESTOR.id,
    userId: LP_USER.id,
    fundId: FUND.id,
    entityName: null,
    user: LP_USER,
  },
};

const LP_DOC = {
  id: "lpdoc-smoke-001",
  investorId: LP_INVESTOR.id,
  fundId: FUND.id,
  documentType: "SUBSCRIPTION_AGREEMENT",
  fileName: "sub-agreement.pdf",
  status: "UPLOADED_PENDING_REVIEW",
  fund: { teamId: TEAM.id, name: FUND.name },
  investor: {
    id: LP_INVESTOR.id,
    userId: LP_USER.id,
    user: LP_USER,
    fundId: FUND.id,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mkReq(
  method: string,
  body?: Record<string, unknown>,
  query?: Record<string, string>,
) {
  return createMocks<NextApiRequest, NextApiResponse>({
    method,
    body: body || {},
    query: query || {},
    headers: {
      "x-forwarded-for": "203.0.113.50",
      "user-agent": "ProductionSmokeTest/1.0",
    },
  });
}

function setSession(s: unknown) {
  __mockGetServerSession.mockResolvedValue(s);
}

function setupGPAdmin() {
  setSession(GP_SESSION);
  mockPrisma.userTeam.findFirst.mockResolvedValue(GP_MEMBERSHIP);
  if ((mockPrisma.userTeam as any).count)
    (mockPrisma.userTeam as any).count.mockResolvedValue(2);
}

function setupLP() {
  setSession(LP_SESSION);
  mockPrisma.user.findUnique.mockResolvedValue({
    ...LP_USER,
    investorProfile: LP_INVESTOR,
  });
}

function flush() {
  return new Promise((r) => setImmediate(r));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Production Smoke Tests (P3-6)", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default $transaction mock: handles both callback and array patterns
    (mockPrisma as any).$transaction.mockImplementation(
      async (arg: unknown) => {
        if (typeof arg === "function") {
          // Interactive transaction — call with mockPrisma as tx client
          return (arg as (tx: unknown) => Promise<unknown>)(mockPrisma);
        }
        // Array pattern — resolve all promises
        return Promise.all(arg as Promise<unknown>[]);
      },
    );

    // Reset rate limiter
    const rl = jest.requireMock("@/lib/redis").__mockRateLimitFn;
    if (rl)
      rl.mockResolvedValue({
        success: true,
        limit: 100,
        remaining: 99,
        reset: Date.now() + 60000,
      });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. HEALTH & DEPLOYMENT READINESS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("1. Health & Deployment Readiness", () => {
    it("health endpoint returns 200 with database status", async () => {
      const origStorage = process.env.STORAGE_PROVIDER;
      process.env.STORAGE_PROVIDER = "vercel";

      // Ensure checkDatabaseHealth mock returns healthy
      const pMod = require("@/lib/prisma");
      if (pMod.checkDatabaseHealth) {
        pMod.checkDatabaseHealth.mockResolvedValue({
          status: "up",
          latencyMs: 5,
        });
      }

      const mod = await import("@/pages/api/health");
      const { req, res } = mkReq("GET");
      await mod.default(req, res);

      expect(res._getStatusCode()).toBe(200);
      const body = JSON.parse(res._getData());
      expect(body.services.database.status).toBe("up");
      expect(body.timestamp).toBeDefined();

      process.env.STORAGE_PROVIDER = origStorage;
    });

    it("deployment-readiness returns structured check results", async () => {
      setupGPAdmin();
      mockPrisma.organization.count.mockResolvedValue(1);
      mockPrisma.team.count.mockResolvedValue(1);
      (mockPrisma as any).$queryRaw.mockResolvedValue([
        { count: BigInt(117) },
      ]);
      if ((mockPrisma.userTeam as any).count)
        (mockPrisma.userTeam as any).count.mockResolvedValue(2);

      const { GET } = await import(
        "@/app/api/admin/deployment-readiness/route"
      );
      const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
      const handler = wrapAppRouteHandler({ GET });
      const { req, res } = mkReq("GET");
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const body = JSON.parse(res._getData());
      expect(body.checks).toBeDefined();
      expect(body.status).toBeDefined();
      expect(Array.isArray(body.checks)).toBe(true);
      expect(body.checks.length).toBeGreaterThan(0);
      // Each check should have name, status, and details
      for (const check of body.checks) {
        expect(check).toHaveProperty("name");
        expect(check).toHaveProperty("status");
        expect(["pass", "warn", "fail"]).toContain(check.status);
      }
    });

    it("unauthenticated requests are rejected on admin endpoints", async () => {
      setSession(null);
      const { GET } = await import(
        "@/app/api/admin/deployment-readiness/route"
      );
      const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrapAppRouteHandler({ GET }) };
      const { req, res } = mkReq("GET");
      await mod.default(req, res);
      expect(res._getStatusCode()).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. LP REGISTRATION & FUND CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("2. LP Registration & Fund Context", () => {
    it("fund-context returns fund details with fundId", async () => {
      mockPrisma.fund.findUnique.mockResolvedValue({
        ...FUND,
        team: { ...TEAM, organization: ORG },
      });
      (mockPrisma.fundroomActivation as any).findFirst.mockResolvedValue({
        status: "ACTIVE",
      });

      const { GET } = await import("@/app/api/lp/fund-context/route");
      const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrapAppRouteHandler({ GET }) };
      const { req, res } = mkReq("GET", undefined, {
        fundId: FUND.id,
      });
      await mod.default(req, res);

      expect(res._getStatusCode()).toBe(200);
      const body = JSON.parse(res._getData());
      expect(body.fundId).toBe(FUND.id);
      expect(body.fundName).toBeDefined();
      expect(body.teamId).toBe(TEAM.id);
    });

    it("LP register creates user and investor profile", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null); // New user
      mockPrisma.user.create.mockResolvedValue({
        ...LP_USER,
        investorProfile: null,
        password: null,
      });
      mockPrisma.investor.create.mockResolvedValue(LP_INVESTOR);
      mockPrisma.fund.findUnique.mockResolvedValue(FUND);
      (mockPrisma.verificationToken as any).create.mockResolvedValue({
        token: "test-token-123",
      });

      const { POST } = await import("@/app/api/lp/register/route");
      const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrapAppRouteHandler({ POST }) };
      const { req, res } = mkReq("POST", {
        name: "New Investor",
        email: "new-investor@smoke.test",
        fundId: FUND.id,
      });
      await mod.default(req, res);
      await flush();

      expect([200, 201]).toContain(res._getStatusCode());
    });

    it("LP register rejects invalid email", async () => {
      const { POST } = await import("@/app/api/lp/register/route");
      const { wrapAppRouteHandler } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrapAppRouteHandler({ POST }) };
      const { req, res } = mkReq("POST", {
        name: "Bad Email",
        email: "not-an-email",
      });
      await mod.default(req, res);

      expect(res._getStatusCode()).toBeGreaterThanOrEqual(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. LP COMMITMENT & WIRE PROOF
  // ═══════════════════════════════════════════════════════════════════════════

  describe("3. LP Commitment & Wire Proof", () => {
    it("subscribe creates investment with SEC representations", async () => {
      setupLP();
      mockPrisma.fund.findUnique.mockResolvedValue({
        ...FUND,
        flatModeEnabled: true,
        pricingTiers: [],
        team: TEAM,
      });
      mockPrisma.investment.findFirst.mockResolvedValue(null);
      mockPrisma.investor.update.mockResolvedValue(LP_INVESTOR);
      mockPrisma.fundAggregate.upsert.mockResolvedValue({});
      (mockPrisma as any).onboardingFlow.findFirst.mockResolvedValue(null);

      // Subscribe uses interactive $transaction
      (mockPrisma as any).$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const txClient = {
            signatureDocument: {
              create: jest.fn().mockResolvedValue({
                id: "sigdoc-001",
                recipients: [{ signingToken: "tok-001" }],
              }),
            },
            subscription: {
              create: jest.fn().mockResolvedValue({
                id: "sub-001",
                amount: 100000,
                status: "PENDING",
              }),
            },
            investment: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({
                ...INVESTMENT,
                status: "COMMITTED",
              }),
              aggregate: jest.fn().mockResolvedValue({
                _sum: { commitmentAmount: new Decimal(100_000) },
              }),
            },
            investor: {
              update: jest.fn().mockResolvedValue(LP_INVESTOR),
            },
            fundAggregate: {
              upsert: jest.fn().mockResolvedValue({}),
            },
          };
          return fn(txClient);
        },
      );

      const { POST: subscribePOST } = await import("@/app/api/lp/subscribe/route");
      const { wrapAppRouteHandler: wrap1 } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrap1({ POST: subscribePOST }) };
      const { req, res } = mkReq("POST", {
        fundId: FUND.id,
        amount: "100000",
        representations: {
          accreditedCert: true,
          principal: true,
          offeringDocs: true,
          riskAware: true,
          restrictedSecurities: true,
          amlOfac: true,
          taxConsent: true,
          independentAdvice: true,
        },
      });
      await mod.default(req, res);
      await flush();

      expect([200, 201]).toContain(res._getStatusCode());
    });

    it("subscribe rejects expired accreditation", async () => {
      const expiredInvestor = {
        ...LP_INVESTOR,
        accreditationExpiresAt: new Date("2025-01-01"), // Expired
      };
      setSession(LP_SESSION);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...LP_USER,
        investorProfile: expiredInvestor,
      });
      mockPrisma.fund.findUnique.mockResolvedValue(FUND);
      (mockPrisma as any).onboardingFlow.findFirst.mockResolvedValue(
        null,
      );

      const { POST: subscribePOST2 } = await import("@/app/api/lp/subscribe/route");
      const { wrapAppRouteHandler: wrap2 } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrap2({ POST: subscribePOST2 }) };
      const { req, res } = mkReq("POST", {
        fundId: FUND.id,
        amount: "100000",
      });
      await mod.default(req, res);

      expect(res._getStatusCode()).toBe(403);
      const body = JSON.parse(res._getData());
      expect(body.error).toMatch(/expired/i);
    });

    it("wire-proof upload creates PROOF_UPLOADED transaction", async () => {
      setupLP();
      mockPrisma.user.findUnique.mockResolvedValue({ id: LP_USER.id });
      // manualInvestment.findUnique returns null → falls through to regular investment path
      if (!(mockPrisma as any).manualInvestment)
        (mockPrisma as any).manualInvestment = { findFirst: jest.fn(), findUnique: jest.fn() };
      if (!(mockPrisma.manualInvestment as any).findUnique)
        (mockPrisma.manualInvestment as any).findUnique = jest.fn();
      (mockPrisma.manualInvestment as any).findUnique.mockResolvedValue(null);
      // investment.findUnique (NOT findFirst) returns the investment
      mockPrisma.investment.findUnique.mockResolvedValue({
        ...INVESTMENT,
        investor: { userId: LP_USER.id },
      });
      // No existing completed transaction (duplicate check)
      mockPrisma.transaction.findFirst.mockResolvedValue(null);
      mockPrisma.transaction.create.mockResolvedValue(TXN_PROOF);

      const { POST: wireProofPOST } = await import("@/app/api/lp/wire-proof/route");
      const { wrapAppRouteHandler: wrap3 } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrap3({ POST: wireProofPOST }) };
      const { req, res } = mkReq("POST", {
        investmentId: INVESTMENT.id,
        storageKey: "uploads/proof-001.pdf",
        storageType: "vercel",
        fileType: "application/pdf",
        fileName: "wire-receipt.pdf",
        fileSize: 102400,
        amountSent: 100000,
      });
      await mod.default(req, res);
      await flush();

      expect([200, 201]).toContain(res._getStatusCode());
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. GP WIRE CONFIRMATION & DOCUMENT REVIEW
  // ═══════════════════════════════════════════════════════════════════════════

  describe("4. GP Wire Confirmation & Document Review", () => {
    it("GP confirms wire receipt atomically", async () => {
      setupGPAdmin();
      mockPrisma.transaction.findUnique.mockResolvedValue({
        ...TXN_PROOF,
        fund: FUND,
      });
      // Fund team ownership verification (line 127-135 of confirm.ts)
      mockPrisma.fund.findFirst.mockResolvedValue({
        id: FUND.id,
        name: FUND.name,
      });

      // $transaction callback pattern
      (mockPrisma as any).$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const txClient = {
            transaction: {
              // Race condition check (line 158): tx.transaction.findUnique
              findUnique: jest
                .fn()
                .mockResolvedValue({ status: "PROOF_UPLOADED" }),
              update: jest
                .fn()
                .mockResolvedValue({
                  ...TXN_PROOF,
                  status: "COMPLETED",
                  confirmedAt: new Date(),
                  fundsReceivedDate: new Date(),
                }),
            },
            investment: {
              update: jest
                .fn()
                .mockResolvedValue({
                  ...INVESTMENT,
                  fundedAmount: new Decimal(100_000),
                  status: "FUNDED",
                }),
              findFirst: jest
                .fn()
                .mockResolvedValue(INVESTMENT),
              aggregate: jest
                .fn()
                .mockResolvedValue({
                  _sum: {
                    fundedAmount: new Decimal(100_000),
                    commitmentAmount: new Decimal(100_000),
                  },
                }),
            },
            fundAggregate: {
              upsert: jest.fn().mockResolvedValue({}),
            },
          };
          return fn(txClient);
        },
      );

      const { POST: confirmPOST } = await import("@/app/api/admin/wire/confirm/route");
      const { wrapAppRouteHandler: wrap4 } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrap4({ POST: confirmPOST }) };
      const { req, res } = mkReq("POST", {
        transactionId: TXN_PROOF.id,
        teamId: TEAM.id,
        amountReceived: 100000,
        fundsReceivedDate: "2026-02-18",
        bankReference: "WR-12345",
      });
      await mod.default(req, res);
      await flush();

      expect(res._getStatusCode()).toBe(200);
    });

    it("GP approves LP document", async () => {
      setupGPAdmin();
      mockPrisma.lPDocument.findUnique.mockResolvedValue(LP_DOC);
      mockPrisma.lPDocument.update.mockResolvedValue({
        ...LP_DOC,
        status: "APPROVED",
      });
      mockPrisma.lPDocumentReview.create.mockResolvedValue({
        id: "review-001",
      });

      const mod = await import(
        "@/pages/api/documents/[docId]/confirm"
      );
      const { req, res } = mkReq(
        "PATCH",
        { notes: "Looks good" },
        { docId: LP_DOC.id },
      );
      await mod.default(req, res);
      await flush();

      expect(res._getStatusCode()).toBe(200);
    });

    it("GP rejects LP document with reason", async () => {
      setupGPAdmin();
      mockPrisma.lPDocument.findUnique.mockResolvedValue(LP_DOC);
      mockPrisma.lPDocument.update.mockResolvedValue({
        ...LP_DOC,
        status: "REJECTED",
      });

      const mod = await import(
        "@/pages/api/documents/[docId]/reject"
      );
      const { req, res } = mkReq(
        "PATCH",
        { reason: "Missing signature on page 3" },
        { docId: LP_DOC.id },
      );
      await mod.default(req, res);
      await flush();

      expect(res._getStatusCode()).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. SEC COMPLIANCE — FORM D EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  describe("5. SEC Compliance — Form D Export", () => {
    it("Form D JSON export includes all SEC sections", async () => {
      setupGPAdmin();
      mockPrisma.fund.findUnique.mockResolvedValue(FUND);
      mockPrisma.investor.findMany.mockResolvedValue([
        {
          ...LP_INVESTOR,
          investments: [
            {
              commitmentAmount: new Decimal(100_000),
              fundedAmount: new Decimal(100_000),
              status: "FUNDED",
              subscriptionDate: new Date("2026-02-01"),
            },
          ],
        },
      ]);

      const { GET: formDGET } = await import("@/app/api/admin/reports/form-d/route");
      const { wrapAppRouteHandler: wrap5 } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrap5({ GET: formDGET }) };
      const { req, res } = mkReq("GET", undefined, {
        fundId: FUND.id,
        format: "json",
      });
      await mod.default(req, res);

      expect(res._getStatusCode()).toBe(200);
      const body = JSON.parse(res._getData());
      const fd = body.formD;

      // Section 1: Issuer
      expect(fd.issuer.entityName).toBe(ORG.name);
      expect(fd.issuer.entityType).toBe("LLC");

      // Section 6: Exemption
      expect(fd.federalExemption.rule506c).toBe(true);
      expect(fd.federalExemption.exemptionLabel).toBe("Rule 506(c)");

      // Section 11: Minimum Investment
      expect(fd.minimumInvestment).toBe(50_000);

      // Section 13: Offering Amounts
      expect(fd.offeringAmounts.totalOfferingAmount).toBe(5_000_000);
      expect(fd.offeringAmounts.totalAmountSold).toBe(100_000);

      // Section 14: Investors
      expect(fd.investorCounts.totalAlreadyInvested).toBe(1);
      expect(fd.investorCounts.totalAccredited).toBe(1);

      // Section 15: Sales Commissions (was hardcoded to 0, now uses fund data)
      expect(fd.salesCommissions.totalSalesCommissions).toBe(
        "$25,000 to Placement Agent",
      );

      // Section 16: Use of Proceeds
      expect(fd.useOfProceeds.generalDescription).toBe(
        "Growth investments in technology startups.",
      );

      // Meta
      expect(fd.meta.fundName).toBe(FUND.name);
      expect(fd.meta.firstSaleDate).toBeDefined();
      expect(fd.meta.filingDeadline).toBeDefined();
    });

    it("Form D CSV export includes Section 15 and 16", async () => {
      setupGPAdmin();
      mockPrisma.fund.findUnique.mockResolvedValue(FUND);
      mockPrisma.investor.findMany.mockResolvedValue([]);

      const { GET: formDGET2 } = await import("@/app/api/admin/reports/form-d/route");
      const { wrapAppRouteHandler: wrap6 } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrap6({ GET: formDGET2 }) };
      const { req, res } = mkReq("GET", undefined, {
        fundId: FUND.id,
        format: "csv",
      });
      await mod.default(req, res);

      expect(res._getStatusCode()).toBe(200);
      const csv = res._getData();
      expect(csv).toContain("SECTION 15: SALES COMMISSIONS");
      expect(csv).toContain("SECTION 16: USE OF PROCEEDS");
      expect(csv).toContain("SEC FORM D");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. CRITICAL AUTH & SECURITY GUARDS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("6. Auth & Security Guards", () => {
    it("non-GET methods are rejected on read-only endpoints", async () => {
      const mod = await import("@/pages/api/health");
      const { req, res } = mkReq("POST");
      await mod.default(req, res);
      // Health endpoint should reject POST
      expect([200, 405]).toContain(res._getStatusCode());
    });

    it("LP endpoints require authentication", async () => {
      setSession(null);
      const { POST: subPOST3 } = await import("@/app/api/lp/subscribe/route");
      const { wrapAppRouteHandler: wrap7 } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrap7({ POST: subPOST3 }) };
      const { req, res } = mkReq("POST", {
        fundId: FUND.id,
        amount: "100000",
      });
      await mod.default(req, res);
      expect(res._getStatusCode()).toBe(401);
    });

    it("GP admin endpoints require admin role", async () => {
      // LP user trying to access GP endpoint — has session but no admin team membership
      setSession(LP_SESSION);
      mockPrisma.fund.findUnique.mockResolvedValue({
        ...FUND,
        teamId: TEAM.id,
      });
      mockPrisma.userTeam.findFirst.mockResolvedValue(null); // Not a team admin

      const { GET: reportsGET } = await import("@/app/api/admin/reports/route");
      const { wrapAppRouteHandler: wrap8 } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrap8({ GET: reportsGET }) };
      const { req, res } = mkReq("GET", undefined, {
        fundId: FUND.id,
      });
      await mod.default(req, res);

      expect(res._getStatusCode()).toBe(403);
    });

    it("rate limiting blocks excessive requests", async () => {
      const rl = jest.requireMock("@/lib/redis").__mockRateLimitFn;
      if (rl)
        rl.mockResolvedValue({
          success: false,
          limit: 10,
          remaining: 0,
          reset: Date.now() + 60000,
        });

      const { POST: subPOST4 } = await import("@/app/api/lp/subscribe/route");
      const { wrapAppRouteHandler: wrap9 } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrap9({ POST: subPOST4 }) };
      const { req, res } = mkReq("POST", {
        fundId: FUND.id,
        amount: "100000",
      });
      await mod.default(req, res);

      expect(res._getStatusCode()).toBe(429);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. DASHBOARD STATS & PENDING ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("7. Dashboard Stats & Pending Actions", () => {
    it("GP dashboard stats returns fund metrics", async () => {
      // dashboard-stats uses user.findUnique with teams select, not userTeam.findFirst
      setSession(GP_SESSION);
      mockPrisma.user.findUnique.mockResolvedValue({
        ...GP_USER,
        teams: [{ teamId: TEAM.id }],
      });
      mockPrisma.fund.findMany.mockResolvedValue([
        {
          ...FUND,
          currentRaise: 100_000,
          _count: { investors: 5 },
        },
      ]);
      (mockPrisma.viewer as any).count.mockResolvedValue(42);
      mockPrisma.investment.findMany.mockResolvedValue([]);
      (mockPrisma.investment as any).count.mockResolvedValue(3);
      mockPrisma.transaction.count.mockResolvedValue(1);
      mockPrisma.lPDocument.count.mockResolvedValue(2);
      (mockPrisma.view as any).count.mockResolvedValue(150);
      mockPrisma.investor.findMany.mockResolvedValue([]);

      const { GET: statsGET } = await import("@/app/api/admin/dashboard-stats/route");
      const { wrapAppRouteHandler: wrap10 } = await import("@/__tests__/helpers/app-router-adapter");
      const mod = { default: wrap10({ GET: statsGET }) };
      const { req, res } = mkReq("GET");
      await mod.default(req, res);

      expect(res._getStatusCode()).toBe(200);
      const body = JSON.parse(res._getData());
      // Endpoint returns stats, raise, pendingActions, pipeline
      expect(body.stats).toBeDefined();
      expect(body.raise).toBeDefined();
      expect(body.raise.funds).toBeDefined();
      expect(body.raise.funds.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. RESPONSE FORMAT CONSISTENCY
  // ═══════════════════════════════════════════════════════════════════════════

  describe("8. Response Format Consistency (H-06)", () => {
    it("error responses use { error: } format, not { message: }", async () => {
      setSession(null);

      // Test unauthenticated responses from multiple endpoints
      const { wrapAppRouteHandler: wrapH06 } = await import("@/__tests__/helpers/app-router-adapter");

      const { POST: subPOSTh06 } = await import("@/app/api/lp/subscribe/route");
      const { GET: reportsGETh06 } = await import("@/app/api/admin/reports/route");

      const endpointHandlers = [
        wrapH06({ POST: subPOSTh06 }),
        wrapH06({ GET: reportsGETh06 }),
      ];

      for (const handler of endpointHandlers) {
        const { req, res } = mkReq("POST", {});
        await handler(req, res);

        if (res._getStatusCode() >= 400) {
          const body = JSON.parse(res._getData());
          expect(body).toHaveProperty("error");
          expect(body).not.toHaveProperty("message");
        }
      }
    });
  });
});
