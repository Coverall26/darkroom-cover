import {
  createContact,
  getContact,
  getContactByEmail,
  updateContact,
  deleteContact,
  searchContacts,
  upsertContact,
  incrementEngagementScore,
  logContactActivity,
  createContactNote,
  getContactNotes,
  updateContactNote,
  deleteContactNote,
} from "@/lib/crm/contact-service";
import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const TEAM_ID = "team-001";
const USER_ID = "user-001";
const CONTACT_ID = "contact-001";
const INVESTOR_ID = "investor-001";

const mockContact = {
  id: CONTACT_ID,
  teamId: TEAM_ID,
  email: "jane@acme.com",
  firstName: "Jane",
  lastName: "Doe",
  phone: "+1234567890",
  company: "Acme Capital",
  title: "Managing Director",
  status: "PROSPECT",
  source: "MANUAL_ENTRY",
  investorId: null,
  assignedToId: null,
  tags: [],
  customFields: {},
  referralSource: null,
  notes: null,
  engagementScore: 0,
  lastEngagedAt: null,
  convertedAt: null,
  closedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  assignedTo: null,
  investor: null,
  _count: { contactNotes: 0, contactActivities: 0 },
};

const mockNote = {
  id: "note-001",
  contactId: CONTACT_ID,
  authorId: USER_ID,
  content: "Initial meeting went well",
  isPinned: false,
  isPrivate: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: USER_ID, name: "Admin", email: "admin@test.com" },
};

