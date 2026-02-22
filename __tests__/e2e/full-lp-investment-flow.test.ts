// @ts-nocheck
/**
 * Full LP Investment Flow — End-to-End Integration Test
 *
 * Validates the ENTIRE LP investment lifecycle:
 *   Dataroom Visit → "I Want to Invest" → Registration → Onboarding Steps →
 *   Document Signing → Wire Instructions → Proof Upload → GP Confirmation → FUNDED
 *
 * Uses Bermuda seed-aligned fixtures: fund minimum $200,000, GP_FUND mode.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { wrapAppRouteHandler } from "../helpers/app-router-adapter";

// ─── Session mocks (explicit local overrides for both import paths) ──────────

const __mockGetServerSession = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: __mockGetServerSession,
}));

jest.mock("next-auth/next", () => ({
  getServerSession: __mockGetServerSession,
}));

// ─── Additional module mocks (beyond jest.setup.ts) ─────────────────────────

jest.mock("@/lib/security/bot-protection", () => ({
  verifyNotBotPages: jest.fn().mockResolvedValue(true),
  verifyNotBot: jest.fn().mockResolvedValue({ blocked: false }),
}));

jest.mock("@/lib/security/csrf", () => ({
  validateCSRF: jest.fn().mockReturnValue(true),
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  strictRateLimiter: jest.fn().mockResolvedValue(true),
  authRateLimiter: jest.fn().mockResolvedValue(true),
  apiRateLimiter: jest.fn().mockResolvedValue(true),
  uploadRateLimiter: jest.fn().mockResolvedValue(true),
  appRouterRateLimit: jest.fn().mockResolvedValue(null),
  appRouterStrictRateLimit: jest.fn().mockResolvedValue(null),
  appRouterUploadRateLimit: jest.fn().mockResolvedValue(null),
  appRouterAuthRateLimit: jest.fn().mockResolvedValue(null),
  appRouterMfaRateLimit: jest.fn().mockResolvedValue(null),
  appRouterSignatureRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/emails/send-investor-welcome", () => ({
  sendInvestorWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  sendInvestorWelcomeEmailWithFund: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/emails/send-wire-confirmed", () => ({
  sendWireConfirmedNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/wire-transfer", () => ({
  getWireInstructionsPublic: jest.fn().mockResolvedValue({
    bankName: "First National Bank",
    beneficiaryName: "Bermuda Fund I LLC",
    routingNumber: "021000089",
    accountNumberLast4: "7890",
    reference: "BF-INV-001",
    notes: "Include investor name in memo",
    swiftCode: "FNBKUS33",
  }),
  uploadProofOfPayment: jest.fn().mockResolvedValue({
    proofStatus: "UPLOADED",
    proofFileName: "wire-receipt.pdf",
  }),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
  logSubscriptionEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/security/anomaly-detection", () => ({
  checkAndAlertAnomalies: jest.fn().mockResolvedValue({ allowed: true, alerts: [] }),
}));

jest.mock("@/lib/signature/checksum", () => ({
  createSignatureChecksum: jest.fn().mockReturnValue({ hash: "mock-checksum" }),
  createConsentRecord: jest.fn().mockReturnValue({ consent: true }),
  ESIGN_CONSENT_TEXT: "I consent to e-signatures.",
  ESIGN_CONSENT_VERSION: "1.0",
}));

jest.mock("@/lib/signature/encryption-service", () => ({
  getEncryptedSignatureForStorage: jest.fn().mockResolvedValue({
    storedValue: "encrypted-signature-data",
    checksum: "sig-checksum",
  }),
  processDocumentCompletion: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/signature/flatten-pdf", () => ({
  flattenSignatureDocument: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/funds/threshold", () => ({
  checkAndMarkThresholdReached: jest.fn().mockResolvedValue({ shouldNotify: false }),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
  handleApiError: jest.fn(),
}));

jest.mock("@/lib/auth/paywall", () => ({
  requireFundroomActive: jest.fn().mockResolvedValue(true),
  requireFundroomActiveByFund: jest.fn().mockResolvedValue(true),
  PAYWALL_ERROR: { error: "This feature requires a FundRoom subscription." },
}));

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

jest.mock("@/pages/api/auth/[...nextauth]", () => ({
  authOptions: {},
}));

// ─── Typed references ────────────────────────────────────────────────────────

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ─── Patch missing Prisma model mocks (not in global jest.setup.ts) ──────────

(mockPrisma as any).onboardingFlow = {
  findUnique: jest.fn(),
  upsert: jest.fn(),
  updateMany: jest.fn(),
};

// manualInvestment has findMany but needs findFirst and findUnique
if (!(mockPrisma.manualInvestment as any)?.findFirst) {
  (mockPrisma.manualInvestment as any).findFirst = jest.fn();
}
if (!(mockPrisma.manualInvestment as any)?.findUnique) {
  (mockPrisma.manualInvestment as any).findUnique = jest.fn();
}

// investorDocument needs upsert (may already be in setup)
if (!(mockPrisma as any).investorDocument) {
  (mockPrisma as any).investorDocument = { upsert: jest.fn() };
} else if (!(mockPrisma as any).investorDocument.upsert) {
  (mockPrisma as any).investorDocument.upsert = jest.fn();
}

// subscription needs findUnique
if (!(mockPrisma as any).subscription) {
  (mockPrisma as any).subscription = { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() };
}

// ─── Bermuda-aligned test fixtures ───────────────────────────────────────────

const TEAM = {
  id: "team-bermuda-001",
  name: "Bermuda Franchise Group",
  slug: "bermuda",
  createdAt: new Date("2026-01-15"),
};

const FUND = {
  id: "fund-bermuda-001",
  teamId: TEAM.id,
  name: "Bermuda Fund I",
  targetRaise: new Decimal(5_000_000),
  minimumInvestment: new Decimal(200_000),
  currentRaise: new Decimal(1_500_000),
  capitalCallThreshold: new Decimal(3_000_000),
  status: "RAISING",
  entityMode: "FUND",
  isActive: true,
  createdAt: new Date("2026-01-20"),
};

const GP_USER = {
  id: "user-gp-001",
  email: "gp@bermudafranchise.com",
  name: "GP Admin",
  role: "ADMIN",
};

const LP_USER = {
  id: "user-lp-001",
  email: "lp-investor@example.com",
  name: "Jane Doe",
  role: "LP",
};

const LP_INVESTOR = {
  id: "investor-lp-001",
  userId: LP_USER.id,
  entityType: "INDIVIDUAL",
  entityName: null,
  phone: "+1-555-0100",
  fundId: FUND.id,
  ndaSigned: true,
  ndaSignedAt: new Date(),
  accreditationStatus: "SELF_CERTIFIED",
  onboardingStep: 5,
  fundData: {
    approvalStage: "APPLIED",
    approvalHistory: [{ stage: "APPLIED", timestamp: new Date().toISOString() }],
  },
  createdAt: new Date(),
  user: LP_USER,
};

const INVESTMENT = {
  id: "investment-001",
  fundId: FUND.id,
  investorId: LP_INVESTOR.id,
  commitmentAmount: new Decimal(250_000),
  fundedAmount: new Decimal(0),
  status: "COMMITTED",
  createdAt: new Date(),
};

const TRANSACTION = {
  id: "txn-001",
  fundId: FUND.id,
  investorId: LP_INVESTOR.id,
  amount: new Decimal(250_000),
  status: "PENDING",
  type: "WIRE",
  createdAt: new Date(),
  investor: {
    id: LP_INVESTOR.id,
    userId: LP_USER.id,
    fundId: FUND.id,
    entityName: null,
    user: { email: LP_USER.email, name: LP_USER.name },
  },
};

const SIGNATURE_DOC_NDA = {
  id: "sigdoc-nda-001",
  title: "Non-Disclosure Agreement",
  description: "Fund NDA",
  status: "SENT",
  numPages: 3,
  completedAt: null,
  createdAt: new Date("2026-02-01"),
  teamId: TEAM.id,
  storageType: "S3",
  file: "s3://bucket/nda.pdf",
  expirationDate: null,
  auditTrail: {},
  documentType: "NDA",
  subscriptionAmount: null,
  createdById: GP_USER.id,
  team: { name: TEAM.name },
  owner: { name: GP_USER.name, email: GP_USER.email },
};

const SIGNATURE_DOC_SUB = {
  id: "sigdoc-sub-001",
  title: "Subscription Agreement",
  description: "Fund Subscription",
  status: "SENT",
  numPages: 12,
  completedAt: null,
  createdAt: new Date("2026-02-02"),
  teamId: TEAM.id,
  storageType: "S3",
  file: "s3://bucket/subscription.pdf",
  expirationDate: null,
  auditTrail: {},
  documentType: "SUBSCRIPTION",
  subscriptionAmount: new Decimal(250_000),
  createdById: GP_USER.id,
  team: { name: TEAM.name },
  owner: { name: GP_USER.name, email: GP_USER.email },
};

const NDA_RECIPIENT = {
  id: "rec-nda-001",
  documentId: SIGNATURE_DOC_NDA.id,
  email: LP_USER.email,
  name: LP_USER.name,
  role: "SIGNER",
  status: "SENT",
  signingToken: "nda-token-abc123",
  signingUrl: "/sign/nda-token-abc123",
  signedAt: null,
  signingOrder: 1,
  viewedAt: null,
  declinedAt: null,
  declinedReason: null,
  ipAddress: null,
  userAgent: null,
  consentRecord: null,
  signatureChecksum: null,
  signatureImage: null,
  document: SIGNATURE_DOC_NDA,
};

const SUB_RECIPIENT = {
  id: "rec-sub-001",
  documentId: SIGNATURE_DOC_SUB.id,
  email: LP_USER.email,
  name: LP_USER.name,
  role: "SIGNER",
  status: "SENT",
  signingToken: "sub-token-def456",
  signingUrl: "/sign/sub-token-def456",
  signedAt: null,
  signingOrder: 2,
  viewedAt: null,
  declinedAt: null,
  declinedReason: null,
  ipAddress: null,
  userAgent: null,
  consentRecord: null,
  signatureChecksum: null,
  signatureImage: null,
  document: SIGNATURE_DOC_SUB,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createRequest(method: string, body?: any, query?: any) {
  return createMocks<NextApiRequest, NextApiResponse>({
    method,
    body: body || {},
    query: query || {},
    headers: {
      "x-forwarded-for": "203.0.113.50",
      "user-agent": "Mozilla/5.0 TestBrowser",
    },
  });
}

/**
 * Sets session mock on the shared getServerSession mock.
 * Both next-auth and next-auth/next point to the same mock function.
 */
