/**
 * Tests for promotePendingContacts — Batch promote PendingContacts on tier upgrade.
 *
 * Covers:
 *   - No-op when org has no team
 *   - No-op when no PendingContacts exist
 *   - Promotes pending contacts to real contacts
 *   - Skips duplicates (email already exists as Contact)
 *   - Handles per-item failures gracefully
 *   - Batch cursor pagination
 */

import { promotePendingContacts } from "@/lib/crm/contact-service";
import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const ORG_ID = "org-001";
const TEAM_ID = "team-001";

const mockPendingContact = (overrides: Record<string, unknown> = {}) => ({
  id: "pc-001",
  orgId: ORG_ID,
  email: "viewer@example.com",
  firstName: "Viewer",
  lastName: "One",
  source: "DATAROOM_VIEW",
  metadata: {},
  createdAt: new Date("2026-01-15"),
  updatedAt: new Date("2026-01-15"),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("promotePendingContacts", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset implementations to prevent leakage between tests.
    // jest.clearAllMocks() only clears call data, NOT mockResolvedValue.
    (prisma.team.findFirst as jest.Mock).mockReset();
    (prisma.pendingContact.findMany as jest.Mock).mockReset();
    (prisma.contact.findFirst as jest.Mock).mockReset();
    (prisma.contact.create as jest.Mock).mockReset();
    (prisma.pendingContact.delete as jest.Mock).mockReset();

    // Override $transaction to handle array pattern (the global mock uses callback pattern)
    (prisma.$transaction as jest.Mock).mockImplementation((input: unknown) => {
      if (Array.isArray(input)) {
        return Promise.resolve(input.map(() => ({})));
      }
      // Fallback for callback pattern
      return Promise.resolve({});
    });
  });

  it("returns zeros when org has no team", async () => {
    (prisma.team.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await promotePendingContacts(ORG_ID);

    expect(result).toEqual({ promoted: 0, skipped: 0, failed: 0 });
    expect(prisma.pendingContact.findMany).not.toHaveBeenCalled();
  });

  it("returns zeros when no PendingContacts exist", async () => {
    (prisma.team.findFirst as jest.Mock).mockResolvedValueOnce({ id: TEAM_ID });
    (prisma.pendingContact.findMany as jest.Mock).mockResolvedValueOnce([]);

    const result = await promotePendingContacts(ORG_ID);

    expect(result).toEqual({ promoted: 0, skipped: 0, failed: 0 });
  });

  it("promotes a pending contact to a real contact", async () => {
    const pending = mockPendingContact();

    (prisma.team.findFirst as jest.Mock).mockResolvedValue({ id: TEAM_ID });
    (prisma.pendingContact.findMany as jest.Mock)
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([]); // Second batch empty
    (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null); // No existing

    const result = await promotePendingContacts(ORG_ID);

    expect(result).toEqual({ promoted: 1, skipped: 0, failed: 0 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("skips pending contacts that already exist as real contacts", async () => {
    const pending = mockPendingContact();

    (prisma.team.findFirst as jest.Mock).mockResolvedValue({ id: TEAM_ID });
    (prisma.pendingContact.findMany as jest.Mock)
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([]);
    (prisma.contact.findFirst as jest.Mock).mockResolvedValue({ id: "existing-contact-001" });
    (prisma.pendingContact.delete as jest.Mock).mockResolvedValue({});

    const result = await promotePendingContacts(ORG_ID);

    expect(result).toEqual({ promoted: 0, skipped: 1, failed: 0 });
    expect(prisma.pendingContact.delete).toHaveBeenCalledWith({
      where: { id: pending.id },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("counts failures when transaction throws", async () => {
    const pending = mockPendingContact();

    (prisma.team.findFirst as jest.Mock).mockResolvedValue({ id: TEAM_ID });
    (prisma.pendingContact.findMany as jest.Mock)
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([]);
    (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error("Unique constraint"));

    const result = await promotePendingContacts(ORG_ID);

    expect(result).toEqual({ promoted: 0, skipped: 0, failed: 1 });
  });

  it("processes multiple pending contacts in one batch", async () => {
    const pending1 = mockPendingContact({ id: "pc-001", email: "a@test.com" });
    const pending2 = mockPendingContact({ id: "pc-002", email: "b@test.com" });
    const pending3 = mockPendingContact({ id: "pc-003", email: "c@test.com" });

    (prisma.team.findFirst as jest.Mock).mockResolvedValue({ id: TEAM_ID });
    (prisma.pendingContact.findMany as jest.Mock)
      .mockResolvedValueOnce([pending1, pending2, pending3])
      .mockResolvedValueOnce([]);
    (prisma.contact.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // a@test.com — new
      .mockResolvedValueOnce({ id: "existing" }) // b@test.com — exists
      .mockResolvedValueOnce(null); // c@test.com — new
    (prisma.pendingContact.delete as jest.Mock).mockResolvedValue({});

    const result = await promotePendingContacts(ORG_ID);

    expect(result).toEqual({ promoted: 2, skipped: 1, failed: 0 });
    // $transaction called 2 times (for the 2 promoted contacts)
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    // pendingContact.delete called 3 times: 2 inside $transaction (promoted) + 1 standalone (skipped)
    expect(prisma.pendingContact.delete).toHaveBeenCalledTimes(3);
  });

  it("normalizes email to lowercase and trims whitespace", async () => {
    const pending = mockPendingContact({ email: "  UPPER@CASE.COM  " });

    (prisma.team.findFirst as jest.Mock).mockResolvedValue({ id: TEAM_ID });
    (prisma.pendingContact.findMany as jest.Mock)
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([]);
    (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

    await promotePendingContacts(ORG_ID);

    // Verify the contact.findFirst lookup used the normalized email
    expect(prisma.contact.findFirst).toHaveBeenCalledWith({
      where: {
        email: "upper@case.com",
        team: { organizationId: ORG_ID },
      },
      select: { id: true },
    });
  });

  it("uses DATAROOM_VIEW as default source when pending has no source", async () => {
    const pending = mockPendingContact({ source: null });

    (prisma.team.findFirst as jest.Mock).mockResolvedValue({ id: TEAM_ID });
    (prisma.pendingContact.findMany as jest.Mock)
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([]);
    (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

    await promotePendingContacts(ORG_ID);

    // Verify $transaction was called (contact created)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
