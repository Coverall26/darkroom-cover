/**
 * Tests for AI CRM Engine:
 * - AI email draft API (/api/ai/draft-email)
 * - AI insights API (/api/ai/insights)
 * - Sequence engine (enrollment, execution, conditions)
 * - Daily digest cron (/api/cron/crm-digest)
 * - Sequence cron (/api/cron/sequences)
 * - Sequence CRUD API (/api/outreach/sequences)
 */

// ---- Mocks ----

const mockSession = {
  user: { id: "user-1", email: "gp@test.com", name: "GP User" },
  expires: "2099-01-01",
};

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(() => Promise.resolve(mockSession)),
}));
jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(() => Promise.resolve(mockSession)),
}));
jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));
jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));
jest.mock("@/lib/security/rate-limiter", () => ({
  appRouterRateLimit: jest.fn(() => Promise.resolve(null)),
  appRouterUploadRateLimit: jest.fn(() => Promise.resolve(null)),
}));

jest.mock("@/lib/emails/send-crm-digest", () => ({
  sendCrmDigestEmail: jest.fn(() => Promise.resolve({ sent: 1, failed: 0 })),
}));

// Mock tier — AI CRM enabled
jest.mock("@/lib/tier/crm-tier", () => ({
  resolveOrgTier: jest.fn(() =>
    Promise.resolve({
      tier: "CRM_PRO",
      aiCrmEnabled: true,
      maxContacts: null,
      maxEsigsPerMonth: 25,
      maxSignerStorage: 100,
      emailTemplateLimit: null,
      hasKanban: true,
      hasOutreachQueue: true,
      hasEmailTracking: true,
      hasLpOnboarding: false,
      hasAiFeatures: true,
      pipelineStages: ["LEAD", "CONTACTED", "INTERESTED", "CONVERTED"],
    }),
  ),
  invalidateTierCache: jest.fn(),
}));

// Mock OpenAI
const mockCreateChatCompletion = jest.fn();
jest.mock("@/lib/openai", () => ({
  createChatCompletion: (...args: unknown[]) =>
    mockCreateChatCompletion(...args),
}));

// Mock Resend
jest.mock("@/lib/resend", () => ({
  sendOrgEmail: jest.fn(() => Promise.resolve({ id: "email-123" })),
}));

// Mock Prisma
const mockPrisma = {
  contact: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(() => Promise.resolve(5)),
    update: jest.fn(),
  },
  contactActivity: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(() => Promise.resolve([])),
    count: jest.fn(() => Promise.resolve(0)),
  },
  userTeam: {
    findFirst: jest.fn(() =>
      Promise.resolve({
        userId: "user-1",
        role: "ADMIN",
        crmRole: "MANAGER",
        team: { id: "team-1", organizationId: "org-1", name: "Test Team" },
      }),
    ),
  },
  user: {
    findUnique: jest.fn(() =>
      Promise.resolve({ name: "GP User" }),
    ),
  },
  organization: {
    findUnique: jest.fn(() =>
      Promise.resolve({ id: "org-1", name: "Test Org" }),
    ),
    findMany: jest.fn(() => Promise.resolve([])),
  },
  fund: {
    findFirst: jest.fn(() =>
      Promise.resolve({ name: "Test Fund I" }),
    ),
  },
  outreachSequence: {
    findFirst: jest.fn(),
    findMany: jest.fn(() => Promise.resolve([])),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findUnique: jest.fn(),
  },
  outreachStep: {},
  sequenceEnrollment: {
    findUnique: jest.fn(),
    findMany: jest.fn(() => Promise.resolve([])),
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(() => Promise.resolve(0)),
  },
  emailTemplate: {
    findUnique: jest.fn(),
  },
  team: {
    findFirst: jest.fn(() => Promise.resolve({ id: "team-1" })),
  },
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: mockPrisma,
}));

// ---- Helpers ----

import { NextRequest } from "next/server";

