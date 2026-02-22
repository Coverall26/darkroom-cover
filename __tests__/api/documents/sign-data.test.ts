/**
 * Tests for GET /api/documents/[docId]/sign-data
 *
 * Prompt 10: E-Signature Flow — returns document + pre-filled field data
 * for the FundRoomSign component.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import handler from "@/pages/api/documents/[docId]/sign-data";

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

const mockSession = {
  user: { id: "user-1", email: "investor@example.com", name: "John Smith" },
  expires: "2099-01-01",
};

const mockField = {
  id: "field-1",
  type: "SIGNATURE",
  pageNumber: 1,
  x: 100,
  y: 500,
  width: 200,
  height: 50,
  required: true,
  label: "Signature",
  placeholder: "Sign here",
  value: null,
  recipientId: "recip-1",
};

const mockDocument = {
  id: "doc-1",
  title: "Subscription Agreement",
  description: "Fund I Subscription Agreement",
  file: "https://storage.example.com/docs/sub-ag.pdf",
  status: "PENDING",
  fundId: "fund-1",
  fields: [mockField],
  recipients: [
    {
      id: "recip-1",
      name: "John Smith",
      email: "investor@example.com",
      status: "PENDING",
      signingToken: "token-abc-123",
    },
  ],
};

const mockInvestor = {
  entityName: "Smith Holdings LLC",
  entityType: "LLC",
  address: "123 Main St, New York, NY 10001",
  user: { name: "John Smith", email: "investor@example.com" },
  investments: [
    {
      commitmentAmount: 250000,
    },
  ],
};

function createReq(query: Record<string, string> = {}) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    query: { docId: "doc-1", ...query },
  });
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  (prisma.signatureDocument.findUnique as jest.Mock).mockResolvedValue(
    mockDocument,
  );
  (prisma.investor.findFirst as jest.Mock).mockResolvedValue(mockInvestor);
});

describe("GET /api/documents/[docId]/sign-data", () => {
  it("rejects non-GET methods", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { docId: "doc-1" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("requires authentication", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("returns 404 for non-existent document", async () => {
    (prisma.signatureDocument.findUnique as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 403 when user is not a recipient", async () => {
    (prisma.signatureDocument.findUnique as jest.Mock).mockResolvedValue({
      ...mockDocument,
      recipients: [],
    });
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  it("returns document data with fields and auto-fill", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const data = JSON.parse(res._getData());
    expect(data.document).toEqual({
      id: "doc-1",
      title: "Subscription Agreement",
      description: "Fund I Subscription Agreement",
      fileUrl: "https://storage.example.com/docs/sub-ag.pdf",
      status: "PENDING",
      fundId: "fund-1",
    });
  });

  it("returns correctly formatted signature fields", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());

    expect(data.fields).toHaveLength(1);
    expect(data.fields[0]).toEqual({
      id: "field-1",
      type: "SIGNATURE",
      pageNumber: 1,
      x: 100,
      y: 500,
      width: 200,
      height: 50,
      required: true,
      label: "Signature",
      placeholder: "Sign here",
      value: null,
      recipientId: "recip-1",
    });
  });

  it("returns recipient info with signing token", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());

    expect(data.recipient).toEqual({
      id: "recip-1",
      name: "John Smith",
      email: "investor@example.com",
      status: "PENDING",
      signingToken: "token-abc-123",
    });
  });

  it("returns auto-fill data from investor profile", async () => {
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());

    expect(data.autoFillData).toEqual(
      expect.objectContaining({
        investorName: "John Smith",
        entityName: "Smith Holdings LLC",
        investmentAmount: 250000,
        email: "investor@example.com",
        address: "123 Main St, New York, NY 10001",
        company: "Smith Holdings LLC",
      }),
    );
    // Extended fields from entity auto-fill
    expect(data.autoFillData.signatoryName).toBeDefined();
    expect(data.autoFillData.entityType).toBeDefined();
    // Merge field data included in response
    expect(data.mergeFields).toBeDefined();
    expect(data.mergeFields.date).toBeDefined();
  });

  it("handles individual investor (no entity name)", async () => {
    (prisma.investor.findFirst as jest.Mock).mockResolvedValue({
      ...mockInvestor,
      entityType: "INDIVIDUAL",
      entityName: null,
    });
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());

    expect(data.autoFillData.entityName).toBeUndefined();
    expect(data.autoFillData.company).toBe("");
  });

  it("handles investor with no investments", async () => {
    (prisma.investor.findFirst as jest.Mock).mockResolvedValue({
      ...mockInvestor,
      investments: [],
    });
    const { req, res } = createReq();
    await handler(req, res);
    const data = JSON.parse(res._getData());

    expect(data.autoFillData.investmentAmount).toBeUndefined();
  });

  it("handles no investor profile found", async () => {
    (prisma.investor.findFirst as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());

    expect(data.autoFillData.investorName).toBe("John Smith");
    expect(data.autoFillData.email).toBe("investor@example.com");
  });

  it("returns 500 on database error", async () => {
    (prisma.signatureDocument.findUnique as jest.Mock).mockRejectedValue(
      new Error("DB error"),
    );
    const { req, res } = createReq();
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe("Internal server error");
  });
});
