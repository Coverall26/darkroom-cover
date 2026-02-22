/**
 * Tests for PATCH /api/investor-profile/[profileId]
 *
 * Prompt 9: Investor Entity Architecture — API persistence for all 5 entity types
 * with AES-256 encryption for tax IDs and post-approval change detection.
 */

import { createMocks } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import handler from "@/pages/api/investor-profile/[profileId]";
import { logAuditEvent } from "@/lib/audit/audit-logger";
import { encryptTaxId } from "@/lib/crypto/secure-storage";

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/error", () => ({
  reportError: jest.fn(),
}));

jest.mock("@/lib/crypto/secure-storage", () => ({
  encryptTaxId: jest.fn((val: string) => `encrypted:${val}`),
}));

const mockSession = {
  user: { id: "user-1", email: "investor@example.com", name: "John Smith" },
  expires: "2099-01-01",
};

const mockInvestor = {
  id: "inv-1",
  userId: "user-1",
  entityType: "INDIVIDUAL",
  entityName: null,
  entityData: null,
  taxId: null,
  phone: null,
  addressLine1: null,
  city: null,
  state: null,
  postalCode: null,
  country: "US",
  fundData: { stage: "APPLIED" },
  user: { email: "investor@example.com", id: "user-1" },
  investments: [{ fundId: "fund-1" }],
};

function createReq(
  body: Record<string, unknown> = {},
  query: Record<string, string> = {},
) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "PATCH",
    body,
    query: { profileId: "inv-1", ...query },
  });
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getServerSession as jest.Mock).mockResolvedValue(mockSession);
  (prisma.investor.findUnique as jest.Mock).mockResolvedValue(mockInvestor);
  (prisma.investor.update as jest.Mock).mockResolvedValue({
    ...mockInvestor,
    entityType: "INDIVIDUAL",
    entityName: "John Smith",
  });
});