function makeRequest(
  method: string,
  body?: Record<string, unknown>,
  searchParams?: Record<string, string>,
) {
  const url = new URL("http://localhost:3000/api/test");
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) =>
      url.searchParams.set(k, v),
    );
  }
  return new Request(url.toString(), {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as unknown as NextRequest;
}

// ---- Import prompt builders ----

import {
  buildEmailDraftPrompt,
  buildInsightPrompt,
  buildDigestPrompt,
} from "@/lib/ai/crm-prompts";

// ===========================================================================
// Test Suite: Prompt Builders
// ===========================================================================

describe("AI CRM Prompt Builders", () => {
  test("buildEmailDraftPrompt includes contact and sender info", () => {
    const prompt = buildEmailDraftPrompt(
      {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        status: "LEAD",
        engagementScore: 42,
      },
      { name: "GP Manager", company: "Acme Capital", fundName: "Fund I" },
      "follow_up",
    );

    expect(prompt).toContain("John Doe");
    expect(prompt).toContain("john@example.com");
    expect(prompt).toContain("GP Manager");
    expect(prompt).toContain("Acme Capital");
    expect(prompt).toContain("Fund I");
    expect(prompt).toContain("42/100");
    expect(prompt).toContain("follow-up");
  });

  test("buildEmailDraftPrompt includes additional context", () => {
    const prompt = buildEmailDraftPrompt(
      {
        email: "test@test.com",
        status: "LEAD",
        engagementScore: 10,
      },
      {},
      "introduction",
      "They viewed the Q4 report last week",
    );

    expect(prompt).toContain("They viewed the Q4 report last week");
  });

  test("buildInsightPrompt includes contact summaries", () => {
    const prompt = buildInsightPrompt(
      [
        {
          firstName: "Alice",
          lastName: "Smith",
          email: "alice@test.com",
          status: "OPPORTUNITY",
          engagementScore: 85,
        },
        {
          firstName: "Bob",
          lastName: null,
          email: "bob@test.com",
          status: "LEAD",
          engagementScore: 20,
        },
      ],
      "Acme Capital",
    );

    expect(prompt).toContain("Alice Smith");
    expect(prompt).toContain("alice@test.com");
    expect(prompt).toContain("bob@test.com");
    expect(prompt).toContain("Acme Capital");
    expect(prompt).toContain("3 insight cards");
  });

  test("buildDigestPrompt includes stats", () => {
    const prompt = buildDigestPrompt(
      {
        totalContacts: 100,
        newContacts24h: 5,
        emailsSent24h: 12,
        emailsOpened24h: 8,
        overdueFollowUps: 3,
        hotLeads: 7,
        recentActivities: [
          { type: "EMAIL_SENT", description: "Sent welcome email" },
        ],
      },
      "GP User",
      "Acme Capital",
    );

    expect(prompt).toContain("100");
    expect(prompt).toContain("5");
    expect(prompt).toContain("GP User");
    expect(prompt).toContain("Acme Capital");
    expect(prompt).toContain("Sent welcome email");
  });
});

// ===========================================================================
// Test Suite: AI Draft Email API
// ===========================================================================

describe("POST /api/ai/draft-email", () => {
  let handler: typeof import("@/app/api/ai/draft-email/route").POST;

  beforeAll(async () => {
    const mod = await import("@/app/api/ai/draft-email/route");
    handler = mod.POST;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.contact.findFirst.mockResolvedValue({
      id: "contact-1",
      firstName: "John",
      lastName: "Doe",
      email: "john@test.com",
      company: "Test Co",
      title: "CEO",
      status: "LEAD",
      engagementScore: 50,
      lastContactedAt: null,
      lastEngagedAt: null,
      activities: [],
    });
    mockCreateChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              subject: "Following up on our conversation",
              body: "Hi John,\n\nI wanted to follow up...",
            }),
          },
        },
      ],
    });
  });

  test("returns drafted email with subject and body", async () => {
    const req = makeRequest("POST", {
      contactId: "contact-1",
      purpose: "follow_up",
    });
    const res = await handler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.subject).toBe("Following up on our conversation");
    expect(data.body).toContain("John");
    expect(data.contactId).toBe("contact-1");
    expect(data.purpose).toBe("follow_up");
  });

  test("rejects invalid purpose", async () => {
    const req = makeRequest("POST", {
      contactId: "contact-1",
      purpose: "spam_everyone",
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  test("rejects missing contactId", async () => {
    const req = makeRequest("POST", { purpose: "follow_up" });
    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  test("returns 404 for unknown contact", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    const req = makeRequest("POST", {
      contactId: "nonexistent",
      purpose: "follow_up",
    });
    const res = await handler(req);
    expect(res.status).toBe(404);
  });

  test("returns 403 when AI CRM not enabled", async () => {
    const { resolveOrgTier } = require("@/lib/tier/crm-tier");
    resolveOrgTier.mockResolvedValueOnce({
      tier: "FREE",
      hasAiFeatures: false,
      aiCrmEnabled: false,
    });
    const req = makeRequest("POST", {
      contactId: "contact-1",
      purpose: "follow_up",
    });
    const res = await handler(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.upgradeUrl).toBeDefined();
  });

  test("returns 502 on malformed AI response", async () => {
    mockCreateChatCompletion.mockResolvedValue({
      choices: [{ message: { content: "not json" } }],
    });
    const req = makeRequest("POST", {
      contactId: "contact-1",
      purpose: "follow_up",
    });
    const res = await handler(req);
    expect(res.status).toBe(502);
  });

  test("logs activity on successful draft", async () => {
    const req = makeRequest("POST", {
      contactId: "contact-1",
      purpose: "introduction",
    });
    await handler(req);

    expect(mockPrisma.contactActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: "contact-1",
          type: "NOTE_ADDED",
          description: expect.stringContaining("introduction"),
        }),
      }),
    );
  });
});

