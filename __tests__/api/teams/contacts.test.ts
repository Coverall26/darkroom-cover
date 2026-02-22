/**
 * Tests for Contact API routes:
 *   GET/POST  /api/teams/[teamId]/contacts
 *   GET/PATCH/DELETE /api/teams/[teamId]/contacts/[contactId]
 *   GET/POST  /api/teams/[teamId]/contacts/[contactId]/notes
 *   GET       /api/teams/[teamId]/contacts/[contactId]/activities
 */

import { createMocks } from "node-mocks-http";

// ---------------------------------------------------------------------------
// Mock modules (before imports)
// ---------------------------------------------------------------------------

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth/auth-options", () => ({
  authOptions: {},
}));

jest.mock("@/lib/crm", () => ({
  createContact: jest.fn(),
  searchContacts: jest.fn(),
  getContact: jest.fn(),
  updateContact: jest.fn(),
  deleteContact: jest.fn(),
  createContactNote: jest.fn(),
  getContactNotes: jest.fn(),
}));

jest.mock("@/lib/crm/contact-service", () => ({
  logContactActivity: jest.fn().mockResolvedValue({}),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/security/rate-limiter", () => ({
  apiRateLimiter: jest.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import { getServerSession } from "next-auth/next";
import {
  createContact,
  searchContacts,
  getContact,
  updateContact,
  deleteContact,
  createContactNote,
  getContactNotes,
} from "@/lib/crm";
import { logContactActivity } from "@/lib/crm/contact-service";
import { apiRateLimiter } from "@/lib/security/rate-limiter";
import prisma from "@/lib/prisma";

// Handlers
import contactsHandler from "@/pages/api/teams/[teamId]/contacts/index";
import contactDetailHandler from "@/pages/api/teams/[teamId]/contacts/[contactId]";
import notesHandler from "@/pages/api/teams/[teamId]/contacts/[contactId]/notes";
import activitiesHandler from "@/pages/api/teams/[teamId]/contacts/[contactId]/activities";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TEAM_ID = "team-001";
const USER_ID = "user-001";
const CONTACT_ID = "contact-001";

function mockSession(userId = USER_ID) {
  (getServerSession as jest.Mock).mockResolvedValue({
    user: { id: userId, email: "admin@test.com" },
  });
}

function mockMembership(role = "ADMIN") {
  (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue({ role });
}

function createReq(
  method: string,
  query: Record<string, string> = {},
  body: Record<string, unknown> = {},
) {
  const { req, res } = createMocks({
    method: method as "GET" | "POST" | "PATCH" | "DELETE",
    query: { teamId: TEAM_ID, ...query },
    body,
  });
  return { req, res };
}

// ---------------------------------------------------------------------------
// Tests: /api/teams/[teamId]/contacts (index)
// ---------------------------------------------------------------------------
describe("Contacts Index API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
    mockMembership("ADMIN");
    (apiRateLimiter as jest.Mock).mockResolvedValue(true);
  });

  describe("GET /contacts — search", () => {
    it("returns 200 with search results", async () => {
      const mockResult = {
        contacts: [],
        total: 0,
        page: 1,
        pageSize: 25,
        totalPages: 0,
      };
      (searchContacts as jest.Mock).mockResolvedValue(mockResult);

      const { req, res } = createReq("GET");
      await contactsHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toEqual(mockResult);
    });

    it("passes query params to search", async () => {
      (searchContacts as jest.Mock).mockResolvedValue({
        contacts: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      });

      const { req, res } = createReq("GET", {
        query: "jane",
        status: "ACTIVE",
        page: "2",
        pageSize: "10",
      });
      await contactsHandler(req, res);

      expect(searchContacts).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: TEAM_ID,
          query: "jane",
          status: "ACTIVE",
          page: 2,
          pageSize: 10,
        }),
      );
    });
  });

  describe("POST /contacts — create", () => {
    it("returns 201 with new contact", async () => {
      const mockContact = {
        id: CONTACT_ID,
        email: "jane@acme.com",
        status: "PROSPECT",
      };
      (createContact as jest.Mock).mockResolvedValue(mockContact);

      const { req, res } = createReq("POST", {}, { email: "jane@acme.com" });
      await contactsHandler(req, res);

      expect(res._getStatusCode()).toBe(201);
      expect(createContact).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: TEAM_ID,
          email: "jane@acme.com",
        }),
      );
      expect(logContactActivity).toHaveBeenCalled();
    });

    it("returns 400 for missing email", async () => {
      const { req, res } = createReq("POST", {}, { firstName: "Jane" });
      await contactsHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("returns 400 for invalid email", async () => {
      const { req, res } = createReq("POST", {}, { email: "not-an-email" });
      await contactsHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("returns 409 for duplicate email", async () => {
      (createContact as jest.Mock).mockRejectedValue(
        new Error("Unique constraint failed"),
      );

      const { req, res } = createReq("POST", {}, { email: "jane@acme.com" });
      await contactsHandler(req, res);

      expect(res._getStatusCode()).toBe(409);
    });
  });

  describe("Auth & Rate Limiting", () => {
    it("returns early when rate limited", async () => {
      (apiRateLimiter as jest.Mock).mockResolvedValue(false);

      const { req, res } = createReq("GET");
      await contactsHandler(req, res);

      // Rate limiter returns false and handles response itself
      expect(searchContacts).not.toHaveBeenCalled();
    });

    it("returns 401 when not authenticated", async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);

      const { req, res } = createReq("GET");
      await contactsHandler(req, res);

      expect(res._getStatusCode()).toBe(401);
    });

    it("returns 403 when not team member", async () => {
      (prisma.userTeam.findFirst as jest.Mock).mockResolvedValue(null);

      const { req, res } = createReq("GET");
      await contactsHandler(req, res);

      expect(res._getStatusCode()).toBe(403);
    });

    it("returns 405 for unsupported method", async () => {
      const { req, res } = createReq("DELETE");
      await contactsHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: /api/teams/[teamId]/contacts/[contactId]
// ---------------------------------------------------------------------------
describe("Contact Detail API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
    mockMembership("ADMIN");
    (apiRateLimiter as jest.Mock).mockResolvedValue(true);
  });

  describe("GET /contacts/[contactId]", () => {
    it("returns 200 with contact", async () => {
      const mockContact = { id: CONTACT_ID, email: "jane@acme.com" };
      (getContact as jest.Mock).mockResolvedValue(mockContact);

      const { req, res } = createReq("GET", { contactId: CONTACT_ID });
      await contactDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toEqual(mockContact);
    });

    it("returns 404 when not found", async () => {
      (getContact as jest.Mock).mockResolvedValue(null);

      const { req, res } = createReq("GET", { contactId: "fake" });
      await contactDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });
  });

  describe("PATCH /contacts/[contactId]", () => {
    it("returns 200 with updated contact", async () => {
      (getContact as jest.Mock).mockResolvedValue({ id: CONTACT_ID });
      (updateContact as jest.Mock).mockResolvedValue({
        id: CONTACT_ID,
        firstName: "Janet",
      });

      const { req, res } = createReq(
        "PATCH",
        { contactId: CONTACT_ID },
        { firstName: "Janet" },
      );
      await contactDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(updateContact).toHaveBeenCalled();
    });

    it("returns 404 when contact doesn't belong to team", async () => {
      (updateContact as jest.Mock).mockResolvedValue(null);

      const { req, res } = createReq(
        "PATCH",
        { contactId: CONTACT_ID },
        { firstName: "Janet" },
      );
      await contactDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });

    it("logs status change activity", async () => {
      (getContact as jest.Mock).mockResolvedValue({ id: CONTACT_ID });
      (updateContact as jest.Mock).mockResolvedValue({ id: CONTACT_ID });

      const { req, res } = createReq(
        "PATCH",
        { contactId: CONTACT_ID },
        { status: "ACTIVE" },
      );
      await contactDetailHandler(req, res);

      expect(logContactActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "STATUS_CHANGE",
          description: expect.stringContaining("ACTIVE"),
        }),
      );
    });

    it("logs assignment change activity", async () => {
      (getContact as jest.Mock).mockResolvedValue({ id: CONTACT_ID });
      (updateContact as jest.Mock).mockResolvedValue({ id: CONTACT_ID });

      const { req, res } = createReq(
        "PATCH",
        { contactId: CONTACT_ID },
        { assignedToId: USER_ID },
      );
      await contactDetailHandler(req, res);

      expect(logContactActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ASSIGNED",
        }),
      );
    });
  });

  describe("DELETE /contacts/[contactId]", () => {
    it("returns 200 on successful delete", async () => {
      (getContact as jest.Mock).mockResolvedValue({ id: CONTACT_ID });
      (deleteContact as jest.Mock).mockResolvedValue({ id: CONTACT_ID });

      const { req, res } = createReq("DELETE", { contactId: CONTACT_ID });
      await contactDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toEqual({ success: true });
    });

    it("returns 404 when not found", async () => {
      (getContact as jest.Mock).mockResolvedValue({ id: CONTACT_ID });
      (deleteContact as jest.Mock).mockResolvedValue(null);

      const { req, res } = createReq("DELETE", { contactId: CONTACT_ID });
      await contactDetailHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: /api/teams/[teamId]/contacts/[contactId]/notes
// ---------------------------------------------------------------------------
describe("Contact Notes API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
    mockMembership("ADMIN");
    (apiRateLimiter as jest.Mock).mockResolvedValue(true);
    (getContact as jest.Mock).mockResolvedValue({ id: CONTACT_ID });
  });

  describe("GET /contacts/[contactId]/notes", () => {
    it("returns 200 with notes for admin", async () => {
      const mockNotes = [{ id: "note-1", content: "Test" }];
      (getContactNotes as jest.Mock).mockResolvedValue(mockNotes);

      const { req, res } = createReq("GET", { contactId: CONTACT_ID });
      await notesHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(getContactNotes).toHaveBeenCalledWith(CONTACT_ID, true, USER_ID);
    });

    it("passes isAdmin=false for MANAGER role", async () => {
      mockMembership("MANAGER");
      (getContactNotes as jest.Mock).mockResolvedValue([]);

      const { req, res } = createReq("GET", { contactId: CONTACT_ID });
      await notesHandler(req, res);

      expect(getContactNotes).toHaveBeenCalledWith(
        CONTACT_ID,
        false,
        USER_ID,
      );
    });
  });

  describe("POST /contacts/[contactId]/notes", () => {
    it("returns 201 with new note", async () => {
      const mockNote = { id: "note-1", content: "Great meeting" };
      (createContactNote as jest.Mock).mockResolvedValue(mockNote);

      const { req, res } = createReq(
        "POST",
        { contactId: CONTACT_ID },
        { content: "Great meeting" },
      );
      await notesHandler(req, res);

      expect(res._getStatusCode()).toBe(201);
      expect(createContactNote).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: CONTACT_ID,
          authorId: USER_ID,
          content: "Great meeting",
        }),
      );
      expect(logContactActivity).toHaveBeenCalled();
    });

    it("returns 400 for empty content", async () => {
      const { req, res } = createReq(
        "POST",
        { contactId: CONTACT_ID },
        { content: "" },
      );
      await notesHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("returns 400 for content exceeding 10000 chars", async () => {
      const { req, res } = createReq(
        "POST",
        { contactId: CONTACT_ID },
        { content: "x".repeat(10001) },
      );
      await notesHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
    });

    it("returns 404 when contact not found", async () => {
      (getContact as jest.Mock).mockResolvedValue(null);

      const { req, res } = createReq(
        "POST",
        { contactId: "fake" },
        { content: "Test" },
      );
      await notesHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
    });
  });

  it("returns 405 for unsupported method", async () => {
    const { req, res } = createReq("DELETE", { contactId: CONTACT_ID });
    await notesHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// Tests: /api/teams/[teamId]/contacts/[contactId]/activities
// ---------------------------------------------------------------------------
describe("Contact Activities API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession();
    mockMembership("ADMIN");
    (apiRateLimiter as jest.Mock).mockResolvedValue(true);
    (getContact as jest.Mock).mockResolvedValue({ id: CONTACT_ID });
  });

  it("returns 200 with paginated activities", async () => {
    const mockActivities = [
      { id: "act-1", type: "NOTE_ADDED", description: "Note added" },
    ];
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue(
      mockActivities,
    );
    (prisma.contactActivity.count as jest.Mock).mockResolvedValue(1);

    const { req, res } = createReq("GET", { contactId: CONTACT_ID });
    await activitiesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.activities).toHaveLength(1);
    expect(data.total).toBe(1);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(25);
    expect(data.totalPages).toBe(1);
  });

  it("supports custom pagination", async () => {
    (prisma.contactActivity.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contactActivity.count as jest.Mock).mockResolvedValue(50);

    const { req, res } = createReq("GET", {
      contactId: CONTACT_ID,
      page: "2",
      pageSize: "10",
    });
    await activitiesHandler(req, res);

    const call = (prisma.contactActivity.findMany as jest.Mock).mock
      .calls[0][0];
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
  });

  it("returns 404 when contact not found", async () => {
    (getContact as jest.Mock).mockResolvedValue(null);

    const { req, res } = createReq("GET", { contactId: "fake" });
    await activitiesHandler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 405 for non-GET method", async () => {
    const { req, res } = createReq("POST", { contactId: CONTACT_ID });
    await activitiesHandler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });
});
