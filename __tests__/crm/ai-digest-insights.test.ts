/**
 * AI CRM Tests — Daily Digest + Per-Contact Insights
 *
 * Tests: GET /api/ai/digest, GET /api/ai/insights?contactId=xxx
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

// ---------- Mocks ----------

const mockSession = {
  user: { id: "user-1", email: "admin@test.com", name: "Joe Admin" },
};

const mockTeam = {
  team: {
    id: "team-1",
    organizationId: "org-1",
    name: "Bermuda Fund",
  },
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
  appRouterRateLimit: jest.fn().mockResolvedValue(null),
}));

const mockRequireAuthAppRouter = jest.fn().mockResolvedValue({
  userId: "user-1",
  email: "admin@test.com",
  teamId: "",
  role: "MEMBER",
  session: { user: { id: "user-1", email: "admin@test.com", name: "Joe Admin" } },
});

jest.mock("@/lib/auth/rbac", () => ({
  requireAuthAppRouter: (...args: unknown[]) => mockRequireAuthAppRouter(...args),
}));

jest.mock("@/lib/tier/crm-tier", () => ({
  resolveOrgTier: jest.fn().mockResolvedValue({
    tier: "FUNDROOM",
    hasAiFeatures: true,
    maxContacts: null,
  }),
}));

jest.mock("@/lib/openai", () => ({
  createChatCompletion: jest.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            insights: [
              {
                title: "Follow up with key contact",
                description: "Jane has been inactive for 14 days",
                type: "action",
                priority: "high",
                contactIds: ["jane@test.com"],
              },
            ],
          }),
        },
      },
    ],
  }),
}));

// ---------------------------------------------------------------------------
// GET /api/ai/digest
// ---------------------------------------------------------------------------

describe("GET /api/ai/digest", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    jest.clearAllMocks();
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(mockTeam);
    (prisma.contact.count as jest.Mock).mockResolvedValue(50);
    (prisma.contactActivity.count as jest.Mock).mockResolvedValue(10);
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue([
      { type: "EMAIL_SENT", description: "Sent intro email" },
      { type: "EMAIL_OPENED", description: "Opened intro email" },
    ]);
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ name: "Acme Capital" });

    // Override createChatCompletion for digest
    const openai = await import("@/lib/openai");
    (openai.createChatCompletion as jest.Mock).mockResolvedValue({
      choices: [
        {
          message: {
            content: "- 50 total contacts\n- 3 overdue follow-ups\n- 5 hot leads",
          },
        },
      ],
    });

    const mod = await import("@/app/api/ai/digest/route");
    GET = mod.GET;
  });

  it("returns daily digest with stats", async () => {
    const req = new NextRequest("http://localhost/api/ai/digest");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.digest).toBeDefined();
    expect(data.stats).toBeDefined();
    expect(data.stats.totalContacts).toBe(50);
    expect(data.generatedAt).toBeDefined();
  });

  it("gathers metrics from parallel queries", async () => {
    const req = new NextRequest("http://localhost/api/ai/digest");
    await GET(req);

    // Should call contact.count multiple times (total, new, overdue, hot)
    expect(prisma.contact.count).toHaveBeenCalled();
    // Should call contactActivity.count for emails sent/opened
    expect(prisma.contactActivity.count).toHaveBeenCalled();
    // Should call contactActivity.findMany for recent activities
    expect(prisma.contactActivity.findMany).toHaveBeenCalled();
  });

  it("returns 401 without session", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireAuthAppRouter.mockResolvedValueOnce(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const req = new NextRequest("http://localhost/api/ai/digest");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when AI features not enabled", async () => {
    const { resolveOrgTier } = await import("@/lib/tier/crm-tier");
    (resolveOrgTier as jest.Mock).mockResolvedValueOnce({
      tier: "FREE",
      hasAiFeatures: false,
    });

    const req = new NextRequest("http://localhost/api/ai/digest");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain("AI CRM");
    expect(data.upgradeUrl).toBeDefined();
  });

  it("returns 403 when no team found", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/ai/digest");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/ai/insights — pipeline-level + per-contact
// ---------------------------------------------------------------------------

describe("GET /api/ai/insights", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    jest.clearAllMocks();
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(mockTeam);
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([
      {
        id: "c1",
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@test.com",
        company: "Acme",
        title: "MD",
        status: "LEAD",
        engagementScore: 25,
        lastContactedAt: new Date("2026-02-10"),
        lastEngagedAt: new Date("2026-02-15"),
      },
    ]);
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ name: "Acme Capital" });

    const openai = await import("@/lib/openai");
    (openai.createChatCompletion as jest.Mock).mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              insights: [
                {
                  title: "Follow up with key contact",
                  description: "Jane has high engagement but no recent contact",
                  type: "action",
                  priority: "high",
                  contactIds: ["jane@test.com"],
                },
              ],
            }),
          },
        },
      ],
    });

    const mod = await import("@/app/api/ai/insights/route");
    GET = mod.GET;
  });

  it("returns pipeline-level insights", async () => {
    const req = new NextRequest("http://localhost/api/ai/insights");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.insights).toBeDefined();
    expect(Array.isArray(data.insights)).toBe(true);
  });

  it("returns per-contact insights when contactId provided", async () => {
    // Mock contact with activities for per-contact mode
    (prisma.contact.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: "c1",
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@test.com",
        company: "Acme",
        title: "MD",
        status: "LEAD",
        engagementScore: 25,
        lastContactedAt: new Date("2026-02-10"),
        lastEngagedAt: new Date("2026-02-15"),
        contactActivities: [
          { type: "EMAIL_SENT", description: "Intro email", createdAt: new Date() },
        ],
      },
    ]);

    const req = new NextRequest("http://localhost/api/ai/insights?contactId=c1");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.insights).toBeDefined();
  });

  it("returns empty when no contacts", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValueOnce([]);

    const req = new NextRequest("http://localhost/api/ai/insights");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.insights).toEqual([]);
    expect(data.message).toContain("No contacts");
  });

  it("validates and cleans insight data from AI", async () => {
    const openai = await import("@/lib/openai");
    (openai.createChatCompletion as jest.Mock).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              insights: [
                {
                  title: "A".repeat(100), // exceeds 60 char limit
                  description: "B".repeat(300), // exceeds 200 char limit
                  type: "invalid_type",
                  priority: "invalid_priority",
                  contactIds: ["email@test.com", 123], // mixed types
                },
              ],
            }),
          },
        },
      ],
    });

    const req = new NextRequest("http://localhost/api/ai/insights");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    const insight = data.insights[0];
    expect(insight.title.length).toBeLessThanOrEqual(60);
    expect(insight.description.length).toBeLessThanOrEqual(200);
    expect(insight.type).toBe("action"); // defaults for invalid
    expect(insight.priority).toBe("medium"); // defaults for invalid
  });

  it("returns 502 on unparseable AI response", async () => {
    const openai = await import("@/lib/openai");
    (openai.createChatCompletion as jest.Mock).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: "not valid json at all {{{",
          },
        },
      ],
    });

    const req = new NextRequest("http://localhost/api/ai/insights");
    const res = await GET(req);
    expect(res.status).toBe(502);
  });

  it("limits insights to 3", async () => {
    const openai = await import("@/lib/openai");
    (openai.createChatCompletion as jest.Mock).mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              insights: Array.from({ length: 10 }, (_, i) => ({
                title: `Insight ${i}`,
                description: `Desc ${i}`,
                type: "action",
                priority: "medium",
                contactIds: [],
              })),
            }),
          },
        },
      ],
    });

    const req = new NextRequest("http://localhost/api/ai/insights");
    const res = await GET(req);
    const data = await res.json();

    expect(data.insights.length).toBeLessThanOrEqual(3);
  });
});