// ===========================================================================
// Test Suite: AI Insights API
// ===========================================================================

describe("GET /api/ai/insights", () => {
  let handler: typeof import("@/app/api/ai/insights/route").GET;

  beforeAll(async () => {
    const mod = await import("@/app/api/ai/insights/route");
    handler = mod.GET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.contact.findMany.mockResolvedValue([
      {
        id: "c-1",
        firstName: "Alice",
        lastName: "Smith",
        email: "alice@test.com",
        company: "Co A",
        title: "CTO",
        status: "OPPORTUNITY",
        engagementScore: 85,
        lastContactedAt: null,
        lastEngagedAt: null,
      },
    ]);
    mockCreateChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              insights: [
                {
                  title: "High-value contact needs follow-up",
                  description: "Alice Smith has high engagement but hasn't been contacted recently.",
                  type: "action",
                  priority: "high",
                  contactIds: ["alice@test.com"],
                },
              ],
            }),
          },
        },
      ],
    });
  });

  test("returns insight cards", async () => {
    const req = new NextRequest("http://localhost/api/ai/insights");
    const res = await handler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.insights).toHaveLength(1);
    expect(data.insights[0].title).toBe("High-value contact needs follow-up");
    expect(data.insights[0].type).toBe("action");
    expect(data.insights[0].priority).toBe("high");
  });

  test("returns empty array when no contacts", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([]);
    const req = new NextRequest("http://localhost/api/ai/insights");
    const res = await handler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.insights).toEqual([]);
  });

  test("returns 403 when AI CRM not enabled", async () => {
    const { resolveOrgTier } = require("@/lib/tier/crm-tier");
    resolveOrgTier.mockResolvedValueOnce({
      tier: "FREE",
      hasAiFeatures: false,
    });
    const req = new NextRequest("http://localhost/api/ai/insights");
    const res = await handler(req);
    expect(res.status).toBe(403);
  });

  test("handles malformed AI response gracefully", async () => {
    mockCreateChatCompletion.mockResolvedValue({
      choices: [{ message: { content: "{not valid json" } }],
    });
    const req = new NextRequest("http://localhost/api/ai/insights");
    const res = await handler(req);
    expect(res.status).toBe(502);
  });

  test("validates and cleans insight types", async () => {
    mockCreateChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                title: "Test",
                description: "Test description",
                type: "INVALID_TYPE",
                priority: "INVALID",
                contactIds: [123, "valid@email.com"],
              },
            ]),
          },
        },
      ],
    });
    const req = new NextRequest("http://localhost/api/ai/insights");
    const res = await handler(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.insights[0].type).toBe("action"); // Fallback
    expect(data.insights[0].priority).toBe("medium"); // Fallback
    expect(data.insights[0].contactIds).toEqual(["valid@email.com"]); // Filtered
  });
});

// ===========================================================================
// Test Suite: Sequence Engine
// ===========================================================================

