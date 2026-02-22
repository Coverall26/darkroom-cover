// @ts-nocheck
/**
 * Signature Reminder Cron Job Tests
 *
 * Tests for app/api/cron/signature-reminders/route.ts
 *
 * Validates:
 * - Reminder scheduling logic (first reminder, repeat intervals)
 * - Max reminder cap enforcement
 * - Expired document skip
 * - Recipient status filtering
 * - Database update after send
 * - Error handling on email failures
 */

// Mock Prisma
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    signatureRecipient: {
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  },
}));

// Mock cron utilities
jest.mock("@/lib/cron", () => ({
  receiver: null,
  limiter: {
    schedule: jest.fn((fn) => fn()),
  },
}));

// Mock email sender
jest.mock("@/lib/emails/send-signature-reminder", () => ({
  sendSignatureReminderEmail: jest.fn(),
}));

// Mock error reporting
jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

// Mock utils
jest.mock("@/lib/utils", () => ({
  log: jest.fn(),
  nanoid: jest.fn(() => "test-id"),
}));

import prisma from "@/lib/prisma";
import { sendSignatureReminderEmail } from "@/lib/emails/send-signature-reminder";
import { processSignatureReminders } from "@/app/api/cron/signature-reminders/route";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockSendReminder = sendSignatureReminderEmail as jest.MockedFunction<
  typeof sendSignatureReminderEmail
>;

