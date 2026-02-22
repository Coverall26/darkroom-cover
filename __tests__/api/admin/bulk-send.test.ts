// @ts-nocheck
/**
 * Bulk Send via CSV Upload Tests
 *
 * Tests for pages/api/admin/bulk-send.ts
 *
 * Validates:
 * - CSV template download
 * - Recipient validation (Zod)
 * - Document ownership/status checks
 * - Deduplication by email
 * - Existing recipient skip
 * - SignatureRecipient creation + email send
 * - Document status transition (DRAFT → SENT)
 * - Audit logging
 * - Error handling for individual recipient failures
 */

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    signatureDocument: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    signatureRecipient: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/resend", () => ({
  sendOrgEmail: jest.fn().mockResolvedValue({}),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue({}),
}));

jest.mock("@/lib/utils", () => ({
  nanoid: jest.fn(() => "test-token-123"),
  log: jest.fn(),
}));

jest.mock("@/lib/auth/rbac", () => ({
  requireAdmin: jest.fn(),
  requireAdminAppRouter: jest.fn(),
}));

jest.mock("@/components/emails/signature-request", () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

import { createMocks } from "node-mocks-http";
import { GET, POST } from "@/app/api/admin/bulk-send/route";
import { wrapAppRouteHandler } from "@/__tests__/helpers/app-router-adapter";
import prisma from "@/lib/prisma";
import { requireAdmin, requireAdminAppRouter } from "@/lib/auth/rbac";
import { logAuditEvent } from "@/lib/audit/audit-logger";

const handler = wrapAppRouteHandler({ GET, POST });

const mockRequireAdmin = requireAdmin as jest.MockedFunction<
  typeof requireAdmin
>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const mockDocument = {
  id: "doc-1",
  title: "Sub Agreement",
  teamId: "team-1",
  status: "DRAFT",
  emailSubject: null,
  emailMessage: null,
  team: {
    name: "Acme Capital",
    users: [{ user: { name: "Jane Admin", email: "jane@acme.com" } }],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({
    teamId: "team-1",
    userId: "user-1",
    role: "ADMIN",
  } as any);
  (requireAdminAppRouter as jest.Mock).mockResolvedValue({
    teamId: "team-1",
    userId: "user-1",
    role: "ADMIN",
    email: "admin@fundroom.ai",
  });
  process.env.NEXTAUTH_URL = "https://app.fundroom.ai";
});

describe("GET /api/admin/bulk-send — CSV template", () => {
  it("should return CSV template", async () => {
    const { req, res } = createMocks({ method: "GET" });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getData();
    expect(body).toContain("name,email,signingOrder");
    expect(body).toContain("John Doe,john@example.com,1");
  });
});

describe("POST /api/admin/bulk-send", () => {
  it("should reject invalid body", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: { documentId: "", recipients: [] },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toHaveProperty("error");
  });

  it("should reject invalid email in recipients", async () => {
    const { req, res } = createMocks({
      method: "POST",
      body: {
        documentId: "doc-1",
        recipients: [{ name: "Test", email: "not-an-email" }],
      },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(400);
  });

  it("should return 404 if document not found", async () => {
    (mockPrisma.signatureDocument.findFirst as jest.Mock).mockResolvedValue(
      null,
    );

    const { req, res } = createMocks({
      method: "POST",
      body: {
        documentId: "doc-1",
        recipients: [{ name: "Test", email: "test@example.com" }],
      },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(404);
  });

  it("should create recipients and send emails", async () => {
    (mockPrisma.signatureDocument.findFirst as jest.Mock).mockResolvedValue(
      mockDocument,
    );
    (mockPrisma.signatureRecipient.findFirst as jest.Mock).mockResolvedValue(
      null,
    );
    (mockPrisma.signatureRecipient.create as jest.Mock).mockResolvedValue({
      id: "recip-new",
    });
    (mockPrisma.signatureDocument.update as jest.Mock).mockResolvedValue({});

    const { req, res } = createMocks({
      method: "POST",
      body: {
        documentId: "doc-1",
        recipients: [
          { name: "Alice", email: "alice@example.com" },
          { name: "Bob", email: "bob@example.com", signingOrder: 2 },
        ],
      },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.succeeded).toBe(2);
    expect(data.failed).toBe(0);
    expect(data.total).toBe(2);
    expect(mockPrisma.signatureRecipient.create).toHaveBeenCalledTimes(2);
  });

  it("should deduplicate by email (last wins)", async () => {
    (mockPrisma.signatureDocument.findFirst as jest.Mock).mockResolvedValue(
      mockDocument,
    );
    (mockPrisma.signatureRecipient.findFirst as jest.Mock).mockResolvedValue(
      null,
    );
    (mockPrisma.signatureRecipient.create as jest.Mock).mockResolvedValue({
      id: "recip-new",
    });
    (mockPrisma.signatureDocument.update as jest.Mock).mockResolvedValue({});

    const { req, res } = createMocks({
      method: "POST",
      body: {
        documentId: "doc-1",
        recipients: [
          { name: "Alice V1", email: "alice@example.com" },
          { name: "Alice V2", email: "alice@example.com" },
        ],
      },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.total).toBe(1); // Deduplicated
    expect(mockPrisma.signatureRecipient.create).toHaveBeenCalledTimes(1);
  });

  it("should skip existing recipients on the document", async () => {
    (mockPrisma.signatureDocument.findFirst as jest.Mock).mockResolvedValue(
      mockDocument,
    );
    (mockPrisma.signatureRecipient.findFirst as jest.Mock).mockResolvedValue({
      id: "existing-recip",
    });
    (mockPrisma.signatureDocument.update as jest.Mock).mockResolvedValue({});

    const { req, res } = createMocks({
      method: "POST",
      body: {
        documentId: "doc-1",
        recipients: [{ name: "Existing", email: "existing@example.com" }],
      },
    });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.succeeded).toBe(1);
    expect(data.results[0].error).toBe("Already exists on document");
    expect(mockPrisma.signatureRecipient.create).not.toHaveBeenCalled();
  });

  it("should transition DRAFT document to SENT", async () => {
    (mockPrisma.signatureDocument.findFirst as jest.Mock).mockResolvedValue(
      mockDocument,
    );
    (mockPrisma.signatureRecipient.findFirst as jest.Mock).mockResolvedValue(
      null,
    );
    (mockPrisma.signatureRecipient.create as jest.Mock).mockResolvedValue({
      id: "recip-new",
    });
    (mockPrisma.signatureDocument.update as jest.Mock).mockResolvedValue({});

    const { req, res } = createMocks({
      method: "POST",
      body: {
        documentId: "doc-1",
        recipients: [{ name: "Test", email: "test@example.com" }],
      },
    });
    await handler(req as any, res as any);

    expect(mockPrisma.signatureDocument.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: {
        status: "SENT",
        sentAt: expect.any(Date),
      },
    });
  });

  it("should fire audit log event", async () => {
    (mockPrisma.signatureDocument.findFirst as jest.Mock).mockResolvedValue(
      mockDocument,
    );
    (mockPrisma.signatureRecipient.findFirst as jest.Mock).mockResolvedValue(
      null,
    );
    (mockPrisma.signatureRecipient.create as jest.Mock).mockResolvedValue({
      id: "recip-new",
    });
    (mockPrisma.signatureDocument.update as jest.Mock).mockResolvedValue({});

    const { req, res } = createMocks({
      method: "POST",
      body: {
        documentId: "doc-1",
        recipients: [{ name: "Test", email: "test@example.com" }],
      },
    });
    await handler(req as any, res as any);

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "BULK_SEND",
        resourceType: "SignatureDocument",
        resourceId: "doc-1",
      }),
    );
  });

  it("should reject method other than GET/POST", async () => {
    const { req, res } = createMocks({ method: "DELETE" });
    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(405);
  });
});