describe("Sequence Engine", () => {
  let enrollContact: typeof import("@/lib/outreach/sequence-engine").enrollContact;
  let unenrollContact: typeof import("@/lib/outreach/sequence-engine").unenrollContact;
  let executeStep: typeof import("@/lib/outreach/sequence-engine").executeStep;
  let processDueEnrollments: typeof import("@/lib/outreach/sequence-engine").processDueEnrollments;

  beforeAll(async () => {
    const mod = await import("@/lib/outreach/sequence-engine");
    enrollContact = mod.enrollContact;
    unenrollContact = mod.unenrollContact;
    executeStep = mod.executeStep;
    processDueEnrollments = mod.processDueEnrollments;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("enrollContact", () => {
    test("creates enrollment and schedules first step", async () => {
      mockPrisma.outreachSequence.findFirst.mockResolvedValue({
        id: "seq-1",
        name: "Welcome Sequence",
        isActive: true,
        steps: [{ stepOrder: 0, delayDays: 2 }],
      });
      mockPrisma.sequenceEnrollment.upsert.mockResolvedValue({
        id: "enroll-1",
        contactId: "contact-1",
        sequenceId: "seq-1",
        currentStep: 0,
        status: "ACTIVE",
        nextStepAt: new Date(),
      });

      const result = await enrollContact({
        contactId: "contact-1",
        sequenceId: "seq-1",
        orgId: "org-1",
      });

      expect(result.enrollmentId).toBe("enroll-1");
      expect(mockPrisma.sequenceEnrollment.upsert).toHaveBeenCalled();
      expect(mockPrisma.contactActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contactId: "contact-1",
            description: expect.stringContaining("Welcome Sequence"),
          }),
        }),
      );
    });

    test("throws on inactive sequence", async () => {
      mockPrisma.outreachSequence.findFirst.mockResolvedValue(null);
      await expect(
        enrollContact({
          contactId: "c-1",
          sequenceId: "seq-1",
          orgId: "org-1",
        }),
      ).rejects.toThrow("Sequence not found or inactive");
    });

    test("throws on empty sequence", async () => {
      mockPrisma.outreachSequence.findFirst.mockResolvedValue({
        id: "seq-1",
        name: "Empty",
        isActive: true,
        steps: [],
      });
      await expect(
        enrollContact({
          contactId: "c-1",
          sequenceId: "seq-1",
          orgId: "org-1",
        }),
      ).rejects.toThrow("Sequence has no steps");
    });
  });

  describe("unenrollContact", () => {
    test("cancels active enrollment", async () => {
      mockPrisma.outreachSequence.findUnique.mockResolvedValue({
        name: "Test Sequence",
      });
      await unenrollContact("contact-1", "seq-1");

      expect(mockPrisma.sequenceEnrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contactId: "contact-1", sequenceId: "seq-1", status: "ACTIVE" },
          data: expect.objectContaining({ status: "CANCELLED" }),
        }),
      );
    });
  });

  describe("executeStep", () => {
    test("skips when enrollment is not active", async () => {
      mockPrisma.sequenceEnrollment.findUnique.mockResolvedValue({
        id: "enroll-1",
        contactId: "c-1",
        currentStep: 0,
        status: "PAUSED",
      });

      const result = await executeStep("enroll-1");
      expect(result.status).toBe("skipped");
      expect(result.reason).toContain("not active");
    });

    test("completes sequence when no more steps", async () => {
      mockPrisma.sequenceEnrollment.findUnique.mockResolvedValue({
        id: "enroll-1",
        contactId: "c-1",
        currentStep: 2,
        status: "ACTIVE",
        sequence: {
          steps: [
            { stepOrder: 0, delayDays: 1 },
            { stepOrder: 1, delayDays: 1 },
          ],
          org: { id: "org-1", name: "Test" },
        },
      });

      const result = await executeStep("enroll-1");
      expect(result.status).toBe("skipped");
      expect(result.reason).toContain("complete");
      expect(mockPrisma.sequenceEnrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "COMPLETED" }),
        }),
      );
    });

    test("cancels when contact is unsubscribed", async () => {
      mockPrisma.sequenceEnrollment.findUnique.mockResolvedValue({
        id: "enroll-1",
        contactId: "c-1",
        currentStep: 0,
        status: "ACTIVE",
        sequence: {
          steps: [
            {
              stepOrder: 0,
              delayDays: 1,
              templateId: "tpl-1",
              condition: "ALWAYS",
            },
          ],
          org: { id: "org-1", name: "Test" },
        },
      });
      mockPrisma.contact.findUnique.mockResolvedValue({
        id: "c-1",
        email: "test@test.com",
        unsubscribedAt: new Date(),
        emailBounced: false,
        activities: [],
      });

      const result = await executeStep("enroll-1");
      expect(result.status).toBe("skipped");
      expect(result.reason).toContain("unsubscribed");
    });
  });

  describe("processDueEnrollments", () => {
    test("returns empty results when no due enrollments", async () => {
      mockPrisma.sequenceEnrollment.findMany.mockResolvedValue([]);
      const result = await processDueEnrollments();
      expect(result.processed).toBe(0);
      expect(result.sent).toBe(0);
    });
  });
});

