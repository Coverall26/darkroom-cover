/**
 * Tests for CRM Billing System
 *
 * Covers:
 *   - lib/stripe/crm-products.ts — price resolution, plan lookup, downgrade detection
 *   - lib/billing/crm-billing.ts — getCrmBillingStatus, upgrade, downgrade, reactivation
 *   - app/api/billing/checkout/route.ts — checkout session creation
 *   - app/api/billing/ai-addon/route.ts — AI add-on subscribe/cancel
 *   - app/api/billing/portal/route.ts — billing portal session
 *   - app/api/webhooks/stripe-crm/route.ts — webhook event processing
 */

import {
  CRM_PLANS,
  AI_CRM_ADDON,
  getCrmPriceId,
  getCrmPlanFromPriceId,
  isCrmPriceId,
  getUpgradePath,
  isDowngrade,
} from "@/lib/stripe/crm-products";

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

const mockStripeSubscriptions = {
  retrieve: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
};
const mockStripeCheckoutSessions = {
  create: jest.fn(),
};
const mockStripeBillingPortalSessions = {
  create: jest.fn(),
};
const mockStripeWebhooks = {
  constructEvent: jest.fn(),
};

jest.mock("@/ee/stripe", () => ({
  stripeInstance: jest.fn(() => ({
    subscriptions: mockStripeSubscriptions,
    checkout: { sessions: mockStripeCheckoutSessions },
    billingPortal: { sessions: mockStripeBillingPortalSessions },
    webhooks: mockStripeWebhooks,
  })),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/tier/crm-tier", () => ({
  invalidateTierCache: jest.fn(),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/tracking/server-events", () => ({
  publishServerEvent: jest.fn(),
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  appRouterRateLimit: jest.fn().mockResolvedValue(null),
}));

let _mockSessionValue: unknown = null;

const mockRequireAuthAppRouter = jest.fn();

jest.mock("@/lib/auth/rbac", () => ({
  requireAuthAppRouter: (...args: unknown[]) => mockRequireAuthAppRouter(...args),
  requireAdminAppRouter: (...args: unknown[]) => mockRequireAuthAppRouter(...args),
}));

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: { providers: [], session: { strategy: "jwt" } },
}));

const { NextResponse } = require("next/server");
const prisma = require("@/lib/prisma").default;
const { invalidateTierCache } = require("@/lib/tier/crm-tier");

