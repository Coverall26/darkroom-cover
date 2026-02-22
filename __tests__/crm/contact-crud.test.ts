/**
 * CRM Contact CRUD API tests
 * Tests: GET/POST /api/contacts, GET/PATCH/DELETE /api/contacts/[id],
 *        PUT /api/contacts/[id]/status, POST /api/contacts/import,
 *        GET/POST /api/contacts/[id]/notes, auto-capture hook
 */

import { NextRequest } from "next/server";

// ---------- Mocks ----------

const mockSession = {
  user: { id: "user-1", email: "admin@test.com" },
};

const mockTeam = {
  userId: "user-1",
  role: "ADMIN",
  crmRole: "MANAGER",
  team: { id: "team-1", organizationId: "org-1" },
};

const mockOrg = {
  subscriptionTier: "CRM_PRO",
  aiCrmEnabled: false,
};

const mockContact = {
  id: "contact-1",
  teamId: "team-1",
  email: "john@example.com",
  firstName: "John",
  lastName: "Doe",
  phone: null,
  company: "Acme",
  title: "CEO",
  status: "PROSPECT",
  source: "MANUAL_ENTRY",
  engagementScore: 5,
  lastEngagedAt: new Date(),
  nextFollowUpAt: null,
  lastContactedAt: null,
  tags: [],
  customFields: {},
  investorId: null,
  assignedToId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
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

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  appRouterRateLimit: jest.fn().mockResolvedValue(null),
  appRouterUploadRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/tier/crm-tier", () => ({
  resolveOrgTier: jest.fn().mockResolvedValue({
    tier: "CRM_PRO",
    maxContacts: null,
    maxEsigsPerMonth: 25,
    hasKanban: true,
    hasOutreachQueue: true,
    hasEmailTracking: true,
    hasLpOnboarding: false,
    hasAiFeatures: false,
    emailTemplateLimit: 5,
    pipelineStages: ["PROSPECT", "LEAD", "OPPORTUNITY", "CUSTOMER", "WON", "LOST", "ARCHIVED"],
  }),
}));

// Mock Prisma
const mockPrisma = {
  userTeam: {
    findFirst: jest.fn().mockResolvedValue(mockTeam),
  },
  organization: {
    findUnique: jest.fn().mockResolvedValue(mockOrg),
  },
  contact: {
    findMany: jest.fn().mockResolvedValue([mockContact]),
    findFirst: jest.fn().mockResolvedValue(mockContact),
    findUnique: jest.fn().mockResolvedValue(mockContact),
    create: jest.fn().mockResolvedValue(mockContact),
    update: jest.fn().mockResolvedValue({ ...mockContact, status: "LEAD" }),
    delete: jest.fn().mockResolvedValue(mockContact),
    count: jest.fn().mockResolvedValue(5),
    createMany: jest.fn().mockResolvedValue({ count: 3 }),
  },
  contactNote: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({
      id: "note-1",
      contactId: "contact-1",
      authorId: "user-1",
      content: "Test note",
      isPinned: false,
      isPrivate: false,
      createdAt: new Date(),
      author: { id: "user-1", name: "Admin", email: "admin@test.com", image: null },
    }),
  },
  contactActivity: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: "activity-1" }),
  },
  pendingContact: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn().mockResolvedValue({ id: "pending-1" }),
  },
  team: {
    findUnique: jest.fn().mockResolvedValue({ organizationId: "org-1" }),
  },
  $transaction: jest.fn((args: unknown) => {
    if (Array.isArray(args)) return Promise.resolve(args.map(() => ({ id: "tx-result" })));
    if (typeof args === "function") return (args as (p: typeof mockPrisma) => Promise<unknown>)(mockPrisma);
    return Promise.resolve([]);
  }),
};

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: mockPrisma,
}));

// ---------- Tests ----------