// ===========================================================================
// Test Suite: Sequence CRUD API
// ===========================================================================

describe("Sequence CRUD API", () => {
  describe("POST /api/outreach/sequences", () => {
    let handler: typeof import("@/app/api/outreach/sequences/route").POST;

    beforeAll(async () => {
      const mod = await import("@/app/api/outreach/sequences/route");
      handler = mod.POST;
    });

    beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma.outreachSequence.create.mockResolvedValue({
        id: "seq-new",
        name: "New Sequence",
        steps: [{ stepOrder: 0, delayDays: 3 }],
      });
    });

    test("creates sequence with steps", async () => {
      const req = makeRequest("POST", {
        name: "Welcome Flow",
        description: "Onboarding emails",
        steps: [
          { templateId: "tpl-1", delayDays: 0 },
          { aiPrompt: "Write a follow-up", delayDays: 3 },
        ],
      });
      const res = await handler(req);
      expect(res.status).toBe(201);
      expect(mockPrisma.outreachSequence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Welcome Flow",
            description: "Onboarding emails",
          }),
        }),
      );
    });

    test("rejects empty name", async () => {
      const req = makeRequest("POST", { name: "", steps: [{ aiPrompt: "hi" }] });
      const res = await handler(req);
      expect(res.status).toBe(400);
    });

    test("rejects empty steps", async () => {
      const req = makeRequest("POST", { name: "Test", steps: [] });
      const res = await handler(req);
      expect(res.status).toBe(400);
    });

    test("rejects too many steps (>10)", async () => {
      const steps = Array.from({ length: 11 }, (_, i) => ({
        aiPrompt: `Step ${i}`,
      }));
      const req = makeRequest("POST", { name: "Test", steps });
      const res = await handler(req);
      expect(res.status).toBe(400);
    });

    test("rejects step with no template or prompt", async () => {
      const req = makeRequest("POST", {
        name: "Test",
        steps: [{ delayDays: 1 }],
      });
      const res = await handler(req);
      expect(res.status).toBe(400);
    });

    test("rejects invalid delay", async () => {
      const req = makeRequest("POST", {
        name: "Test",
        steps: [{ aiPrompt: "hi", delayDays: 100 }],
      });
      const res = await handler(req);
      expect(res.status).toBe(400);
    });

    test("rejects invalid condition", async () => {
      const req = makeRequest("POST", {
        name: "Test",
        steps: [{ aiPrompt: "hi", condition: "INVALID" }],
      });
      const res = await handler(req);
      expect(res.status).toBe(400);
    });

    test("returns 403 when AI CRM not enabled", async () => {
      const { resolveOrgTier } = require("@/lib/tier/crm-tier");
      resolveOrgTier.mockResolvedValueOnce({
        tier: "FREE",
        hasAiFeatures: false,
      });
      const req = makeRequest("POST", {
        name: "Test",
        steps: [{ aiPrompt: "hi" }],
      });
      const res = await handler(req);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/outreach/sequences", () => {
    let handler: typeof import("@/app/api/outreach/sequences/route").GET;

    beforeAll(async () => {
      const mod = await import("@/app/api/outreach/sequences/route");
      handler = mod.GET;
    });

    test("returns sequences list", async () => {
      mockPrisma.outreachSequence.findMany.mockResolvedValue([]);
      const req = makeRequest("GET");
      const res = await handler(req);
      expect(res.status).toBe(200);
    });
  });
});

// ===========================================================================
// Test Suite: Sequence Enrollment API
// ===========================================================================

