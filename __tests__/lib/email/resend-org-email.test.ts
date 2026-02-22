// @ts-nocheck
/**
 * Tests for lib/resend.ts — sendOrgEmail (Tier 2 org-branded emails)
 * and sendEmail (Tier 1 platform emails)
 *
 * Since jest.setup.ts globally mocks @/lib/resend, we use jest.resetModules +
 * jest.doMock + require() to test the REAL implementation with controlled deps.
 */

const mockGetTeamFromAddress = jest.fn();
const mockResendEmailsSend = jest.fn();

// Set env before anything
process.env.RESEND_API_KEY = "test-resend-key";

describe("sendOrgEmail (Tier 2 — Org-branded)", () => {
  let sendOrgEmail: any;
  let sendEmail: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockResendEmailsSend.mockResolvedValue({ data: { id: "email-123" }, error: null });

    // Remove the hoisted mock from jest.setup.ts so we get the REAL module
    jest.unmock("@/lib/resend");

    // Mock only the dependencies of @/lib/resend
    jest.doMock("resend", () => ({
      Resend: jest.fn().mockImplementation(() => ({
        emails: {
          send: (...args: any[]) => mockResendEmailsSend(...args),
        },
      })),
    }));

    jest.doMock("@/lib/email/domain-service", () => ({
      getTeamFromAddress: (...args: any[]) => mockGetTeamFromAddress(...args),
    }));

    jest.doMock("@react-email/render", () => ({
      render: jest.fn().mockResolvedValue("<html>test</html>"),
      toPlainText: jest.fn().mockReturnValue("test plain text"),
    }));

    jest.doMock("@/lib/utils", () => ({
      log: jest.fn(),
      nanoid: jest.fn().mockReturnValue("test-nano-id"),
    }));

    // Import the REAL module with mocked deps
    const resendModule = require("@/lib/resend");
    sendOrgEmail = resendModule.sendOrgEmail;
    sendEmail = resendModule.sendEmail;
  });

  const mockReact = { type: "div", props: {} } as any;

  it("sends from org domain when team has verified domain", async () => {
    mockGetTeamFromAddress.mockResolvedValue({
      from: "Bermuda Club <investors@mail.bermudaclub.com>",
      replyTo: "support@bermudaclub.com",
    });

    await sendOrgEmail({
      teamId: "team-1",
      to: "lp@example.com",
      subject: "Your investment approved",
      react: mockReact,
    });

    expect(mockGetTeamFromAddress).toHaveBeenCalledWith("team-1");
    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Bermuda Club <investors@mail.bermudaclub.com>",
        to: "lp@example.com",
        replyTo: "support@bermudaclub.com",
      }),
    );
  });

  it("falls back to platform @fundroom.ai when no org domain", async () => {
    mockGetTeamFromAddress.mockResolvedValue(null);

    await sendOrgEmail({
      teamId: "team-1",
      to: "lp@example.com",
      subject: "Test",
      react: mockReact,
    });

    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "FundRoom <notifications@fundroom.ai>",
      }),
    );
  });

  it("falls back to platform default when getTeamFromAddress throws", async () => {
    mockGetTeamFromAddress.mockRejectedValue(new Error("DB down"));

    await sendOrgEmail({
      teamId: "team-1",
      to: "lp@example.com",
      subject: "Test",
      react: mockReact,
    });

    // Should still send — just from platform default
    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "FundRoom <notifications@fundroom.ai>",
      }),
    );
  });

  it("preserves explicit replyTo over org replyTo", async () => {
    mockGetTeamFromAddress.mockResolvedValue({
      from: "Fund <notify@mail.fund.com>",
      replyTo: "default-reply@fund.com",
    });

    await sendOrgEmail({
      teamId: "team-1",
      to: "lp@example.com",
      subject: "Test",
      react: mockReact,
      replyTo: "override@custom.com",
    });

    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: "override@custom.com",
      }),
    );
  });

  it("uses org replyTo when no explicit replyTo provided", async () => {
    mockGetTeamFromAddress.mockResolvedValue({
      from: "Fund <notify@mail.fund.com>",
      replyTo: "default-reply@fund.com",
    });

    await sendOrgEmail({
      teamId: "team-1",
      to: "lp@example.com",
      subject: "Test",
      react: mockReact,
    });

    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: "default-reply@fund.com",
      }),
    );
  });

  it("sends to delivered@resend.dev in test mode", async () => {
    mockGetTeamFromAddress.mockResolvedValue(null);

    await sendOrgEmail({
      teamId: "team-1",
      to: "real@example.com",
      subject: "Test",
      react: mockReact,
      test: true,
    });

    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "delivered@resend.dev",
      }),
    );
  });

  it("passes cc and scheduledAt through to sendEmail", async () => {
    mockGetTeamFromAddress.mockResolvedValue(null);

    await sendOrgEmail({
      teamId: "team-1",
      to: "lp@example.com",
      subject: "Test",
      react: mockReact,
      cc: "gp@fund.com",
      scheduledAt: "2026-03-01T12:00:00Z",
    });

    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        cc: "gp@fund.com",
        scheduledAt: "2026-03-01T12:00:00Z",
      }),
    );
  });
});

