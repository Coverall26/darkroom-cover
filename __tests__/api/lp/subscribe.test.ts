// @ts-nocheck
/**
 * LP Subscribe API Tests
 *
 * Tests for pages/api/lp/subscribe.ts - Investment subscription creation.
 *
 * These tests validate:
 * - Authentication requirements
 * - NDA signature requirement
 * - Accreditation status validation
 * - Fund association validation
 * - Amount validation and minimum investment
 * - Tier allocation for non-flat mode
 * - PDF generation and storage
 * - Subscription creation with audit logging
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock functions - defined at module level for hoisting
const mockGetServerSession = jest.fn();
const mockUserFindUnique = jest.fn();
const mockFundFindUnique = jest.fn();
const mockFundPricingTierFindMany = jest.fn();
const mockTransaction = jest.fn();
const mockOnboardingFlowFindFirst = jest.fn();
const mockInvestorUpdate = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: (...args: any[]) => mockUserFindUnique(...args),
    },
    fund: {
      findUnique: (...args: any[]) => mockFundFindUnique(...args),
    },
    fundPricingTier: {
      findMany: (...args: any[]) => mockFundPricingTierFindMany(...args),
    },
    onboardingFlow: {
      findFirst: (...args: any[]) => mockOnboardingFlowFindFirst(...args),
    },
    investor: {
      update: (...args: any[]) => mockInvestorUpdate(...args),
    },
    $transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

// Convenience aliases
const mockPrismaUser = { findUnique: mockUserFindUnique };
const mockPrismaFund = { findUnique: mockFundFindUnique };
const mockPrismaFundPricingTier = { findMany: mockFundPricingTierFindMany };
const mockPrismaTransaction = mockTransaction;

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

const mockRequireLPAuthAppRouter = jest.fn();
jest.mock("@/lib/auth/rbac", () => ({
  requireLPAuthAppRouter: (...args: any[]) => mockRequireLPAuthAppRouter(...args),
  enforceRBAC: jest.fn(),
  requireAdmin: jest.fn(),
  enforceRBACAppRouter: jest.fn(),
  requireAdminAppRouter: jest.fn(),
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  appRouterStrictRateLimit: jest.fn().mockResolvedValue(null),
  strictRateLimiter: jest.fn().mockResolvedValue(undefined),
  apiRateLimiter: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/funds/tranche-service", () => ({
  executePurchase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/emails/send-gp-commitment-notification", () => ({
  sendGpCommitmentNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/emails/send-lp-commitment-confirmation", () => ({
  sendLpCommitmentConfirmation: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/tracking/server-events", () => ({
  publishServerEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/sse/event-emitter", () => ({
  emitSSE: jest.fn(),
  SSE_EVENTS: {
    INVESTOR_COMMITTED: "investor.committed",
  },
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/files/put-file-server", () => ({
  putFileServer: jest.fn().mockResolvedValue({
    type: "S3_PATH",
    data: "/uploads/subscription-doc.pdf",
  }),
}));

jest.mock("@/lib/id-helper", () => ({
  newId: jest.fn().mockReturnValue("doc_test123"),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logSubscriptionEvent: jest.fn().mockResolvedValue("audit-log-id"),
}));

// Mock pdf-lib
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
  StandardFonts: {
    Helvetica: "Helvetica",
    HelveticaBold: "Helvetica-Bold",
  },
}));

import { POST } from "@/app/api/lp/subscribe/route";
import { wrapAppRouteHandler } from "@/__tests__/helpers/app-router-adapter";
import { logSubscriptionEvent } from "@/lib/audit/audit-logger";

const handler = wrapAppRouteHandler({ POST });

/**
 * Helper: creates a full tx mock for prisma.$transaction callbacks.
 * Includes all models accessed inside the subscribe route's transaction.
 */