describe("Enrollment API", () => {
  describe("POST /api/outreach/sequences/[id]/enroll", () => {
    let handler: typeof import("@/app/api/outreach/sequences/[id]/enroll/route").POST;

    beforeAll(async () => {
      const mod = await import(
        "@/app/api/outreach/sequences/[id]/enroll/route"
      );
      handler = mod.POST;
    });

    beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: "c-1", unsubscribedAt: null, emailBounced: false },
      ]);
      mockPrisma.outreachSequence.findFirst.mockResolvedValue({
        id: "seq-1",
        name: "Test",
        isActive: true,
        steps: [{ stepOrder: 0, delayDays: 1 }],
      });
      mockPrisma.sequenceEnrollment.upsert.mockResolvedValue({
        id: "enroll-1",
        contactId: "c-1",
        sequenceId: "seq-1",
        currentStep: 0,
        status: "ACTIVE",
        nextStepAt: new Date(),
      });
    });

    test("enrolls single contact", async () => {
      const req = makeRequest("POST", { contactId: "c-1" });
      const res = await handler(req, {
        params: Promise.resolve({ id: "seq-1" }),
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.enrolled).toBe(1);
    });

    test("enrolls multiple contacts", async () => {
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: "c-1", unsubscribedAt: null, emailBounced: false },
        { id: "c-2", unsubscribedAt: null, emailBounced: false },
      ]);
      const req = makeRequest("POST", { contactIds: ["c-1", "c-2"] });
      const res = await handler(req, {
        params: Promise.resolve({ id: "seq-1" }),
      });
      const data = await res.json();
      expect(data.enrolled).toBe(2);
    });

    test("rejects when no contactId provided", async () => {
      const req = makeRequest("POST", {});
      const res = await handler(req, {
        params: Promise.resolve({ id: "seq-1" }),
      });
      expect(res.status).toBe(400);
    });

    test("rejects more than 50 contacts", async () => {
      const ids = Array.from({ length: 51 }, (_, i) => `c-${i}`);
      const req = makeRequest("POST", { contactIds: ids });
      const res = await handler(req, {
        params: Promise.resolve({ id: "seq-1" }),
      });
      expect(res.status).toBe(400);
    });

    test("skips unsubscribed contacts", async () => {
      mockPrisma.contact.findMany.mockResolvedValue([
        { id: "c-1", unsubscribedAt: new Date(), emailBounced: false },
      ]);
      const req = makeRequest("POST", { contactId: "c-1" });
      const res = await handler(req, {
        params: Promise.resolve({ id: "seq-1" }),
      });
      const data = await res.json();
      expect(data.enrolled).toBe(0);
      expect(data.skipped).toBe(1);
    });
  });
});

// ===========================================================================
// Test Suite: Cron Endpoints
// ===========================================================================

describe("Cron Endpoints", () => {
  describe("POST /api/cron/sequences", () => {
    let handler: typeof import("@/app/api/cron/sequences/route").POST;

    beforeAll(async () => {
      const mod = await import("@/app/api/cron/sequences/route");
      handler = mod.POST;
    });

    beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma.sequenceEnrollment.findMany.mockResolvedValue([]);
    });

    test("processes due enrollments", async () => {
      const req = makeRequest("POST");
      const res = await handler(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.processed).toBe(0);
    });

    test("rejects invalid cron secret", async () => {
      const originalEnv = process.env.CRON_SECRET;
      process.env.CRON_SECRET = "real-secret";

      const req = new Request("http://localhost:3000/api/cron/sequences", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-secret" },
      }) as unknown as import("next/server").NextRequest;

      const res = await handler(req);
      expect(res.status).toBe(401);

      if (originalEnv === undefined) {
        delete process.env.CRON_SECRET;
      } else {
        process.env.CRON_SECRET = originalEnv;
      }
    });
  });

  describe("POST /api/cron/crm-digest", () => {
    let handler: typeof import("@/app/api/cron/crm-digest/route").POST;

    beforeAll(async () => {
      const mod = await import("@/app/api/cron/crm-digest/route");
      handler = mod.POST;
    });

    beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma.organization.findMany.mockResolvedValue([]);
    });

    test("processes orgs with AI CRM", async () => {
      const req = makeRequest("POST");
      const res = await handler(req);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.orgsProcessed).toBe(0);
    });

    test("sends digest when org has AI CRM", async () => {
      mockPrisma.organization.findMany.mockResolvedValue([
        {
          id: "org-1",
          name: "Test Org",
          teams: [
            {
              id: "team-1",
              users: [
                { user: { email: "admin@test.com", name: "Admin" } },
              ],
            },
          ],
        },
      ]);

      mockCreateChatCompletion.mockResolvedValue({
        choices: [
          {
            message: {
              content: "Today's highlights: 5 new contacts, 2 overdue follow-ups.",
            },
          },
        ],
      });

      const req = makeRequest("POST");
      const res = await handler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.orgsProcessed).toBe(1);
      expect(mockCreateChatCompletion).toHaveBeenCalled();
    });
  });
});
