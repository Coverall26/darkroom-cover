/**
 * Engagement Scoring Tests
 *
 * Tests recalculateContactEngagement, recalculateTeamEngagement,
 * and the engagement API endpoints.
 */

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

// ---------- Mocks ----------

const mockSession = {
  user: { id: "user-1", email: "admin@test.com" },
};

const mockTeam = {
  role: "ADMIN",
  crmRole: "MANAGER",
  team: { id: "team-1", organizationId: "org-1" },
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

// ---------- Test data ----------

const mockContact = {
  id: "contact-1",
  teamId: "team-1",
  email: "john@example.com",
  engagementScore: 5,
  lastEngagedAt: new Date("2026-02-15"),
  lastContactedAt: new Date("2026-02-10"),
};

const mockActivities = [
  { type: "EMAIL_SENT", createdAt: new Date("2026-02-19") },
  { type: "EMAIL_OPENED", createdAt: new Date("2026-02-19") },
  { type: "LINK_CLICKED", createdAt: new Date("2026-02-18") },
  { type: "EMAIL_REPLIED", createdAt: new Date("2026-02-18") },
  { type: "DOCUMENT_SIGNED", createdAt: new Date("2026-02-17") },
  { type: "COMMITMENT_MADE", createdAt: new Date("2026-02-16") },
  { type: "NOTE_ADDED", createdAt: new Date("2026-01-15") },     // 35 days old -> 0.4 decay
  { type: "EMAIL_SENT", createdAt: new Date("2025-10-01") },     // ~140 days -> 0.1 decay
];

// ---------- Import after mocks ----------

import {
  recalculateContactEngagement,
  recalculateTeamEngagement,
} from "@/lib/crm/contact-service";

// ---------------------------------------------------------------------------
// recalculateContactEngagement
// ---------------------------------------------------------------------------

describe("recalculateContactEngagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue(mockActivities);
    (prisma.contact.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it("calculates engagement score from activity history", async () => {
    const result = await recalculateContactEngagement("contact-1", "team-1");

    expect(result.total).toBeGreaterThan(0);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.activityCount).toBe(8);
  });

  it("applies time-decay to older activities", async () => {
    const result = await recalculateContactEngagement("contact-1", "team-1");

    // NOTE_ADDED at 35 days: 1 * 0.4 = 0.4
    // EMAIL_SENT at 140 days: 1 * 0.1 = 0.1
    // Recent activities should contribute more
    expect(result.byType["NOTE_ADDED"]?.decayedPoints).toBeLessThan(
      result.byType["NOTE_ADDED"]?.rawPoints ?? 0,
    );
  });

  it("calculates email metrics correctly", async () => {
    const result = await recalculateContactEngagement("contact-1", "team-1");

    expect(result.emailMetrics.sent).toBe(2);
    expect(result.emailMetrics.opened).toBe(1);
    expect(result.emailMetrics.clicked).toBe(1);
    expect(result.emailMetrics.replied).toBe(1);
    expect(result.emailMetrics.openRate).toBe(0.5);
    expect(result.emailMetrics.clickRate).toBe(0.5);
  });

  it("caps score at 100", async () => {
    // Provide many high-weight activities
    const heavyActivities = Array.from({ length: 50 }, () => ({
      type: "COMMITMENT_MADE",
      createdAt: new Date(),
    }));
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue(heavyActivities);

    const result = await recalculateContactEngagement("contact-1", "team-1");
    expect(result.total).toBe(100);
  });

  it("assigns correct engagement tier", async () => {
    // Low score -> COOL
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue([
      { type: "NOTE_ADDED", createdAt: new Date() },
    ]);
    let result = await recalculateContactEngagement("contact-1", "team-1");
    expect(result.tier).toBe("COOL");

    // Medium score -> WARM
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue([
      { type: "CALL", createdAt: new Date() },
      { type: "MEETING", createdAt: new Date() },
    ]);
    result = await recalculateContactEngagement("contact-1", "team-1");
    expect(result.tier).toBe("WARM");

    // High score -> HOT
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue([
      { type: "COMMITMENT_MADE", createdAt: new Date() },
      { type: "WIRE_RECEIVED", createdAt: new Date() },
    ]);
    result = await recalculateContactEngagement("contact-1", "team-1");
    expect(result.tier).toBe("HOT");
  });

  it("returns NONE tier for zero-scored activities", async () => {
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue([
      { type: "STATUS_CHANGE", createdAt: new Date() },
      { type: "CREATED", createdAt: new Date() },
    ]);
    const result = await recalculateContactEngagement("contact-1", "team-1");
    expect(result.tier).toBe("NONE");
    expect(result.total).toBe(0);
  });

  it("persists updated score to database", async () => {
    await recalculateContactEngagement("contact-1", "team-1");

    expect(prisma.contact.updateMany).toHaveBeenCalledWith({
      where: { id: "contact-1", teamId: "team-1" },
      data: expect.objectContaining({
        engagementScore: expect.any(Number),
      }),
    });
  });

  it("handles empty activity history", async () => {
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue([]);

    const result = await recalculateContactEngagement("contact-1", "team-1");
    expect(result.total).toBe(0);
    expect(result.tier).toBe("NONE");
    expect(result.activityCount).toBe(0);
    expect(result.lastActivityAt).toBeNull();
    expect(result.emailMetrics.openRate).toBe(0);
  });

  it("tracks lastActivityAt correctly", async () => {
    const newestDate = new Date("2026-02-19");
    const result = await recalculateContactEngagement("contact-1", "team-1");
    expect(result.lastActivityAt).toEqual(newestDate);
  });

  it("groups activity counts by type", async () => {
    const result = await recalculateContactEngagement("contact-1", "team-1");

    expect(result.byType["EMAIL_SENT"]?.count).toBe(2);
    expect(result.byType["COMMITMENT_MADE"]?.count).toBe(1);
    expect(result.byType["DOCUMENT_SIGNED"]?.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// recalculateTeamEngagement
// ---------------------------------------------------------------------------

describe("recalculateTeamEngagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([
      { id: "contact-1" },
      { id: "contact-2" },
      { id: "contact-3" },
    ]);
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue(mockActivities);
    (prisma.contact.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it("processes all contacts in team", async () => {
    const result = await recalculateTeamEngagement("team-1");

    expect(result.processed).toBe(3);
    expect(result.errors).toBe(0);
  });

  it("counts errors without stopping", async () => {
    // Make 2nd contact fail
    let callCount = 0;
    (prisma.contactActivity.findMany as jest.Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 2) throw new Error("DB error");
      return Promise.resolve(mockActivities);
    });

    const result = await recalculateTeamEngagement("team-1");
    expect(result.processed).toBe(2);
    expect(result.errors).toBe(1);
  });

  it("handles empty team", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

    const result = await recalculateTeamEngagement("team-1");
    expect(result.processed).toBe(0);
    expect(result.errors).toBe(0);
  });

  it("only processes non-unsubscribed contacts", async () => {
    await recalculateTeamEngagement("team-1");

    expect(prisma.contact.findMany).toHaveBeenCalledWith({
      where: { teamId: "team-1", unsubscribedAt: null },
      select: { id: true },
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/contacts/[id]/engagement
// ---------------------------------------------------------------------------

describe("GET /api/contacts/[id]/engagement", () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    jest.clearAllMocks();
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(mockTeam);
    (prisma.contact.findFirst as jest.Mock).mockResolvedValue(mockContact);
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue(mockActivities);

    const mod = await import("@/app/api/contacts/[id]/engagement/route");
    GET = mod.GET;
  });

  it("returns engagement breakdown for valid contact", async () => {
    const req = new NextRequest("http://localhost/api/contacts/contact-1/engagement");
    const res = await GET(req, { params: Promise.resolve({ id: "contact-1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.contactId).toBe("contact-1");
    expect(data.engagementScore).toBe(5);
    expect(data.emailMetrics).toBeDefined();
    expect(data.emailMetrics.sent).toBe(2);
    // GET endpoint returns percentage (not ratio): Math.round((1/2) * 100) = 50
    expect(data.emailMetrics.openRate).toBe(50);
    expect(data.activityByType).toBeDefined();
  });

  it("returns 401 without session", async () => {
    const { getServerSession } = await import("next-auth");
    (getServerSession as jest.Mock).mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/contacts/contact-1/engagement");
    const res = await GET(req, { params: Promise.resolve({ id: "contact-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent contact", async () => {
    (prisma.contact.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/contacts/contact-999/engagement");
    const res = await GET(req, { params: Promise.resolve({ id: "contact-999" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 for VIEWER role (minimum required)", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValueOnce({
      ...mockTeam,
      role: "MEMBER",
      crmRole: null,
    });

    const req = new NextRequest("http://localhost/api/contacts/contact-1/engagement");
    const res = await GET(req, { params: Promise.resolve({ id: "contact-1" }) });
    // MEMBER with no crmRole resolves to VIEWER, which is the minimum for GET
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/contacts/[id]/engagement
// ---------------------------------------------------------------------------

describe("POST /api/contacts/[id]/engagement", () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    jest.clearAllMocks();
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(mockTeam);
    (prisma.contact.findFirst as jest.Mock).mockResolvedValue(mockContact);
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue(mockActivities);
    (prisma.contact.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const mod = await import("@/app/api/contacts/[id]/engagement/route");
    POST = mod.POST;
  });

  it("recalculates and returns breakdown", async () => {
    const req = new NextRequest("http://localhost/api/contacts/contact-1/engagement", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "contact-1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.contactId).toBe("contact-1");
    expect(data.engagementScore).toBeGreaterThan(0);
    expect(data.tier).toBeDefined();
    expect(data.byType).toBeDefined();
    expect(data.emailMetrics).toBeDefined();
  });

  it("returns 403 for VIEWER role (requires CONTRIBUTOR)", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValueOnce({
      ...mockTeam,
      role: "MEMBER",
      crmRole: null,
    });

    const req = new NextRequest("http://localhost/api/contacts/contact-1/engagement", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "contact-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 for contact not in team", async () => {
    (prisma.contact.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/contacts/contact-1/engagement", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "contact-1" }) });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/contacts/recalculate-engagement
// ---------------------------------------------------------------------------

describe("POST /api/contacts/recalculate-engagement", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    jest.clearAllMocks();
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(mockTeam);
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([
      { id: "contact-1" },
      { id: "contact-2" },
    ]);
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue(mockActivities);
    (prisma.contact.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const mod = await import("@/app/api/contacts/recalculate-engagement/route");
    POST = mod.POST;
  });

  it("recalculates all team contacts and returns result", async () => {
    const req = new NextRequest("http://localhost/api/contacts/recalculate-engagement", {
      method: "POST",
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.processed).toBe(2);
    expect(data.errors).toBe(0);
    expect(data.message).toContain("Recalculated engagement scores for 2 contacts");
  });

  it("returns 403 for non-MANAGER role", async () => {
    (prisma.userTeam.findFirst as jest.Mock).mockResolvedValueOnce({
      ...mockTeam,
      role: "MEMBER",
      crmRole: "CONTRIBUTOR",
    });

    const req = new NextRequest("http://localhost/api/contacts/recalculate-engagement", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 401 without session", async () => {
    const { getServerSession } = await import("next-auth");
    (getServerSession as jest.Mock).mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/contacts/recalculate-engagement", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("includes error count in message when some contacts fail", async () => {
    let callCount = 0;
    (prisma.contactActivity.findMany as jest.Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error("DB error");
      return Promise.resolve(mockActivities);
    });

    const req = new NextRequest("http://localhost/api/contacts/recalculate-engagement", {
      method: "POST",
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.errors).toBe(1);
    expect(data.message).toContain("1 errors");
  });
});
