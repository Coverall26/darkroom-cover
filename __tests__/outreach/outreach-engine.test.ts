/**
 * Tests for CRM Outreach Engine:
 * - Email sending service (merge vars, tracking pixel, unsubscribe)
 * - Send API (/api/outreach/send)
 * - Tracking pixel (/api/outreach/track/open)
 * - Unsubscribe (/api/outreach/unsubscribe)
 * - Template CRUD (/api/outreach/templates)
 * - Follow-up tracking (/api/outreach/follow-ups)
 * - Bulk email (/api/outreach/bulk)
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
jest.mock("@/lib/tier/crm-tier", () => ({
  resolveOrgTier: jest.fn(() =>
    Promise.resolve({
      tier: "CRM_PRO",
      aiCrmEnabled: false,
      maxContacts: null,
      maxEsigsPerMonth: 25,
      maxSignerStorage: 100,
      emailTemplateLimit: 5,
      hasKanban: true,
      hasOutreachQueue: true,
      hasEmailTracking: true,
      hasLpOnboarding: false,
      hasAiFeatures: false,
      pipelineStages: ["LEAD", "CONTACTED", "INTERESTED", "CONVERTED"],
    }),
  ),
  invalidateTierCache: jest.fn(),
}));

// Mock Prisma — defined inline in factory to avoid const TDZ
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    contact: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    contactActivity: {
      create: jest.fn(() => Promise.resolve({ id: "activity-1" })),
      findFirst: jest.fn(() => Promise.resolve(null)),
    },
    userTeam: {
      findFirst: jest.fn(() =>
        Promise.resolve({
          userId: "user-1",
          role: "ADMIN",
          crmRole: "MANAGER",
          team: { id: "team-1", name: "Acme Capital", organizationId: "org-1" },
          user: { name: "GP User", email: "gp@test.com" },
        }),
      ),
    },
    emailTemplate: {
      findMany: jest.fn(() => Promise.resolve([])),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(() => Promise.resolve(0)),
    },
    team: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: "team-1",
          name: "Acme Capital",
          organization: {
            name: "Acme Capital LLC",
            addressLine1: "123 Main St",
            addressLine2: null,
            addressCity: "San Francisco",
            addressState: "CA",
            addressZip: "94102",
            addressCountry: "US",
          },
        }),
      ),
    },
  },
}));

// Get reference to the mock object after jest.mock has been evaluated
import prisma from "@/lib/prisma";
const mockPrisma = prisma as any;

jest.mock("@/lib/resend", () => ({
  sendOrgEmail: jest.fn(() => Promise.resolve({ id: "resend-email-123" })),
  sendEmail: jest.fn(() => Promise.resolve({ id: "resend-email-456" })),
}));

// ---- Tests ----

import {
  interpolateMergeVars,
  MergeContext,
} from "@/lib/outreach/send-email";

// =========================================================================
// 1. Merge Variable Interpolation
// =========================================================================

describe("interpolateMergeVars", () => {
  const ctx: MergeContext = {
    contact: {
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@acme.com",
      company: "Acme Inc",
      title: "Partner",
    },
    sender: {
      name: "John GP",
      email: "john@fundroom.ai",
      company: "FundRoom Capital",
    },
    fund: {
      name: "Growth Fund I",
    },
  };

  test("replaces contact variables", () => {
    const result = interpolateMergeVars(
      "Hello {{contact.firstName}} {{contact.lastName}}!",
      ctx,
    );
    expect(result).toBe("Hello Jane Smith!");
  });

  test("replaces sender variables", () => {
    const result = interpolateMergeVars(
      "From {{sender.name}} at {{sender.company}}",
      ctx,
    );
    expect(result).toBe("From John GP at FundRoom Capital");
  });

  test("replaces fund variables", () => {
    const result = interpolateMergeVars(
      "Regarding {{fund.name}}",
      ctx,
    );
    expect(result).toBe("Regarding Growth Fund I");
  });

  test("leaves unknown variables as-is", () => {
    const result = interpolateMergeVars(
      "Hello {{unknown.field}}",
      ctx,
    );
    expect(result).toBe("Hello {{unknown.field}}");
  });

  test("handles null/undefined values as empty string", () => {
    const ctxNulls: MergeContext = {
      contact: {
        firstName: null,
        lastName: undefined,
        email: "test@test.com",
      },
    };
    const result = interpolateMergeVars(
      "Hello {{contact.firstName}} {{contact.lastName}}!",
      ctxNulls,
    );
    expect(result).toBe("Hello  !");
  });

  test("handles template with no variables", () => {
    const result = interpolateMergeVars("No variables here", ctx);
    expect(result).toBe("No variables here");
  });

  test("handles multiple occurrences of same variable", () => {
    const result = interpolateMergeVars(
      "{{contact.firstName}} said hi. {{contact.firstName}} is here.",
      ctx,
    );
    expect(result).toBe("Jane said hi. Jane is here.");
  });
});

// =========================================================================
// 2. Send API Tests
// =========================================================================

describe("POST /api/outreach/send", () => {
  let handler: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("@/app/api/outreach/send/route");
    handler = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.contact.findFirst.mockResolvedValue({
      id: "contact-1",
      email: "jane@acme.com",
      teamId: "team-1",
      firstName: "Jane",
      lastName: "Smith",
      company: "Acme",
      title: "Partner",
    });
    mockPrisma.contact.findUnique.mockResolvedValue({
      id: "contact-1",
      email: "jane@acme.com",
      teamId: "team-1",
      unsubscribedAt: null,
      emailBounced: false,
    });
    mockPrisma.contact.update.mockResolvedValue({});
  });

  test("sends email successfully", async () => {
    const req = new Request("http://localhost/api/outreach/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: "contact-1",
        subject: "Hello {{contact.firstName}}",
        body: "<p>Hi there</p>",
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.emailId).toBeTruthy();
  });

  test("rejects missing contactId", async () => {
    const req = new Request("http://localhost/api/outreach/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "Hi", body: "Body" }),
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("contactId");
  });

  test("rejects missing subject", async () => {
    const req = new Request("http://localhost/api/outreach/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: "c1", body: "Body" }),
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("subject");
  });

  test("returns 404 for unknown contact", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);

    const req = new Request("http://localhost/api/outreach/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: "unknown",
        subject: "Hi",
        body: "Body",
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(404);
  });

  test("rejects unauthenticated request", async () => {
    const { getServerSession } = require("next-auth");
    getServerSession.mockResolvedValueOnce(null);

    const req = new Request("http://localhost/api/outreach/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: "c1",
        subject: "Hi",
        body: "Body",
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// 3. Tracking Pixel Tests
// =========================================================================

describe("GET /api/outreach/track/open", () => {
  let handler: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("@/app/api/outreach/track/open/route");
    handler = mod.GET as unknown as (req: Request) => Promise<Response>;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.contactActivity.findFirst.mockResolvedValue(null);
    mockPrisma.contact.update.mockResolvedValue({});
  });

  test("returns 1x1 GIF", async () => {
    const req = new Request(
      "http://localhost/api/outreach/track/open?cid=c1&eid=e1",
    );

    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/gif");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  test("creates open activity on first open", async () => {
    const req = new Request(
      "http://localhost/api/outreach/track/open?cid=c1&eid=e1",
    );

    await handler(req);

    expect(mockPrisma.contactActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: "c1",
          type: "EMAIL_OPENED",
          emailId: "e1",
        }),
      }),
    );
  });

  test("does not create duplicate open activity", async () => {
    mockPrisma.contactActivity.findFirst.mockResolvedValue({ id: "existing" });

    const req = new Request(
      "http://localhost/api/outreach/track/open?cid=c1&eid=e1",
    );

    await handler(req);

    expect(mockPrisma.contactActivity.create).not.toHaveBeenCalled();
  });

  test("returns pixel even without params", async () => {
    const req = new Request("http://localhost/api/outreach/track/open");

    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/gif");
  });

  test("increments engagement score on open", async () => {
    const req = new Request(
      "http://localhost/api/outreach/track/open?cid=c1&eid=e1",
    );

    await handler(req);

    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: expect.objectContaining({
          engagementScore: { increment: 2 },
        }),
      }),
    );
  });
});

// =========================================================================
// 4. Unsubscribe Tests
// =========================================================================

describe("GET /api/outreach/unsubscribe", () => {
  let handler: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("@/app/api/outreach/unsubscribe/route");
    handler = mod.GET as unknown as (req: Request) => Promise<Response>;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("unsubscribes contact successfully", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({
      id: "c1",
      email: "test@test.com",
      unsubscribedAt: null,
    });
    mockPrisma.contact.update.mockResolvedValue({});

    const req = new Request(
      "http://localhost/api/outreach/unsubscribe?cid=c1&tid=team-1",
    );

    const res = await handler(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("unsubscribed");
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: expect.objectContaining({
          unsubscribedAt: expect.any(Date),
        }),
      }),
    );
  });

  test("handles already unsubscribed contact", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({
      id: "c1",
      email: "test@test.com",
      unsubscribedAt: new Date(),
    });

    const req = new Request(
      "http://localhost/api/outreach/unsubscribe?cid=c1&tid=team-1",
    );

    const res = await handler(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("already");
    expect(mockPrisma.contact.update).not.toHaveBeenCalled();
  });

  test("returns 400 for missing params", async () => {
    const req = new Request("http://localhost/api/outreach/unsubscribe");
    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  test("returns 404 for unknown contact", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);

    const req = new Request(
      "http://localhost/api/outreach/unsubscribe?cid=unknown&tid=team-1",
    );

    const res = await handler(req);
    expect(res.status).toBe(404);
  });
});

// =========================================================================
// 5. Template CRUD Tests
// =========================================================================

describe("Template CRUD /api/outreach/templates", () => {
  let listHandler: (req: Request) => Promise<Response>;
  let createHandler: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("@/app/api/outreach/templates/route");
    listHandler = mod.GET as unknown as (req: Request) => Promise<Response>;
    createHandler = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.emailTemplate.findMany.mockResolvedValue([
      { id: "t1", name: "Welcome", subject: "Hi", body: "<p>Hi</p>", isSystem: true, category: "INVITATION" },
    ]);
  });

  test("GET lists templates with tier limits", async () => {
    const req = new Request("http://localhost/api/outreach/templates");
    const res = await listHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.templates).toHaveLength(1);
    expect(data.limits).toBeDefined();
    expect(data.limits.templateLimit).toBe(5);
  });

  test("GET filters by category", async () => {
    const req = new Request(
      "http://localhost/api/outreach/templates?category=FOLLOW_UP",
    );
    await listHandler(req);
    expect(mockPrisma.emailTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: "FOLLOW_UP" }),
      }),
    );
  });

  test("POST creates template", async () => {
    mockPrisma.emailTemplate.create.mockResolvedValue({
      id: "t2",
      name: "Follow Up",
      subject: "Following up",
      body: "<p>Just following up</p>",
      category: "FOLLOW_UP",
    });

    const req = new Request("http://localhost/api/outreach/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Follow Up",
        subject: "Following up",
        body: "<p>Just following up</p>",
        category: "FOLLOW_UP",
      }),
    });

    const res = await createHandler(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Follow Up");
  });

  test("POST rejects empty name", async () => {
    const req = new Request("http://localhost/api/outreach/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "",
        subject: "Hi",
        body: "<p>Body</p>",
      }),
    });

    const res = await createHandler(req);
    expect(res.status).toBe(400);
  });

  test("POST rejects invalid category", async () => {
    const req = new Request("http://localhost/api/outreach/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        subject: "Hi",
        body: "<p>Body</p>",
        category: "INVALID",
      }),
    });

    const res = await createHandler(req);
    expect(res.status).toBe(400);
  });

  test("POST enforces template limit", async () => {
    const { resolveOrgTier } = require("@/lib/tier/crm-tier");
    resolveOrgTier.mockResolvedValueOnce({
      tier: "FREE",
      emailTemplateLimit: 2,
      hasEmailTracking: false,
    });
    mockPrisma.emailTemplate.count.mockResolvedValueOnce(2);

    const req = new Request("http://localhost/api/outreach/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Third Template",
        subject: "Hi",
        body: "<p>Body</p>",
      }),
    });

    const res = await createHandler(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("TEMPLATE_LIMIT_REACHED");
  });
});

// =========================================================================
// 6. Template Single Item Tests
// =========================================================================

describe("Template /api/outreach/templates/[id]", () => {
  let getHandler: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let patchHandler: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  let deleteHandler: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("@/app/api/outreach/templates/[id]/route");
    getHandler = mod.GET as unknown as typeof getHandler;
    patchHandler = mod.PATCH as unknown as typeof patchHandler;
    deleteHandler = mod.DELETE as unknown as typeof deleteHandler;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.emailTemplate.findFirst.mockResolvedValue({
      id: "t1",
      orgId: "org-1",
      name: "Test",
      subject: "Sub",
      body: "<p>Body</p>",
      isSystem: false,
    });
  });

  const makeParams = (id: string) => ({
    params: Promise.resolve({ id }),
  });

  test("GET returns template", async () => {
    const req = new Request("http://localhost/api/outreach/templates/t1");
    const res = await getHandler(req, makeParams("t1"));
    expect(res.status).toBe(200);
  });

  test("PATCH updates template", async () => {
    mockPrisma.emailTemplate.update.mockResolvedValue({
      id: "t1",
      name: "Updated",
    });

    const req = new Request("http://localhost/api/outreach/templates/t1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });

    const res = await patchHandler(req, makeParams("t1"));
    expect(res.status).toBe(200);
  });

  test("DELETE removes template", async () => {
    mockPrisma.emailTemplate.delete.mockResolvedValue({});

    const req = new Request("http://localhost/api/outreach/templates/t1", {
      method: "DELETE",
    });

    const res = await deleteHandler(req, makeParams("t1"));
    expect(res.status).toBe(200);
  });

  test("DELETE rejects system template", async () => {
    mockPrisma.emailTemplate.findFirst.mockResolvedValue({
      id: "t1",
      isSystem: true,
    });

    const req = new Request("http://localhost/api/outreach/templates/t1", {
      method: "DELETE",
    });

    const res = await deleteHandler(req, makeParams("t1"));
    expect(res.status).toBe(403);
  });
});

// =========================================================================
// 7. Follow-Up Tests
// =========================================================================

describe("Follow-ups /api/outreach/follow-ups", () => {
  let getHandler: (req: Request) => Promise<Response>;
  let postHandler: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("@/app/api/outreach/follow-ups/route");
    getHandler = mod.GET as unknown as (req: Request) => Promise<Response>;
    postHandler = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.contact.findMany.mockResolvedValue([]);
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c1" });
    mockPrisma.contact.update.mockResolvedValue({
      id: "c1",
      email: "test@test.com",
      nextFollowUpAt: new Date("2026-03-01"),
    });
  });

  test("GET returns follow-ups with counts", async () => {
    const req = new Request("http://localhost/api/outreach/follow-ups");
    const res = await getHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.contacts).toBeDefined();
    expect(data.counts).toBeDefined();
  });

  test("POST schedules follow-up", async () => {
    const req = new Request("http://localhost/api/outreach/follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: "c1",
        followUpAt: "2026-03-01T00:00:00.000Z",
        notes: "Discuss fund terms",
      }),
    });

    const res = await postHandler(req);
    expect(res.status).toBe(200);
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: expect.objectContaining({
          nextFollowUpAt: expect.any(Date),
        }),
      }),
    );
  });

  test("POST rejects invalid date", async () => {
    const req = new Request("http://localhost/api/outreach/follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: "c1",
        followUpAt: "not-a-date",
      }),
    });

    const res = await postHandler(req);
    expect(res.status).toBe(400);
  });

  test("POST rejects missing contactId", async () => {
    const req = new Request("http://localhost/api/outreach/follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        followUpAt: "2026-03-01T00:00:00.000Z",
      }),
    });

    const res = await postHandler(req);
    expect(res.status).toBe(400);
  });
});

// =========================================================================
// 8. Bulk Email Tests
// =========================================================================

describe("POST /api/outreach/bulk", () => {
  let handler: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("@/app/api/outreach/bulk/route");
    handler = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.contact.findMany.mockResolvedValue([
      {
        id: "c1",
        email: "a@test.com",
        firstName: "A",
        lastName: "One",
        teamId: "team-1",
        unsubscribedAt: null,
        emailBounced: false,
      },
      {
        id: "c2",
        email: "b@test.com",
        firstName: "B",
        lastName: "Two",
        teamId: "team-1",
        unsubscribedAt: null,
        emailBounced: false,
      },
    ]);
    mockPrisma.contact.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({
        id: where.id,
        email: `${where.id}@test.com`,
        teamId: "team-1",
        unsubscribedAt: null,
        emailBounced: false,
      }),
    );
    mockPrisma.contact.update.mockResolvedValue({});
  });

  test("sends bulk emails successfully", async () => {
    const req = new Request("http://localhost/api/outreach/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactIds: ["c1", "c2"],
        subject: "Hello {{contact.firstName}}",
        body: "<p>Hi there</p>",
        trackOpens: true,
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(2);
    expect(data.sent).toBeGreaterThanOrEqual(0);
  });

  test("rejects empty contactIds", async () => {
    const req = new Request("http://localhost/api/outreach/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactIds: [],
        subject: "Hi",
        body: "Body",
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  test("rejects more than 50 recipients", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `c${i}`);

    const req = new Request("http://localhost/api/outreach/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactIds: ids,
        subject: "Hi",
        body: "Body",
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  test("requires CRM_PRO+ tier for bulk email", async () => {
    const { resolveOrgTier } = require("@/lib/tier/crm-tier");
    resolveOrgTier.mockResolvedValueOnce({
      tier: "FREE",
      hasEmailTracking: false,
    });

    const req = new Request("http://localhost/api/outreach/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactIds: ["c1"],
        subject: "Hi",
        body: "Body",
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(403);
  });
});