function createRecipient(overrides: Record<string, any> = {}) {
  const now = new Date();
  const sentAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

  return {
    id: "recip-1",
    name: "John Doe",
    email: "john@example.com",
    role: "SIGNER",
    status: "SENT",
    reminderCount: 0,
    lastReminderSentAt: null,
    signingToken: "token-123",
    signingUrl: "https://app.fundroom.ai/view/sign/token-123",
    createdAt: sentAt,
    document: {
      id: "doc-1",
      title: "Subscription Agreement",
      sentAt,
      expirationDate: null,
      status: "SENT",
      teamId: "team-1",
      team: {
        name: "Acme Capital",
        users: [
          {
            user: { name: "Jane Admin", email: "jane@acme.com" },
          },
        ],
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXTAUTH_URL = "https://app.fundroom.ai";
});

describe("processSignatureReminders", () => {
  it("should send first reminder after FIRST_REMINDER_DAYS", async () => {
    const recipient = createRecipient();
    (mockPrisma.signatureRecipient.findMany as jest.Mock).mockResolvedValue([
      recipient,
    ]);
    mockSendReminder.mockResolvedValue({ success: true });
    (mockPrisma.signatureRecipient.update as jest.Mock).mockResolvedValue({});

    const result = await processSignatureReminders();

    expect(result.remindersSent).toBe(1);
    expect(result.errors).toBe(0);
    expect(mockSendReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "john@example.com",
        recipientName: "John Doe",
        documentTitle: "Subscription Agreement",
        teamId: "team-1",
      }),
    );
    expect(mockPrisma.signatureRecipient.update).toHaveBeenCalledWith({
      where: { id: "recip-1" },
      data: {
        lastReminderSentAt: expect.any(Date),
        reminderCount: { increment: 1 },
      },
    });
  });

  it("should skip recipients who have not waited long enough for first reminder", async () => {
    const now = new Date();
    const sentAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
    const recipient = createRecipient({
      document: {
        ...createRecipient().document,
        sentAt,
      },
    });
    (mockPrisma.signatureRecipient.findMany as jest.Mock).mockResolvedValue([
      recipient,
    ]);

    const result = await processSignatureReminders();

    expect(result.remindersSent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockSendReminder).not.toHaveBeenCalled();
  });

  it("should send subsequent reminder after REPEAT_REMINDER_DAYS", async () => {
    const now = new Date();
    const sentAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const lastReminder = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000); // 4 days ago
    const recipient = createRecipient({
      reminderCount: 1,
      lastReminderSentAt: lastReminder,
      document: {
        ...createRecipient().document,
        sentAt,
      },
    });
    (mockPrisma.signatureRecipient.findMany as jest.Mock).mockResolvedValue([
      recipient,
    ]);
    mockSendReminder.mockResolvedValue({ success: true });
    (mockPrisma.signatureRecipient.update as jest.Mock).mockResolvedValue({});

    const result = await processSignatureReminders();

    expect(result.remindersSent).toBe(1);
  });

  it("should skip recipients already at max reminders", async () => {
    // Max reminders is filtered at the query level (reminderCount: { lt: MAX_REMINDERS })
    // So the query should return empty if all are maxed out
    (mockPrisma.signatureRecipient.findMany as jest.Mock).mockResolvedValue([]);

    const result = await processSignatureReminders();

    expect(result.recipientsChecked).toBe(0);
    expect(result.remindersSent).toBe(0);
  });

  it("should skip expired documents", async () => {
    const now = new Date();
    const expired = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // yesterday
    const recipient = createRecipient({
      document: {
        ...createRecipient().document,
        expirationDate: expired,
      },
    });
    (mockPrisma.signatureRecipient.findMany as jest.Mock).mockResolvedValue([
      recipient,
    ]);

    const result = await processSignatureReminders();

    expect(result.remindersSent).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("should skip documents without sentAt date", async () => {
    const recipient = createRecipient({
      document: {
        ...createRecipient().document,
        sentAt: null,
      },
    });
    (mockPrisma.signatureRecipient.findMany as jest.Mock).mockResolvedValue([
      recipient,
    ]);

    const result = await processSignatureReminders();

    expect(result.remindersSent).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("should count errors when email send fails", async () => {
    const recipient = createRecipient();
    (mockPrisma.signatureRecipient.findMany as jest.Mock).mockResolvedValue([
      recipient,
    ]);
    mockSendReminder.mockResolvedValue({ success: false, error: new Error("fail") });

    const result = await processSignatureReminders();

    expect(result.errors).toBe(1);
    expect(result.remindersSent).toBe(0);
    // Should NOT update the recipient when send fails
    expect(mockPrisma.signatureRecipient.update).not.toHaveBeenCalled();
  });

  it("should handle multiple recipients in a batch", async () => {
    const recipients = [
      createRecipient({ id: "r1", email: "a@test.com" }),
      createRecipient({ id: "r2", email: "b@test.com" }),
      createRecipient({ id: "r3", email: "c@test.com" }),
    ];
    (mockPrisma.signatureRecipient.findMany as jest.Mock).mockResolvedValue(
      recipients,
    );
    mockSendReminder.mockResolvedValue({ success: true });
    (mockPrisma.signatureRecipient.update as jest.Mock).mockResolvedValue({});

    const result = await processSignatureReminders();

    expect(result.recipientsChecked).toBe(3);
    expect(result.remindersSent).toBe(3);
    expect(mockSendReminder).toHaveBeenCalledTimes(3);
  });

  it("should include expiration date in email when document has one", async () => {
    const now = new Date();
    const expDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const recipient = createRecipient({
      document: {
        ...createRecipient().document,
        expirationDate: expDate,
      },
    });
    (mockPrisma.signatureRecipient.findMany as jest.Mock).mockResolvedValue([
      recipient,
    ]);
    mockSendReminder.mockResolvedValue({ success: true });
    (mockPrisma.signatureRecipient.update as jest.Mock).mockResolvedValue({});

    await processSignatureReminders();

    expect(mockSendReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        expirationDate: expect.any(String),
      }),
    );
  });

  it("should use signingUrl from recipient when available", async () => {
    const recipient = createRecipient({
      signingUrl: "https://custom.url/sign",
    });
    (mockPrisma.signatureRecipient.findMany as jest.Mock).mockResolvedValue([
      recipient,
    ]);
    mockSendReminder.mockResolvedValue({ success: true });
    (mockPrisma.signatureRecipient.update as jest.Mock).mockResolvedValue({});

    await processSignatureReminders();

    expect(mockSendReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        signingUrl: "https://custom.url/sign",
      }),
    );
  });

  it("should construct signing URL from token when signingUrl is missing", async () => {
    const recipient = createRecipient({
      signingUrl: null,
      signingToken: "abc-token",
    });
    (mockPrisma.signatureRecipient.findMany as jest.Mock).mockResolvedValue([
      recipient,
    ]);
    mockSendReminder.mockResolvedValue({ success: true });
    (mockPrisma.signatureRecipient.update as jest.Mock).mockResolvedValue({});

    await processSignatureReminders();

    expect(mockSendReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        signingUrl: "https://app.fundroom.ai/view/sign/abc-token",
      }),
    );
  });
});
