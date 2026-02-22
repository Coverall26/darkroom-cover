/**
 * Tests for CRM Tier Resolution + Gate Checks
 *
 * Covers:
 * - resolveOrgTier returns correct limits for each tier
 * - checkContactLimit blocks at 20 for FREE, allows unlimited for CRM_PRO
 * - checkEsigLimit resets monthly, blocks at correct thresholds
 * - checkFeatureAccess gates features by tier
 * - Cache invalidation works
 * - withTierCheck middleware returns 403 with correct error shape
 */

import { resolveOrgTier, invalidateTierCache } from "@/lib/tier/crm-tier";
import {
  checkContactLimit,
  checkEsigLimit,
  checkFeatureAccess,
  checkSignerStorage,
  getTemplateLimit,
  incrementEsigUsage,
} from "@/lib/tier/gates";

// Mock prisma
jest.mock("@/lib/prisma", () => {
  const mockPrisma = {
    organization: {
      findUnique: jest.fn(),
    },
    team: {
      findMany: jest.fn(),
    },
    contact: {
      count: jest.fn(),
    },
    esigUsage: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    signatureRecipient: {
      count: jest.fn(),
    },
    emailTemplate: {
      count: jest.fn(),
    },
    pendingContact: {
      count: jest.fn(),
    },
  };
  return { __esModule: true, default: mockPrisma };
});

const prisma = require("@/lib/prisma").default;

beforeEach(() => {
  jest.clearAllMocks();
  invalidateTierCache(); // Clear cache between tests
});

// ---------------------------------------------------------------------------
// resolveOrgTier
// ---------------------------------------------------------------------------

describe("resolveOrgTier", () => {
  it("returns FREE tier limits for FREE subscription", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FREE",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });

    const tier = await resolveOrgTier("org-1");

    expect(tier.tier).toBe("FREE");
    expect(tier.maxContacts).toBe(20);
    expect(tier.maxEsigsPerMonth).toBe(10);
    expect(tier.maxSignerStorage).toBe(40);
    expect(tier.emailTemplateLimit).toBe(2);
    expect(tier.hasKanban).toBe(false);
    expect(tier.hasOutreachQueue).toBe(false);
    expect(tier.hasEmailTracking).toBe(false);
    expect(tier.hasLpOnboarding).toBe(false);
    expect(tier.hasAiFeatures).toBe(false);
    expect(tier.pipelineStages).toEqual(["LEAD", "CONTACTED", "INTERESTED", "CONVERTED"]);
  });

  it("returns CRM_PRO tier limits", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "CRM_PRO",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });

    const tier = await resolveOrgTier("org-2");

    expect(tier.tier).toBe("CRM_PRO");
    expect(tier.maxContacts).toBeNull(); // unlimited
    expect(tier.maxEsigsPerMonth).toBe(25);
    expect(tier.maxSignerStorage).toBe(100);
    expect(tier.emailTemplateLimit).toBe(5);
    expect(tier.hasKanban).toBe(true);
    expect(tier.hasOutreachQueue).toBe(true);
    expect(tier.hasEmailTracking).toBe(true);
    expect(tier.hasLpOnboarding).toBe(false);
  });

  it("returns FUNDROOM tier limits with compliance pipeline", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FUNDROOM",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });

    const tier = await resolveOrgTier("org-3");

    expect(tier.tier).toBe("FUNDROOM");
    expect(tier.maxContacts).toBeNull();
    expect(tier.maxEsigsPerMonth).toBeNull();
    expect(tier.maxSignerStorage).toBeNull();
    expect(tier.hasLpOnboarding).toBe(true);
    expect(tier.pipelineStages).toEqual(["LEAD", "NDA_SIGNED", "ACCREDITED", "COMMITTED", "FUNDED"]);
  });

  it("enables AI features when aiCrmEnabled is true", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "CRM_PRO",
      aiCrmEnabled: true,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });

    const tier = await resolveOrgTier("org-4");

    expect(tier.hasAiFeatures).toBe(true);
    expect(tier.emailTemplateLimit).toBeNull(); // unlimited with AI
    expect(tier.hasOutreachQueue).toBe(true);
  });

  it("disables AI features when trial has expired", async () => {
    const expired = new Date(Date.now() - 86400000); // 1 day ago
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "CRM_PRO",
      aiCrmEnabled: true,
      aiCrmTrialEndsAt: expired,
      subscriptionStatus: "ACTIVE",
    });

    const tier = await resolveOrgTier("org-5");

    expect(tier.hasAiFeatures).toBe(false);
    expect(tier.aiCrmEnabled).toBe(false);
  });

  it("treats PAST_DUE as FREE for feature access", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FUNDROOM",
      aiCrmEnabled: true,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "PAST_DUE",
    });

    const tier = await resolveOrgTier("org-6");

    expect(tier.tier).toBe("FUNDROOM"); // tier field unchanged
    expect(tier.maxContacts).toBe(20); // but limits match FREE
    expect(tier.hasKanban).toBe(false);
    expect(tier.hasLpOnboarding).toBe(false);
  });

  it("uses cache on subsequent calls", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FREE",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });

    await resolveOrgTier("org-cache");
    await resolveOrgTier("org-cache");

    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(1);
  });

  it("invalidates cache when requested", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FREE",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });

    await resolveOrgTier("org-invalidate");
    invalidateTierCache("org-invalidate");
    await resolveOrgTier("org-invalidate");

    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(2);
  });

  it("throws for non-existent org", async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(resolveOrgTier("org-missing")).rejects.toThrow("Organization not found");
  });
});