describe("Contact CRUD API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.userTeam.findFirst.mockResolvedValue(mockTeam);
    mockPrisma.contact.findFirst.mockResolvedValue(mockContact);
    mockPrisma.contact.findMany.mockResolvedValue([mockContact]);
    mockPrisma.contact.count.mockResolvedValue(5);
  });

  describe("GET /api/contacts", () => {
    it("returns contacts list with pagination", async () => {
      const { GET } = await import("@/app/api/contacts/route");
      const req = new NextRequest("http://localhost/api/contacts?page=1&limit=50");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.contacts).toBeDefined();
      expect(Array.isArray(data.contacts)).toBe(true);
    });

    it("returns 401 when not authenticated", async () => {
      const { getServerSession } = require("next-auth");
      getServerSession.mockResolvedValueOnce(null);

      const { GET } = await import("@/app/api/contacts/route");
      const req = new NextRequest("http://localhost/api/contacts");
      const res = await GET(req);

      expect(res.status).toBe(401);
    });

    it("supports search filter", async () => {
      const { GET } = await import("@/app/api/contacts/route");
      const req = new NextRequest("http://localhost/api/contacts?search=john");
      await GET(req);

      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teamId: "team-1",
          }),
        }),
      );
    });

    it("supports status filter", async () => {
      const { GET } = await import("@/app/api/contacts/route");
      const req = new NextRequest("http://localhost/api/contacts?status=LEAD");
      await GET(req);

      expect(mockPrisma.contact.findMany).toHaveBeenCalled();
    });
  });

  describe("POST /api/contacts", () => {
    it("creates a new contact", async () => {
      mockPrisma.contact.findUnique.mockResolvedValueOnce(null); // No existing contact

      const { POST } = await import("@/app/api/contacts/route");
      const req = new NextRequest("http://localhost/api/contacts", {
        method: "POST",
        body: JSON.stringify({
          firstName: "Jane",
          lastName: "Smith",
          email: "jane@example.com",
          source: "MANUAL_ENTRY",
        }),
      });
      const res = await POST(req);

      expect(res.status).toBe(201);
    });

    it("rejects missing email", async () => {
      const { POST } = await import("@/app/api/contacts/route");
      const req = new NextRequest("http://localhost/api/contacts", {
        method: "POST",
        body: JSON.stringify({ firstName: "Jane" }),
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("rejects duplicate email", async () => {
      mockPrisma.contact.findUnique.mockResolvedValueOnce(mockContact); // Existing contact

      const { POST } = await import("@/app/api/contacts/route");
      const req = new NextRequest("http://localhost/api/contacts", {
        method: "POST",
        body: JSON.stringify({ email: "john@example.com" }),
      });
      const res = await POST(req);

      expect(res.status).toBe(409);
    });
  });

  describe("PUT /api/contacts/[id]/status", () => {
    it("updates contact status", async () => {
      const { PUT } = await import("@/app/api/contacts/[id]/status/route");
      const req = new NextRequest("http://localhost/api/contacts/contact-1/status", {
        method: "PUT",
        body: JSON.stringify({ status: "LEAD" }),
      });
      const res = await PUT(req, { params: Promise.resolve({ id: "contact-1" }) });

      expect(res.status).toBe(200);
    });

    it("rejects invalid status", async () => {
      const { PUT } = await import("@/app/api/contacts/[id]/status/route");
      const req = new NextRequest("http://localhost/api/contacts/contact-1/status", {
        method: "PUT",
        body: JSON.stringify({ status: "INVALID_STATUS" }),
      });
      const res = await PUT(req, { params: Promise.resolve({ id: "contact-1" }) });

      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent contact", async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce(null);

      const { PUT } = await import("@/app/api/contacts/[id]/status/route");
      const req = new NextRequest("http://localhost/api/contacts/missing/status", {
        method: "PUT",
        body: JSON.stringify({ status: "LEAD" }),
      });
      const res = await PUT(req, { params: Promise.resolve({ id: "missing" }) });

      expect(res.status).toBe(404);
    });

    it("sets convertedAt when moving to OPPORTUNITY", async () => {
      mockPrisma.contact.findFirst.mockResolvedValueOnce({
        ...mockContact,
        status: "LEAD",
        convertedAt: null,
      });

      const { PUT } = await import("@/app/api/contacts/[id]/status/route");
      const req = new NextRequest("http://localhost/api/contacts/contact-1/status", {
        method: "PUT",
        body: JSON.stringify({ status: "OPPORTUNITY" }),
      });
      await PUT(req, { params: Promise.resolve({ id: "contact-1" }) });

      expect(mockPrisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "OPPORTUNITY",
            convertedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe("GET/PATCH/DELETE /api/contacts/[id]", () => {
    it("GET returns contact detail", async () => {
      const { GET } = await import("@/app/api/contacts/[id]/route");
      const req = new NextRequest("http://localhost/api/contacts/contact-1");
      const res = await GET(req, { params: Promise.resolve({ id: "contact-1" }) });

      expect(res.status).toBe(200);
    });

    it("PATCH updates contact fields", async () => {
      const { PATCH } = await import("@/app/api/contacts/[id]/route");
      const req = new NextRequest("http://localhost/api/contacts/contact-1", {
        method: "PATCH",
        body: JSON.stringify({ company: "New Company" }),
      });
      const res = await PATCH(req, { params: Promise.resolve({ id: "contact-1" }) });

      expect(res.status).toBe(200);
    });

    it("DELETE removes contact", async () => {
      const { DELETE } = await import("@/app/api/contacts/[id]/route");
      const req = new NextRequest("http://localhost/api/contacts/contact-1", {
        method: "DELETE",
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: "contact-1" }) });

      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/contacts/import", () => {
    it("imports valid rows", async () => {
      const { POST } = await import("@/app/api/contacts/import/route");
      const req = new NextRequest("http://localhost/api/contacts/import", {
        method: "POST",
        body: JSON.stringify({
          rows: [
            { email: "a@test.com", firstName: "A" },
            { email: "b@test.com", firstName: "B" },
            { email: "c@test.com", firstName: "C" },
          ],
        }),
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.imported).toBeDefined();
    });

    it("rejects over 500 rows", async () => {
      const rows = Array.from({ length: 501 }, (_, i) => ({
        email: `user${i}@test.com`,
      }));

      const { POST } = await import("@/app/api/contacts/import/route");
      const req = new NextRequest("http://localhost/api/contacts/import", {
        method: "POST",
        body: JSON.stringify({ rows }),
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("rejects empty rows", async () => {
      const { POST } = await import("@/app/api/contacts/import/route");
      const req = new NextRequest("http://localhost/api/contacts/import", {
        method: "POST",
        body: JSON.stringify({ rows: [] }),
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });
  });

  describe("GET/POST /api/contacts/[id]/notes", () => {
    it("GET returns notes list", async () => {
      const { GET } = await import("@/app/api/contacts/[id]/notes/route");
      const req = new NextRequest("http://localhost/api/contacts/contact-1/notes");
      const res = await GET(req, { params: Promise.resolve({ id: "contact-1" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.notes).toBeDefined();
    });

    it("POST creates a note", async () => {
      mockPrisma.$transaction.mockResolvedValueOnce([
        {
          id: "note-1",
          content: "Test note",
          author: { name: "Admin" },
        },
        { id: "activity-1" },
      ]);

      const { POST } = await import("@/app/api/contacts/[id]/notes/route");
      const req = new NextRequest("http://localhost/api/contacts/contact-1/notes", {
        method: "POST",
        body: JSON.stringify({ content: "Test note" }),
      });
      const res = await POST(req, { params: Promise.resolve({ id: "contact-1" }) });

      expect(res.status).toBe(201);
    });

    it("POST rejects empty content", async () => {
      const { POST } = await import("@/app/api/contacts/[id]/notes/route");
      const req = new NextRequest("http://localhost/api/contacts/contact-1/notes", {
        method: "POST",
        body: JSON.stringify({ content: "" }),
      });
      const res = await POST(req, { params: Promise.resolve({ id: "contact-1" }) });

      expect(res.status).toBe(400);
    });

    it("POST rejects overly long notes", async () => {
      const { POST } = await import("@/app/api/contacts/[id]/notes/route");
      const req = new NextRequest("http://localhost/api/contacts/contact-1/notes", {
        method: "POST",
        body: JSON.stringify({ content: "x".repeat(10_001) }),
      });
      const res = await POST(req, { params: Promise.resolve({ id: "contact-1" }) });

      expect(res.status).toBe(400);
    });
  });
});

describe("Contact Auto-Capture", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.contact.findUnique.mockResolvedValue(null);
    mockPrisma.team.findUnique.mockResolvedValue({ organizationId: "org-1" });
  });

  it("creates a new contact from dataroom viewer", async () => {
    const { handleDataroomViewerCapture } = await import("@/lib/contact-autocapture");

    await handleDataroomViewerCapture("team-1", "viewer@example.com", "view-1");

    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamId: "team-1",
          email: "viewer@example.com",
          source: "DATAROOM_VIEW",
          status: "PROSPECT",
        }),
      }),
    );
  });

  it("increments engagement for existing contact", async () => {
    mockPrisma.contact.findUnique.mockResolvedValueOnce(mockContact);

    const { handleDataroomViewerCapture } = await import("@/lib/contact-autocapture");

    await handleDataroomViewerCapture("team-1", "john@example.com", "view-2");

    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          engagementScore: { increment: 1 },
        }),
      }),
    );
  });

  it("creates PendingContact when at FREE tier limit", async () => {
    const { resolveOrgTier } = require("@/lib/tier/crm-tier");
    resolveOrgTier.mockResolvedValueOnce({
      tier: "FREE",
      maxContacts: 20,
    });
    mockPrisma.contact.count.mockResolvedValueOnce(20);

    const { handleDataroomViewerCapture } = await import("@/lib/contact-autocapture");

    await handleDataroomViewerCapture("team-1", "new@example.com", "view-3");

    expect(mockPrisma.pendingContact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          email: "new@example.com",
          source: "DATAROOM_VIEW",
        }),
      }),
    );
  });

  it("parses name from email when no viewerName", async () => {
    const { handleDataroomViewerCapture } = await import("@/lib/contact-autocapture");

    await handleDataroomViewerCapture("team-1", "john.smith@company.com", "view-4");

    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: "John",
          lastName: "Smith",
        }),
      }),
    );
  });

  it("uses viewerName when provided", async () => {
    const { handleDataroomViewerCapture } = await import("@/lib/contact-autocapture");

    await handleDataroomViewerCapture("team-1", "j@test.com", "view-5", "Jane Doe");

    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: "Jane",
          lastName: "Doe",
        }),
      }),
    );
  });

  it("does nothing for empty email", async () => {
    const { handleDataroomViewerCapture } = await import("@/lib/contact-autocapture");

    await handleDataroomViewerCapture("team-1", "");

    expect(mockPrisma.contact.findUnique).not.toHaveBeenCalled();
  });
});