describe("PATCH /api/investor-profile/[profileId]", () => {
  it("rejects non-PATCH methods", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { profileId: "inv-1" },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it("requires authentication", async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq({ entityType: "INDIVIDUAL" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it("returns 404 for non-existent profile", async () => {
    (prisma.investor.findUnique as jest.Mock).mockResolvedValue(null);
    const { req, res } = createReq({ entityType: "INDIVIDUAL" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(404);
  });

  it("returns 403 when profile belongs to different user", async () => {
    (prisma.investor.findUnique as jest.Mock).mockResolvedValue({
      ...mockInvestor,
      user: { email: "other@example.com", id: "user-2" },
    });
    const { req, res } = createReq({ entityType: "INDIVIDUAL" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  it("validates entity data with zod", async () => {
    const { req, res } = createReq({ invalid: "data" });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toBe("Invalid entity data");
  });

  it("persists INDIVIDUAL entity data", async () => {
    const { req, res } = createReq({
      entityType: "INDIVIDUAL",
      firstName: "John",
      lastName: "Smith",
      ssn: "123456789",
      dateOfBirth: "1990-01-15",
      phone: "555-123-4567",
      address: {
        street1: "123 Main St",
        city: "New York",
        state: "NY",
        zip: "10001",
        country: "US",
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(prisma.investor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1" },
        data: expect.objectContaining({
          entityType: "INDIVIDUAL",
          entityName: "John Smith",
          taxId: "encrypted:123456789",
          addressLine1: "123 Main St",
          city: "New York",
          state: "NY",
          postalCode: "10001",
          country: "US",
        }),
      }),
    );
  });

  it("encrypts SSN for Individual with encryptTaxId", async () => {
    const { req, res } = createReq({
      entityType: "INDIVIDUAL",
      firstName: "John",
      lastName: "Smith",
      ssn: "123456789",
      address: {
        street1: "123 Main St",
        city: "NY",
        state: "NY",
        zip: "10001",
        country: "US",
      },
    });
    await handler(req, res);
    expect(encryptTaxId).toHaveBeenCalledWith("123456789");
  });

  it("persists LLC entity data with signer info", async () => {
    const { req, res } = createReq({
      entityType: "LLC",
      legalName: "Smith Holdings LLC",
      ein: "123456789",
      stateOfFormation: "DE",
      taxClassification: "PARTNERSHIP",
      signatoryName: "John Smith",
      signatoryTitle: "Managing Member",
      signatoryEmail: "john@smith.com",
      signatoryPhone: "555-111-2222",
      signatoryIsAccountHolder: true,
      address: {
        street1: "100 Business Ave",
        city: "San Francisco",
        state: "CA",
        zip: "94105",
        country: "US",
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(prisma.investor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "LLC",
          entityName: "Smith Holdings LLC",
          taxId: "encrypted:123456789",
          stateOfFormation: "DE",
          taxClassification: "PARTNERSHIP",
          authorizedSignatory: "John Smith",
          signatoryTitle: "Managing Member",
          entityData: expect.objectContaining({
            signatoryEmail: "john@smith.com",
            signatoryPhone: "555-111-2222",
            signatoryIsAccountHolder: true,
          }),
        }),
      }),
    );
  });

  it("persists TRUST entity data with trustee info", async () => {
    const { req, res } = createReq({
      entityType: "TRUST",
      legalName: "Smith Family Trust",
      trustType: "IRREVOCABLE",
      taxId: "987654321",
      dateEstablished: "2015-01-01",
      governingState: "IL",
      trusteeName: "Jane Smith",
      trusteeTitle: "Trustee",
      trusteeEmail: "jane@smith.com",
      trusteePhone: "555-333-4444",
      address: {
        street1: "200 Trust Lane",
        city: "Chicago",
        state: "IL",
        zip: "60601",
        country: "US",
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(prisma.investor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "TRUST",
          entityName: "Smith Family Trust",
          taxId: "encrypted:987654321",
          trustType: "IRREVOCABLE",
          trusteeName: "Jane Smith",
          entityData: expect.objectContaining({
            trusteeTitle: "Trustee",
            trusteeEmail: "jane@smith.com",
            trusteePhone: "555-333-4444",
          }),
        }),
      }),
    );
  });

  it("persists RETIREMENT entity data with custodian info", async () => {
    const { req, res } = createReq({
      entityType: "RETIREMENT",
      accountType: "TRADITIONAL_IRA",
      accountTitle: "FBO John Smith",
      custodianName: "Fidelity",
      custodianAccountNumber: "ACCT-12345",
      custodianEin: "111222333",
      custodianCoSignRequired: true,
      accountHolderName: "John Smith",
      accountHolderSsn: "123456789",
      accountHolderDob: "1965-03-15",
      accountHolderEmail: "john@example.com",
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(prisma.investor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "RETIREMENT",
          accountType: "TRADITIONAL_IRA",
          accountTitle: "FBO John Smith",
          entityName: "FBO John Smith",
          custodianName: "Fidelity",
          custodianAccount: "ACCT-12345",
          custodianEin: "encrypted:111222333",
          custodianCoSignRequired: true,
          taxId: "encrypted:123456789",
          entityData: expect.objectContaining({
            accountHolderName: "John Smith",
            accountHolderDob: "1965-03-15",
            accountHolderEmail: "john@example.com",
          }),
        }),
      }),
    );
  });

  it("persists OTHER entity data", async () => {
    const { req, res } = createReq({
      entityType: "OTHER",
      legalName: "Smith Capital Partners LP",
      otherEntityType: "LIMITED_PARTNERSHIP",
      ein: "987654321",
      stateOfFormation: "TX",
      countryOfFormation: "US",
      taxClassification: "PARTNERSHIP",
      signatoryName: "Robert Smith",
      signatoryTitle: "General Partner",
      signatoryEmail: "robert@smithcapital.com",
      address: {
        street1: "300 Finance Way",
        city: "Houston",
        state: "TX",
        zip: "77002",
        country: "US",
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(prisma.investor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "OTHER",
          entityName: "Smith Capital Partners LP",
          otherEntityType: "LIMITED_PARTNERSHIP",
          taxId: "encrypted:987654321",
          stateOfFormation: "TX",
          authorizedSignatory: "Robert Smith",
          signatoryTitle: "General Partner",
        }),
      }),
    );
  });

  it("creates audit log on successful update", async () => {
    const { req, res } = createReq({
      entityType: "INDIVIDUAL",
      firstName: "John",
      lastName: "Smith",
      address: {
        street1: "123 Main St",
        city: "NY",
        state: "NY",
        zip: "10001",
        country: "US",
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "INVESTOR_UPDATED",
        resourceType: "Investor",
        resourceId: "inv-1",
        userId: "user-1",
      }),
    );
  });

  it("creates ProfileChangeRequests for post-approval updates", async () => {
    (prisma.investor.findUnique as jest.Mock).mockResolvedValue({
      ...mockInvestor,
      entityName: "Old Name",
      fundData: { stage: "APPROVED" },
    });
    (prisma.profileChangeRequest.create as jest.Mock).mockResolvedValue({ id: "cr-1" });

    const { req, res } = createReq({
      entityType: "INDIVIDUAL",
      firstName: "New",
      lastName: "Name",
      address: {
        street1: "123 Main St",
        city: "NY",
        state: "NY",
        zip: "10001",
        country: "US",
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.pendingChanges).toBeGreaterThan(0);
    expect(data.message).toBe("Changes submitted for GP review");
    expect(prisma.profileChangeRequest.create).toHaveBeenCalled();
  });

  it("does not create change requests for pre-approval updates", async () => {
    (prisma.investor.findUnique as jest.Mock).mockResolvedValue({
      ...mockInvestor,
      fundData: { stage: "ONBOARDING" },
    });

    const { req, res } = createReq({
      entityType: "INDIVIDUAL",
      firstName: "John",
      lastName: "Smith",
      address: {
        street1: "123 Main St",
        city: "NY",
        state: "NY",
        zip: "10001",
        country: "US",
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(prisma.profileChangeRequest.create).not.toHaveBeenCalled();
  });

  it("returns 500 on database error", async () => {
    (prisma.investor.findUnique as jest.Mock).mockRejectedValue(
      new Error("DB error"),
    );
    const { req, res } = createReq({
      entityType: "INDIVIDUAL",
      firstName: "John",
      lastName: "Smith",
      address: {
        street1: "123 Main St",
        city: "NY",
        state: "NY",
        zip: "10001",
        country: "US",
      },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toBe("Internal server error");
  });
});