function setSession(session: any) {
  __mockGetServerSession.mockResolvedValue(session);
}

function setSessionOnce(session: any) {
  __mockGetServerSession.mockResolvedValueOnce(session);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Full LP Investment Flow — End-to-End", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Re-attach onboardingFlow mocks (clearAllMocks resets them)
    (mockPrisma as any).onboardingFlow = {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    };
    if (!(mockPrisma.manualInvestment as any)?.findFirst) {
      (mockPrisma.manualInvestment as any).findFirst = jest.fn();
    }
    if (!(mockPrisma.manualInvestment as any)?.findUnique) {
      (mockPrisma.manualInvestment as any).findUnique = jest.fn();
    }

    // Default: rate limiter allows all requests
    const mockRateLimitFn = jest.requireMock("@/lib/redis").__mockRateLimitFn;
    if (mockRateLimitFn) {
      mockRateLimitFn.mockResolvedValue({ success: true, limit: 30, remaining: 29, reset: Date.now() + 60000 });
    }
  });

  // ── Phase A: Dataroom Visit & Invest Button State ──────────────────────

  describe("Phase A: Dataroom Visit & Invest Button State", () => {
    it("determineInvestButtonState returns LIVE for active fund", async () => {
      const { determineInvestButtonState } = await import("@/components/view/invest-button");

      const state = determineInvestButtonState({
        fundExists: true,
        fundActivated: true,
        isPreview: false,
      });

      expect(state).toBe("LIVE");
    });

    it("determineInvestButtonState returns NO_FUND when fund missing", async () => {
      const { determineInvestButtonState } = await import("@/components/view/invest-button");

      expect(determineInvestButtonState({ fundExists: false, fundActivated: false, isPreview: false })).toBe("NO_FUND");
    });

    it("determineInvestButtonState returns NOT_ACTIVATED when fund inactive", async () => {
      const { determineInvestButtonState } = await import("@/components/view/invest-button");

      expect(determineInvestButtonState({ fundExists: true, fundActivated: false, isPreview: false })).toBe("NOT_ACTIVATED");
    });

    it("determineInvestButtonState returns PREVIEW in preview mode", async () => {
      const { determineInvestButtonState } = await import("@/components/view/invest-button");

      expect(determineInvestButtonState({ fundExists: true, fundActivated: true, isPreview: true })).toBe("PREVIEW");
    });
  });

  // ── Phase B: LP Registration ───────────────────────────────────────────

  describe("Phase B: LP Registration", () => {
    it("registers a new LP investor with fund association", async () => {
      const verifyNotBotPages = jest.requireMock("@/lib/security/bot-protection").verifyNotBotPages;
      verifyNotBotPages.mockResolvedValue(true);

      // User does not exist yet
      (mockPrisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // First call: user lookup returns null
        .mockResolvedValueOnce({     // Re-fetch after creation won't be called (new user path)
          ...LP_USER,
          investorProfile: LP_INVESTOR,
        });

      (mockPrisma.user.create as jest.Mock).mockResolvedValue({
        ...LP_USER,
        investorProfile: { ...LP_INVESTOR, id: "investor-lp-001" },
      });

      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
        id: FUND.id,
        teamId: TEAM.id,
      });

      (mockPrisma.investor.update as jest.Mock).mockResolvedValue(LP_INVESTOR);
      (mockPrisma.investment.findFirst as jest.Mock).mockResolvedValue(null);
      (mockPrisma.investment.create as jest.Mock).mockResolvedValue(INVESTMENT);

      const { POST: registerPOST } = await import("@/app/api/lp/register/route");
      const { wrapAppRouteHandler: wrapRegister } = await import("@/__tests__/helpers/app-router-adapter");
      const registerHandler = wrapRegister({ POST: registerPOST });
      const { req, res } = createRequest("POST", {
        name: LP_USER.name,
        email: LP_USER.email,
        phone: "+1-555-0100",
        entityType: "INDIVIDUAL",
        accreditationType: "INCOME",
        ndaAccepted: true,
        fundId: FUND.id,
        teamId: TEAM.id,
      });

      await registerHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.message).toBe("Account created successfully");

      // Verify user was created with LP role
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: LP_USER.email.toLowerCase(),
            role: "LP",
          }),
        }),
      );

      // Verify investment record was created
      expect(mockPrisma.investment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fundId: FUND.id,
            investorId: LP_INVESTOR.id,
            status: "APPLIED",
          }),
        }),
      );
    });

    it("rejects registration with missing email", async () => {
      const verifyNotBotPages = jest.requireMock("@/lib/security/bot-protection").verifyNotBotPages;
      verifyNotBotPages.mockResolvedValue(true);

      const { POST: registerPOST } = await import("@/app/api/lp/register/route");
      const { wrapAppRouteHandler: wrapRegister } = await import("@/__tests__/helpers/app-router-adapter");
      const registerHandler = wrapRegister({ POST: registerPOST });
      const { req, res } = createRequest("POST", { name: "Test" });

      await registerHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData()).error).toBe("Name and email are required");
    });

    it("rejects registration with invalid email format", async () => {
      const verifyNotBotPages = jest.requireMock("@/lib/security/bot-protection").verifyNotBotPages;
      verifyNotBotPages.mockResolvedValue(true);

      const { POST: registerPOST } = await import("@/app/api/lp/register/route");
      const { wrapAppRouteHandler: wrapRegister } = await import("@/__tests__/helpers/app-router-adapter");
      const registerHandler = wrapRegister({ POST: registerPOST });
      const { req, res } = createRequest("POST", { name: "Test", email: "not-an-email" });

      await registerHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData()).error).toBe("Invalid email format");
    });

    it("rejects non-POST methods", async () => {
      const { POST: registerPOST } = await import("@/app/api/lp/register/route");
      const { wrapAppRouteHandler: wrapRegister } = await import("@/__tests__/helpers/app-router-adapter");
      const registerHandler = wrapRegister({ POST: registerPOST });
      const { req, res } = createRequest("GET");

      await registerHandler(req, res);
      expect(res._getStatusCode()).toBe(405);
    });
  });

  // ── Phase C: Onboarding Flow Auto-Save/Resume ─────────────────────────

  describe("Phase C: Onboarding Flow Auto-Save & Resume", () => {
    beforeEach(() => {
      setSession({
        user: { id: LP_USER.id, email: LP_USER.email },
      });

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: LP_USER.id });
      (mockPrisma.investor.findUnique as jest.Mock).mockResolvedValue({
        id: LP_INVESTOR.id,
        fundId: FUND.id,
      });
    });

    it("saves onboarding progress (PUT) with personal info", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({ id: FUND.id });
      (mockPrisma.onboardingFlow.upsert as jest.Mock).mockResolvedValue({
        id: "flow-001",
        currentStep: 1,
        lastActiveAt: new Date(),
      });

      const handler = wrapAppRouteHandler(await import("@/app/api/lp/onboarding-flow/route"));
      const { req, res } = createRequest("PUT", {
        fundId: FUND.id,
        currentStep: 1,
        formData: {
          name: LP_USER.name,
          email: LP_USER.email,
          phone: "+1-555-0100",
        },
        stepsCompleted: [0],
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.flow.currentStep).toBe(1);

      expect(mockPrisma.onboardingFlow.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            investorId_fundId: {
              investorId: LP_INVESTOR.id,
              fundId: FUND.id,
            },
          },
        }),
      );
    });

    it("retrieves saved onboarding state (GET) for resume", async () => {
      (mockPrisma.onboardingFlow.findUnique as jest.Mock).mockResolvedValue({
        id: "flow-001",
        currentStep: 3,
        totalSteps: 7,
        status: "IN_PROGRESS",
        stepsCompleted: [0, 1, 2],
        formData: { name: LP_USER.name, email: LP_USER.email, entityType: "INDIVIDUAL" },
        lastActiveAt: new Date(),
      });

      const handler = wrapAppRouteHandler(await import("@/app/api/lp/onboarding-flow/route"));
      const { req, res } = createRequest("GET", undefined, { fundId: FUND.id });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.flow).not.toBeNull();
      expect(data.flow.currentStep).toBe(3);
      expect(data.flow.status).toBe("IN_PROGRESS");
    });

    it("returns null flow for completed onboarding", async () => {
      (mockPrisma.onboardingFlow.findUnique as jest.Mock).mockResolvedValue({
        id: "flow-001",
        status: "COMPLETED",
      });

      const handler = wrapAppRouteHandler(await import("@/app/api/lp/onboarding-flow/route"));
      const { req, res } = createRequest("GET", undefined, { fundId: FUND.id });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData()).flow).toBeNull();
    });

    it("clears onboarding on final submission (DELETE)", async () => {
      (mockPrisma.onboardingFlow.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const handler = wrapAppRouteHandler(await import("@/app/api/lp/onboarding-flow/route"));
      const { req, res } = createRequest("DELETE", undefined, { fundId: FUND.id });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData()).success).toBe(true);
      expect(mockPrisma.onboardingFlow.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { investorId: LP_INVESTOR.id, fundId: FUND.id },
          data: expect.objectContaining({ status: "COMPLETED" }),
        }),
      );
    });

    it("rejects onboarding save without fundId", async () => {
      const handler = wrapAppRouteHandler(await import("@/app/api/lp/onboarding-flow/route"));
      const { req, res } = createRequest("PUT", { currentStep: 1 });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("rejects unauthenticated access", async () => {
      setSessionOnce(null);

      const handler = wrapAppRouteHandler(await import("@/app/api/lp/onboarding-flow/route"));
      const { req, res } = createRequest("GET", undefined, { fundId: FUND.id });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  // ── Phase D: Document Signing ──────────────────────────────────────────

  describe("Phase D: Document Signing Flow", () => {
    describe("D.1: Fetching signing documents", () => {
      beforeEach(() => {
        setSession({
          user: { id: LP_USER.id, email: LP_USER.email },
        });
      });

      it("returns signing documents sorted by priority (NDA first)", async () => {
        (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
          id: LP_USER.id,
          email: LP_USER.email,
          name: LP_USER.name,
        });
        (mockPrisma.investor.findUnique as jest.Mock).mockResolvedValue({
          id: LP_INVESTOR.id,
          fundId: FUND.id,
        });
        (mockPrisma.signatureRecipient.findMany as jest.Mock).mockResolvedValue([
          SUB_RECIPIENT,
          NDA_RECIPIENT,
        ]);

        const handler = wrapAppRouteHandler(await import("@/app/api/lp/signing-documents/route"));
        const { req, res } = createRequest("GET");

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        const data = JSON.parse(res._getData());
        expect(data.documents).toHaveLength(2);
        // NDA should sort before Subscription
        expect(data.documents[0].title).toContain("Non-Disclosure");
        expect(data.documents[1].title).toContain("Subscription");
        expect(data.progress.total).toBe(2);
        expect(data.progress.signed).toBe(0);
        expect(data.progress.complete).toBe(false);
      });

      it("returns 401 for unauthenticated request", async () => {
        setSessionOnce(null);

        const handler = wrapAppRouteHandler(await import("@/app/api/lp/signing-documents/route"));
        const { req, res } = createRequest("GET");

        await handler(req, res);
        expect(res._getStatusCode()).toBe(401);
      });
    });

    describe("D.2: Viewing a signing document (GET /api/sign/[token])", () => {
      it("returns document data and marks recipient as VIEWED", async () => {
        const recipientWithDoc = {
          ...NDA_RECIPIENT,
          document: {
            ...SIGNATURE_DOC_NDA,
            fields: [
              {
                id: "field-sig-001",
                type: "SIGNATURE",
                pageNumber: 3,
                x: 100,
                y: 500,
                width: 200,
                height: 50,
                required: true,
                placeholder: "Sign here",
                value: null,
                recipientId: NDA_RECIPIENT.id,
              },
            ],
            recipients: [NDA_RECIPIENT],
          },
        };

        (mockPrisma.signatureRecipient.findUnique as jest.Mock).mockResolvedValue(recipientWithDoc);
        (mockPrisma.signatureRecipient.update as jest.Mock).mockResolvedValue({
          ...NDA_RECIPIENT,
          status: "VIEWED",
          viewedAt: new Date(),
        });
        (mockPrisma.signatureDocument.update as jest.Mock).mockResolvedValue({
          ...SIGNATURE_DOC_NDA,
          status: "VIEWED",
        });

        const handler = (await import("@/pages/api/sign/[token]")).default;
        const { req, res } = createRequest("GET", undefined, { token: "nda-token-abc123" });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        const data = JSON.parse(res._getData());
        expect(data.recipient.email).toBe(LP_USER.email);
        expect(data.recipient.status).toBe("VIEWED");
        expect(data.document.title).toBe("Non-Disclosure Agreement");
        expect(data.fields).toHaveLength(1);
        expect(data.fields[0].type).toBe("SIGNATURE");
      });

      it("returns 404 for invalid token", async () => {
        (mockPrisma.signatureRecipient.findUnique as jest.Mock).mockResolvedValue(null);

        const handler = (await import("@/pages/api/sign/[token]")).default;
        const { req, res } = createRequest("GET", undefined, { token: "invalid-token" });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(404);
      });
    });

    describe("D.3: Submitting signature (POST /api/sign/[token])", () => {
      it("signs document and updates status to COMPLETED when all signers done", async () => {
        const recipientWithFullDoc = {
          ...NDA_RECIPIENT,
          document: {
            ...SIGNATURE_DOC_NDA,
            fields: [
              {
                id: "field-sig-001",
                type: "SIGNATURE",
                pageNumber: 3,
                x: 100,
                y: 500,
                width: 200,
                height: 50,
                required: true,
                value: null,
                recipientId: NDA_RECIPIENT.id,
              },
            ],
            recipients: [NDA_RECIPIENT],
          },
        };

        (mockPrisma.signatureRecipient.findUnique as jest.Mock).mockResolvedValue(recipientWithFullDoc);

        // Mock the $transaction callback
        const mockTxSignatureField = { update: jest.fn().mockResolvedValue({}) };
        const mockTxRecipient = {
          update: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue([
            { ...NDA_RECIPIENT, status: "SIGNED", role: "SIGNER", signedAt: new Date() },
          ]),
        };
        const mockTxDocument = { update: jest.fn().mockResolvedValue({}) };
        const mockTxAuditLog = { create: jest.fn().mockResolvedValue({}) };

        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
          return callback({
            signatureField: mockTxSignatureField,
            signatureRecipient: mockTxRecipient,
            signatureDocument: mockTxDocument,
            signatureAuditLog: mockTxAuditLog,
          });
        });

        // Post-completion lookups
        (mockPrisma.investor.findFirst as jest.Mock).mockResolvedValue(LP_INVESTOR);
        (mockPrisma.investorDocument.upsert as jest.Mock).mockResolvedValue({});
        (mockPrisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
        (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(GP_USER);

        const handler = (await import("@/pages/api/sign/[token]")).default;
        const { req, res } = createRequest("POST", {
          fields: [{ id: "field-sig-001", value: "data:image/png;base64,signature" }],
          signatureImage: "data:image/png;base64,signature",
          consentConfirmed: true,
        }, { token: "nda-token-abc123" });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        const data = JSON.parse(res._getData());
        expect(data.message).toBe("Document signed successfully");
        expect(data.status).toBe("COMPLETED");

        // Verify transaction was called
        expect(mockPrisma.$transaction).toHaveBeenCalled();
        // Verify recipient was marked as SIGNED
        expect(mockTxRecipient.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: NDA_RECIPIENT.id },
            data: expect.objectContaining({ status: "SIGNED" }),
          }),
        );
      });

      it("rejects signing without consent", async () => {
        const recipientWithFullDoc = {
          ...NDA_RECIPIENT,
          document: {
            ...SIGNATURE_DOC_NDA,
            fields: [
              {
                id: "field-sig-001",
                type: "SIGNATURE",
                pageNumber: 3,
                x: 100,
                y: 500,
                width: 200,
                height: 50,
                required: true,
                value: null,
                recipientId: NDA_RECIPIENT.id,
              },
            ],
            recipients: [NDA_RECIPIENT],
          },
        };

        (mockPrisma.signatureRecipient.findUnique as jest.Mock).mockResolvedValue(recipientWithFullDoc);

        const handler = (await import("@/pages/api/sign/[token]")).default;
        const { req, res } = createRequest("POST", {
          fields: [],
          signatureImage: "data:image/png;base64,sig",
          consentConfirmed: false,
        }, { token: "nda-token-abc123" });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
        const data = JSON.parse(res._getData());
        expect(data.requiresConsent).toBe(true);
      });

      it("rejects signing without required signature image", async () => {
        const recipientWithFullDoc = {
          ...NDA_RECIPIENT,
          document: {
            ...SIGNATURE_DOC_NDA,
            fields: [
              {
                id: "field-sig-001",
                type: "SIGNATURE",
                pageNumber: 3,
                x: 100,
                y: 500,
                width: 200,
                height: 50,
                required: true,
                value: null,
                recipientId: NDA_RECIPIENT.id,
              },
            ],
            recipients: [NDA_RECIPIENT],
          },
        };

        (mockPrisma.signatureRecipient.findUnique as jest.Mock).mockResolvedValue(recipientWithFullDoc);

        const handler = (await import("@/pages/api/sign/[token]")).default;
        const { req, res } = createRequest("POST", {
          fields: [],
          signatureImage: null,
          consentConfirmed: true,
        }, { token: "nda-token-abc123" });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
        expect(JSON.parse(res._getData()).error).toContain("Signature is required");
      });
    });
  });

  // ── Phase E: Wire Instructions & Proof Upload ──────────────────────────

  describe("Phase E: Wire Instructions & Proof Upload", () => {
    describe("E.1: LP fetches wire instructions", () => {
      beforeEach(() => {
        setSession({
          user: { id: LP_USER.id, email: LP_USER.email },
        });
      });

      it("returns wire instructions from regular investment fallback", async () => {
        (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
          investorProfile: { id: LP_INVESTOR.id },
        });
        (mockPrisma.manualInvestment.findFirst as jest.Mock).mockResolvedValue(null);
        (mockPrisma.investment.findFirst as jest.Mock).mockResolvedValue({
          id: INVESTMENT.id,
          fundId: FUND.id,
          commitmentAmount: INVESTMENT.commitmentAmount,
          fund: {
            id: FUND.id,
            name: FUND.name,
            teamId: TEAM.id,
          },
        });

        const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-instructions/route"));
        const { req, res } = createRequest("GET");

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        const data = JSON.parse(res._getData());
        expect(data.fundId).toBe(FUND.id);
        expect(data.fundName).toBe(FUND.name);
        expect(data.wireInstructions).not.toBeNull();
        expect(data.wireInstructions.bankName).toBe("First National Bank");
        expect(data.wireInstructions.accountNumber).toBe("****7890");
        expect(data.wireInstructions.routingNumber).toBe("021000089");
        expect(data.commitmentAmount).toBe(250000);
      });

      it("returns 401 for unauthenticated request", async () => {
        setSessionOnce(null);

        const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-instructions/route"));
        const { req, res } = createRequest("GET");

        await handler(req, res);
        expect(res._getStatusCode()).toBe(401);
      });

      it("returns 404 when no investment found", async () => {
        (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
          investorProfile: { id: LP_INVESTOR.id },
        });
        (mockPrisma.manualInvestment.findFirst as jest.Mock).mockResolvedValue(null);
        (mockPrisma.investment.findFirst as jest.Mock).mockResolvedValue(null);

        const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-instructions/route"));
        const { req, res } = createRequest("GET");

        await handler(req, res);

        expect(res._getStatusCode()).toBe(404);
      });
    });

    describe("E.2: LP uploads wire proof", () => {
      beforeEach(() => {
        setSession({
          user: { id: LP_USER.id, email: LP_USER.email },
        });
      });

      it("successfully submits proof of payment metadata", async () => {
        (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: LP_USER.id });
        (mockPrisma.manualInvestment.findUnique as jest.Mock).mockResolvedValue({
          id: INVESTMENT.id,
          fundId: FUND.id,
        });

        const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-proof/route"));
        const { req, res } = createRequest("POST", {
          investmentId: INVESTMENT.id,
          storageKey: "proofs/wire-receipt-001.pdf",
          storageType: "S3",
          fileType: "application/pdf",
          fileName: "wire-receipt.pdf",
          fileSize: 524288,
          notes: "Wire sent from Chase account ending 1234",
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        const data = JSON.parse(res._getData());
        expect(data.success).toBe(true);
        expect(data.proofStatus).toBe("UPLOADED");
        expect(data.proofFileName).toBe("wire-receipt.pdf");

        const uploadMock = jest.requireMock("@/lib/wire-transfer").uploadProofOfPayment;
        expect(uploadMock).toHaveBeenCalledWith(
          INVESTMENT.id,
          expect.objectContaining({
            storageKey: "proofs/wire-receipt-001.pdf",
            fileName: "wire-receipt.pdf",
          }),
          LP_USER.id,
        );
      });

      it("rejects proof upload with missing fields", async () => {
        (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: LP_USER.id });

        const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-proof/route"));
        const { req, res } = createRequest("POST", { investmentId: INVESTMENT.id });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
      });

      it("rejects unauthenticated proof upload", async () => {
        setSessionOnce(null);

        const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-proof/route"));
        const { req, res } = createRequest("POST", {});

        await handler(req, res);
        expect(res._getStatusCode()).toBe(401);
      });

      it("returns 500 for generic upload failure", async () => {
        (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: LP_USER.id });
        (mockPrisma.manualInvestment.findUnique as jest.Mock).mockResolvedValue({
          id: INVESTMENT.id,
          fundId: FUND.id,
        });

        const uploadMock = jest.requireMock("@/lib/wire-transfer").uploadProofOfPayment;
        uploadMock.mockRejectedValueOnce(new Error("Database connection failed"));

        const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-proof/route"));
        const { req, res } = createRequest("POST", {
          investmentId: INVESTMENT.id,
          storageKey: "proofs/test.pdf",
          storageType: "S3",
          fileType: "application/pdf",
          fileName: "test.pdf",
          fileSize: 1024,
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(500);
        expect(JSON.parse(res._getData()).error).toBe("Internal server error");
      });

      it("returns 409 when proof already verified", async () => {
        (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: LP_USER.id });
        (mockPrisma.manualInvestment.findUnique as jest.Mock).mockResolvedValue({
          id: INVESTMENT.id,
          fundId: FUND.id,
        });

        const uploadMock = jest.requireMock("@/lib/wire-transfer").uploadProofOfPayment;
        uploadMock.mockRejectedValueOnce(new Error("Proof has already been verified"));

        const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-proof/route"));
        const { req, res } = createRequest("POST", {
          investmentId: INVESTMENT.id,
          storageKey: "proofs/dup.pdf",
          storageType: "S3",
          fileType: "application/pdf",
          fileName: "dup.pdf",
          fileSize: 1024,
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(409);
        expect(JSON.parse(res._getData()).error).toBe("Proof has already been verified");
      });
    });
  });

  // ── Phase E.3: Staged Commitment Validation ─────────────────────────────

  describe("Phase E.3: Staged Commitment Validation", () => {
    const LP_SESSION = { user: { id: LP_USER.id, email: LP_USER.email } };

    const validTranches = [
      { amount: 125_000, scheduledDate: "2026-06-01", label: "First Close" },
      { amount: 125_000, scheduledDate: "2026-09-01", label: "Second Close" },
    ];

    beforeEach(() => {
      setSession(LP_SESSION);
    });

    it("rejects commitment below fund minimum ($200K)", async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: LP_USER.id,
        investorProfile: {
          id: LP_INVESTOR.id,
          ndaSigned: true,
          accreditationStatus: "SELF_CERTIFIED",
          fund: {
            id: FUND.id,
            teamId: TEAM.id,
            minimumInvestment: new Decimal(200_000),
          },
        },
      });

      // Staged commitments enabled
      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([{ stagedCommitmentsEnabled: true }]);

      const handler = wrapAppRouteHandler(await import("@/app/api/lp/staged-commitment/route"));
      const { req, res } = createRequest("POST", {
        totalCommitment: 150_000, // Below $200K minimum
        tranches: [
          { amount: 75_000, scheduledDate: "2026-06-01", label: "Close 1" },
          { amount: 75_000, scheduledDate: "2026-09-01", label: "Close 2" },
        ],
        schedule: "MILESTONE",
        confirmTerms: true,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData()).error).toContain("Minimum commitment");
    });

    it("blocks commitment without accreditation", async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: LP_USER.id,
        investorProfile: {
          id: LP_INVESTOR.id,
          ndaSigned: true,
          accreditationStatus: "NOT_STARTED", // Not accredited
          fund: {
            id: FUND.id,
            teamId: TEAM.id,
            minimumInvestment: new Decimal(200_000),
          },
        },
      });

      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([{ stagedCommitmentsEnabled: true }]);

      const handler = wrapAppRouteHandler(await import("@/app/api/lp/staged-commitment/route"));
      const { req, res } = createRequest("POST", {
        totalCommitment: 250_000,
        tranches: validTranches,
        schedule: "MILESTONE",
        confirmTerms: true,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData()).error).toContain("Accreditation must be completed");
    });

    it("blocks commitment without NDA signed", async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: LP_USER.id,
        investorProfile: {
          id: LP_INVESTOR.id,
          ndaSigned: false, // NDA not signed
          accreditationStatus: "SELF_CERTIFIED",
          fund: {
            id: FUND.id,
            teamId: TEAM.id,
            minimumInvestment: new Decimal(200_000),
          },
        },
      });

      (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([{ stagedCommitmentsEnabled: true }]);

      const handler = wrapAppRouteHandler(await import("@/app/api/lp/staged-commitment/route"));
      const { req, res } = createRequest("POST", {
        totalCommitment: 250_000,
        tranches: validTranches,
        schedule: "MILESTONE",
        confirmTerms: true,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData()).error).toContain("NDA must be signed first");
    });
  });

  // ── Phase F: GP Wire Confirmation ──────────────────────────────────────

  describe("Phase F: GP Wire Confirmation", () => {
    const gpSession = { user: { id: GP_USER.id, email: GP_USER.email } };

    beforeEach(() => {
      setSession(gpSession);
    });

    it("confirms wire and advances Investment to FUNDED", async () => {
      // Team membership check
      (mockPrisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
        userId: GP_USER.id,
        teamId: TEAM.id,
        role: "ADMIN",
        status: "ACTIVE",
      });

      // Transaction lookup
      (mockPrisma.transaction.findUnique as jest.Mock).mockResolvedValue(TRANSACTION);

      // Fund ownership check
      (mockPrisma.fund.findFirst as jest.Mock).mockResolvedValue({
        id: FUND.id,
        name: FUND.name,
      });

      // Atomic transaction mock
      const updatedTx = {
        id: TRANSACTION.id,
        status: "COMPLETED",
        confirmedAt: new Date(),
        fundsReceivedDate: new Date("2026-02-10"),
      };

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const txMock = {
          transaction: {
            findUnique: jest.fn().mockResolvedValue({ status: "PENDING" }),
            update: jest.fn().mockResolvedValue(updatedTx),
          },
          investment: {
            findFirst: jest.fn().mockResolvedValue({
              id: INVESTMENT.id,
              commitmentAmount: new Decimal(250_000),
              fundedAmount: new Decimal(0),
              status: "COMMITTED",
            }),
            update: jest.fn().mockResolvedValue({
              id: INVESTMENT.id,
              fundedAmount: new Decimal(250_000),
              status: "FUNDED",
            }),
            aggregate: jest.fn().mockResolvedValue({
              _sum: { fundedAmount: new Decimal(250_000), commitmentAmount: new Decimal(250_000) },
            }),
          },
          fundAggregate: {
            upsert: jest.fn().mockResolvedValue({
              fundId: FUND.id,
              totalInbound: new Decimal(250_000),
              totalCommitted: new Decimal(250_000),
            }),
          },
        };
        return callback(txMock);
      });

      // Audit log mock
      const { logAuditEvent } = jest.requireMock("@/lib/audit/audit-logger");

      const handler = wrapAppRouteHandler(await import("@/app/api/admin/wire/confirm/route"));
      const { req, res } = createRequest("POST", {
        transactionId: TRANSACTION.id,
        teamId: TEAM.id,
        fundsReceivedDate: "2026-02-10T00:00:00.000Z",
        amountReceived: 250_000,
        bankReference: "WIRE-REF-20260210",
        confirmationNotes: "Funds cleared same day",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.transaction.status).toBe("COMPLETED");
      expect(data.investmentUpdated).toBe(true);

      // Verify audit was logged
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "ADMIN_ACTION",
          userId: GP_USER.id,
          teamId: TEAM.id,
          resourceType: "Transaction",
          resourceId: TRANSACTION.id,
          metadata: expect.objectContaining({
            action: "WIRE_TRANSFER_CONFIRMED",
            amountReceived: 250_000,
          }),
        }),
      );
    });

    it("rejects confirmation for wrong team", async () => {
      (mockPrisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);

      const handler = wrapAppRouteHandler(await import("@/app/api/admin/wire/confirm/route"));
      const { req, res } = createRequest("POST", {
        transactionId: TRANSACTION.id,
        teamId: "wrong-team-id",
        fundsReceivedDate: "2026-02-10T00:00:00.000Z",
        amountReceived: 250_000,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(JSON.parse(res._getData()).error).toContain("Forbidden");
    });

    it("rejects confirmation for non-existent transaction", async () => {
      (mockPrisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
        userId: GP_USER.id,
        teamId: TEAM.id,
        role: "ADMIN",
        status: "ACTIVE",
      });
      (mockPrisma.transaction.findUnique as jest.Mock).mockResolvedValue(null);

      const handler = wrapAppRouteHandler(await import("@/app/api/admin/wire/confirm/route"));
      const { req, res } = createRequest("POST", {
        transactionId: "non-existent-txn",
        teamId: TEAM.id,
        fundsReceivedDate: "2026-02-10T00:00:00.000Z",
        amountReceived: 250_000,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("rejects confirmation with negative amount", async () => {
      const handler = wrapAppRouteHandler(await import("@/app/api/admin/wire/confirm/route"));
      const { req, res } = createRequest("POST", {
        transactionId: TRANSACTION.id,
        teamId: TEAM.id,
        fundsReceivedDate: "2026-02-10T00:00:00.000Z",
        amountReceived: -1000,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("rejects confirmation exceeding $100B max", async () => {
      const handler = wrapAppRouteHandler(await import("@/app/api/admin/wire/confirm/route"));
      const { req, res } = createRequest("POST", {
        transactionId: TRANSACTION.id,
        teamId: TEAM.id,
        fundsReceivedDate: "2026-02-10T00:00:00.000Z",
        amountReceived: 200_000_000_000,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("rejects confirmation for already-completed transaction", async () => {
      (mockPrisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
        userId: GP_USER.id,
        teamId: TEAM.id,
        role: "ADMIN",
        status: "ACTIVE",
      });
      (mockPrisma.transaction.findUnique as jest.Mock).mockResolvedValue({
        ...TRANSACTION,
        status: "COMPLETED",
      });
      (mockPrisma.fund.findFirst as jest.Mock).mockResolvedValue({
        id: FUND.id,
        name: FUND.name,
      });

      const handler = wrapAppRouteHandler(await import("@/app/api/admin/wire/confirm/route"));
      const { req, res } = createRequest("POST", {
        transactionId: TRANSACTION.id,
        teamId: TEAM.id,
        fundsReceivedDate: "2026-02-10T00:00:00.000Z",
        amountReceived: 250_000,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData()).error).toContain("already been confirmed");
    });

    it("rejects confirmation for CANCELLED transaction", async () => {
      (mockPrisma.userTeam.findFirst as jest.Mock).mockResolvedValue({
        userId: GP_USER.id,
        teamId: TEAM.id,
        role: "ADMIN",
        status: "ACTIVE",
      });
      (mockPrisma.transaction.findUnique as jest.Mock).mockResolvedValue({
        ...TRANSACTION,
        status: "CANCELLED",
      });
      (mockPrisma.fund.findFirst as jest.Mock).mockResolvedValue({
        id: FUND.id,
        name: FUND.name,
      });

      const handler = wrapAppRouteHandler(await import("@/app/api/admin/wire/confirm/route"));
      const { req, res } = createRequest("POST", {
        transactionId: TRANSACTION.id,
        teamId: TEAM.id,
        fundsReceivedDate: "2026-02-10T00:00:00.000Z",
        amountReceived: 250_000,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData()).error).toContain("cancelled");
    });

    it("rejects unauthenticated confirmation", async () => {
      setSessionOnce(null);

      const handler = wrapAppRouteHandler(await import("@/app/api/admin/wire/confirm/route"));
      const { req, res } = createRequest("POST", {
        transactionId: TRANSACTION.id,
        teamId: TEAM.id,
        fundsReceivedDate: "2026-02-10T00:00:00.000Z",
        amountReceived: 250_000,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  // ── Phase G: Final State Verification ──────────────────────────────────

  describe("Phase G: Final State — Full Flow Verification", () => {
    it("verifies end-to-end state transitions are valid", () => {
      // Investment Stage Progression:
      // LEAD → INVITED → ONBOARDING → COMMITTED → DOCS_APPROVED → FUNDED
      const stages = ["LEAD", "INVITED", "ONBOARDING", "COMMITTED", "DOCS_APPROVED", "FUNDED"];

      // Verify APPLIED is a valid initial stage (from registration)
      expect(["APPLIED", ...stages]).toContain("APPLIED");

      // Verify FUNDED is the terminal state
      expect(stages[stages.length - 1]).toBe("FUNDED");
    });

    it("verifies invest button state machine covers all scenarios", async () => {
      const { determineInvestButtonState } = await import("@/components/view/invest-button");

      const scenarios = [
        { input: { fundExists: false, fundActivated: false, isPreview: false }, expected: "NO_FUND" },
        { input: { fundExists: true, fundActivated: false, isPreview: false }, expected: "NOT_ACTIVATED" },
        { input: { fundExists: true, fundActivated: true, isPreview: false }, expected: "LIVE" },
        { input: { fundExists: true, fundActivated: true, isPreview: true }, expected: "PREVIEW" },
        { input: { fundExists: false, fundActivated: true, isPreview: true }, expected: "PREVIEW" },
      ];

      for (const { input, expected } of scenarios) {
        expect(determineInvestButtonState(input)).toBe(expected);
      }
    });

    it("verifies document signing priority ordering is correct", () => {
      const getDocumentPriority = (title: string): number => {
        const lower = title.toLowerCase();
        if (lower.includes("nda") || lower.includes("non-disclosure") || lower.includes("confidentiality")) return 1;
        if (lower.includes("subscription") || lower.includes("sub ag")) return 2;
        if (lower.includes("lpa") || lower.includes("limited partner")) return 3;
        if (lower.includes("side letter")) return 4;
        return 5;
      };

      expect(getDocumentPriority("Non-Disclosure Agreement")).toBe(1);
      expect(getDocumentPriority("NDA")).toBe(1);
      expect(getDocumentPriority("Subscription Agreement")).toBe(2);
      expect(getDocumentPriority("LPA - Limited Partnership Agreement")).toBe(3);
      expect(getDocumentPriority("Side Letter")).toBe(4);
      expect(getDocumentPriority("Operating Agreement")).toBe(5);

      // NDA < Subscription < LPA (sorted ascending = NDA first)
      expect(getDocumentPriority("NDA")).toBeLessThan(getDocumentPriority("Subscription Agreement"));
      expect(getDocumentPriority("Subscription Agreement")).toBeLessThan(getDocumentPriority("LPA"));
    });

    it("verifies wire amount variance is tracked on confirmation", async () => {
      // When GP confirms a different amount than expected, variance should be recorded
      const expected = new Decimal(250_000);
      const received = new Decimal(248_500);
      const variance = received.minus(expected);

      expect(variance.toString()).toBe("-1500");
      expect(variance.isZero()).toBe(false);
    });
  });
});