// ---------------------------------------------------------------------------
// Tests: Contact CRUD
// ---------------------------------------------------------------------------
describe("Contact Service — CRUD", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createContact", () => {
    it("creates a contact with required fields", async () => {
      (prisma.contact.create as jest.Mock).mockResolvedValue(mockContact);

      const result = await createContact({
        teamId: TEAM_ID,
        email: "Jane@Acme.com",
      });

      expect(prisma.contact.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            team: { connect: { id: TEAM_ID } },
            email: "jane@acme.com", // lowercased + trimmed
            status: "PROSPECT",
            source: "MANUAL_ENTRY",
          }),
        }),
      );
      expect(result).toEqual(mockContact);
    });

    it("creates a contact with all optional fields", async () => {
      (prisma.contact.create as jest.Mock).mockResolvedValue(mockContact);

      await createContact({
        teamId: TEAM_ID,
        email: "jane@acme.com",
        firstName: " Jane ",
        lastName: " Doe ",
        phone: "  +1234567890  ",
        company: "Acme Capital",
        title: "MD",
        status: "ACTIVE",
        source: "DATAROOM_VIEW",
        investorId: INVESTOR_ID,
        assignedToId: USER_ID,
        tags: ["vip", "fund-i"],
        customFields: { sector: "real-estate" },
        referralSource: "referral",
        notes: "Test note",
      });

      const call = (prisma.contact.create as jest.Mock).mock.calls[0][0];
      expect(call.data.firstName).toBe("Jane"); // trimmed
      expect(call.data.lastName).toBe("Doe");
      expect(call.data.status).toBe("ACTIVE");
      expect(call.data.source).toBe("DATAROOM_VIEW");
      expect(call.data.investor).toEqual({ connect: { id: INVESTOR_ID } });
      expect(call.data.assignedTo).toEqual({ connect: { id: USER_ID } });
    });
  });

  describe("getContact", () => {
    it("returns contact scoped to team", async () => {
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(mockContact);

      const result = await getContact(CONTACT_ID, TEAM_ID);

      expect(prisma.contact.findFirst).toHaveBeenCalledWith({
        where: { id: CONTACT_ID, teamId: TEAM_ID },
        include: expect.any(Object),
      });
      expect(result).toEqual(mockContact);
    });

    it("returns null for non-existent contact", async () => {
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await getContact("fake-id", TEAM_ID);
      expect(result).toBeNull();
    });
  });

  describe("getContactByEmail", () => {
    it("finds contact by team+email unique key", async () => {
      (prisma.contact.findUnique as jest.Mock).mockResolvedValue(mockContact);

      const result = await getContactByEmail(" Jane@Acme.com ", TEAM_ID);

      expect(prisma.contact.findUnique).toHaveBeenCalledWith({
        where: {
          teamId_email: { teamId: TEAM_ID, email: "jane@acme.com" },
        },
        include: expect.any(Object),
      });
      expect(result).toEqual(mockContact);
    });
  });

  describe("updateContact", () => {
    it("updates an existing contact", async () => {
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue({
        id: CONTACT_ID,
        status: "PROSPECT",
      });
      (prisma.contact.update as jest.Mock).mockResolvedValue({
        ...mockContact,
        firstName: "Janet",
      });

      const result = await updateContact(CONTACT_ID, TEAM_ID, {
        firstName: "Janet",
        status: "ACTIVE",
      });

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: CONTACT_ID },
        data: expect.objectContaining({
          firstName: "Janet",
          status: "ACTIVE",
        }),
        include: expect.any(Object),
      });
      expect(result?.firstName).toBe("Janet");
    });

    it("returns null when contact not found", async () => {
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await updateContact(CONTACT_ID, TEAM_ID, {
        firstName: "X",
      });
      expect(result).toBeNull();
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it("handles assignedTo disconnect (null)", async () => {
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue({
        id: CONTACT_ID,
        status: "PROSPECT",
      });
      (prisma.contact.update as jest.Mock).mockResolvedValue(mockContact);

      await updateContact(CONTACT_ID, TEAM_ID, {
        assignedToId: null,
      });

      const call = (prisma.contact.update as jest.Mock).mock.calls[0][0];
      expect(call.data.assignedTo).toEqual({ disconnect: true });
    });

    it("handles assignedTo connect (string value)", async () => {
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue({
        id: CONTACT_ID,
        status: "PROSPECT",
      });
      (prisma.contact.update as jest.Mock).mockResolvedValue(mockContact);

      await updateContact(CONTACT_ID, TEAM_ID, {
        assignedToId: USER_ID,
      });

      const call = (prisma.contact.update as jest.Mock).mock.calls[0][0];
      expect(call.data.assignedTo).toEqual({ connect: { id: USER_ID } });
    });
  });

  describe("deleteContact", () => {
    it("deletes an existing contact", async () => {
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue({
        id: CONTACT_ID,
      });
      (prisma.contact.delete as jest.Mock).mockResolvedValue(mockContact);

      const result = await deleteContact(CONTACT_ID, TEAM_ID);
      expect(prisma.contact.delete).toHaveBeenCalledWith({
        where: { id: CONTACT_ID },
      });
      expect(result).toEqual(mockContact);
    });

    it("returns null when contact not found", async () => {
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await deleteContact(CONTACT_ID, TEAM_ID);
      expect(result).toBeNull();
      expect(prisma.contact.delete).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Search
// ---------------------------------------------------------------------------
describe("Contact Service — Search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("searches with default pagination", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([mockContact]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(1);

    const result = await searchContacts({ teamId: TEAM_ID });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.contacts).toHaveLength(1);
  });

  it("applies text query across multiple fields", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await searchContacts({ teamId: TEAM_ID, query: "jane" });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.OR).toHaveLength(4);
    expect(call.where.OR[0]).toEqual({
      email: { contains: "jane", mode: "insensitive" },
    });
  });

  it("filters by status (single)", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await searchContacts({ teamId: TEAM_ID, status: "ACTIVE" });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.status).toBe("ACTIVE");
  });

  it("filters by status (multiple)", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await searchContacts({
      teamId: TEAM_ID,
      status: ["ACTIVE", "PROSPECT"],
    });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ["ACTIVE", "PROSPECT"] });
  });

  it("filters by source", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await searchContacts({ teamId: TEAM_ID, source: "DATAROOM_VIEW" });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.source).toBe("DATAROOM_VIEW");
  });

  it("filters by assignedToId", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await searchContacts({ teamId: TEAM_ID, assignedToId: USER_ID });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.assignedToId).toBe(USER_ID);
  });

  it("filters by hasInvestor=true", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await searchContacts({ teamId: TEAM_ID, hasInvestor: true });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.investorId).toEqual({ not: null });
  });

  it("filters by hasInvestor=false", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await searchContacts({ teamId: TEAM_ID, hasInvestor: false });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.investorId).toBeNull();
  });

  it("filters by minEngagementScore", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await searchContacts({ teamId: TEAM_ID, minEngagementScore: 50 });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.engagementScore).toEqual({ gte: 50 });
  });

  it("filters by tags (JSON array containment)", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await searchContacts({ teamId: TEAM_ID, tags: ["vip"] });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.tags).toEqual({ array_contains: ["vip"] });
  });

  it("supports custom sort and pagination", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(100);

    const result = await searchContacts({
      teamId: TEAM_ID,
      page: 3,
      pageSize: 10,
      sortBy: "engagementScore",
      sortOrder: "desc",
    });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.skip).toBe(20); // (3-1)*10
    expect(call.take).toBe(10);
    expect(call.orderBy).toEqual({ engagementScore: "desc" });
    expect(result.totalPages).toBe(10); // 100/10
  });

  it("clamps page to min 1", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await searchContacts({ teamId: TEAM_ID, page: -5 });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.skip).toBe(0);
  });

  it("clamps pageSize to max 100", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await searchContacts({ teamId: TEAM_ID, pageSize: 500 });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.take).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Tests: Upsert