describe("sendEmail (Tier 1 — Platform)", () => {
  let sendEmail: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    mockResendEmailsSend.mockResolvedValue({ data: { id: "email-456" }, error: null });

    jest.unmock("@/lib/resend");

    jest.doMock("resend", () => ({
      Resend: jest.fn().mockImplementation(() => ({
        emails: {
          send: (...args: any[]) => mockResendEmailsSend(...args),
        },
      })),
    }));

    jest.doMock("@react-email/render", () => ({
      render: jest.fn().mockResolvedValue("<html>test</html>"),
      toPlainText: jest.fn().mockReturnValue("test plain text"),
    }));

    jest.doMock("@/lib/utils", () => ({
      log: jest.fn(),
      nanoid: jest.fn().mockReturnValue("test-nano-id"),
    }));

    const resendModule = require("@/lib/resend");
    sendEmail = resendModule.sendEmail;
  });

  const mockReact = { type: "div", props: {} } as any;

  it("sends from system address when system flag is set", async () => {
    await sendEmail({
      to: "user@example.com",
      subject: "System notification",
      react: mockReact,
      system: true,
    });

    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "FundRoom <system@fundroom.ai>",
      }),
    );
  });

  it("sends from verify address when verify flag is set", async () => {
    await sendEmail({
      to: "user@example.com",
      subject: "Verify your email",
      react: mockReact,
      verify: true,
    });

    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "FundRoom <verify@fundroom.ai>",
      }),
    );
  });

  it("uses notifications as default from address", async () => {
    await sendEmail({
      to: "user@example.com",
      subject: "Welcome",
      react: mockReact,
    });

    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "FundRoom <notifications@fundroom.ai>",
      }),
    );
  });

  it("uses explicit from address when provided", async () => {
    await sendEmail({
      to: "user@example.com",
      subject: "Custom",
      react: mockReact,
      from: "Custom Sender <custom@example.com>",
    });

    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Custom Sender <custom@example.com>",
      }),
    );
  });

  it("throws when Resend returns an error", async () => {
    mockResendEmailsSend.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid email" },
    });

    await expect(
      sendEmail({
        to: "bad-email",
        subject: "Test",
        react: mockReact,
      }),
    ).rejects.toEqual(
      expect.objectContaining({ message: "Invalid email" }),
    );
  });

  it("includes unsubscribe header when unsubscribeUrl provided", async () => {
    await sendEmail({
      to: "user@example.com",
      subject: "Newsletter",
      react: mockReact,
      marketing: true,
      unsubscribeUrl: "https://app.fundroom.ai/unsubscribe/abc",
    });

    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          "List-Unsubscribe": "https://app.fundroom.ai/unsubscribe/abc",
        }),
      }),
    );
  });

  it("includes X-Entity-Ref-ID header for deduplication", async () => {
    await sendEmail({
      to: "user@example.com",
      subject: "Test",
      react: mockReact,
    });

    expect(mockResendEmailsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Entity-Ref-ID": "test-nano-id",
        }),
      }),
    );
  });
});
