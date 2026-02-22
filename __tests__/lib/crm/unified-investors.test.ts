/**
 * Tests for getUnifiedInvestors + getUnifiedInvestorById
 *
 * Covers:
 *   - Basic query with default pagination
 *   - Text search across contact fields
 *   - Status and source filtering
 *   - InvestorProfile filter (hasInvestorProfile)
 *   - Engagement score threshold
 *   - Sorting options
 *   - Page bounds clamping
 *   - getUnifiedInvestorById — found and not found
 */

import {
  getUnifiedInvestors,
  getUnifiedInvestorById,
} from "@/lib/crm/unified-investors";
import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const TEAM_ID = "team-001";

const mockContactRow = (overrides: Record<string, unknown> = {}) => ({
  id: "contact-001",
  email: "jane@acme.com",
  firstName: "Jane",
  lastName: "Doe",
  phone: "+1234567890",
  company: "Acme Capital",
  title: "Managing Director",
  status: "PROSPECT",
  source: "MANUAL_ENTRY",
  engagementScore: 5,
  lastEngagedAt: new Date("2026-02-01"),
  lastContactedAt: null,
  lastEmailedAt: null,
  nextFollowUpAt: null,
  unsubscribedAt: null,
  emailBounced: false,
  tags: [],
  notes: null,
  createdAt: new Date("2026-01-15"),
  updatedAt: new Date("2026-02-10"),
  assignedTo: null,
  investor: null,
  _count: { contactNotes: 2, contactActivities: 5 },
  ...overrides,
});

const mockContactWithInvestor = mockContactRow({
  id: "contact-002",
  email: "bob@fund.com",
  investor: {
    id: "inv-001",
    entityName: "Bob LLC",
    entityType: "LLC",
    accreditationStatus: "SELF_CERTIFIED",
    accreditationMethod: "SELF_ACK",
    fundId: "fund-001",
    onboardingStep: 6,
    investments: [
      {
        id: "invest-001",
        status: "COMMITTED",
        committedAmount: 100000,
        fundedAmount: 0,
        fundId: "fund-001",
        fund: { name: "Bermuda Club Fund I" },
      },
    ],
  },
});

// ---------------------------------------------------------------------------
// Tests: getUnifiedInvestors
// ---------------------------------------------------------------------------
describe("getUnifiedInvestors", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("queries with default pagination", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([mockContactRow()]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(1);

    const result = await getUnifiedInvestors({ teamId: TEAM_ID });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.investors).toHaveLength(1);
    expect(result.investors[0].email).toBe("jane@acme.com");

    // Verify teamId in where clause
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teamId: TEAM_ID }),
        skip: 0,
        take: 25,
      }),
    );
  });

  it("applies text search via OR clause", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await getUnifiedInvestors({ teamId: TEAM_ID, query: "jane" });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR).toHaveLength(4);
  });

  it("filters by status", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await getUnifiedInvestors({ teamId: TEAM_ID, status: "QUALIFIED" });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.status).toBe("QUALIFIED");
  });

  it("filters by multiple statuses (array)", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await getUnifiedInvestors({ teamId: TEAM_ID, status: ["PROSPECT", "LEAD"] });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.status).toEqual({ in: ["PROSPECT", "LEAD"] });
  });

  it("filters by source", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await getUnifiedInvestors({ teamId: TEAM_ID, source: "DATAROOM_VIEW" });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.source).toBe("DATAROOM_VIEW");
  });

  it("filters by hasInvestorProfile=true", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await getUnifiedInvestors({ teamId: TEAM_ID, hasInvestorProfile: true });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.investorId).toEqual({ not: null });
  });

  it("filters by hasInvestorProfile=false", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await getUnifiedInvestors({ teamId: TEAM_ID, hasInvestorProfile: false });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.investorId).toBeNull();
  });

  it("filters by minEngagementScore", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await getUnifiedInvestors({ teamId: TEAM_ID, minEngagementScore: 10 });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.engagementScore).toEqual({ gte: 10 });
  });

  it("clamps page and pageSize", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await getUnifiedInvestors({ teamId: TEAM_ID, page: -5, pageSize: 999 });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.skip).toBe(0); // page clamped to 1
    expect(call.take).toBe(100); // pageSize clamped to 100
  });

  it("maps investor data when present", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([mockContactWithInvestor]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(1);

    const result = await getUnifiedInvestors({ teamId: TEAM_ID });

    const inv = result.investors[0];
    expect(inv.investor).not.toBeNull();
    expect(inv.investor!.id).toBe("inv-001");
    expect(inv.investor!.entityName).toBe("Bob LLC");
    expect(inv.investor!.investments).toHaveLength(1);
    expect(inv.investor!.investments[0].fundName).toBe("Bermuda Club Fund I");
  });

  it("applies sort options", async () => {
    (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contact.count as jest.Mock).mockResolvedValue(0);

    await getUnifiedInvestors({
      teamId: TEAM_ID,
      sortBy: "engagementScore",
      sortOrder: "desc",
    });

    const call = (prisma.contact.findMany as jest.Mock).mock.calls[0][0];
    expect(call.orderBy).toEqual({ engagementScore: "desc" });
  });
});

// ---------------------------------------------------------------------------
// Tests: getUnifiedInvestorById
// ---------------------------------------------------------------------------
describe("getUnifiedInvestorById", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns unified investor when found", async () => {
    (prisma.contact.findFirst as jest.Mock).mockResolvedValue(mockContactWithInvestor);

    const result = await getUnifiedInvestorById("contact-002", TEAM_ID);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("contact-002");
    expect(result!.investor).not.toBeNull();
    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "contact-002", teamId: TEAM_ID },
      }),
    );
  });

  it("returns null when contact not found", async () => {
    (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await getUnifiedInvestorById("non-existent", TEAM_ID);

    expect(result).toBeNull();
  });

  it("returns null investor field when no InvestorProfile linked", async () => {
    (prisma.contact.findFirst as jest.Mock).mockResolvedValue(mockContactRow());

    const result = await getUnifiedInvestorById("contact-001", TEAM_ID);

    expect(result).not.toBeNull();
    expect(result!.investor).toBeNull();
  });
});