function createTxMock(overrides: Record<string, any> = {}) {
  return {
    fundPricingTier: mockPrismaFundPricingTier,
    signatureDocument: {
      create: jest.fn().mockResolvedValue({
        id: "doc-123",
        recipients: [{ signingToken: "token123" }],
      }),
    },
    subscription: {
      create: jest.fn().mockResolvedValue({
        id: "sub-123",
        amount: 100000,
      }),
    },
    investment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: "inv-123",
        fundId: "fund-1",
        investorId: "investor-1",
        commitmentAmount: 100000,
        fundedAmount: 0,
        status: "COMMITTED",
      }),
      update: jest.fn().mockResolvedValue({
        id: "inv-123",
        commitmentAmount: 100000,
        status: "COMMITTED",
      }),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { commitmentAmount: 100000 },
      }),
    },
    investor: {
      update: jest.fn().mockResolvedValue({}),
    },
    fundAggregate: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

describe("LP Subscribe API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no onboarding flow found (auto-heal won't trigger)
    mockOnboardingFlowFindFirst.mockResolvedValue(null);
    mockInvestorUpdate.mockResolvedValue({});

    // Default: App Router rbac mock delegates to getServerSession mock
    // When getServerSession returns null → rbac returns NextResponse(401)
    // When getServerSession returns session → rbac returns RBACResult
    mockRequireLPAuthAppRouter.mockImplementation(async () => {
      const session = await mockGetServerSession();
      if (!session?.user?.email && !session?.user?.id) {
        const { NextResponse } = require("next/server");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return {
        userId: session.user.id || "test-user-id",
        email: session.user.email || "",
        investorId: "",
        teamId: "",
        role: "MEMBER",
        session: { user: session.user },
      };
    });
  });

  describe("HTTP Method Validation", () => {
    it("should reject non-POST requests", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData().error).toBe("Method not allowed");
    });

    it("should accept POST requests", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: {},
      });

      await handler(req, res);

      // Will return 401 for no session, but method is accepted
      expect(res._getStatusCode()).toBe(401);
    });
  });

  describe("Authentication", () => {
    it("should reject unauthenticated requests", async () => {
      mockGetServerSession.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(res._getJSONData().error).toBe("Unauthorized");
    });

    it("should reject session without email", async () => {
      mockGetServerSession.mockResolvedValue({ user: {} });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });
  });

  describe("Input Validation", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });
    });

    it("should require fundId", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { amount: "100000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error).toBe("Fund ID and amount are required");
    });

    it("should require amount", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error).toBe("Fund ID and amount are required");
    });
  });

  describe("Investor Profile Validation", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });
    });

    it("should reject user without investor profile", async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        investorProfile: null,
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error).toBe("Investor profile not found");
    });

    it("should reject investor without signed NDA", async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        investorProfile: {
          id: "investor-1",
          ndaSigned: false,
          accreditationStatus: "SELF_CERTIFIED",
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error).toContain("NDA must be signed before committing");
    });

    it("should reject investor without accreditation", async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        investorProfile: {
          id: "investor-1",
          ndaSigned: true,
          accreditationStatus: "PENDING",
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error).toContain("Accreditation must be confirmed before committing");
    });

    it("should accept SELF_CERTIFIED accreditation", async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        name: "John Investor",
        investorProfile: {
          id: "investor-1",
          ndaSigned: true,
          accreditationStatus: "SELF_CERTIFIED",
          fundId: "fund-1",
          entityName: "John's LLC",
        },
      });

      mockPrismaFund.findUnique.mockResolvedValue({
        id: "fund-1",
        name: "Test Fund",
        minimumInvestment: 50000,
        flatModeEnabled: true,
        teamId: "team-1",
        pricingTiers: [],
      });

      mockPrismaTransaction.mockImplementation(async (fn) => {
        return fn(createTxMock());
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(201);
    });

    it("should accept KYC_VERIFIED accreditation", async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        investorProfile: {
          id: "investor-1",
          ndaSigned: true,
          accreditationStatus: "KYC_VERIFIED",
          fundId: "fund-1",
        },
      });

      mockPrismaFund.findUnique.mockResolvedValue({
        id: "fund-1",
        name: "Test Fund",
        minimumInvestment: 50000,
        flatModeEnabled: true,
        teamId: "team-1",
        pricingTiers: [],
      });

      mockPrismaTransaction.mockImplementation(async (fn) => {
        return fn(createTxMock());
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(201);
    });

    it("should auto-heal NDA when onboarding step >= 6 (GP-added investor)", async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        name: "GP Added LP",
        investorProfile: {
          id: "investor-1",
          ndaSigned: false,
          accreditationStatus: "PENDING",
          onboardingStep: 7, // Past commitment step — must have completed NDA+accreditation
          fundId: "fund-1",
          entityName: "LP Corp",
        },
      });

      mockPrismaFund.findUnique.mockResolvedValue({
        id: "fund-1",
        name: "Test Fund",
        minimumInvestment: 50000,
        flatModeEnabled: true,
        teamId: "team-1",
        pricingTiers: [],
      });

      mockPrismaTransaction.mockImplementation(async (fn) => {
        return fn(createTxMock());
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      // Auto-heal should have fixed both NDA and accreditation
      expect(mockInvestorUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "investor-1" },
          data: expect.objectContaining({ ndaSigned: true }),
        }),
      );
      expect(mockInvestorUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "investor-1" },
          data: expect.objectContaining({ accreditationStatus: "SELF_CERTIFIED" }),
        }),
      );
      expect(res._getStatusCode()).toBe(201);
    });

    it("should auto-heal accreditation when OnboardingFlow shows step completed", async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        investorProfile: {
          id: "investor-1",
          ndaSigned: true,
          accreditationStatus: "PENDING",
          onboardingStep: 2, // Low step — but OnboardingFlow has evidence
          fundId: "fund-1",
        },
      });

      // OnboardingFlow record shows accreditation step was completed
      mockOnboardingFlowFindFirst.mockResolvedValue({
        stepsCompleted: { accreditation: true, agreement: true },
        currentStep: 6,
      });

      mockPrismaFund.findUnique.mockResolvedValue({
        id: "fund-1",
        name: "Test Fund",
        minimumInvestment: 50000,
        flatModeEnabled: true,
        teamId: "team-1",
        pricingTiers: [],
      });

      mockPrismaTransaction.mockImplementation(async (fn) => {
        return fn(createTxMock());
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(mockInvestorUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accreditationStatus: "SELF_CERTIFIED" }),
        }),
      );
      expect(res._getStatusCode()).toBe(201);
    });

    it("should still reject when no auto-heal evidence exists", async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        investorProfile: {
          id: "investor-1",
          ndaSigned: false,
          accreditationStatus: "PENDING",
          onboardingStep: 2, // Low step
        },
      });

      // No OnboardingFlow record
      mockOnboardingFlowFindFirst.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error).toContain("NDA must be signed before committing");
    });
  });

  describe("Fund Association Validation", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });
    });

    it("should reject subscription to different fund", async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        investorProfile: {
          id: "investor-1",
          ndaSigned: true,
          accreditationStatus: "SELF_CERTIFIED",
          fundId: "fund-other", // Associated with different fund
        },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData().error).toBe(
        "You can only subscribe to your associated fund"
      );
    });

    it("should reject subscription when fund not found", async () => {
      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        investorProfile: {
          id: "investor-1",
          ndaSigned: true,
          accreditationStatus: "SELF_CERTIFIED",
          fundId: "fund-1",
        },
      });

      mockPrismaFund.findUnique.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData().error).toBe("Fund not found");
    });
  });

  describe("Amount Validation", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });

      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        investorProfile: {
          id: "investor-1",
          ndaSigned: true,
          accreditationStatus: "SELF_CERTIFIED",
          fundId: "fund-1",
        },
      });
    });

    it("should reject invalid amount (NaN)", async () => {
      mockPrismaFund.findUnique.mockResolvedValue({
        id: "fund-1",
        name: "Test Fund",
        minimumInvestment: 50000,
        flatModeEnabled: true,
        pricingTiers: [],
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "not-a-number" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error).toBe("Invalid subscription amount");
    });

    it("should reject zero or negative amount", async () => {
      mockPrismaFund.findUnique.mockResolvedValue({
        id: "fund-1",
        name: "Test Fund",
        minimumInvestment: 50000,
        flatModeEnabled: true,
        pricingTiers: [],
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "0" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error).toBe("Invalid subscription amount");
    });

    it("should reject amount below minimum investment", async () => {
      mockPrismaFund.findUnique.mockResolvedValue({
        id: "fund-1",
        name: "Test Fund",
        minimumInvestment: 100000,
        flatModeEnabled: true,
        pricingTiers: [],
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "50000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error).toContain("Minimum investment");
    });
  });

  describe("Successful Subscription", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });

      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        name: "John Doe",
        investorProfile: {
          id: "investor-1",
          ndaSigned: true,
          accreditationStatus: "SELF_CERTIFIED",
          fundId: "fund-1",
          entityName: "John Doe LLC",
        },
      });

      mockPrismaFund.findUnique.mockResolvedValue({
        id: "fund-1",
        name: "Test Fund",
        minimumInvestment: 50000,
        flatModeEnabled: true,
        teamId: "team-1",
        pricingTiers: [],
        team: { id: "team-1" },
      });
    });

    it("should create subscription and return signing URL", async () => {
      mockPrismaTransaction.mockImplementation(async (fn) => {
        return fn(createTxMock({
          signatureDocument: {
            create: jest.fn().mockResolvedValue({
              id: "doc-123",
              recipients: [{ signingToken: "sign-token-xyz" }],
            }),
          },
        }));
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(201);
      const data = res._getJSONData();
      expect(data.success).toBe(true);
      expect(data.signingUrl).toContain("/view/sign/");
      expect(data.subscription.id).toBeDefined();
      expect(data.subscription.status).toBe("PENDING");
    });

    it("should log subscription event", async () => {
      mockPrismaTransaction.mockImplementation(async (fn) => {
        return fn(createTxMock());
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(logSubscriptionEvent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          eventType: "SUBSCRIPTION_CREATED",
          subscriptionId: "sub-123",
          investorId: "investor-1",
          fundId: "fund-1",
        })
      );
    });
  });

  describe("Tiered Subscription (Non-Flat Mode)", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });

      mockPrismaUser.findUnique.mockResolvedValue({
        id: "user-1",
        email: "investor@example.com",
        investorProfile: {
          id: "investor-1",
          ndaSigned: true,
          accreditationStatus: "SELF_CERTIFIED",
          fundId: "fund-1",
        },
      });
    });

    it("should require units for tiered subscription", async () => {
      mockPrismaFund.findUnique.mockResolvedValue({
        id: "fund-1",
        name: "Tiered Fund",
        minimumInvestment: 50000,
        flatModeEnabled: false, // Tiered mode
        pricingTiers: [
          { id: "tier-1", tranche: 1, pricePerUnit: 1000, unitsAvailable: 100, isActive: true },
        ],
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" }, // No units
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error).toContain("Invalid unit count");
    });

    it("should reject when not enough units available", async () => {
      mockPrismaFund.findUnique.mockResolvedValue({
        id: "fund-1",
        name: "Tiered Fund",
        minimumInvestment: 50000,
        flatModeEnabled: false,
        pricingTiers: [],
      });

      mockPrismaFundPricingTier.findMany.mockResolvedValue([
        { id: "tier-1", tranche: 1, pricePerUnit: 1000, unitsAvailable: 10, isActive: true },
      ]);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000", units: "100" }, // Want 100, only 10 available
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error).toContain("fully subscribed");
    });
  });

  describe("Error Handling", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue({
        user: { email: "investor@example.com" },
      });
    });

    it("should handle database errors gracefully", async () => {
      mockPrismaUser.findUnique.mockRejectedValue(new Error("Database error"));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
        body: { fundId: "fund-1", amount: "100000" },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData().error).toBe("Internal server error");
    });
  });
});
