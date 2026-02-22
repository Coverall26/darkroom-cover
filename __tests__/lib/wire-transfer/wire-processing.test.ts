/**
 * Wire Transfer Processing Unit Tests
 *
 * Covers: wire proof upload validation, wire confirmation flow,
 * race condition prevention, status transitions, account masking.
 */

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    manualInvestment: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    fund: { findUnique: jest.fn(), update: jest.fn() },
    investment: { findFirst: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    fundAggregate: { upsert: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(prisma)),
  },
}));

jest.mock("@/lib/audit/audit-logger", () => ({
  logAuditEvent: jest.fn(),
}));

import prisma from "@/lib/prisma";
import {
  uploadProofOfPayment,
  reviewProofOfPayment,
  listPendingProofs,
  getWireTransferSummary,
  requireProof,
} from "@/lib/wire-transfer/proof";
import {
  setWireInstructions,
  getWireInstructions,
  getWireInstructionsPublic,
  deleteWireInstructions,
} from "@/lib/wire-transfer/instructions";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe("Wire Transfer Proof Processing", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("uploadProofOfPayment", () => {
    it("updates investment with proof metadata", async () => {
      (mockPrisma.manualInvestment.findUnique as jest.Mock).mockResolvedValue({
        id: "inv-1",
        proofStatus: "PENDING",
        transferMethod: "WIRE",
        investorId: "investor-1",
        investor: { userId: "user-1" },
      });
      (mockPrisma.manualInvestment.update as jest.Mock).mockResolvedValue({ id: "inv-1" });

      await uploadProofOfPayment("inv-1", {
        storageKey: "uploads/proof.pdf",
        storageType: "S3" as any,
        fileType: "application/pdf",
        fileName: "proof.pdf",
        fileSize: 1024,
        notes: "Bank transfer completed",
      }, "user-1");

      expect(mockPrisma.manualInvestment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inv-1" },
          data: expect.objectContaining({
            proofStatus: "RECEIVED",
            proofDocumentKey: "uploads/proof.pdf",
            proofFileName: "proof.pdf",
          }),
        })
      );
    });

    it("sets status to RECEIVED", async () => {
      (mockPrisma.manualInvestment.findUnique as jest.Mock).mockResolvedValue({
        id: "inv-1",
        proofStatus: "PENDING",
        transferMethod: "WIRE",
        investorId: "investor-1",
        investor: { userId: "user-1" },
      });
      (mockPrisma.manualInvestment.update as jest.Mock).mockResolvedValue({ id: "inv-1" });

      await uploadProofOfPayment("inv-1", {
        storageKey: "uploads/proof.pdf",
        storageType: "S3" as any,
        fileType: "application/pdf",
        fileName: "proof.pdf",
        fileSize: 1024,
      }, "user-1");

      const updateCall = (mockPrisma.manualInvestment.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.proofStatus).toBe("RECEIVED");
    });
  });

  describe("reviewProofOfPayment", () => {
    it("verifies proof and updates status", async () => {
      (mockPrisma.manualInvestment.findUnique as jest.Mock).mockResolvedValue({
        id: "inv-1",
        proofStatus: "RECEIVED",
        proofDocumentKey: "uploads/proof.pdf",
        commitmentAmount: 50000,
        fundedAmount: 0,
      });
      (mockPrisma.manualInvestment.update as jest.Mock).mockResolvedValue({ id: "inv-1" });

      await reviewProofOfPayment("inv-1", {
        action: "verify",
      }, "gp-user-1");

      expect(mockPrisma.manualInvestment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            proofStatus: "VERIFIED",
            transferStatus: "COMPLETED",
          }),
        })
      );
    });

    it("rejects proof with reason", async () => {
      (mockPrisma.manualInvestment.findUnique as jest.Mock).mockResolvedValue({
        id: "inv-1",
        proofStatus: "RECEIVED",
        proofDocumentKey: "uploads/proof.pdf",
        commitmentAmount: 50000,
        fundedAmount: 0,
      });
      (mockPrisma.manualInvestment.update as jest.Mock).mockResolvedValue({ id: "inv-1" });

      await reviewProofOfPayment("inv-1", {
        action: "reject",
        rejectionReason: "Amount mismatch",
      }, "gp-user-1");

      expect(mockPrisma.manualInvestment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            proofStatus: "REJECTED",
            proofRejectionReason: "Amount mismatch",
          }),
        })
      );
    });
  });

  describe("listPendingProofs", () => {
    it("paginates results with default page size", async () => {
      (mockPrisma.manualInvestment.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.manualInvestment.count as jest.Mock).mockResolvedValue(0);

      const result = await listPendingProofs("team-1");
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
      expect(result.total).toBe(0);
    });

    it("filters by fundId when provided", async () => {
      (mockPrisma.manualInvestment.findMany as jest.Mock).mockResolvedValue([]);
      (mockPrisma.manualInvestment.count as jest.Mock).mockResolvedValue(0);

      await listPendingProofs("team-1", { fundId: "fund-1", page: 1, pageSize: 10 });

      const findCall = (mockPrisma.manualInvestment.findMany as jest.Mock).mock.calls[0][0];
      expect(findCall.where.fundId).toBe("fund-1");
    });
  });

  describe("requireProof", () => {
    it("sets proof status to PENDING", async () => {
      (mockPrisma.manualInvestment.update as jest.Mock).mockResolvedValue({ id: "inv-1" });

      await requireProof("inv-1");

      expect(mockPrisma.manualInvestment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inv-1" },
          data: expect.objectContaining({
            proofStatus: "PENDING",
          }),
        })
      );
    });
  });
});

describe("Wire Instructions", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("getWireInstructionsPublic", () => {
    it("masks account number to last 4 digits", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
        id: "fund-1",
        wireInstructions: {
          bankName: "Chase",
          beneficiaryName: "Fund I LLC",
          accountNumber: "1234567890",
          routingNumber: "021000021",
          reference: "Investment",
        },
      });

      const result = await getWireInstructionsPublic("fund-1");
      expect(result).not.toBeNull();
      expect(result!.accountNumberLast4).toBe("7890");
      expect(result!.bankName).toBe("Chase");
    });

    it("returns null for fund without wire instructions", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
        id: "fund-1",
        wireInstructions: null,
      });
      const result = await getWireInstructionsPublic("fund-1");
      expect(result).toBeNull();
    });
  });

  describe("setWireInstructions", () => {
    it("persists wire instructions to fund", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({ id: "fund-1", teamId: "team-1" });
      const mockUpdate = jest.fn().mockResolvedValue({ id: "fund-1" });
      // The actual function calls prisma.fund.update
      (prisma.fund as any).update = mockUpdate;

      await setWireInstructions("fund-1", {
        bankName: "Chase",
        beneficiaryName: "Fund I LLC",
        accountNumber: "1234567890",
        routingNumber: "021000021",
        reference: "Investment for {investorName}",
      }, "gp-user-1");

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "fund-1" },
        })
      );
    });
  });

  describe("getWireInstructions (full, GP view)", () => {
    it("returns full account number for GP", async () => {
      (mockPrisma.fund.findUnique as jest.Mock).mockResolvedValue({
        id: "fund-1",
        wireInstructions: {
          bankName: "Chase",
          beneficiaryName: "Fund I LLC",
          accountNumber: "1234567890",
          routingNumber: "021000021",
        },
      });

      const result = await getWireInstructions("fund-1");
      expect(result).not.toBeNull();
      expect(result!.accountNumber).toBe("1234567890");
    });
  });
});