// ---------------------------------------------------------------------------
describe("Contact Service — Upsert", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates contact when none exists (upsert create path)", async () => {
    (prisma.contact.upsert as jest.Mock).mockResolvedValue(mockContact);

    await upsertContact({
      teamId: TEAM_ID,
      email: "Jane@Acme.com",
      firstName: "Jane",
      source: "SIGNING_EVENT",
      engagementScore: 5,
    });

    const call = (prisma.contact.upsert as jest.Mock).mock.calls[0][0];
    expect(call.where.teamId_email).toEqual({
      teamId: TEAM_ID,
      email: "jane@acme.com",
    });
    expect(call.create.email).toBe("jane@acme.com");
    expect(call.create.source).toBe("SIGNING_EVENT");
    expect(call.create.engagementScore).toBe(5);
  });

  it("increments engagement score on update (additive)", async () => {
    (prisma.contact.upsert as jest.Mock).mockResolvedValue(mockContact);

    await upsertContact({
      teamId: TEAM_ID,
      email: "jane@acme.com",
      engagementScore: 10,
    });

    const call = (prisma.contact.upsert as jest.Mock).mock.calls[0][0];
    expect(call.update.engagementScore).toEqual({ increment: 10 });
  });

  it("only updates non-empty fields on existing contact", async () => {
    (prisma.contact.upsert as jest.Mock).mockResolvedValue(mockContact);

    await upsertContact({
      teamId: TEAM_ID,
      email: "jane@acme.com",
      firstName: "Janet",
      lastName: "",  // empty — should NOT overwrite
    });

    const call = (prisma.contact.upsert as jest.Mock).mock.calls[0][0];
    expect(call.update.firstName).toBe("Janet");
    expect(call.update.lastName).toBeUndefined();
  });

  it("connects investor on upsert when provided", async () => {
    (prisma.contact.upsert as jest.Mock).mockResolvedValue(mockContact);

    await upsertContact({
      teamId: TEAM_ID,
      email: "jane@acme.com",
      investorId: INVESTOR_ID,
    });

    const call = (prisma.contact.upsert as jest.Mock).mock.calls[0][0];
    expect(call.create.investor).toEqual({ connect: { id: INVESTOR_ID } });
    expect(call.update.investor).toEqual({ connect: { id: INVESTOR_ID } });
  });
});