function mockSession(value: unknown) {
  _mockSessionValue = value;
  if (value && typeof value === "object" && "user" in (value as Record<string, unknown>)) {
    const user = (value as { user: { email?: string; id?: string } }).user;
    mockRequireAuthAppRouter.mockResolvedValue({
      userId: user.id || "user-1",
      email: user.email || "",
      teamId: "",
      role: "MEMBER",
    });
  } else {
    mockRequireAuthAppRouter.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  }
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// 1. CRM Products — Price Configuration
// ===========================================================================

describe("CRM Products (lib/stripe/crm-products)", () => {
  describe("CRM_PLANS", () => {
    it("defines FREE, CRM_PRO, and FUNDROOM plans", () => {
      expect(CRM_PLANS).toHaveProperty("FREE");
      expect(CRM_PLANS).toHaveProperty("CRM_PRO");
      expect(CRM_PLANS).toHaveProperty("FUNDROOM");
    });

    it("FREE plan has $0 pricing", () => {
      expect(CRM_PLANS.FREE.monthlyPriceDollars).toBe(0);
      expect(CRM_PLANS.FREE.yearlyPriceDollars).toBe(0);
    });

    it("CRM_PRO plan has $20/mo pricing", () => {
      expect(CRM_PLANS.CRM_PRO.monthlyPriceDollars).toBe(20);
      expect(CRM_PLANS.CRM_PRO.yearlyPriceDollars).toBe(16);
      expect(CRM_PLANS.CRM_PRO.price.monthly.amount).toBe(2000);
    });

    it("FUNDROOM plan has $79/mo pricing", () => {
      expect(CRM_PLANS.FUNDROOM.monthlyPriceDollars).toBe(79);
      expect(CRM_PLANS.FUNDROOM.yearlyPriceDollars).toBe(63);
      expect(CRM_PLANS.FUNDROOM.price.monthly.amount).toBe(7900);
    });

    it("each plan has features array", () => {
      expect(CRM_PLANS.FREE.features.length).toBeGreaterThan(0);
      expect(CRM_PLANS.CRM_PRO.features.length).toBeGreaterThan(0);
      expect(CRM_PLANS.FUNDROOM.features.length).toBeGreaterThan(0);
    });
  });

  describe("AI_CRM_ADDON", () => {
    it("has $49/mo pricing with 14-day trial", () => {
      expect(AI_CRM_ADDON.monthlyPriceDollars).toBe(49);
      expect(AI_CRM_ADDON.yearlyPriceDollars).toBe(39);
      expect(AI_CRM_ADDON.trialDays).toBe(14);
    });

    it("has price IDs for monthly and yearly", () => {
      expect(AI_CRM_ADDON.price.monthly.priceId).toBeTruthy();
      expect(AI_CRM_ADDON.price.yearly.priceId).toBeTruthy();
    });
  });

  describe("getCrmPriceId", () => {
    it("returns null for FREE plan", () => {
      expect(getCrmPriceId("FREE", "monthly")).toBeNull();
      expect(getCrmPriceId("FREE", "yearly")).toBeNull();
    });

    it("returns price ID for CRM_PRO monthly", () => {
      const priceId = getCrmPriceId("CRM_PRO", "monthly");
      expect(priceId).toBeTruthy();
      expect(typeof priceId).toBe("string");
    });

    it("returns price ID for FUNDROOM yearly", () => {
      const priceId = getCrmPriceId("FUNDROOM", "yearly");
      expect(priceId).toBeTruthy();
    });

    it("returns price ID for AI_CRM add-on", () => {
      const monthlyId = getCrmPriceId("AI_CRM", "monthly");
      const yearlyId = getCrmPriceId("AI_CRM", "yearly");
      expect(monthlyId).toBeTruthy();
      expect(yearlyId).toBeTruthy();
    });
  });

  describe("getCrmPlanFromPriceId", () => {
    it("returns plan info for known CRM_PRO price ID", () => {
      const priceId = CRM_PLANS.CRM_PRO.price.monthly.priceId;
      const result = getCrmPlanFromPriceId(priceId);
      expect(result).toEqual({ slug: "CRM_PRO", period: "monthly" });
    });

    it("returns plan info for known FUNDROOM price ID", () => {
      const priceId = CRM_PLANS.FUNDROOM.price.yearly.priceId;
      const result = getCrmPlanFromPriceId(priceId);
      expect(result).toEqual({ slug: "FUNDROOM", period: "yearly" });
    });

    it("returns plan info for AI_CRM price ID", () => {
      const priceId = AI_CRM_ADDON.price.monthly.priceId;
      const result = getCrmPlanFromPriceId(priceId);
      expect(result).toEqual({ slug: "AI_CRM", period: "monthly" });
    });

    it("returns null for unknown price ID", () => {
      expect(getCrmPlanFromPriceId("price_unknown_xxx")).toBeNull();
    });
  });

  describe("isCrmPriceId", () => {
    it("returns true for CRM plan price IDs", () => {
      expect(isCrmPriceId(CRM_PLANS.CRM_PRO.price.monthly.priceId)).toBe(true);
      expect(isCrmPriceId(CRM_PLANS.FUNDROOM.price.yearly.priceId)).toBe(true);
    });

    it("returns true for AI_CRM price IDs", () => {
      expect(isCrmPriceId(AI_CRM_ADDON.price.monthly.priceId)).toBe(true);
    });

    it("returns false for unknown price IDs", () => {
      expect(isCrmPriceId("price_saas_plan_xxx")).toBe(false);
    });
  });

  describe("getUpgradePath", () => {
    it("FREE upgrades to CRM_PRO", () => {
      expect(getUpgradePath("FREE")).toBe("CRM_PRO");
    });

    it("CRM_PRO upgrades to FUNDROOM", () => {
      expect(getUpgradePath("CRM_PRO")).toBe("FUNDROOM");
    });

    it("FUNDROOM has no upgrade path", () => {
      expect(getUpgradePath("FUNDROOM")).toBeNull();
    });
  });

  describe("isDowngrade", () => {
    it("FUNDROOM to CRM_PRO is a downgrade", () => {
      expect(isDowngrade("FUNDROOM", "CRM_PRO")).toBe(true);
    });

    it("CRM_PRO to FREE is a downgrade", () => {
      expect(isDowngrade("CRM_PRO", "FREE")).toBe(true);
    });

    it("FUNDROOM to FREE is a downgrade", () => {
      expect(isDowngrade("FUNDROOM", "FREE")).toBe(true);
    });

    it("FREE to CRM_PRO is NOT a downgrade", () => {
      expect(isDowngrade("FREE", "CRM_PRO")).toBe(false);
    });

    it("CRM_PRO to FUNDROOM is NOT a downgrade", () => {
      expect(isDowngrade("CRM_PRO", "FUNDROOM")).toBe(false);
    });

    it("same tier is NOT a downgrade", () => {
      expect(isDowngrade("CRM_PRO", "CRM_PRO")).toBe(false);
    });
  });
});

// ===========================================================================
// 2. CRM Billing Utilities (lib/billing/crm-billing)
// ===========================================================================

describe("CRM Billing Utilities (lib/billing/crm-billing)", () => {
  // Import after mocks are set up
  let getCrmBillingStatus: typeof import("@/lib/billing/crm-billing").getCrmBillingStatus;
  let handleCrmUpgrade: typeof import("@/lib/billing/crm-billing").handleCrmUpgrade;
  let handleCrmDowngrade: typeof import("@/lib/billing/crm-billing").handleCrmDowngrade;
  let reactivateCrmSubscription: typeof import("@/lib/billing/crm-billing").reactivateCrmSubscription;

  beforeAll(async () => {
    const mod = await import("@/lib/billing/crm-billing");
    getCrmBillingStatus = mod.getCrmBillingStatus;
    handleCrmUpgrade = mod.handleCrmUpgrade;
    handleCrmDowngrade = mod.handleCrmDowngrade;
    reactivateCrmSubscription = mod.reactivateCrmSubscription;
  });

  describe("getCrmBillingStatus", () => {
    it("returns billing status for FREE org", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "FREE",
        aiCrmEnabled: false,
        aiCrmTrialEndsAt: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: "ACTIVE",
      });

      const status = await getCrmBillingStatus("org-1");

      expect(status.currentTier).toBe("FREE");
      expect(status.aiCrmEnabled).toBe(false);
      expect(status.monthlyPrice).toBe(0);
      expect(status.stripeCustomerId).toBeNull();
    });

    it("returns billing status for CRM_PRO org with AI add-on", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "CRM_PRO",
        aiCrmEnabled: true,
        aiCrmTrialEndsAt: null,
        stripeCustomerId: "cus_test123",
        stripeSubscriptionId: "sub_test123",
        subscriptionStatus: "ACTIVE",
      });

      mockStripeSubscriptions.retrieve.mockResolvedValue({
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        cancel_at_period_end: false,
      });

      const status = await getCrmBillingStatus("org-2");

      expect(status.currentTier).toBe("CRM_PRO");
      expect(status.aiCrmEnabled).toBe(true);
      // $20 base + $49 AI add-on = $69/mo
      expect(status.monthlyPrice).toBe(69);
      expect(status.currentPeriodEnd).toBeTruthy();
      expect(status.cancelAtPeriodEnd).toBe(false);
    });

    it("returns FUNDROOM billing status", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "FUNDROOM",
        aiCrmEnabled: false,
        aiCrmTrialEndsAt: null,
        stripeCustomerId: "cus_test456",
        stripeSubscriptionId: "sub_test456",
        subscriptionStatus: "ACTIVE",
      });

      mockStripeSubscriptions.retrieve.mockResolvedValue({
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        cancel_at_period_end: true,
      });

      const status = await getCrmBillingStatus("org-3");

      expect(status.currentTier).toBe("FUNDROOM");
      expect(status.monthlyPrice).toBe(79);
      expect(status.cancelAtPeriodEnd).toBe(true);
    });

    it("throws for non-existent org", async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(getCrmBillingStatus("org-missing")).rejects.toThrow(
        "Organization not found",
      );
    });

    it("handles Stripe API errors gracefully", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "CRM_PRO",
        aiCrmEnabled: false,
        aiCrmTrialEndsAt: null,
        stripeCustomerId: "cus_test789",
        stripeSubscriptionId: "sub_test789",
        subscriptionStatus: "ACTIVE",
      });

      mockStripeSubscriptions.retrieve.mockRejectedValue(
        new Error("Stripe API error"),
      );

      // Should not throw — falls back to DB data
      const status = await getCrmBillingStatus("org-stripe-err");

      expect(status.currentTier).toBe("CRM_PRO");
      expect(status.currentPeriodEnd).toBeNull();
      expect(status.cancelAtPeriodEnd).toBe(false);
    });
  });

  describe("handleCrmUpgrade", () => {
    it("returns error for non-existent org", async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      const result = await handleCrmUpgrade("org-missing", "CRM_PRO");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("rejects downgrade via upgrade function", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "FUNDROOM",
        stripeCustomerId: "cus_x",
        stripeSubscriptionId: "sub_x",
      });

      const result = await handleCrmUpgrade("org-1", "CRM_PRO");

      expect(result.success).toBe(false);
      expect(result.error).toContain("downgrade");
    });

    it("rejects upgrade to same tier", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "CRM_PRO",
        stripeCustomerId: "cus_x",
        stripeSubscriptionId: "sub_x",
      });

      const result = await handleCrmUpgrade("org-1", "CRM_PRO");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Already on this plan");
    });

    it("updates existing subscription with proration on upgrade", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "CRM_PRO",
        stripeCustomerId: "cus_existing",
        stripeSubscriptionId: "sub_existing",
      });

      mockStripeSubscriptions.retrieve.mockResolvedValue({
        items: { data: [{ id: "si_item123" }] },
      });

      mockStripeSubscriptions.update.mockResolvedValue({});
      prisma.organization.update.mockResolvedValue({});

      const result = await handleCrmUpgrade("org-upgrade", "FUNDROOM");

      expect(result.success).toBe(true);
      expect(result.newTier).toBe("FUNDROOM");
      expect(mockStripeSubscriptions.update).toHaveBeenCalledWith(
        "sub_existing",
        expect.objectContaining({
          proration_behavior: "create_prorations",
        }),
      );
      expect(prisma.organization.update).toHaveBeenCalled();
      expect(invalidateTierCache).toHaveBeenCalledWith("org-upgrade");
    });

    it("returns error when no existing subscription", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "FREE",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      });

      const result = await handleCrmUpgrade("org-no-sub", "CRM_PRO");

      expect(result.success).toBe(false);
      expect(result.error).toContain("checkout");
    });

    it("handles Stripe subscription update failure", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "CRM_PRO",
        stripeCustomerId: "cus_fail",
        stripeSubscriptionId: "sub_fail",
      });

      mockStripeSubscriptions.retrieve.mockResolvedValue({
        items: { data: [{ id: "si_item999" }] },
      });

      mockStripeSubscriptions.update.mockRejectedValue(
        new Error("Stripe error"),
      );

      const result = await handleCrmUpgrade("org-fail", "FUNDROOM");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to update");
    });
  });

  describe("handleCrmDowngrade", () => {
    it("returns error for non-existent org", async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      const result = await handleCrmDowngrade("org-missing", "FREE");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("rejects upgrade via downgrade function", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "FREE",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeAiSubscriptionId: null,
      });

      const result = await handleCrmDowngrade("org-1", "CRM_PRO");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not a downgrade");
    });

    it("sets FREE tier for org without subscription", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "CRM_PRO",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeAiSubscriptionId: null,
      });

      prisma.organization.update.mockResolvedValue({});

      const result = await handleCrmDowngrade("org-no-stripe", "FREE");

      expect(result.success).toBe(true);
      expect(prisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subscriptionTier: "FREE",
            subscriptionStatus: "ACTIVE",
          }),
        }),
      );
      expect(invalidateTierCache).toHaveBeenCalledWith("org-no-stripe");
    });

    it("cancels subscription at period end for FREE downgrade", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "FUNDROOM",
        stripeCustomerId: "cus_dg",
        stripeSubscriptionId: "sub_dg",
        stripeAiSubscriptionId: null,
      });

      mockStripeSubscriptions.update.mockResolvedValue({
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 15,
      });

      const result = await handleCrmDowngrade("org-dg-free", "FREE");

      expect(result.success).toBe(true);
      expect(result.effectiveDate).toBeTruthy();
      expect(mockStripeSubscriptions.update).toHaveBeenCalledWith(
        "sub_dg",
        expect.objectContaining({
          cancel_at_period_end: true,
        }),
      );
    });

    it("cancels AI add-on when downgrading to FREE", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "FUNDROOM",
        stripeCustomerId: "cus_dg_ai",
        stripeSubscriptionId: "sub_dg_ai",
        stripeAiSubscriptionId: "sub_ai_addon",
      });

      mockStripeSubscriptions.update
        .mockResolvedValueOnce({
          current_period_end: Math.floor(Date.now() / 1000) + 86400 * 15,
        })
        .mockResolvedValueOnce({});

      const result = await handleCrmDowngrade("org-dg-ai", "FREE");

      expect(result.success).toBe(true);
      // Should cancel both subscriptions
      expect(mockStripeSubscriptions.update).toHaveBeenCalledTimes(2);
      expect(mockStripeSubscriptions.update).toHaveBeenCalledWith(
        "sub_ai_addon",
        expect.objectContaining({
          cancel_at_period_end: true,
        }),
      );
    });

    it("downgrades to lower paid tier without proration", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "FUNDROOM",
        stripeCustomerId: "cus_lower",
        stripeSubscriptionId: "sub_lower",
        stripeAiSubscriptionId: null,
      });

      mockStripeSubscriptions.retrieve.mockResolvedValue({
        items: { data: [{ id: "si_lower" }] },
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 20,
      });

      mockStripeSubscriptions.update.mockResolvedValue({});

      const result = await handleCrmDowngrade("org-lower", "CRM_PRO");

      expect(result.success).toBe(true);
      expect(result.effectiveDate).toBeTruthy();
      expect(mockStripeSubscriptions.update).toHaveBeenCalledWith(
        "sub_lower",
        expect.objectContaining({
          proration_behavior: "none",
          metadata: expect.objectContaining({
            scheduledDowngrade: "true",
          }),
        }),
      );
    });

    it("handles Stripe error during downgrade", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        subscriptionTier: "FUNDROOM",
        stripeCustomerId: "cus_err",
        stripeSubscriptionId: "sub_err",
        stripeAiSubscriptionId: null,
      });

      mockStripeSubscriptions.update.mockRejectedValue(
        new Error("Stripe error"),
      );

      const result = await handleCrmDowngrade("org-err", "FREE");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to process");
    });
  });

  describe("reactivateCrmSubscription", () => {
    it("returns error when no subscription exists", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        stripeSubscriptionId: null,
      });

      const result = await reactivateCrmSubscription("org-no-sub");

      expect(result.success).toBe(false);
      expect(result.error).toContain("No subscription");
    });

    it("reactivates a cancelled subscription", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        stripeSubscriptionId: "sub_reactivate",
      });

      mockStripeSubscriptions.update.mockResolvedValue({});
      prisma.organization.update.mockResolvedValue({});

      const result = await reactivateCrmSubscription("org-reactivate");

      expect(result.success).toBe(true);
      expect(mockStripeSubscriptions.update).toHaveBeenCalledWith(
        "sub_reactivate",
        { cancel_at_period_end: false },
      );
      expect(prisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { subscriptionStatus: "ACTIVE" },
        }),
      );
      expect(invalidateTierCache).toHaveBeenCalledWith("org-reactivate");
    });

    it("handles Stripe error on reactivation", async () => {
      prisma.organization.findUnique.mockResolvedValue({
        stripeSubscriptionId: "sub_fail_reactivate",
      });

      mockStripeSubscriptions.update.mockRejectedValue(
        new Error("Stripe error"),
      );

      const result = await reactivateCrmSubscription("org-fail-react");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to reactivate");
    });
  });
});

