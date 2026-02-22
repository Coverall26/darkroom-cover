/**
 * Tests for POST /api/webhooks/resend — Resend email event webhook handler.
 *
 * Covers:
 *   - Signature verification (valid, invalid, missing)
 *   - email.delivered — marks existing activity as delivered
 *   - email.opened — logs activity + increments engagement
 *   - email.clicked — logs link click + increments engagement, skips tracking links
 *   - email.bounced — marks contact bounced, cancels sequences (hard bounce)
 *   - email.complained — unsubscribes + cancels sequences
 *   - Unknown event type — acknowledged without processing
 *   - Contact not found — no-op
 *   - Handler error — returns 200 to prevent retries
 */

import crypto from "crypto";

// ---------------------------------------------------------------------------
// Mocks (must be before imports)
// ---------------------------------------------------------------------------

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

// Use the global jest.setup.ts prisma mock
import prisma from "@/lib/prisma";
import { reportError } from "@/lib/error";

// ---------------------------------------------------------------------------
// Import the handler
// ---------------------------------------------------------------------------
import { POST } from "@/app/api/webhooks/resend/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = "whsec_" + Buffer.from("test-secret-key-32bytes!").toString("base64");

function makeHeaders(body: string, secret: string = WEBHOOK_SECRET) {
  const svixId = "msg_test123";
  const svixTimestamp = Math.floor(Date.now() / 1000).toString();
  const secretBytes = Buffer.from(secret.slice(6), "base64");
  const toSign = `${svixId}.${svixTimestamp}.${body}`;
  const signature = crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");

  return {
    "svix-id": svixId,
    "svix-timestamp": svixTimestamp,
    "svix-signature": `v1,${signature}`,
  };
}

function makeEvent(type: string, overrides: Record<string, unknown> = {}) {
  return {
    type,
    created_at: new Date().toISOString(),
    data: {
      email_id: "email-001",
      from: "noreply@fundroom.ai",
      to: ["lp@example.com"],
      subject: "Test Email",
      ...overrides,
    },
  };
}

function makeRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/webhooks/resend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  }) as unknown as import("next/server").NextRequest;
}

