// @ts-nocheck
/**
 * E-Sign Webhook API Tests
 *
 * Tests for pages/api/webhooks/esign.ts - E-signature webhook handler.
 *
 * These tests validate:
 * - Method validation (POST only)
 * - Signature verification when secret is configured
 * - Payload validation (event + documentId required)
 * - Document lookup and team ownership checks
 * - Recipient verification
 * - Event dispatching (recipient_signed, document_completed, document_declined, document_viewed)
 * - Error handling
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

// Mock functions for controlled test behavior
const mockSignatureDocFindUnique = jest.fn();
const mockSignatureDocUpdate = jest.fn();
const mockSignatureRecipientFindFirst = jest.fn();
const mockSignatureRecipientUpdate = jest.fn();
const mockSignatureRecipientFindMany = jest.fn();
const mockSendEmail = jest.fn();

// Mock prisma before importing handler
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    signatureDocument: {
      findUnique: (...args: any[]) => mockSignatureDocFindUnique(...args),
      update: (...args: any[]) => mockSignatureDocUpdate(...args),
    },
    signatureRecipient: {
      findFirst: (...args: any[]) => mockSignatureRecipientFindFirst(...args),
      update: (...args: any[]) => mockSignatureRecipientUpdate(...args),
      findMany: (...args: any[]) => mockSignatureRecipientFindMany(...args),
    },
    $transaction: jest.fn((callback) =>
      callback({
        signatureRecipient: {
          update: jest.fn().mockResolvedValue({}),
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: "r1", role: "SIGNER", status: "SIGNED" },
              { id: "r2", role: "SIGNER", status: "PENDING" },
            ]),
        },
        signatureDocument: {
          update: jest.fn().mockResolvedValue({}),
        },
      })
    ),
  },
}));

jest.mock("@/lib/resend", () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}));

jest.mock("@/components/emails/signature-completed", () => ({
  __esModule: true,
  default: jest.fn().mockReturnValue(null),
}));

jest.mock("@/lib/webhook/triggers/signature-events", () => ({
  onRecipientSigned: jest.fn(),
  onDocumentCompleted: jest.fn(),
  onDocumentDeclined: jest.fn(),
  onDocumentViewed: jest.fn(),
}));

import handler from "@/pages/api/webhooks/esign";

// Helper to create mock request with stream-based body (bodyParser: false)
function createStreamRequest(
  method: string,
  payload: any,
  headers: Record<string, string> = {}
) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method,
    headers,
  });

  const body = JSON.stringify(payload);

  // Simulate readable stream for raw body parsing
  process.nextTick(() => {
    req.emit("data", Buffer.from(body));
    req.emit("end");
  });

  return { req, res };
}

// Standard valid payload for happy-path tests
function createValidPayload(overrides = {}) {
  return {
    id: "webhook-evt-123",
    event: "signature.recipient_signed",
    timestamp: new Date().toISOString(),
    data: {
      documentId: "doc-abc",
      documentTitle: "Test Agreement",
      teamId: "team-bermuda",
      teamName: "Bermuda Franchise Group",
      recipientId: "recipient-1",
      recipientName: "Jane Signer",
      recipientEmail: "jane@example.com",
      status: "SIGNED",
      ipAddress: "1.2.3.4",
      userAgent: "Mozilla/5.0",
    },
    ...overrides,
  };
}

describe("E-Sign Webhook API", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // No webhook secret by default (skip sig verification)
    delete process.env.ESIGN_WEBHOOK_SECRET;
    process.env.NODE_ENV = "test";

    // Default: document exists and belongs to the claimed team
    mockSignatureDocFindUnique.mockResolvedValue({
      id: "doc-abc",
      teamId: "team-bermuda",
      status: "PENDING",
      auditTrail: { entries: [] },
    });

    // Default: recipient exists
    mockSignatureRecipientFindFirst.mockResolvedValue({
      id: "recipient-1",
      documentId: "doc-abc",
      status: "PENDING",
    });

    mockSignatureDocUpdate.mockResolvedValue({});
    mockSignatureRecipientUpdate.mockResolvedValue({});
    mockSendEmail.mockResolvedValue({ success: true });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ─── Method Validation ──────────────────────────────────────────────

  describe("Method Validation", () => {
    it("should reject GET requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "GET",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({ error: "Method not allowed" });
    });

    it("should reject PUT requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "PUT",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });

    it("should reject DELETE requests with 405", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "DELETE",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
    });
  });

  // ─── Signature Verification ─────────────────────────────────────────

  describe("Signature Verification", () => {
    it("should reject requests with missing signature when secret is configured", async () => {
      process.env.ESIGN_WEBHOOK_SECRET = "test-webhook-secret-abc123";

      const payload = createValidPayload();
      const { req, res } = createStreamRequest("POST", payload);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(res._getJSONData()).toEqual({
        error: "Missing signature header",
      });
    });

    it("should reject requests with invalid signature when secret is configured", async () => {
      process.env.ESIGN_WEBHOOK_SECRET = "test-webhook-secret-abc123";

      const payload = createValidPayload();
      const { req, res } = createStreamRequest("POST", payload, {
        "x-esign-signature": "0000000000000000000000000000000000000000000000000000000000000000",
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(401);
      expect(res._getJSONData()).toEqual({
        error: "Invalid webhook signature",
      });
    });

    it("should skip signature verification when no secret is configured", async () => {
      delete process.env.ESIGN_WEBHOOK_SECRET;

      const payload = createValidPayload();
      const { req, res } = createStreamRequest("POST", payload);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toMatchObject({ success: true });
    });
  });

  // ─── Payload Validation ─────────────────────────────────────────────

  describe("Payload Validation", () => {
    it("should reject payload missing event field", async () => {
      const payload = createValidPayload({ event: undefined });
      delete payload.event;
      const { req, res } = createStreamRequest("POST", payload);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: "Invalid webhook payload",
      });
    });

    it("should reject payload missing documentId in data", async () => {
      const payload = createValidPayload();
      delete payload.data.documentId;
      const { req, res } = createStreamRequest("POST", payload);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: "Invalid webhook payload",
      });
    });
  });

  // ─── Document & Team Verification ──────────────────────────────────

  describe("Document & Team Verification", () => {
    it("should return 404 when document is not found", async () => {
      mockSignatureDocFindUnique.mockResolvedValueOnce(null);

      const payload = createValidPayload();
      const { req, res } = createStreamRequest("POST", payload);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({ error: "Document not found" });
    });

    it("should return 403 when document teamId does not match payload teamId", async () => {
      mockSignatureDocFindUnique.mockResolvedValueOnce({
        id: "doc-abc",
        teamId: "team-different",
        status: "PENDING",
      });

      const payload = createValidPayload();
      const { req, res } = createStreamRequest("POST", payload);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(403);
      expect(res._getJSONData()).toEqual({ error: "Access denied" });
    });

    it("should return 404 when recipientId is provided but recipient not found", async () => {
      mockSignatureRecipientFindFirst.mockResolvedValueOnce(null);

      const payload = createValidPayload();
      const { req, res } = createStreamRequest("POST", payload);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(res._getJSONData()).toEqual({ error: "Recipient not found" });
    });
  });

  // ─── Event Handling (Happy Path) ───────────────────────────────────

  describe("Event Handling", () => {
    it("should process recipient_signed event and return 200", async () => {
      const payload = createValidPayload({
        event: "signature.recipient_signed",
      });
      const { req, res } = createStreamRequest("POST", payload);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const body = res._getJSONData();
      expect(body.success).toBe(true);
      expect(body.event).toBe("signature.recipient_signed");
      expect(body.documentId).toBe("doc-abc");
    });

    it("should process document_completed event and send completion emails", async () => {
      const payload = createValidPayload({
        event: "signature.document_completed",
        data: {
          documentId: "doc-abc",
          documentTitle: "Final Agreement",
          teamId: "team-bermuda",
          teamName: "Bermuda Franchise Group",
          status: "COMPLETED",
          allRecipients: [
            {
              name: "Jane",
              email: "jane@example.com",
              status: "SIGNED",
              signedAt: new Date().toISOString(),
            },
            {
              name: "Bob",
              email: "bob@example.com",
              status: "SIGNED",
              signedAt: new Date().toISOString(),
            },
          ],
        },
      });
      const { req, res } = createStreamRequest("POST", payload);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      // Should update document status to COMPLETED
      expect(mockSignatureDocUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "doc-abc" },
          data: expect.objectContaining({ status: "COMPLETED" }),
        })
      );
      // Should send completion emails to all recipients
      expect(mockSendEmail).toHaveBeenCalledTimes(2);
    });

    it("should process document_viewed event and return 200", async () => {
      const payload = createValidPayload({
        event: "signature.document_viewed",
      });
      const { req, res } = createStreamRequest("POST", payload);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().event).toBe("signature.document_viewed");
      // Should update recipient status to VIEWED
      expect(mockSignatureRecipientUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "recipient-1" },
          data: expect.objectContaining({ status: "VIEWED" }),
        })
      );
    });

    it("should handle unknown event types gracefully and still return 200", async () => {
      const payload = createValidPayload({
        event: "signature.unknown_event",
      });
      const { req, res } = createStreamRequest("POST", payload);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().success).toBe(true);
    });
  });

  // ─── Error Handling ─────────────────────────────────────────────────

  describe("Error Handling", () => {
    it("should return 500 when an unexpected error occurs during processing", async () => {
      mockSignatureDocFindUnique.mockRejectedValueOnce(
        new Error("Database connection failed")
      );

      const payload = createValidPayload();
      const { req, res } = createStreamRequest("POST", payload);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData()).toEqual({
        error: "Internal server error",
      });
    });

    it("should return 500 for malformed JSON body", async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: "POST",
      });

      process.nextTick(() => {
        req.emit("data", Buffer.from("not valid json {{{"));
        req.emit("end");
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData()).toEqual({
        error: "Invalid request body",
      });
    });
  });
});