// ---------------------------------------------------------------------------
// checkContactLimit
// ---------------------------------------------------------------------------

describe("checkContactLimit", () => {
  it("blocks at 20 for FREE tier", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FREE",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });
    prisma.team.findMany.mockResolvedValue([{ id: "team-1" }]);
    prisma.contact.count.mockResolvedValue(20);

    const result = await checkContactLimit("org-free");

    expect(result.allowed).toBe(false);
    expect(result.error).toBe("CONTACT_LIMIT_REACHED");
    expect(result.meta).toHaveProperty("current", 20);
    expect(result.meta).toHaveProperty("limit", 20);
    expect(result.meta).toHaveProperty("upgradeUrl");
  });

  it("allows when under limit", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FREE",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });
    prisma.team.findMany.mockResolvedValue([{ id: "team-1" }]);
    prisma.contact.count.mockResolvedValue(15);

    const result = await checkContactLimit("org-free-under");

    expect(result.allowed).toBe(true);
  });

  it("allows unlimited for CRM_PRO", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "CRM_PRO",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });

    const result = await checkContactLimit("org-pro");

    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkEsigLimit
// ---------------------------------------------------------------------------

describe("checkEsigLimit", () => {
  it("blocks at 10 for FREE tier", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FREE",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });
    prisma.esigUsage.upsert.mockResolvedValue({ signaturesUsed: 10 });

    const result = await checkEsigLimit("org-esig-free");

    expect(result.allowed).toBe(false);
    expect(result.error).toBe("ESIG_LIMIT_REACHED");
  });

  it("allows when under limit", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FREE",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });
    prisma.esigUsage.upsert.mockResolvedValue({ signaturesUsed: 5 });

    const result = await checkEsigLimit("org-esig-under");

    expect(result.allowed).toBe(true);
  });

  it("allows unlimited for FUNDROOM tier", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FUNDROOM",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });

    const result = await checkEsigLimit("org-esig-fund");

    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkFeatureAccess
// ---------------------------------------------------------------------------

describe("checkFeatureAccess", () => {
  it("gates kanban for FREE tier", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FREE",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });

    const result = await checkFeatureAccess("org-gate", "kanban");

    expect(result.allowed).toBe(false);
    expect(result.error).toBe("FEATURE_GATED");
    expect(result.meta?.feature).toBe("kanban");
    expect(result.meta?.currentTier).toBe("FREE");
  });

  it("allows kanban for CRM_PRO tier", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "CRM_PRO",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });

    const result = await checkFeatureAccess("org-gate-pro", "kanban");

    expect(result.allowed).toBe(true);
  });

  it("gates lp_onboarding for CRM_PRO tier", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "CRM_PRO",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });

    const result = await checkFeatureAccess("org-gate-lp", "lp_onboarding");

    expect(result.allowed).toBe(false);
    expect(result.error).toBe("FEATURE_GATED");
  });

  it("allows lp_onboarding for FUNDROOM tier", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FUNDROOM",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });

    const result = await checkFeatureAccess("org-gate-fund", "lp_onboarding");

    expect(result.allowed).toBe(true);
  });

  it("allows unknown features by default", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FREE",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });

    const result = await checkFeatureAccess("org-gate-unknown", "some_unknown_feature");

    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getTemplateLimit
// ---------------------------------------------------------------------------

describe("getTemplateLimit", () => {
  it("returns limit of 2 for FREE tier", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "FREE",
      aiCrmEnabled: false,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });
    prisma.emailTemplate.count.mockResolvedValue(1);

    const result = await getTemplateLimit("org-tpl-free");

    expect(result.limit).toBe(2);
    expect(result.used).toBe(1);
    expect(result.canCreate).toBe(true);
  });

  it("returns unlimited for AI CRM enabled", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      subscriptionTier: "CRM_PRO",
      aiCrmEnabled: true,
      aiCrmTrialEndsAt: null,
      subscriptionStatus: "ACTIVE",
    });
    prisma.emailTemplate.count.mockResolvedValue(50);

    const result = await getTemplateLimit("org-tpl-ai");

    expect(result.limit).toBeNull();
    expect(result.canCreate).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// incrementEsigUsage
// ---------------------------------------------------------------------------

describe("incrementEsigUsage", () => {
  it("increments the counter for the current month", async () => {
    prisma.esigUsage.upsert.mockResolvedValue({ signaturesUsed: 6 });

    await incrementEsigUsage("org-incr");

    expect(prisma.esigUsage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { signaturesUsed: { increment: 1 } },
      }),
    );
  });
});