const CONTACT_MATCH = { contactId: "contact-001", teamId: "team-001" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("POST /api/webhooks/resend", () => {
  const originalEnv = process.env.RESEND_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterAll(() => {
    process.env.RESEND_WEBHOOK_SECRET = originalEnv;
  });

  // -----------------------------------------------------------------------
  // Signature verification
  // -----------------------------------------------------------------------
  describe("signature verification", () => {
    it("rejects invalid signature", async () => {
      const body = JSON.stringify(makeEvent("email.delivered"));
      const headers = makeHeaders(body);
      headers["svix-signature"] = "v1,invalidsignature";

      const res = await POST(makeRequest(body, headers));
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe("Invalid webhook signature");
    });

    it("rejects missing svix headers", async () => {
      const body = JSON.stringify(makeEvent("email.delivered"));

      const res = await POST(makeRequest(body, {}));
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe("Invalid webhook signature");
    });

    it("accepts valid signature", async () => {
      const event = makeEvent("unknown.event");
      const body = JSON.stringify(event);
      const headers = makeHeaders(body);

      const res = await POST(makeRequest(body, headers));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.received).toBe(true);
    });

    it("accepts events without verification when secret not set", async () => {
      delete process.env.RESEND_WEBHOOK_SECRET;

      const body = JSON.stringify(makeEvent("unknown.event"));

      const res = await POST(makeRequest(body, {}));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.received).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Invalid JSON
  // -----------------------------------------------------------------------
  it("returns 400 for invalid JSON body", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    const res = await POST(makeRequest("not-json", {}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Invalid JSON body");
  });

  // -----------------------------------------------------------------------
  // email.delivered
  // -----------------------------------------------------------------------
  describe("email.delivered", () => {
    it("updates existing EMAIL_SENT activity with delivery status", async () => {
      delete process.env.RESEND_WEBHOOK_SECRET;

      (prisma.contactActivity.findFirst as jest.Mock)
        // First call: findContactByEmailEvent
        .mockResolvedValueOnce({
          contactId: "contact-001",
          contact: { teamId: "team-001" },
        })
        // Second call: duplicate check
        .mockResolvedValueOnce(null);
      (prisma.contactActivity.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const event = makeEvent("email.delivered");
      const body = JSON.stringify(event);

      const res = await POST(makeRequest(body, {}));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.received).toBe(true);
      expect(prisma.contactActivity.updateMany).toHaveBeenCalled();
    });

    it("skips duplicate delivered event", async () => {
      delete process.env.RESEND_WEBHOOK_SECRET;

      (prisma.contactActivity.findFirst as jest.Mock)
        .mockResolvedValueOnce({
          contactId: "contact-001",
          contact: { teamId: "team-001" },
        })
        .mockResolvedValueOnce({ id: "existing-activity" }); // Duplicate found

      const event = makeEvent("email.delivered");
      const body = JSON.stringify(event);

      const res = await POST(makeRequest(body, {}));

      expect(prisma.contactActivity.updateMany).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // email.opened
  // -----------------------------------------------------------------------
  describe("email.opened", () => {
    it("logs open activity and increments engagement score", async () => {
      delete process.env.RESEND_WEBHOOK_SECRET;

      (prisma.contactActivity.findFirst as jest.Mock)
        // findContactByEmailEvent
        .mockResolvedValueOnce({
          contactId: "contact-001",
          contact: { teamId: "team-001" },
        })
        // Duplicate check
        .mockResolvedValueOnce(null);
      (prisma.contactActivity.create as jest.Mock).mockResolvedValue({});
      (prisma.contact.update as jest.Mock).mockResolvedValue({});

      const event = makeEvent("email.opened");
      const body = JSON.stringify(event);

      const res = await POST(makeRequest(body, {}));
      expect(res.status).toBe(200);

      expect(prisma.contactActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "EMAIL_OPENED",
          }),
        }),
      );
      // +2 engagement for open
      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            engagementScore: { increment: 2 },
          }),
        }),
      );
    });

    it("deduplicates against existing open activity", async () => {
      delete process.env.RESEND_WEBHOOK_SECRET;

      (prisma.contactActivity.findFirst as jest.Mock)
        .mockResolvedValueOnce({
          contactId: "contact-001",
          contact: { teamId: "team-001" },
        })
        .mockResolvedValueOnce({ id: "existing-open" }); // Already tracked

      const event = makeEvent("email.opened");
      const body = JSON.stringify(event);

      await POST(makeRequest(body, {}));

      expect(prisma.contactActivity.create).not.toHaveBeenCalled();
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // email.clicked
  // -----------------------------------------------------------------------
  describe("email.clicked", () => {
    it("logs click activity and increments engagement by 3", async () => {
      delete process.env.RESEND_WEBHOOK_SECRET;

      (prisma.contactActivity.findFirst as jest.Mock).mockResolvedValueOnce({
        contactId: "contact-001",
        contact: { teamId: "team-001" },
      });
      (prisma.contactActivity.create as jest.Mock).mockResolvedValue({});
      (prisma.contact.update as jest.Mock).mockResolvedValue({});

      const event = makeEvent("email.clicked", {
        click: { link: "https://app.fundroom.ai/lp/dashboard", timestamp: new Date().toISOString() },
      });
      const body = JSON.stringify(event);

      const res = await POST(makeRequest(body, {}));
      expect(res.status).toBe(200);

      expect(prisma.contactActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "LINK_CLICKED",
          }),
        }),
      );
      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            engagementScore: { increment: 3 },
          }),
        }),
      );
    });

    it("skips tracking pixel links", async () => {
      delete process.env.RESEND_WEBHOOK_SECRET;

      (prisma.contactActivity.findFirst as jest.Mock).mockResolvedValueOnce({
        contactId: "contact-001",
        contact: { teamId: "team-001" },
      });

      const event = makeEvent("email.clicked", {
        click: { link: "https://app.fundroom.ai/api/outreach/track/click123" },
      });
      const body = JSON.stringify(event);

      await POST(makeRequest(body, {}));

      expect(prisma.contactActivity.create).not.toHaveBeenCalled();
    });

    it("skips unsubscribe links", async () => {
      delete process.env.RESEND_WEBHOOK_SECRET;

      (prisma.contactActivity.findFirst as jest.Mock).mockResolvedValueOnce({
        contactId: "contact-001",
        contact: { teamId: "team-001" },
      });

      const event = makeEvent("email.clicked", {
        click: { link: "https://app.fundroom.ai/api/outreach/unsubscribe?token=abc" },
      });
      const body = JSON.stringify(event);

      await POST(makeRequest(body, {}));

      expect(prisma.contactActivity.create).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // email.bounced
  // -----------------------------------------------------------------------
  describe("email.bounced", () => {
    it("marks contact as bounced and cancels sequences for hard bounce", async () => {
      delete process.env.RESEND_WEBHOOK_SECRET;

      (prisma.contactActivity.findFirst as jest.Mock).mockResolvedValueOnce({
        contactId: "contact-001",
        contact: { teamId: "team-001" },
      });
      (prisma.contact.update as jest.Mock).mockResolvedValue({});
      (prisma.contactActivity.create as jest.Mock).mockResolvedValue({});
      (prisma.sequenceEnrollment.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const event = makeEvent("email.bounced", {
        bounce: { type: "hard", message: "Mailbox not found" },
      });
      const body = JSON.stringify(event);

      const res = await POST(makeRequest(body, {}));
      expect(res.status).toBe(200);

      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { emailBounced: true },
        }),
      );
      expect(prisma.sequenceEnrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contactId: "contact-001",
            status: "ACTIVE",
          }),
          data: expect.objectContaining({
            status: "CANCELLED",
            pausedReason: "email_bounced",
          }),
        }),
      );
    });

    it("does not mark contact bounced for soft bounce", async () => {
      delete process.env.RESEND_WEBHOOK_SECRET;

      (prisma.contactActivity.findFirst as jest.Mock).mockResolvedValueOnce({
        contactId: "contact-001",
        contact: { teamId: "team-001" },
      });
      (prisma.contactActivity.create as jest.Mock).mockResolvedValue({});

      const event = makeEvent("email.bounced", {
        bounce: { type: "soft", message: "Mailbox full" },
      });
      const body = JSON.stringify(event);

      await POST(makeRequest(body, {}));

      // Should NOT update contact.emailBounced for soft bounce
      expect(prisma.contact.update).not.toHaveBeenCalled();
      // Should NOT cancel sequences for soft bounce
      expect(prisma.sequenceEnrollment.updateMany).not.toHaveBeenCalled();
      // But should still log the activity
      expect(prisma.contactActivity.create).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // email.complained
  // -----------------------------------------------------------------------
  describe("email.complained", () => {
    it("unsubscribes contact and cancels active sequences", async () => {
      delete process.env.RESEND_WEBHOOK_SECRET;

      (prisma.contactActivity.findFirst as jest.Mock).mockResolvedValueOnce({
        contactId: "contact-001",
        contact: { teamId: "team-001" },
      });
      (prisma.contact.update as jest.Mock).mockResolvedValue({});
      (prisma.contactActivity.create as jest.Mock).mockResolvedValue({});
      (prisma.sequenceEnrollment.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      const event = makeEvent("email.complained");
      const body = JSON.stringify(event);

      const res = await POST(makeRequest(body, {}));
      expect(res.status).toBe(200);

      // Unsubscribe
      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unsubscribedAt: expect.any(Date),
          }),
        }),
      );
      // Cancel sequences
      expect(prisma.sequenceEnrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CANCELLED",
            pausedReason: "spam_complaint",
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Contact not found
  // -----------------------------------------------------------------------
  it("no-ops when contact cannot be resolved", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    (prisma.contactActivity.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

    const event = makeEvent("email.opened");
    const body = JSON.stringify(event);

    const res = await POST(makeRequest(body, {}));

    expect(res.status).toBe(200);
    expect(prisma.contactActivity.create).not.toHaveBeenCalled();
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Fallback: find contact by email when emailId lookup fails
  // -----------------------------------------------------------------------
  it("falls back to email lookup when emailId not found in activities", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    (prisma.contactActivity.findFirst as jest.Mock)
      .mockResolvedValueOnce(null) // emailId lookup fails
      .mockResolvedValueOnce(null); // dedup check (for opened)
    (prisma.contact.findFirst as jest.Mock).mockResolvedValue({
      id: "contact-002",
      teamId: "team-002",
    });
    (prisma.contactActivity.create as jest.Mock).mockResolvedValue({});
    (prisma.contact.update as jest.Mock).mockResolvedValue({});

    const event = makeEvent("email.opened");
    const body = JSON.stringify(event);

    await POST(makeRequest(body, {}));

    // Should have tried contact.findFirst as fallback
    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "lp@example.com" },
      }),
    );
    // Should still log the activity
    expect(prisma.contactActivity.create).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Handler error
  // -----------------------------------------------------------------------
  it("returns 200 even when handler throws (prevents retries)", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    (prisma.contactActivity.findFirst as jest.Mock).mockResolvedValueOnce({
      contactId: "contact-001",
      contact: { teamId: "team-001" },
    });
    // Make the handler throw
    (prisma.contactActivity.create as jest.Mock).mockRejectedValue(
      new Error("DB connection lost"),
    );

    const event = makeEvent("email.opened");
    const body = JSON.stringify(event);

    const res = await POST(makeRequest(body, {}));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
    expect(json.error).toBe("Handler failed");
    expect(reportError).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Unknown event type
  // -----------------------------------------------------------------------
  it("acknowledges unknown event types without processing", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    const event = makeEvent("email.some_future_event");
    const body = JSON.stringify(event);

    const res = await POST(makeRequest(body, {}));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
  });
});
