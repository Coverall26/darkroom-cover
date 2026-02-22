/**
 * Tests for TierResolver — lib/tier/resolver.ts
 */

import {
  resolveTier,
  canAccess,
  getLimit,
  isFundroomActive,
  isOverLimit,
  clearTierCache,
} from "@/lib/tier/resolver";

import prisma from "@/lib/prisma";

// Cast the global mock for type-safe access
const prismaMock = prisma as unknown as {
  team: { findUnique: jest.Mock };
  fundroomActivation: { findFirst: jest.Mock };
  signatureDocument: { count: jest.Mock };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTeam(overrides: Record<string, unknown> = {}) {
  return {
    plan: "datarooms-plus",
    limits: null,
    stripeId: "cus_abc123",
    subscriptionId: "sub_abc123",
    startsAt: new Date("2026-01-01"),
    endsAt: null,
    pausedAt: null,
    cancelledAt: null,
    featureFlags: null,
    _count: {
      documents: 50,
      links: 20,
      users: 3,
      invitations: 1,
      datarooms: 5,
      domains: 2,
      signatureDocuments: 10,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TierResolver", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearTierCache();
    delete process.env.PAYWALL_BYPASS;
  });

  describe("resolveTier", () => {
    it("resolves a paid datarooms-plus plan correctly", async () => {
      prismaMock.team.findUnique.mockResolvedValue(makeTeam());
      prismaMock.fundroomActivation.findFirst.mockResolvedValue({
        status: "ACTIVE",
      });
      prismaMock.signatureDocument.count.mockResolvedValue(10);

      const tier = await resolveTier("team-1");

      expect(tier.planSlug).toBe("datarooms-plus");
      expect(tier.planName).toBe("Data Rooms Plus");
      expect(tier.isPaidPlan).toBe(true);
      expect(tier.isFreePlan).toBe(false);
      expect(tier.isTrial).toBe(false);
      expect(tier.subscriptionStatus).toBe("active");
      expect(tier.activationStatus).toBe("ACTIVE");
      expect(tier.fundroomActive).toBe(true);

      // Limits from DATAROOMS_PLUS_PLAN_LIMITS
      expect(tier.limits.users).toBeNull(); // unlimited
      expect(tier.limits.links).toBeNull(); // unlimited
      expect(tier.limits.documents).toBeNull(); // unlimited
      expect(tier.limits.domains).toBe(1000);
      expect(tier.limits.datarooms).toBe(1000);
      expect(tier.limits.customDomainInDataroom).toBe(true);
      expect(tier.limits.esignatures).toBeNull(); // unlimited

      // Usage
      expect(tier.usage.documents).toBe(50);
      expect(tier.usage.links).toBe(20);
      expect(tier.usage.users).toBe(4); // 3 users + 1 invitation
      expect(tier.usage.esignatures).toBe(10);
    });

    it("resolves a free plan correctly", async () => {
      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({
          plan: "free",
          stripeId: null,
          subscriptionId: null,
          startsAt: null,
        }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const tier = await resolveTier("team-free");

      expect(tier.planSlug).toBe("free");
      expect(tier.isFreePlan).toBe(true);
      expect(tier.isPaidPlan).toBe(false);
      expect(tier.subscriptionStatus).toBe("none");
      expect(tier.activationStatus).toBe("NONE");
      expect(tier.fundroomActive).toBe(false);

      // Free plan limits
      expect(tier.limits.users).toBe(1);
      expect(tier.limits.links).toBe(50);
      expect(tier.limits.documents).toBe(50);
      expect(tier.limits.domains).toBe(0);
      expect(tier.limits.datarooms).toBe(0);
      expect(tier.limits.esignatures).toBe(0);
    });

    it("resolves a trial plan correctly", async () => {
      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({
          plan: "free+drtrial",
          subscriptionId: null,
          stripeId: null,
        }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const tier = await resolveTier("team-trial");

      expect(tier.planSlug).toBe("free");
      expect(tier.isTrial).toBe(true);
      expect(tier.subscriptionStatus).toBe("trialing");
      // Trial gets 3 users instead of 1
      expect(tier.limits.users).toBe(3);
    });

    it("handles paused subscription", async () => {
      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({ pausedAt: new Date() }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue({
        status: "ACTIVE",
      });
      prismaMock.signatureDocument.count.mockResolvedValue(5);

      const tier = await resolveTier("team-paused");

      expect(tier.subscriptionStatus).toBe("paused");
      expect(tier.capabilities.canSign).toBe(false);
      expect(tier.capabilities.canManageFund).toBe(false);
      expect(tier.capabilities.canShareLinks).toBe(false);
      expect(tier.capabilities.canAddDocuments).toBe(false);
      expect(tier.capabilities.canViewAnalytics).toBe(true); // Always allowed
    });

    it("handles expired subscription", async () => {
      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({ endsAt: new Date("2025-01-01") }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue({
        status: "ACTIVE",
      });
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const tier = await resolveTier("team-expired");

      expect(tier.subscriptionStatus).toBe("expired");
      expect(tier.capabilities.canSign).toBe(false);
      expect(tier.capabilities.canManageFund).toBe(false);
    });

    it("handles cancelled subscription", async () => {
      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({ cancelledAt: new Date() }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue({
        status: "ACTIVE",
      });
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const tier = await resolveTier("team-cancelled");

      expect(tier.subscriptionStatus).toBe("cancelled");
      expect(tier.capabilities.canSign).toBe(false);
    });

    it("handles PAYWALL_BYPASS env var", async () => {
      process.env.PAYWALL_BYPASS = "true";

      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({ plan: "free", subscriptionId: null, stripeId: null }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const tier = await resolveTier("team-bypass");

      expect(tier.fundroomActive).toBe(true);
      // Free plan still doesn't include e-sig plans
      expect(tier.capabilities.canSign).toBe(false);
      // But fund management is allowed via activation
      expect(tier.capabilities.canManageFund).toBe(true);
    });

    it("handles team with custom limits override", async () => {
      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({
          plan: "pro",
          limits: { documents: 500, domains: 2 },
        }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const tier = await resolveTier("team-overrides");

      // Pro plan default is 300 docs, but team override sets 500
      expect(tier.limits.documents).toBe(500);
      // Pro plan default is 0 domains, override sets 2
      expect(tier.limits.domains).toBe(2);
    });

    it("throws error for nonexistent team", async () => {
      prismaMock.team.findUnique.mockResolvedValue(null);
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      await expect(resolveTier("nonexistent")).rejects.toThrow(
        "Team not found: nonexistent",
      );
    });

    it("computes resource-based capabilities from usage vs limits", async () => {
      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({
          plan: "pro",
          _count: {
            documents: 300, // at limit
            links: 10,
            users: 1, // at limit
            invitations: 0,
            datarooms: 0,
            domains: 0,
            signatureDocuments: 0,
          },
        }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const tier = await resolveTier("team-at-limit");

      expect(tier.capabilities.canAddDocuments).toBe(false); // 300 >= 300
      expect(tier.capabilities.canAddLinks).toBe(true); // unlimited on pro
      expect(tier.capabilities.canAddUsers).toBe(false); // 1 >= 1
      expect(tier.capabilities.canAddDomains).toBe(false); // 0 domains allowed on pro
    });

    it("uses cached result on second call", async () => {
      prismaMock.team.findUnique.mockResolvedValue(makeTeam());
      prismaMock.fundroomActivation.findFirst.mockResolvedValue({
        status: "ACTIVE",
      });
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const tier1 = await resolveTier("team-cached");
      const tier2 = await resolveTier("team-cached");

      expect(tier1).toBe(tier2); // Same object reference (cached)
      expect(prismaMock.team.findUnique).toHaveBeenCalledTimes(1);
    });

    it("returns fresh result after cache cleared", async () => {
      prismaMock.team.findUnique.mockResolvedValue(makeTeam());
      prismaMock.fundroomActivation.findFirst.mockResolvedValue({
        status: "ACTIVE",
      });
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      await resolveTier("team-clear");
      clearTierCache("team-clear");
      await resolveTier("team-clear");

      expect(prismaMock.team.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe("Plan-level capabilities", () => {
    it.each([
      ["free", false, false, false, false, false],
      ["pro", true, false, false, false, false],
      ["business", true, true, true, true, false],
      ["datarooms", true, true, true, true, false],
      ["datarooms-plus", true, true, true, true, false],
      ["datarooms-premium", true, true, true, true, true],
    ] as const)(
      "%s plan has correct feature flags",
      async (plan, branding, webhooks, screenshot, _watermark, sso) => {
        prismaMock.team.findUnique.mockResolvedValue(
          makeTeam({ plan, subscriptionId: plan !== "free" ? "sub_x" : null }),
        );
        prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
        prismaMock.signatureDocument.count.mockResolvedValue(0);

        const tier = await resolveTier(`team-${plan}`);

        expect(tier.capabilities.canUseBranding).toBe(branding);
        expect(tier.capabilities.canUseWebhooks).toBe(webhooks);
        expect(tier.capabilities.canUseScreenshotProtection).toBe(screenshot);
        expect(tier.capabilities.canUseSSO).toBe(sso);
      },
    );
  });

  describe("canAccess helper", () => {
    it("returns true for allowed capability", async () => {
      prismaMock.team.findUnique.mockResolvedValue(makeTeam());
      prismaMock.fundroomActivation.findFirst.mockResolvedValue({
        status: "ACTIVE",
      });
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const result = await canAccess("team-can", "canSign");
      expect(result).toBe(true);
    });

    it("returns false for disallowed capability", async () => {
      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({ plan: "free", subscriptionId: null }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const result = await canAccess("team-cant", "canSign");
      expect(result).toBe(false);
    });
  });

  describe("getLimit helper", () => {
    it("returns null for unlimited resource", async () => {
      prismaMock.team.findUnique.mockResolvedValue(makeTeam());
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const result = await getLimit("team-limit", "users");
      expect(result).toBeNull();
    });

    it("returns numeric limit for capped resource", async () => {
      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({ plan: "free", subscriptionId: null }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const result = await getLimit("team-free-limit", "documents");
      expect(result).toBe(50);
    });
  });

  describe("isFundroomActive helper", () => {
    it("returns true when activation is ACTIVE", async () => {
      prismaMock.team.findUnique.mockResolvedValue(makeTeam());
      prismaMock.fundroomActivation.findFirst.mockResolvedValue({
        status: "ACTIVE",
      });
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      expect(await isFundroomActive("team-active")).toBe(true);
    });

    it("returns false when no activation", async () => {
      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({ plan: "free", subscriptionId: null }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      expect(await isFundroomActive("team-none")).toBe(false);
    });

    it("returns true when PAYWALL_BYPASS is set", async () => {
      process.env.PAYWALL_BYPASS = "true";
      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({ plan: "free", subscriptionId: null }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      expect(await isFundroomActive("team-bypass")).toBe(true);
    });
  });

  describe("isOverLimit helper", () => {
    it("returns true when usage equals limit", async () => {
      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({
          plan: "pro",
          _count: {
            documents: 300,
            links: 0,
            users: 1,
            invitations: 0,
            datarooms: 0,
            domains: 0,
            signatureDocuments: 0,
          },
        }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      expect(await isOverLimit("team-over", "documents")).toBe(true);
    });

    it("returns false when usage is below limit", async () => {
      prismaMock.team.findUnique.mockResolvedValue(
        makeTeam({
          plan: "pro",
          _count: {
            documents: 100,
            links: 0,
            users: 1,
            invitations: 0,
            datarooms: 0,
            domains: 0,
            signatureDocuments: 0,
          },
        }),
      );
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      expect(await isOverLimit("team-under", "documents")).toBe(false);
    });

    it("returns false for unlimited resource", async () => {
      prismaMock.team.findUnique.mockResolvedValue(makeTeam());
      prismaMock.fundroomActivation.findFirst.mockResolvedValue(null);
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      expect(await isOverLimit("team-unlimited", "documents")).toBe(false);
    });
  });

  describe("SUSPENDED and DEACTIVATED activation statuses", () => {
    it("SUSPENDED activation does not grant fundroom features", async () => {
      prismaMock.team.findUnique.mockResolvedValue(makeTeam());
      prismaMock.fundroomActivation.findFirst.mockResolvedValue({
        status: "SUSPENDED",
      });
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const tier = await resolveTier("team-suspended");

      expect(tier.activationStatus).toBe("SUSPENDED");
      expect(tier.fundroomActive).toBe(false);
      expect(tier.capabilities.canManageFund).toBe(false);
      expect(tier.capabilities.canOnboardLP).toBe(false);
    });

    it("DEACTIVATED activation does not grant fundroom features", async () => {
      prismaMock.team.findUnique.mockResolvedValue(makeTeam());
      prismaMock.fundroomActivation.findFirst.mockResolvedValue({
        status: "DEACTIVATED",
      });
      prismaMock.signatureDocument.count.mockResolvedValue(0);

      const tier = await resolveTier("team-deactivated");

      expect(tier.activationStatus).toBe("DEACTIVATED");
      expect(tier.fundroomActive).toBe(false);
    });
  });
});