// ===========================================================================
// 3. Billing Checkout API (app/api/billing/checkout)
// ===========================================================================

describe("Billing Checkout API", () => {
  let POST: typeof import("@/app/api/billing/checkout/route").POST;

  beforeAll(async () => {
    const mod = await import("@/app/api/billing/checkout/route");
    POST = mod.POST;
  });

  function makeRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost:5000/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as Request;
  }

  it("returns 401 when not authenticated", async () => {
    mockSession(null);

    const req = makeRequest({ plan: "CRM_PRO", period: "monthly" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 for invalid plan", async () => {
    mockSession({
      user: { email: "test@example.com" },
    });

    const req = makeRequest({ plan: "INVALID", period: "monthly" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid plan");
  });

  it("returns 400 for invalid period", async () => {
    mockSession({
      user: { email: "test@example.com" },
    });

    const req = makeRequest({ plan: "CRM_PRO", period: "biweekly" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid period");
  });

  it("returns 404 when user not found", async () => {
    mockSession({
      user: { email: "ghost@example.com" },
    });
    prisma.user.findUnique.mockResolvedValue(null);

    const req = makeRequest({ plan: "CRM_PRO", period: "monthly" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("User not found");
  });

  it("returns 403 when user has no admin role", async () => {
    mockSession({
      user: { email: "member@example.com" },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "member@example.com",
      teams: [
        {
          role: "MEMBER",
          team: { id: "team-1", organization: { id: "org-1", stripeCustomerId: null, subscriptionTier: "FREE", name: "Test Org" } },
        },
      ],
    });

    const req = makeRequest({ plan: "CRM_PRO", period: "monthly" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain("admin");
  });

  it("creates checkout session for new customer", async () => {
    mockSession({
      user: { email: "admin@example.com" },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-admin",
      email: "admin@example.com",
      teams: [
        {
          role: "ADMIN",
          team: {
            id: "team-1",
            organization: {
              id: "org-1",
              stripeCustomerId: null,
              subscriptionTier: "FREE",
              name: "Test Org",
            },
          },
        },
      ],
    });

    mockStripeCheckoutSessions.create.mockResolvedValue({
      url: "https://checkout.stripe.com/session_123",
      id: "cs_test_123",
    });

    const req = makeRequest({ plan: "CRM_PRO", period: "monthly" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.url).toBe("https://checkout.stripe.com/session_123");
    expect(data.sessionId).toBe("cs_test_123");
    expect(mockStripeCheckoutSessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_email: "admin@example.com",
        mode: "subscription",
        metadata: expect.objectContaining({
          system: "crm",
          plan: "CRM_PRO",
        }),
      }),
    );
  });

  it("reuses existing Stripe customer", async () => {
    mockSession({
      user: { email: "admin@example.com" },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-admin",
      email: "admin@example.com",
      teams: [
        {
          role: "OWNER",
          team: {
            id: "team-1",
            organization: {
              id: "org-1",
              stripeCustomerId: "cus_existing_123",
              subscriptionTier: "CRM_PRO",
              name: "Test Org",
            },
          },
        },
      ],
    });

    mockStripeCheckoutSessions.create.mockResolvedValue({
      url: "https://checkout.stripe.com/upgrade_session",
      id: "cs_upgrade",
    });

    const req = makeRequest({ plan: "FUNDROOM", period: "yearly" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockStripeCheckoutSessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing_123",
      }),
    );
  });

  it("rejects downgrade through checkout", async () => {
    mockSession({
      user: { email: "admin@example.com" },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-admin",
      email: "admin@example.com",
      teams: [
        {
          role: "ADMIN",
          team: {
            id: "team-1",
            organization: {
              id: "org-1",
              stripeCustomerId: "cus_x",
              subscriptionTier: "FUNDROOM",
              name: "Test Org",
            },
          },
        },
      ],
    });

    const req = makeRequest({ plan: "CRM_PRO", period: "monthly" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("billing portal");
  });
});

// ===========================================================================
// 4. AI Add-on API (app/api/billing/ai-addon)
// ===========================================================================

describe("AI Add-on API", () => {
  let POST: typeof import("@/app/api/billing/ai-addon/route").POST;

  beforeAll(async () => {
    const mod = await import("@/app/api/billing/ai-addon/route");
    POST = mod.POST;
  });

  function makeRequest(body: Record<string, unknown>): Request {
    return new Request("http://localhost:5000/api/billing/ai-addon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as Request;
  }

  function mockAdminUser(orgOverrides: Record<string, unknown> = {}) {
    mockSession({
      user: { email: "admin@example.com" },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-admin",
      email: "admin@example.com",
      teams: [
        {
          role: "ADMIN",
          team: {
            id: "team-1",
            organization: {
              id: "org-1",
              stripeCustomerId: "cus_test",
              stripeSubscriptionId: "sub_test",
              stripeAiSubscriptionId: null,
              subscriptionTier: "CRM_PRO",
              aiCrmEnabled: false,
              ...orgOverrides,
            },
          },
        },
      ],
    });
  }

  it("returns 401 when not authenticated", async () => {
    mockSession(null);

    const req = makeRequest({ action: "subscribe" });
    const res = await POST(req as any);

    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid action", async () => {
    mockSession({
      user: { email: "admin@example.com" },
    });

    const req = makeRequest({ action: "pause" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("Invalid action");
  });

  it("rejects subscribe on FREE tier", async () => {
    mockAdminUser({ subscriptionTier: "FREE", stripeCustomerId: null });

    const req = makeRequest({ action: "subscribe", period: "monthly" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("active CRM Pro or FundRoom");
  });

  it("rejects subscribe when already active", async () => {
    mockAdminUser({
      aiCrmEnabled: true,
      stripeAiSubscriptionId: "sub_ai_existing",
    });

    const req = makeRequest({ action: "subscribe", period: "monthly" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toContain("already active");
  });

  it("creates AI add-on subscription with trial", async () => {
    mockAdminUser();

    const trialEnd = Math.floor(Date.now() / 1000) + 86400 * 14;
    mockStripeSubscriptions.create.mockResolvedValue({
      id: "sub_ai_new",
      status: "trialing",
      trial_end: trialEnd,
    });
    prisma.organization.update.mockResolvedValue({});

    const req = makeRequest({ action: "subscribe", period: "monthly" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.subscriptionId).toBe("sub_ai_new");
    expect(data.status).toBe("trialing");
    expect(data.trialEndsAt).toBeTruthy();

    expect(mockStripeSubscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_test",
        trial_period_days: 14,
        metadata: expect.objectContaining({
          system: "crm",
          addon: "AI_CRM",
        }),
      }),
    );
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiCrmEnabled: true,
          stripeAiSubscriptionId: "sub_ai_new",
        }),
      }),
    );
    expect(invalidateTierCache).toHaveBeenCalledWith("org-1");
  });

  it("cancels AI add-on at period end", async () => {
    mockAdminUser({
      aiCrmEnabled: true,
      stripeAiSubscriptionId: "sub_ai_cancel",
    });

    mockStripeSubscriptions.update.mockResolvedValue({});

    const req = makeRequest({ action: "cancel" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toContain("cancelled at the end");

    expect(mockStripeSubscriptions.update).toHaveBeenCalledWith(
      "sub_ai_cancel",
      expect.objectContaining({
        cancel_at_period_end: true,
      }),
    );
  });

  it("rejects cancel when no AI subscription exists", async () => {
    mockAdminUser({ stripeAiSubscriptionId: null });

    const req = makeRequest({ action: "cancel" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("No active AI CRM subscription");
  });
});

// ===========================================================================
// 5. Billing Portal API (app/api/billing/portal)
// ===========================================================================

describe("Billing Portal API", () => {
  let POST: typeof import("@/app/api/billing/portal/route").POST;

  beforeAll(async () => {
    const mod = await import("@/app/api/billing/portal/route");
    POST = mod.POST;
  });

  function makeRequest(body: Record<string, unknown> = {}): Request {
    return new Request("http://localhost:5000/api/billing/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as Request;
  }

  it("returns 401 when not authenticated", async () => {
    mockSession(null);

    const req = makeRequest();
    const res = await POST(req as any);

    expect(res.status).toBe(401);
  });

  it("returns 400 when no Stripe customer ID", async () => {
    mockSession({
      user: { email: "admin@example.com" },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      teams: [
        {
          role: "ADMIN",
          team: {
            organization: {
              id: "org-1",
              stripeCustomerId: null,
            },
          },
        },
      ],
    });

    const req = makeRequest();
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("billing account");
  });

  it("creates portal session and returns URL", async () => {
    mockSession({
      user: { email: "admin@example.com" },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      teams: [
        {
          role: "OWNER",
          team: {
            organization: {
              id: "org-1",
              stripeCustomerId: "cus_portal_test",
            },
          },
        },
      ],
    });

    mockStripeBillingPortalSessions.create.mockResolvedValue({
      url: "https://billing.stripe.com/session_portal",
    });

    const req = makeRequest({ returnUrl: "https://app.fundroom.ai/admin" });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.url).toBe("https://billing.stripe.com/session_portal");
    expect(mockStripeBillingPortalSessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_portal_test",
        return_url: "https://app.fundroom.ai/admin",
      }),
    );
  });
});

// ===========================================================================
// 6. CRM Webhook Handler (app/api/webhooks/stripe-crm)
// ===========================================================================

describe("CRM Webhook Handler", () => {
  let POST: typeof import("@/app/api/webhooks/stripe-crm/route").POST;

  beforeAll(async () => {
    const mod = await import("@/app/api/webhooks/stripe-crm/route");
    POST = mod.POST;
  });

  function makeWebhookRequest(body: string, sig = "test-sig"): Request {
    return new Request("http://localhost:5000/api/webhooks/stripe-crm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": sig,
      },
      body,
    }) as unknown as Request;
  }

  beforeEach(() => {
    // Set webhook secret
    process.env.STRIPE_CRM_WEBHOOK_SECRET = "whsec_test_crm";
  });

  afterEach(() => {
    delete process.env.STRIPE_CRM_WEBHOOK_SECRET;
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    const req = new Request("http://localhost:5000/api/webhooks/stripe-crm", {
      method: "POST",
      body: "{}",
    }) as unknown as Request;

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("stripe-signature");
  });

  it("returns 400 when signature verification fails", async () => {
    mockStripeWebhooks.constructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const req = makeWebhookRequest("{}", "bad-sig");
    const res = await POST(req as any);

    expect(res.status).toBe(400);
  });

  it("returns 200 for irrelevant events", async () => {
    mockStripeWebhooks.constructEvent.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: {} },
    });

    const req = makeWebhookRequest("{}");
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.received).toBe(true);
  });

  it("handles checkout.session.completed for base plan", async () => {
    const priceId = CRM_PLANS.CRM_PRO.price.monthly.priceId;

    mockStripeWebhooks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      id: "evt_test_checkout",
      data: {
        object: {
          metadata: { system: "crm", orgId: "org-checkout" },
          client_reference_id: "org-checkout",
          customer: "cus_new",
          subscription: "sub_new",
        },
      },
    });

    mockStripeSubscriptions.retrieve.mockResolvedValue({
      id: "sub_new",
      items: { data: [{ price: { id: priceId } }] },
      trial_end: null,
    });

    prisma.organization.update.mockResolvedValue({});

    const req = makeWebhookRequest("{}");
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org-checkout" },
        data: expect.objectContaining({
          subscriptionTier: "CRM_PRO",
          stripeCustomerId: "cus_new",
          stripeSubscriptionId: "sub_new",
          subscriptionStatus: "ACTIVE",
        }),
      }),
    );
    expect(invalidateTierCache).toHaveBeenCalledWith("org-checkout");
  });

  it("handles checkout.session.completed for AI add-on", async () => {
    const priceId = AI_CRM_ADDON.price.monthly.priceId;
    const trialEnd = Math.floor(Date.now() / 1000) + 86400 * 14;

    mockStripeWebhooks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      id: "evt_test_ai_checkout",
      data: {
        object: {
          metadata: { system: "crm", orgId: "org-ai-checkout" },
          client_reference_id: "org-ai-checkout",
          customer: "cus_ai",
          subscription: "sub_ai",
        },
      },
    });

    mockStripeSubscriptions.retrieve.mockResolvedValue({
      id: "sub_ai",
      items: { data: [{ price: { id: priceId } }] },
      trial_end: trialEnd,
    });

    prisma.organization.update.mockResolvedValue({});

    const req = makeWebhookRequest("{}");
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org-ai-checkout" },
        data: expect.objectContaining({
          aiCrmEnabled: true,
          stripeAiSubscriptionId: "sub_ai",
        }),
      }),
    );
  });

  it("skips non-CRM checkout events", async () => {
    mockStripeWebhooks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      id: "evt_test_saas",
      data: {
        object: {
          metadata: { system: "saas" },
          customer: "cus_saas",
          subscription: "sub_saas",
        },
      },
    });

    const req = makeWebhookRequest("{}");
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it("handles customer.subscription.updated for base plan", async () => {
    const priceId = CRM_PLANS.FUNDROOM.price.monthly.priceId;

    mockStripeWebhooks.constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      id: "evt_test_update",
      data: {
        object: {
          metadata: { system: "crm", orgId: "org-update" },
          status: "active",
          items: { data: [{ price: { id: priceId } }] },
        },
      },
    });

    prisma.organization.update.mockResolvedValue({});

    const req = makeWebhookRequest("{}");
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org-update" },
        data: expect.objectContaining({
          subscriptionTier: "FUNDROOM",
          subscriptionStatus: "ACTIVE",
        }),
      }),
    );
  });

  it("handles customer.subscription.updated with past_due status", async () => {
    const priceId = CRM_PLANS.CRM_PRO.price.monthly.priceId;

    mockStripeWebhooks.constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      id: "evt_test_past_due",
      data: {
        object: {
          metadata: { system: "crm", orgId: "org-past-due" },
          status: "past_due",
          items: { data: [{ price: { id: priceId } }] },
        },
      },
    });

    prisma.organization.update.mockResolvedValue({});

    const req = makeWebhookRequest("{}");
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionStatus: "PAST_DUE",
        }),
      }),
    );
  });

  it("handles customer.subscription.deleted for base plan", async () => {
    mockStripeWebhooks.constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      id: "evt_test_delete",
      data: {
        object: {
          id: "sub_deleted",
          metadata: { system: "crm", orgId: "org-deleted" },
        },
      },
    });

    prisma.organization.update.mockResolvedValue({});

    const req = makeWebhookRequest("{}");
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org-deleted" },
        data: expect.objectContaining({
          subscriptionTier: "FREE",
          stripeSubscriptionId: null,
          subscriptionStatus: "CANCELED",
          aiCrmEnabled: false,
        }),
      }),
    );
    expect(invalidateTierCache).toHaveBeenCalledWith("org-deleted");
  });

  it("handles customer.subscription.deleted for AI add-on", async () => {
    mockStripeWebhooks.constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      id: "evt_test_ai_delete",
      data: {
        object: {
          id: "sub_ai_deleted",
          metadata: {
            system: "crm",
            orgId: "org-ai-deleted",
            addon: "AI_CRM",
          },
        },
      },
    });

    prisma.organization.update.mockResolvedValue({});

    const req = makeWebhookRequest("{}");
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(prisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "org-ai-deleted" },
        data: expect.objectContaining({
          aiCrmEnabled: false,
          stripeAiSubscriptionId: null,
          aiCrmTrialEndsAt: null,
        }),
      }),
    );
  });
});
