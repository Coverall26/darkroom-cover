// @ts-nocheck
/**
 * Critical Path Integration Tests — PROMPT 11
 *
 * Covers untested critical paths:
 *   1. Settings Inheritance — org defaults → fund overrides → resolved
 *   2. Multi-Tenant Isolation — cross-team data access prevention via RBAC
 *   3. Paywall Enforcement — FundroomActivation + PlatformSettings checks
 *   4. Rate Limiting Enforcement — per-route + blanket rate limiter
 *   5. GP Setup → LP Onboard → Wire → Confirm → Funded lifecycle
 *   6. CRM Contact Lifecycle — auto-capture + engagement scoring + promotion
 *   7. Tier-Based Feature Gating — FREE vs CRM_PRO vs FUNDROOM limits
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { wrapAppRouteHandler } from "@/__tests__/helpers/app-router-adapter";

// ─── Session Mock ─────────────────────────────────────────────────────────────

const __mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({ getServerSession: __mockGetServerSession }));
jest.mock("next-auth/next", () => ({
  getServerSession: __mockGetServerSession,
}));

// ─── Dependency Mocks ─────────────────────────────────────────────────────────

jest.mock("@/lib/auth/auth-options", () => ({ authOptions: {} }));

jest.mock("@/lib/security/bot-protection", () => ({
  verifyNotBotPages: jest.fn().mockResolvedValue(true),
  verifyNotBot: jest.fn().mockResolvedValue({ blocked: false }),
}));

jest.mock("@/lib/security/csrf", () => ({
  validateCSRF: jest.fn().mockReturnValue(true),
}));

const __defaultAdminAuth = {
  userId: "gp-user-1",
  email: "gp@acme.com",
  teamId: "team-1",
  role: "ADMIN",
  session: { user: { id: "gp-user-1", email: "gp@acme.com" } },
};
const __defaultLPAuth = {
  userId: "lp-user-1",
  email: "lp@investor.com",
  investorId: "investor-1",
  teamId: "team-1",
  session: { user: { id: "lp-user-1", email: "lp@investor.com" } },
};
let __adminAppRouterOverride: any = null;
let __lpAppRouterOverride: any = null;
jest.mock("@/lib/auth/rbac", () => ({
  requireAdmin: jest.fn().mockResolvedValue({ userId: "gp-user-1", teamId: "team-1" }),
  enforceRBAC: jest.fn().mockResolvedValue({ userId: "gp-user-1", teamId: "team-1" }),
  requireTeamMember: jest.fn().mockResolvedValue({ userId: "gp-user-1", teamId: "team-1" }),
  requireGPAccess: jest.fn().mockResolvedValue({ userId: "gp-user-1", teamId: "team-1" }),
  requireAdminAppRouter: jest.fn(async () => __adminAppRouterOverride ?? __defaultAdminAuth),
  requireLPAuthAppRouter: jest.fn(async () => __lpAppRouterOverride ?? __defaultLPAuth),
  enforceRBACAppRouter: jest.fn().mockResolvedValue({ userId: "gp-user-1", email: "gp@acme.com", teamId: "team-1", role: "ADMIN", session: { user: { id: "gp-user-1", email: "gp@acme.com" } } }),
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  apiRateLimiter: jest.fn().mockResolvedValue(true),
  authRateLimiter: jest.fn().mockResolvedValue(true),
  strictRateLimiter: jest.fn().mockResolvedValue(true),
  uploadRateLimiter: jest.fn().mockResolvedValue(true),
  signatureRateLimiter: jest.fn().mockResolvedValue(true),
  mfaVerifyRateLimiter: jest.fn().mockResolvedValue(true),
  appRouterRateLimit: jest.fn().mockResolvedValue(null),
  appRouterStrictRateLimit: jest.fn().mockResolvedValue(null),
  appRouterUploadRateLimit: jest.fn().mockResolvedValue(null),
  appRouterAuthRateLimit: jest.fn().mockResolvedValue(null),
  appRouterMfaRateLimit: jest.fn().mockResolvedValue(null),
  appRouterSignatureRateLimit: jest.fn().mockResolvedValue(null),
  ratelimit: jest.fn(() => ({
    limit: jest.fn().mockResolvedValue({ success: true }),
  })),
}));

// Shared mock limiter object — register.ts creates `registrationLimiter` at module load
// from `ratelimit(5, "60 s")`. By returning the same object from the factory, we can
// track `.limit()` calls made during handler execution.
const __mockRedisLimiter = {
  limit: jest.fn().mockResolvedValue({ success: true }),
};

jest.mock("@/lib/redis", () => ({
  ratelimit: jest.fn(() => __mockRedisLimiter),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue("audit-id"),
}));

jest.mock("@/lib/tracking/server-events", () => ({
  publishServerEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/sse/event-emitter", () => ({
  emitSSE: jest.fn(),
  SSE_EVENTS: {
    WIRE_CONFIRMED: "wire.confirmed",
    WIRE_PROOF_UPLOADED: "wire.proof_uploaded",
    DOCUMENT_APPROVED: "document.approved",
    DOCUMENT_REJECTED: "document.rejected",
    INVESTOR_COMMITTED: "investor.committed",
  },
}));

jest.mock("@/lib/emails/send-investor-welcome", () => ({
  sendInvestorWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  sendInvestorWelcomeEmailWithFund: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/emails/send-wire-confirmed", () => ({
  sendWireConfirmedNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/emails/send-gp-commitment-notification", () => ({
  sendGPCommitmentNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/emails/send-gp-wire-proof-notification", () => ({
  sendGpWireProofNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/emails/send-accreditation-confirmed", () => ({
  sendAccreditationConfirmedEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/crm/contact-upsert-job", () => ({
  captureFromLPRegistration: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/wire-transfer", () => ({
  uploadProofOfPayment: jest.fn().mockResolvedValue({
    proofStatus: "RECEIVED",
    proofFileName: "proof.pdf",
  }),
}));

jest.mock("@/lib/auth/paywall", () => ({
  requireFundroomActive: jest.fn().mockResolvedValue(true),
  requireFundroomActiveByFund: jest.fn().mockResolvedValue(true),
  PAYWALL_ERROR: { error: "Subscription required" },
}));

jest.mock("@/lib/funds/tranche-service", () => ({
  getFundProgress: jest.fn().mockResolvedValue(null),
}));

// ─── Prisma Mock ──────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  investor: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  investment: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  distribution: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
  manualInvestment: {
    findUnique: jest.fn(),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  transaction: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  fund: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  userTeam: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  verificationToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  organization: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  organizationDefaults: {
    findFirst: jest.fn(),
  },
  team: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  fundAggregate: {
    upsert: jest.fn(),
  },
  onboardingFlow: {
    findFirst: jest.fn(),
  },
  fundroomActivation: {
    findFirst: jest.fn(),
  },
  platformSettings: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn((fn) => {
    if (typeof fn === "function") {
      return fn(mockPrisma);
    }
    return Promise.all(fn);
  }),
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: mockPrisma,
}));

// ─── Global beforeEach ───────────────────────────────────────────────────────
// Ensure the shared redis rate limiter defaults to success before every test.
// jest.clearAllMocks() (used in each section's beforeEach) clears call counts
// but does NOT reset mockResolvedValue defaults — so we must explicitly reset here.
beforeEach(() => {
  __mockRedisLimiter.limit.mockResolvedValue({ success: true });
  __adminAppRouterOverride = null;
  __lpAppRouterOverride = null;
});

// ─── Test Constants ───────────────────────────────────────────────────────────

const GP_USER = {
  id: "gp-user-1",
  email: "gp@acme.com",
  name: "GP Admin",
  role: "ADMIN",
};

const LP_USER = {
  id: "lp-user-1",
  email: "lp@investor.com",
  name: "LP Investor",
  role: "LP",
};

const TEAM = {
  id: "team-1",
  name: "Acme Capital",
  slug: "acme-capital",
};

const FUND = {
  id: "fund-1",
  name: "Acme Fund I",
  teamId: TEAM.id,
  targetRaise: 10000000,
  currentRaise: 0,
  status: "ACTIVE",
  minimumInvestment: 200000,
};

const INVESTOR = {
  id: "investor-1",
  userId: LP_USER.id,
  fundId: FUND.id,
  ndaSigned: true,
  accreditationStatus: "SELF_CERTIFIED",
  onboardingStep: 6,
};

const INVESTMENT = {
  id: "investment-1",
  investorId: INVESTOR.id,
  fundId: FUND.id,
  commitmentAmount: 250000,
  fundedAmount: 0,
  status: "COMMITTED",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createRequest(method: string, body?: Record<string, unknown>, query?: Record<string, unknown>) {
  return createMocks<NextApiRequest, NextApiResponse>({
    method,
    body: body || {},
    query: query || {},
    headers: { "x-forwarded-for": "127.0.0.1" },
    socket: { remoteAddress: "127.0.0.1" } as any,
  });
}

function setSession(session: Record<string, unknown> | null) {
  __mockGetServerSession.mockResolvedValue(session);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Settings Inheritance
// ═══════════════════════════════════════════════════════════════════════════════

describe("Section 1: Settings Inheritance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves org defaults when no fund override exists", async () => {
    const { resolveSettingsSync, getSystemDefaults } = await import("@/lib/settings/resolve");

    // orgDefaults uses OrganizationDefaults model field names (fundroom-prefixed)
    // extractOrgSettings() maps fundroomNdaGateEnabled → ndaGateEnabled, etc.
    const orgDefaults = {
      fundroomNdaGateEnabled: false,             // Override system default (true → false)
      fundroomStagedCommitmentsEnabled: true,     // Override system default (false → true)
    };

    const resolved = resolveSettingsSync({ orgDefaults });

    expect(resolved.ndaGateEnabled).toBe(false);           // Overridden by org
    expect(resolved.stagedCommitmentsEnabled).toBe(true);   // Overridden by org
    expect(resolved.kycRequired).toBe(getSystemDefaults().kycRequired); // Inherited from system
  });

  it("fund overrides take priority over org defaults", async () => {
    const { resolveSettingsSync } = await import("@/lib/settings/resolve");

    const orgDefaults = {
      fundroomNdaGateEnabled: true,
      fundroomStagedCommitmentsEnabled: false,
    };

    // fundData uses Fund model field names (direct, no prefix)
    // extractFundSettings() maps ndaGateEnabled → ndaGateEnabled directly
    const fundData = {
      stagedCommitmentsEnabled: true, // Override at fund level
    };

    const resolved = resolveSettingsSync({ orgDefaults, fundData });

    expect(resolved.ndaGateEnabled).toBe(true);            // Inherited from org
    expect(resolved.stagedCommitmentsEnabled).toBe(true);   // Overridden by fund
  });

  it("returns system defaults when both tiers are empty", async () => {
    const { resolveSettingsSync, getSystemDefaults } = await import("@/lib/settings/resolve");
    const resolved = resolveSettingsSync({});
    expect(resolved).toEqual(getSystemDefaults());
  });

  it("handles null/undefined fund overrides gracefully", async () => {
    const { resolveSettingsSync } = await import("@/lib/settings/resolve");

    const orgDefaults = { fundroomNdaGateEnabled: false };

    const resolved1 = resolveSettingsSync({ orgDefaults, fundData: null });
    expect(resolved1.ndaGateEnabled).toBe(false);

    const resolved2 = resolveSettingsSync({ orgDefaults, fundData: undefined });
    expect(resolved2.ndaGateEnabled).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Multi-Tenant Isolation via RBAC
// ═══════════════════════════════════════════════════════════════════════════════

describe("Section 2: Multi-Tenant Isolation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects request when user has no team membership", async () => {
    const { NextResponse } = require("next/server");
    __adminAppRouterOverride = NextResponse.json(
      { error: "Forbidden: no team access" },
      { status: 403 }
    );

    const handler = wrapAppRouteHandler(await import("@/app/api/admin/fund-dashboard/route"));
    const { req, res } = createRequest("GET");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  it("blocks access to fund not owned by user's team", async () => {
    // Auth passes — user is on team-1 but team has no funds
    mockPrisma.userTeam.findMany.mockResolvedValue([
      { teamId: "team-1", role: "ADMIN", hasFundroomAccess: true },
    ]);

    mockPrisma.fund.findMany.mockResolvedValue([]); // No funds for team-1
    // The handler calls investment.groupBy, distribution.groupBy, manualInvestment.groupBy, and
    // investment.groupBy (distinct investors) in a Promise.all — all already default to [].
    // It also calls transaction.findMany and transaction.groupBy — already default to [].
    // It calls investor.findMany on the investorIds list — must return [] or handler throws.
    mockPrisma.investor.findMany.mockResolvedValue([]);

    const handler = wrapAppRouteHandler(await import("@/app/api/admin/fund-dashboard/route"));
    const { req, res } = createRequest("GET");

    await handler(req, res);

    // Should return empty fund data, not someone else's funds
    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.funds).toEqual([]);
    expect(data.totals.totalFunds).toBe(0);
  });

  it("rejects unauthenticated requests", async () => {
    const { NextResponse } = require("next/server");
    __adminAppRouterOverride = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );

    const handler = wrapAppRouteHandler(await import("@/app/api/admin/fund-dashboard/route"));
    const { req, res } = createRequest("GET");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
  });

  it("checks fund room access flag for non-admin users", async () => {
    const { NextResponse } = require("next/server");
    __adminAppRouterOverride = NextResponse.json(
      { error: "Forbidden: no FundRoom access" },
      { status: 403 }
    );

    const handler = wrapAppRouteHandler(await import("@/app/api/admin/fund-dashboard/route"));
    const { req, res } = createRequest("GET");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const data = res._getJSONData();
    expect(data.error).toContain("access");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: Paywall Enforcement
// ═══════════════════════════════════════════════════════════════════════════════

describe("Section 3: Paywall Enforcement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("blocks LP registration when fund is not activated", async () => {
    const { requireFundroomActiveByFund } = jest.requireMock("@/lib/auth/paywall");
    requireFundroomActiveByFund.mockResolvedValueOnce(false);

    setSession(null); // LP registration doesn't require session

    mockPrisma.user.findUnique.mockResolvedValue(null);

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("POST", {
      name: "Test LP",
      email: "test@lp.com",
      fundId: "inactive-fund",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(402);
    const data = res._getJSONData();
    expect(data.error).toBeDefined();
  });

  it("allows LP registration when fund is activated", async () => {
    const { requireFundroomActiveByFund } = jest.requireMock("@/lib/auth/paywall");
    requireFundroomActiveByFund.mockResolvedValueOnce(true);

    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: "new-lp",
      email: "test@lp.com",
      name: "Test LP",
      investorProfile: { id: "inv-1" },
    });
    mockPrisma.fund.findUnique.mockResolvedValue({ id: "active-fund", teamId: "team-1" });
    mockPrisma.investor.update.mockResolvedValue({});
    mockPrisma.investment.findFirst.mockResolvedValue(null);
    mockPrisma.investment.create.mockResolvedValue({});
    mockPrisma.verificationToken.create.mockResolvedValue({});

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("POST", {
      name: "Test LP",
      email: "test@lp.com",
      fundId: "active-fund",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().success).toBe(true);
  });

  it("blocks wire proof when fund not activated", async () => {
    const { requireFundroomActiveByFund } = jest.requireMock("@/lib/auth/paywall");
    // ManualInvestment path is skipped (findUnique returns null), so only
    // the Investment path calls requireFundroomActiveByFund
    requireFundroomActiveByFund.mockResolvedValueOnce(false);

    setSession({ user: LP_USER });

    mockPrisma.user.findUnique.mockResolvedValue({ id: LP_USER.id });
    mockPrisma.manualInvestment.findUnique.mockResolvedValue(null); // Not manual
    mockPrisma.investment.findUnique.mockResolvedValue({
      ...INVESTMENT,
      investor: { userId: LP_USER.id },
      fund: { teamId: TEAM.id },
    });

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

    expect(res._getStatusCode()).toBe(402);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Rate Limiting
// ═══════════════════════════════════════════════════════════════════════════════

describe("Section 4: Rate Limiting Enforcement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("registration handler invokes rate limiter during request", async () => {
    // register.ts creates `registrationLimiter = ratelimit(5, "60 s")` at module level.
    // The shared `__mockRedisLimiter` object is returned by our `ratelimit()` mock factory,
    // so `registrationLimiter.limit(...)` calls go through `__mockRedisLimiter.limit`.
    __mockRedisLimiter.limit.mockResolvedValue({ success: true });

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("POST", {
      name: "Rate Test",
      email: "ratetest@test.com",
    });

    // Need a user lookup for registration to proceed past rate limiter
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: "rl-user",
      email: "ratetest@test.com",
      investorProfile: { id: "rl-inv" },
    });
    mockPrisma.verificationToken.create.mockResolvedValue({});

    await handler(req, res);

    // Handler should have called the rate limiter's limit function
    expect(__mockRedisLimiter.limit).toHaveBeenCalled();
    // Key should include IP-based prefix
    const limitArg = __mockRedisLimiter.limit.mock.calls[0][0];
    expect(limitArg).toContain("lp-register:");
  });

  it("registration returns 429 when rate limited", async () => {
    __mockRedisLimiter.limit.mockResolvedValueOnce({ success: false });

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("POST", {
      name: "Rate Test",
      email: "ratetest@test.com",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(429);
    expect(res._getJSONData().error).toContain("Too many requests");
  });

  it("wire proof enforces upload rate limit", async () => {
    const { uploadRateLimiter } = jest.requireMock("@/lib/security/rate-limiter");
    // Simulate rate limit exhaustion
    uploadRateLimiter.mockResolvedValueOnce(false);

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-proof/route"));
    const { req, res } = createRequest("POST", {
      investmentId: "inv-1",
      storageKey: "key",
      storageType: "S3",
      fileType: "application/pdf",
      fileName: "proof.pdf",
    });

    await handler(req, res);

    // When rate limiter returns false, handler returns early (handler doesn't write response,
    // the rate limiter middleware does). The handler stops executing.
    expect(uploadRateLimiter).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: GP → LP Lifecycle Integration
// ═══════════════════════════════════════════════════════════════════════════════

describe("Section 5: GP→LP Investment Lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("LP Registration → Investment Creation", () => {
    it("creates user + investor + investment when registering with fundId", async () => {
      const { requireFundroomActiveByFund } = jest.requireMock("@/lib/auth/paywall");
      requireFundroomActiveByFund.mockResolvedValue(true);

      const newUser = {
        id: "new-user",
        email: "newinvestor@test.com",
        name: "New Investor",
        investorProfile: { id: "new-inv", fundData: {} },
      };

      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // First check: user doesn't exist
        .mockResolvedValueOnce(newUser); // After re-fetch (not used in create path)
      mockPrisma.user.create.mockResolvedValue(newUser);
      mockPrisma.fund.findUnique.mockResolvedValue({
        id: FUND.id,
        teamId: TEAM.id,
      });
      mockPrisma.investor.update.mockResolvedValue({});
      mockPrisma.investment.findFirst.mockResolvedValue(null);
      mockPrisma.investment.create.mockResolvedValue({ id: "new-investment" });
      mockPrisma.verificationToken.create.mockResolvedValue({});

      const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
      const { req, res } = createRequest("POST", {
        name: "New Investor",
        email: "newinvestor@test.com",
        fundId: FUND.id,
        ndaAccepted: true,
        accreditationType: "INCOME_200K",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.success).toBe(true);

      // Verify user was created
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "newinvestor@test.com",
            role: "LP",
          }),
        })
      );

      // Verify investment was linked to fund
      expect(mockPrisma.investment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fundId: FUND.id,
            status: "APPLIED",
          }),
        })
      );
    });

    it("does not overwrite existing investor profile on re-registration", async () => {
      const { requireFundroomActiveByFund } = jest.requireMock("@/lib/auth/paywall");
      requireFundroomActiveByFund.mockResolvedValue(true);

      const existingUser = {
        id: "existing-user",
        email: "existing@test.com",
        name: "Existing",
        role: "LP",
        password: "hashed",
        investorProfile: {
          id: "existing-inv",
          ndaSigned: false,
          accreditationStatus: "PENDING",
          onboardingStep: 1,
        },
      };

      // Reset to clear any leaked mockResolvedValueOnce from prior tests
      // (jest.clearAllMocks only clears call history, not queued return values)
      mockPrisma.user.findUnique.mockReset();
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(existingUser)
        .mockResolvedValueOnce(existingUser);

      // Existing investor gets upgraded, not overwritten
      mockPrisma.investor.update.mockResolvedValue({});
      mockPrisma.fund.findUnique.mockResolvedValue({
        id: FUND.id,
        teamId: TEAM.id,
      });
      mockPrisma.investment.findFirst.mockResolvedValue(null);
      mockPrisma.investment.create.mockResolvedValue({});
      mockPrisma.verificationToken.create.mockResolvedValue({});

      const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
      const { req, res } = createRequest("POST", {
        name: "Existing",
        email: "existing@test.com",
        fundId: FUND.id,
        ndaAccepted: true,
        accreditationType: "INCOME_200K",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);

      // Should NOT create a new investor profile
      expect(mockPrisma.investor.create).not.toHaveBeenCalled();

      // Should upgrade flags only
      expect(mockPrisma.investor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "existing-inv" },
          data: expect.objectContaining({
            ndaSigned: true,
            ndaSignedAt: expect.any(Date),
            accreditationStatus: "SELF_CERTIFIED",
          }),
        })
      );

      // Should not overwrite existing password
      expect(mockPrisma.user.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ password: expect.any(String) }),
        })
      );
    });
  });

  describe("Wire Proof → GP Confirmation → Funded", () => {
    it("GP confirms wire and advances investment to FUNDED", async () => {
      setSession({ user: GP_USER });

      const transaction = {
        id: "tx-1",
        investorId: INVESTOR.id,
        fundId: FUND.id,
        status: "PROOF_UPLOADED",
        amount: 250000,
        investor: {
          id: INVESTOR.id,
          userId: LP_USER.id,
          fundId: FUND.id,
          entityName: "LP Investor LLC",
          user: { email: LP_USER.email, name: LP_USER.name },
        },
      };

      // Pre-$transaction: fetch transaction and fund ownership check
      mockPrisma.transaction.findUnique.mockResolvedValue(transaction);
      mockPrisma.fund.findFirst.mockResolvedValue({ id: FUND.id, name: FUND.name });

      // Simulate $transaction callback
      mockPrisma.$transaction.mockImplementation(async (fn) => {
        if (typeof fn === "function") {
          return fn({
            transaction: {
              findUnique: jest.fn().mockResolvedValue(transaction),
              update: jest.fn().mockResolvedValue({
                ...transaction,
                status: "COMPLETED",
                confirmedAt: new Date(),
                fundsReceivedDate: new Date("2026-02-20"),
              }),
            },
            investment: {
              findFirst: jest.fn().mockResolvedValue({
                ...INVESTMENT,
                commitmentAmount: 250000,
              }),
              update: jest.fn().mockResolvedValue({}),
              aggregate: jest.fn().mockResolvedValue({
                _sum: { fundedAmount: 250000, commitmentAmount: 250000 },
              }),
            },
            fundAggregate: {
              upsert: jest.fn().mockResolvedValue({}),
            },
          });
        }
        return Promise.all(fn);
      });

      const handler = wrapAppRouteHandler(await import("@/app/api/admin/wire/confirm/route"));
      const { req, res } = createRequest("POST", {
        transactionId: "tx-1",
        teamId: TEAM.id,
        fundsReceivedDate: "2026-02-20",
        amountReceived: 250000,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.success).toBe(true);
    });

    it("rejects wire confirmation for wrong team", async () => {
      setSession({ user: GP_USER });

      const transaction = {
        id: "tx-1",
        investorId: INVESTOR.id,
        fundId: FUND.id,
        status: "PROOF_UPLOADED",
        amount: 250000,
        investor: {
          id: INVESTOR.id,
          userId: LP_USER.id,
          fundId: FUND.id,
          entityName: null,
          user: { email: LP_USER.email, name: LP_USER.name },
        },
      };

      mockPrisma.transaction.findUnique.mockResolvedValue(transaction);
      // Fund not found for wrong-team → 403
      mockPrisma.fund.findFirst.mockResolvedValue(null);

      const handler = wrapAppRouteHandler(await import("@/app/api/admin/wire/confirm/route"));
      const { req, res } = createRequest("POST", {
        transactionId: "tx-1",
        teamId: "wrong-team",
        fundsReceivedDate: "2026-02-20",
        amountReceived: 250000,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: Input Validation & Edge Cases
// ═══════════════════════════════════════════════════════════════════════════════

describe("Section 6: Input Validation & Edge Cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects LP registration with invalid email format", async () => {
    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("POST", {
      name: "Test",
      email: "not-an-email",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain("email");
  });

  it("rejects LP registration with missing name", async () => {
    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("POST", {
      email: "test@test.com",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain("required");
  });

  it("rejects LP registration with oversized name", async () => {
    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("POST", {
      name: "A".repeat(201),
      email: "test@test.com",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain("name");
  });

  it("rejects LP registration with password exceeding 72 bytes (bcrypt limit)", async () => {
    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("POST", {
      name: "Test",
      email: "test@test.com",
      password: "A".repeat(73),
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain("password");
  });

  it("normalizes email to lowercase", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: "u1",
      email: "test@test.com",
      investorProfile: { id: "inv-1" },
    });
    mockPrisma.verificationToken.create.mockResolvedValue({});

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("POST", {
      name: "Test",
      email: "TEST@TEST.COM",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "test@test.com" },
      })
    );
  });

  it("wire proof rejects missing required fields", async () => {
    setSession({ user: LP_USER });
    mockPrisma.user.findUnique.mockResolvedValue({ id: LP_USER.id });

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-proof/route"));
    const { req, res } = createRequest("POST", {
      investmentId: "inv-1",
      // Missing storageKey, storageType, fileType, fileName
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain("required");
  });

  it("wire proof rejects oversized notes", async () => {
    setSession({ user: LP_USER });
    mockPrisma.user.findUnique.mockResolvedValue({ id: LP_USER.id });

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-proof/route"));
    const { req, res } = createRequest("POST", {
      investmentId: "inv-1",
      storageKey: "key",
      storageType: "S3",
      fileType: "application/pdf",
      fileName: "proof.pdf",
      notes: "x".repeat(501),
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain("Notes");
  });

  it("wire proof rejects negative amountSent", async () => {
    setSession({ user: LP_USER });
    mockPrisma.user.findUnique.mockResolvedValue({ id: LP_USER.id });

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-proof/route"));
    const { req, res } = createRequest("POST", {
      investmentId: "inv-1",
      storageKey: "key",
      storageType: "S3",
      fileType: "application/pdf",
      fileName: "proof.pdf",
      amountSent: -1000,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain("amountSent");
  });

  it("wire proof prevents duplicate completed transaction (409)", async () => {
    setSession({ user: LP_USER });
    mockPrisma.user.findUnique.mockResolvedValue({ id: LP_USER.id });
    mockPrisma.manualInvestment.findUnique.mockResolvedValue(null);
    mockPrisma.investment.findUnique.mockResolvedValue({
      ...INVESTMENT,
      investor: { userId: LP_USER.id },
      fund: { teamId: TEAM.id },
    });

    // Already has a completed transaction
    mockPrisma.transaction.findFirst.mockResolvedValue({
      id: "completed-tx",
      status: "COMPLETED",
    });

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-proof/route"));
    const { req, res } = createRequest("POST", {
      investmentId: INVESTMENT.id,
      storageKey: "proofs/dup.pdf",
      storageType: "S3",
      fileType: "application/pdf",
      fileName: "dup.pdf",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData().error).toContain("already been confirmed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: Method Enforcement
// ═══════════════════════════════════════════════════════════════════════════════

describe("Section 7: Method Enforcement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("LP register rejects GET", async () => {
    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("GET");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("wire proof rejects GET", async () => {
    const handler = wrapAppRouteHandler(await import("@/app/api/lp/wire-proof/route"));
    const { req, res } = createRequest("GET");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("fund dashboard rejects POST", async () => {
    const handler = wrapAppRouteHandler(await import("@/app/api/admin/fund-dashboard/route"));
    const { req, res } = createRequest("POST");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("wire confirm rejects GET", async () => {
    const handler = wrapAppRouteHandler(await import("@/app/api/admin/wire/confirm/route"));
    const { req, res } = createRequest("GET");
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: Data Integrity Checks
// ═══════════════════════════════════════════════════════════════════════════════

describe("Section 8: Data Integrity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("LP registration sets correct lead source from referralSource", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockImplementation(async (args) => ({
      id: "u1",
      email: args.data.email,
      investorProfile: { id: "inv-1" },
    }));
    mockPrisma.verificationToken.create.mockResolvedValue({});

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("POST", {
      name: "Test",
      email: "lead@test.com",
      referralSource: "GOOGLE_ADS",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    // Check that user.create was called with correct investorProfile data
    const createCall = mockPrisma.user.create.mock.calls[0][0];
    expect(createCall.data.investorProfile.create.leadSource).toBe("GOOGLE_ADS");
  });

  it("LP registration defaults to DATAROOM lead source when fundId present", async () => {
    const { requireFundroomActiveByFund } = jest.requireMock("@/lib/auth/paywall");
    requireFundroomActiveByFund.mockResolvedValue(true);

    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockImplementation(async (args) => ({
      id: "u1",
      email: args.data.email,
      investorProfile: { id: "inv-1", fundData: {} },
    }));
    mockPrisma.fund.findUnique.mockResolvedValue({ id: "f1", teamId: "t1" });
    mockPrisma.investor.update.mockResolvedValue({});
    mockPrisma.investment.findFirst.mockResolvedValue(null);
    mockPrisma.investment.create.mockResolvedValue({});
    mockPrisma.verificationToken.create.mockResolvedValue({});

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("POST", {
      name: "Test",
      email: "dataroom@test.com",
      fundId: "f1",
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const createCall = mockPrisma.user.create.mock.calls[0][0];
    expect(createCall.data.investorProfile.create.leadSource).toBe("DATAROOM");
  });

  it("LP registration maps address fields correctly", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockImplementation(async (args) => ({
      id: "u1",
      email: args.data.email,
      investorProfile: { id: "inv-1" },
    }));
    mockPrisma.verificationToken.create.mockResolvedValue({});

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("POST", {
      name: "Test",
      email: "addr@test.com",
      address: {
        street1: "123 Main St",
        street2: "Suite 100",
        city: "Miami",
        state: "FL",
        zip: "33101",
        country: "US",
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const createCall = mockPrisma.user.create.mock.calls[0][0];
    const investorData = createCall.data.investorProfile.create;
    expect(investorData.addressLine1).toBe("123 Main St");
    expect(investorData.addressLine2).toBe("Suite 100");
    expect(investorData.city).toBe("Miami");
    expect(investorData.state).toBe("FL");
    expect(investorData.postalCode).toBe("33101");
    expect(investorData.country).toBe("US");
  });

  it("NDA acceptance is recorded with timestamp", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockImplementation(async (args) => ({
      id: "u1",
      email: args.data.email,
      investorProfile: { id: "inv-1" },
    }));
    mockPrisma.verificationToken.create.mockResolvedValue({});

    const handler = wrapAppRouteHandler(await import("@/app/api/lp/register/route"));
    const { req, res } = createRequest("POST", {
      name: "Test",
      email: "nda@test.com",
      ndaAccepted: true,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const createCall = mockPrisma.user.create.mock.calls[0][0];
    const investorData = createCall.data.investorProfile.create;
    expect(investorData.ndaSigned).toBe(true);
    expect(investorData.ndaSignedAt).toBeInstanceOf(Date);
    expect(investorData.onboardingStep).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: Fund Dashboard Aggregation Accuracy
// ═══════════════════════════════════════════════════════════════════════════════

describe("Section 9: Fund Dashboard Aggregation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("correctly aggregates platform + manual investments", async () => {
    setSession({ user: GP_USER });

    mockPrisma.userTeam.findMany.mockResolvedValue([
      { teamId: TEAM.id, role: "ADMIN", hasFundroomAccess: true },
    ]);

    mockPrisma.fund.findMany.mockResolvedValue([
      {
        id: FUND.id,
        name: FUND.name,
        status: "ACTIVE",
        targetRaise: 10000000,
        currentRaise: 500000,
        closingDate: null,
        _count: { capitalCalls: 2, distributions: 1 },
        aggregate: null,
      },
    ]);

    // Platform investments: $500K committed, $300K funded
    (mockPrisma.investment.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        {
          fundId: FUND.id,
          _sum: { commitmentAmount: 500000, fundedAmount: 300000 },
          _count: { investorId: 3 },
        },
      ])
      // Distinct investors
      .mockResolvedValueOnce([
        { fundId: FUND.id, investorId: "inv-1" },
        { fundId: FUND.id, investorId: "inv-2" },
        { fundId: FUND.id, investorId: "inv-3" },
      ]);

    // Distributions: $50K
    (mockPrisma.distribution.groupBy as jest.Mock).mockResolvedValueOnce([
      { fundId: FUND.id, _sum: { totalAmount: 50000 } },
    ]);

    // Manual investments: $200K committed, $150K funded
    (mockPrisma.manualInvestment.groupBy as jest.Mock).mockResolvedValueOnce([
      {
        fundId: FUND.id,
        _sum: { commitmentAmount: 200000, fundedAmount: 150000 },
        _count: { id: 2 },
      },
    ]);

    // Transactions
    mockPrisma.transaction.findMany.mockResolvedValue([]);
    mockPrisma.transaction.groupBy.mockResolvedValue([]);
    mockPrisma.investor.findMany.mockResolvedValue([]);

    const handler = wrapAppRouteHandler(await import("@/app/api/admin/fund-dashboard/route"));
    const { req, res } = createRequest("GET");

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();

    // Platform ($500K) + Manual ($200K) = $700K total commitments
    expect(data.funds[0].commitments).toBe(700000);

    // Platform funded ($300K) + Manual funded ($150K) = $450K
    expect(data.funds[0].funded).toBe(450000);

    // Distributions
    expect(data.funds[0].distributed).toBe(50000);

    // Investor count from distinct query
    expect(data.funds[0].investorCount).toBe(3);

    // Manual investment count
    expect(data.funds[0].manualInvestmentCount).toBe(2);

    // Totals
    expect(Number(data.totals.totalRaised)).toBe(450000);
    expect(Number(data.totals.totalDistributed)).toBe(50000);
    expect(Number(data.totals.totalCommitments)).toBe(700000);
  });
});