// ---------------------------------------------------------------------------
// Tests: Engagement Score
// ---------------------------------------------------------------------------
describe("Contact Service — Engagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("increments engagement score by given points", async () => {
    (prisma.contact.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await incrementEngagementScore(CONTACT_ID, TEAM_ID, 15);

    expect(prisma.contact.updateMany).toHaveBeenCalledWith({
      where: { id: CONTACT_ID, teamId: TEAM_ID },
      data: {
        engagementScore: { increment: 15 },
        lastEngagedAt: expect.any(Date),
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Activity Logging
// ---------------------------------------------------------------------------
describe("Contact Service — Activity Logging", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("logs activity with all fields", async () => {
    (prisma.contactActivity.create as jest.Mock).mockResolvedValue({
      id: "act-001",
      contactId: CONTACT_ID,
      type: "NOTE_ADDED",
      actorId: USER_ID,
      description: "Note added",
    });

    await logContactActivity({
      contactId: CONTACT_ID,
      type: "NOTE_ADDED",
      actorId: USER_ID,
      description: "Note added",
      metadata: { noteId: "note-001" },
    });

    const call = (prisma.contactActivity.create as jest.Mock).mock.calls[0][0];
    expect(call.data.contact).toEqual({ connect: { id: CONTACT_ID } });
    expect(call.data.type).toBe("NOTE_ADDED");
    expect(call.data.description).toBe("Note added");
    expect(call.data.actor).toEqual({ connect: { id: USER_ID } });
  });

  it("logs activity without actorId", async () => {
    (prisma.contactActivity.create as jest.Mock).mockResolvedValue({
      id: "act-002",
      contactId: CONTACT_ID,
      type: "EMAIL_SENT",
    });

    await logContactActivity({
      contactId: CONTACT_ID,
      type: "EMAIL_SENT",
      description: "Welcome email sent",
    });

    const call = (prisma.contactActivity.create as jest.Mock).mock.calls[0][0];
    expect(call.data.actor).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: Notes CRUD
// ---------------------------------------------------------------------------
describe("Contact Service — Notes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createContactNote", () => {
    it("creates a note with default flags", async () => {
      (prisma.contactNote.create as jest.Mock).mockResolvedValue(mockNote);

      const result = await createContactNote({
        contactId: CONTACT_ID,
        authorId: USER_ID,
        content: "Initial meeting went well",
      });

      const call = (prisma.contactNote.create as jest.Mock).mock.calls[0][0];
      expect(call.data.contact).toEqual({ connect: { id: CONTACT_ID } });
      expect(call.data.author).toEqual({ connect: { id: USER_ID } });
      expect(call.data.isPinned).toBe(false);
      expect(call.data.isPrivate).toBe(false);
      expect(result).toEqual(mockNote);
    });

    it("creates a pinned private note", async () => {
      (prisma.contactNote.create as jest.Mock).mockResolvedValue(mockNote);

      await createContactNote({
        contactId: CONTACT_ID,
        authorId: USER_ID,
        content: "Confidential info",
        isPinned: true,
        isPrivate: true,
      });

      const call = (prisma.contactNote.create as jest.Mock).mock.calls[0][0];
      expect(call.data.isPinned).toBe(true);
      expect(call.data.isPrivate).toBe(true);
    });
  });

  describe("getContactNotes", () => {
    it("returns all notes when includePrivate=true", async () => {
      (prisma.contactNote.findMany as jest.Mock).mockResolvedValue([mockNote]);

      await getContactNotes(CONTACT_ID, true);

      const call = (prisma.contactNote.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ contactId: CONTACT_ID });
      expect(call.where.OR).toBeUndefined();
    });

    it("filters private notes when includePrivate=false", async () => {
      (prisma.contactNote.findMany as jest.Mock).mockResolvedValue([mockNote]);

      await getContactNotes(CONTACT_ID, false, USER_ID);

      const call = (prisma.contactNote.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { isPrivate: false },
        { isPrivate: true, authorId: USER_ID },
      ]);
    });

    it("orders by pinned first, then createdAt desc", async () => {
      (prisma.contactNote.findMany as jest.Mock).mockResolvedValue([]);

      await getContactNotes(CONTACT_ID, true);

      const call = (prisma.contactNote.findMany as jest.Mock).mock.calls[0][0];
      expect(call.orderBy).toEqual([
        { isPinned: "desc" },
        { createdAt: "desc" },
      ]);
    });
  });

  describe("updateContactNote", () => {
    it("updates a note when author matches", async () => {
      (prisma.contactNote.findFirst as jest.Mock).mockResolvedValue({
        id: "note-001",
      });
      (prisma.contactNote.update as jest.Mock).mockResolvedValue({
        ...mockNote,
        content: "Updated",
      });

      const result = await updateContactNote("note-001", USER_ID, {
        content: "Updated",
      });

      expect(prisma.contactNote.update).toHaveBeenCalledWith({
        where: { id: "note-001" },
        data: { content: "Updated" },
        include: expect.any(Object),
      });
      expect(result?.content).toBe("Updated");
    });

    it("returns null when author doesn't match", async () => {
      (prisma.contactNote.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await updateContactNote("note-001", "wrong-user", {
        content: "Hacked",
      });
      expect(result).toBeNull();
      expect(prisma.contactNote.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteContactNote", () => {
    it("deletes when author matches", async () => {
      (prisma.contactNote.findFirst as jest.Mock).mockResolvedValue({
        id: "note-001",
      });
      (prisma.contactNote.delete as jest.Mock).mockResolvedValue(mockNote);

      const result = await deleteContactNote("note-001", USER_ID);
      expect(prisma.contactNote.delete).toHaveBeenCalledWith({
        where: { id: "note-001" },
      });
      expect(result).toEqual(mockNote);
    });

    it("returns null when author doesn't match", async () => {
      (prisma.contactNote.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await deleteContactNote("note-001", "wrong-user");
      expect(result).toBeNull();
      expect(prisma.contactNote.delete).not.toHaveBeenCalled();
    });
  });
});
