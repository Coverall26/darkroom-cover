import {
  captureFromSigningEvent,
  captureFromDataroomView,
  captureFromLPRegistration,
  captureFromExpressInterest,
  backfillContactsFromDataroomViewers,
  parseName,
  ENGAGEMENT_WEIGHTS,
} from "@/lib/crm/contact-upsert-job";
import prisma from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------
const mockUpsertContact = jest.fn();
const mockLogContactActivity = jest.fn();
const mockIncrementEngagementScore = jest.fn();

jest.mock("@/lib/crm/contact-service", () => {
  // Preserve the real ContactLimitError class for instanceof checks
  const actual = jest.requireActual("@/lib/crm/contact-service");
  return {
    upsertContact: (...args: unknown[]) => mockUpsertContact(...args),
    logContactActivity: (...args: unknown[]) => mockLogContactActivity(...args),
    incrementEngagementScore: (...args: unknown[]) =>
      mockIncrementEngagementScore(...args),
    ContactLimitError: actual.ContactLimitError,
  };
});

const mockRecordCreated = jest.fn();
const mockRecordSent = jest.fn();
const mockRecordCompleted = jest.fn();

jest.mock("@/lib/esig/usage-service", () => ({
  recordDocumentCreated: (...args: unknown[]) => mockRecordCreated(...args),
  recordDocumentSent: (...args: unknown[]) => mockRecordSent(...args),
  recordDocumentCompleted: (...args: unknown[]) =>
    mockRecordCompleted(...args),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const TEAM_ID = "team-001";
const DOC_ID = "sigdoc-001";
const ACTOR_ID = "user-001";

const mockContact = {
  id: "contact-001",
  teamId: TEAM_ID,
  email: "signer@example.com",
};

// ---------------------------------------------------------------------------
// Tests: parseName helper
// ---------------------------------------------------------------------------
describe("ContactUpsertJob — parseName", () => {
  it("parses full name into first and last", () => {
    expect(parseName("Jane Doe")).toEqual({
      firstName: "Jane",
      lastName: "Doe",
    });
  });

  it("handles single name (first only)", () => {
    expect(parseName("Jane")).toEqual({ firstName: "Jane" });
  });

  it("handles multi-part last name", () => {
    expect(parseName("Jean Pierre de la Cruz")).toEqual({
      firstName: "Jean",
      lastName: "Pierre de la Cruz",
    });
  });

  it("returns empty for undefined/empty", () => {
    expect(parseName(undefined)).toEqual({});
    expect(parseName("")).toEqual({});
    expect(parseName("  ")).toEqual({});
  });

  it("trims whitespace", () => {
    expect(parseName("  Jane  Doe  ")).toEqual({
      firstName: "Jane",
      lastName: "Doe",
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Engagement Weights
// ---------------------------------------------------------------------------
describe("ContactUpsertJob — Engagement Weights", () => {
  it("has correct weight values", () => {
    expect(ENGAGEMENT_WEIGHTS.DOCUMENT_SIGNED).toBe(10);
    expect(ENGAGEMENT_WEIGHTS.DOCUMENT_SENT).toBe(3);
    expect(ENGAGEMENT_WEIGHTS.DATAROOM_VIEWED).toBe(1);
    expect(ENGAGEMENT_WEIGHTS.LP_REGISTERED).toBe(5);
    expect(ENGAGEMENT_WEIGHTS.EXPRESS_INTEREST).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Tests: captureFromSigningEvent
// ---------------------------------------------------------------------------
describe("ContactUpsertJob — captureFromSigningEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertContact.mockResolvedValue(mockContact);
    mockLogContactActivity.mockResolvedValue({});
    mockRecordCreated.mockResolvedValue(undefined);
    mockRecordSent.mockResolvedValue(undefined);
    mockRecordCompleted.mockResolvedValue(undefined);
  });

  it("upserts contact on DOCUMENT_SIGNED event", async () => {
    await captureFromSigningEvent({
      email: "signer@example.com",
      name: "Jane Doe",
      teamId: TEAM_ID,
      signatureDocumentId: DOC_ID,
      eventType: "DOCUMENT_SIGNED",
    });

    expect(mockUpsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: TEAM_ID,
        email: "signer@example.com",
        firstName: "Jane",
        lastName: "Doe",
        source: "SIGNATURE_EVENT",
        engagementScore: ENGAGEMENT_WEIGHTS.DOCUMENT_SIGNED,
      }),
    );
  });

  it("logs activity on DOCUMENT_SIGNED", async () => {
    await captureFromSigningEvent({
      email: "signer@example.com",
      teamId: TEAM_ID,
      signatureDocumentId: DOC_ID,
      eventType: "DOCUMENT_SIGNED",
      actorId: ACTOR_ID,
    });

    expect(mockLogContactActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: mockContact.id,
        type: "DOCUMENT_SIGNED",
        actorId: ACTOR_ID,
        documentId: DOC_ID,
      }),
    );
  });

  it("upserts contact on DOCUMENT_SENT with lower engagement", async () => {
    await captureFromSigningEvent({
      email: "signer@example.com",
      teamId: TEAM_ID,
      signatureDocumentId: DOC_ID,
      eventType: "DOCUMENT_SENT",
    });

    expect(mockUpsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "MANUAL_ENTRY",
        engagementScore: ENGAGEMENT_WEIGHTS.DOCUMENT_SENT,
      }),
    );
    expect(mockRecordSent).toHaveBeenCalledWith(TEAM_ID);
  });

  it("tracks esig usage for DOCUMENT_CREATED", async () => {
    await captureFromSigningEvent({
      email: "signer@example.com",
      teamId: TEAM_ID,
      signatureDocumentId: DOC_ID,
      eventType: "DOCUMENT_CREATED",
    });

    expect(mockRecordCreated).toHaveBeenCalledWith(TEAM_ID, DOC_ID);
  });

  it("tracks esig usage for DOCUMENT_COMPLETED", async () => {
    await captureFromSigningEvent({
      email: "signer@example.com",
      teamId: TEAM_ID,
      signatureDocumentId: DOC_ID,
      eventType: "DOCUMENT_COMPLETED",
    });

    expect(mockRecordCompleted).toHaveBeenCalledWith(TEAM_ID);
  });

  it("does not throw on upsert failure (fire-and-forget)", async () => {
    mockUpsertContact.mockRejectedValue(new Error("DB error"));

    await expect(
      captureFromSigningEvent({
        email: "signer@example.com",
        teamId: TEAM_ID,
        signatureDocumentId: DOC_ID,
        eventType: "DOCUMENT_SIGNED",
      }),
    ).resolves.toBeUndefined();
  });

  it("skips activity log when no activityType (DOCUMENT_CREATED)", async () => {
    await captureFromSigningEvent({
      email: "signer@example.com",
      teamId: TEAM_ID,
      signatureDocumentId: DOC_ID,
      eventType: "DOCUMENT_CREATED",
    });

    expect(mockLogContactActivity).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: captureFromDataroomView
// ---------------------------------------------------------------------------
describe("ContactUpsertJob — captureFromDataroomView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertContact.mockResolvedValue(mockContact);
    mockLogContactActivity.mockResolvedValue({});
  });

  it("upserts contact from dataroom view", async () => {
    await captureFromDataroomView({
      email: "viewer@acme.com",
      name: "John Smith",
      teamId: TEAM_ID,
      dataroomId: "dr-001",
      linkId: "link-001",
      referralSource: "linkedin",
    });

    expect(mockUpsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: TEAM_ID,
        email: "viewer@acme.com",
        firstName: "John",
        lastName: "Smith",
        source: "DATAROOM_VIEW",
        referralSource: "linkedin",
        engagementScore: ENGAGEMENT_WEIGHTS.DATAROOM_VIEWED,
      }),
    );
  });

  it("logs DOCUMENT_VIEWED activity", async () => {
    await captureFromDataroomView({
      email: "viewer@acme.com",
      teamId: TEAM_ID,
      dataroomId: "dr-001",
    });

    expect(mockLogContactActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: mockContact.id,
        type: "DOCUMENT_VIEWED",
        metadata: expect.objectContaining({
          dataroomId: "dr-001",
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: captureFromLPRegistration
// ---------------------------------------------------------------------------
describe("ContactUpsertJob — captureFromLPRegistration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertContact.mockResolvedValue(mockContact);
    mockLogContactActivity.mockResolvedValue({});
  });

  it("upserts contact from LP registration", async () => {
    await captureFromLPRegistration({
      email: "lp@investor.com",
      firstName: "Alice",
      lastName: "Investor",
      teamId: TEAM_ID,
      investorId: "inv-001",
      fundId: "fund-001",
    });

    expect(mockUpsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: TEAM_ID,
        email: "lp@investor.com",
        firstName: "Alice",
        lastName: "Investor",
        source: "INVESTOR_ONBOARDING",
        investorId: "inv-001",
        engagementScore: ENGAGEMENT_WEIGHTS.LP_REGISTERED,
      }),
    );
  });

  it("logs CREATED activity with fund metadata", async () => {
    await captureFromLPRegistration({
      email: "lp@investor.com",
      teamId: TEAM_ID,
      fundId: "fund-001",
    });

    expect(mockLogContactActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CREATED",
        description: "LP registered for onboarding",
        metadata: expect.objectContaining({
          fundId: "fund-001",
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: captureFromExpressInterest
// ---------------------------------------------------------------------------
describe("ContactUpsertJob — captureFromExpressInterest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertContact.mockResolvedValue(mockContact);
    mockLogContactActivity.mockResolvedValue({});
  });

  it("upserts contact from express interest", async () => {
    await captureFromExpressInterest({
      email: "interested@acme.com",
      name: "Bob Builder",
      teamId: TEAM_ID,
      fundId: "fund-001",
      investorType: "Individual",
    });

    expect(mockUpsertContact).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: TEAM_ID,
        email: "interested@acme.com",
        firstName: "Bob",
        lastName: "Builder",
        source: "DEAL_INTEREST",
        engagementScore: ENGAGEMENT_WEIGHTS.EXPRESS_INTEREST,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: backfillContactsFromDataroomViewers
// ---------------------------------------------------------------------------
describe("ContactUpsertJob — backfillContactsFromDataroomViewers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertContact.mockResolvedValue(mockContact);
  });

  it("processes viewers in batches", async () => {
    // First batch: 2 viewers
    (prisma.view.findMany as jest.Mock)
      .mockResolvedValueOnce([
        {
          viewerEmail: "a@test.com",
          viewerName: "Alice A",
          referralSource: null,
          dataroomId: "dr-1",
          linkId: "link-1",
        },
        {
          viewerEmail: "b@test.com",
          viewerName: null,
          referralSource: "google",
          dataroomId: "dr-1",
          linkId: "link-2",
        },
      ])
      // Second batch: empty (stop)
      .mockResolvedValueOnce([]);

    // Contact a does not exist, b already exists
    (prisma.contact.findUnique as jest.Mock)
      .mockResolvedValueOnce(null) // a@test.com - new
      .mockResolvedValueOnce({ id: "contact-002" }); // b@test.com - existing

    const result = await backfillContactsFromDataroomViewers(TEAM_ID, 10);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.errors).toBe(0);
    expect(mockUpsertContact).toHaveBeenCalledTimes(2);
  });

  it("counts errors and continues processing", async () => {
    (prisma.view.findMany as jest.Mock)
      .mockResolvedValueOnce([
        { viewerEmail: "fail@test.com", viewerName: null, referralSource: null, dataroomId: null, linkId: null },
      ])
      .mockResolvedValueOnce([]);

    (prisma.contact.findUnique as jest.Mock).mockResolvedValueOnce(null);
    mockUpsertContact.mockRejectedValueOnce(new Error("DB error"));

    const result = await backfillContactsFromDataroomViewers(TEAM_ID);

    expect(result.errors).toBe(1);
    expect(result.created).toBe(0);
  });

  it("skips viewers without email", async () => {
    (prisma.view.findMany as jest.Mock)
      .mockResolvedValueOnce([
        { viewerEmail: null, viewerName: null, referralSource: null, dataroomId: null, linkId: null },
      ])
      .mockResolvedValueOnce([]);

    const result = await backfillContactsFromDataroomViewers(TEAM_ID);

    expect(mockUpsertContact).not.toHaveBeenCalled();
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: ContactLimitError handling
// ---------------------------------------------------------------------------
describe("ContactUpsertJob — ContactLimitError handling", () => {
  // Get the real ContactLimitError class and the mocked reportError
  const { ContactLimitError: ContactLimitErrorClass } = jest.requireActual(
    "@/lib/crm/contact-service",
  ) as { ContactLimitError: typeof import("@/lib/crm/contact-service").ContactLimitError };
  const { reportError: mockReportError } = require("@/lib/error") as {
    reportError: jest.Mock;
  };

  const limitError = new ContactLimitErrorClass(
    "Contact limit reached for organization",
    {
      email: "signer@example.com",
      orgId: "org-001",
      current: 20,
      limit: 20,
    },
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertContact.mockRejectedValue(limitError);
    mockLogContactActivity.mockResolvedValue({});
    mockRecordCreated.mockResolvedValue(undefined);
    mockRecordSent.mockResolvedValue(undefined);
    mockRecordCompleted.mockResolvedValue(undefined);
  });

  it("captureFromSigningEvent does NOT report error on ContactLimitError", async () => {
    await expect(
      captureFromSigningEvent({
        email: "signer@example.com",
        name: "Jane Doe",
        teamId: TEAM_ID,
        signatureDocumentId: DOC_ID,
        eventType: "DOCUMENT_SIGNED",
      }),
    ).resolves.toBeUndefined();

    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("captureFromDataroomView does NOT report error on ContactLimitError", async () => {
    await expect(
      captureFromDataroomView({
        email: "viewer@acme.com",
        name: "John Smith",
        teamId: TEAM_ID,
        dataroomId: "dr-001",
        linkId: "link-001",
      }),
    ).resolves.toBeUndefined();

    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("captureFromLPRegistration does NOT report error on ContactLimitError", async () => {
    await expect(
      captureFromLPRegistration({
        email: "lp@investor.com",
        firstName: "Alice",
        lastName: "Investor",
        teamId: TEAM_ID,
        investorId: "inv-001",
        fundId: "fund-001",
      }),
    ).resolves.toBeUndefined();

    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("captureFromExpressInterest does NOT report error on ContactLimitError", async () => {
    await expect(
      captureFromExpressInterest({
        email: "interested@acme.com",
        name: "Bob Builder",
        teamId: TEAM_ID,
        fundId: "fund-001",
        investorType: "Individual",
      }),
    ).resolves.toBeUndefined();

    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("regular errors DO call reportError", async () => {
    const regularError = new Error("Unexpected database failure");
    mockUpsertContact.mockRejectedValue(regularError);

    await expect(
      captureFromSigningEvent({
        email: "signer@example.com",
        name: "Jane Doe",
        teamId: TEAM_ID,
        signatureDocumentId: DOC_ID,
        eventType: "DOCUMENT_SIGNED",
      }),
    ).resolves.toBeUndefined();

    expect(mockReportError).toHaveBeenCalledWith(regularError);
  });
});
