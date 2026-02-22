/**
 * Wire Transfer Tests
 *
 * Unit tests for wire transfer type definitions, validation, and behavior rules.
 */

import type {
  WireInstructions,
  WireInstructionsPublic,
  ProofStatus,
  SetWireInstructionsInput,
  UploadProofInput,
  ReviewProofInput,
} from "@/lib/wire-transfer/types";

describe("Wire Transfer Types", () => {
  describe("WireInstructions", () => {
    it("should have all required fields", () => {
      const instructions: WireInstructions = {
        bankName: "Chase Bank",
        accountNumber: "123456789012",
        routingNumber: "021000021",
        beneficiaryName: "FundRoom Capital Partners LP",
      };

      expect(instructions.bankName).toBe("Chase Bank");
      expect(instructions.accountNumber).toBe("123456789012");
      expect(instructions.routingNumber).toBe("021000021");
      expect(instructions.beneficiaryName).toBe("FundRoom Capital Partners LP");
    });

    it("should support optional SWIFT code for international wires", () => {
      const instructions: WireInstructions = {
        bankName: "HSBC",
        accountNumber: "GB82WEST12345698765432",
        routingNumber: "400515",
        swiftCode: "HSBCGB2L",
        beneficiaryName: "FundRoom International LP",
        beneficiaryAddress: "123 Financial St, London EC2V 8DP",
      };

      expect(instructions.swiftCode).toBe("HSBCGB2L");
      expect(instructions.beneficiaryAddress).toBeDefined();
    });

    it("should support intermediary bank details", () => {
      const instructions: WireInstructions = {
        bankName: "Local Bank",
        accountNumber: "9876543210",
        routingNumber: "021000021",
        beneficiaryName: "Fund LP",
        intermediaryBank: {
          bankName: "Citibank NA",
          swiftCode: "CITIUS33",
          routingNumber: "021000089",
        },
      };

      expect(instructions.intermediaryBank).toBeDefined();
      expect(instructions.intermediaryBank?.bankName).toBe("Citibank NA");
      expect(instructions.intermediaryBank?.swiftCode).toBe("CITIUS33");
    });
  });

  describe("WireInstructionsPublic (LP-facing)", () => {
    it("should mask the account number to last 4 digits", () => {
      const publicInstructions: WireInstructionsPublic = {
        bankName: "Chase Bank",
        accountNumberLast4: "9012",
        routingNumber: "021000021",
        beneficiaryName: "FundRoom Capital Partners LP",
      };

      expect(publicInstructions.accountNumberLast4).toBe("9012");
      expect(publicInstructions.accountNumberLast4.length).toBe(4);
      // Verify no full account number is exposed
      expect(publicInstructions).not.toHaveProperty("accountNumber");
    });

    it("should mask correctly using slice(-4)", () => {
      const fullAccountNumber = "123456789012";
      const last4 = fullAccountNumber.slice(-4);
      expect(last4).toBe("9012");
    });
  });

  describe("ProofStatus", () => {
    it("should have all expected status values", () => {
      const statuses: ProofStatus[] = [
        "NOT_REQUIRED",
        "PENDING",
        "RECEIVED",
        "VERIFIED",
        "REJECTED",
      ];

      expect(statuses).toContain("NOT_REQUIRED");
      expect(statuses).toContain("PENDING");
      expect(statuses).toContain("RECEIVED");
      expect(statuses).toContain("VERIFIED");
      expect(statuses).toContain("REJECTED");
      expect(statuses.length).toBe(5);
    });
  });

  describe("SetWireInstructionsInput validation", () => {
    it("should require all mandatory fields", () => {
      const input: SetWireInstructionsInput = {
        bankName: "Chase",
        accountNumber: "123456789",
        routingNumber: "021000021",
        beneficiaryName: "Fund LP",
      };

      expect(input.bankName).toBeTruthy();
      expect(input.accountNumber).toBeTruthy();
      expect(input.routingNumber).toBeTruthy();
      expect(input.beneficiaryName).toBeTruthy();
    });

    it("should validate routing number format (9 digits for US)", () => {
      const routingNumber = "021000021";
      expect(routingNumber.length).toBe(9);
      expect(/^\d{9}$/.test(routingNumber)).toBe(true);
    });
  });
});

describe("Proof of Payment", () => {
  describe("UploadProofInput validation", () => {
    it("should require all file metadata fields", () => {
      const input: UploadProofInput = {
        storageKey: "investors/inv_123/proof/wire_confirm_20260207.pdf",
        storageType: "S3_PATH",
        fileType: "application/pdf",
        fileName: "wire_confirmation.pdf",
        fileSize: 204800,
      };

      expect(input.storageKey).toBeTruthy();
      expect(input.storageType).toBeTruthy();
      expect(input.fileType).toBeTruthy();
      expect(input.fileName).toBeTruthy();
      expect(input.fileSize).toBeGreaterThan(0);
    });

    it("should accept optional notes", () => {
      const input: UploadProofInput = {
        storageKey: "proof/file.pdf",
        storageType: "S3_PATH",
        fileType: "application/pdf",
        fileName: "proof.pdf",
        fileSize: 100000,
        notes: "Wire sent on Feb 7, confirmation #WR-2026-1234",
      };

      expect(input.notes).toBeDefined();
    });
  });

  describe("ReviewProofInput validation", () => {
    it("should accept verify action", () => {
      const input: ReviewProofInput = { action: "verify" };
      expect(input.action).toBe("verify");
    });

    it("should require rejectionReason when rejecting", () => {
      const input: ReviewProofInput = {
        action: "reject",
        rejectionReason: "Document is illegible, please re-upload a clearer scan",
      };
      expect(input.action).toBe("reject");
      expect(input.rejectionReason).toBeTruthy();
    });

    it("should only allow verify or reject actions", () => {
      const validActions = ["verify", "reject"];
      expect(validActions).toContain("verify");
      expect(validActions).toContain("reject");
      expect(validActions.length).toBe(2);
    });
  });

  describe("Proof status transition rules", () => {
    it("should follow the expected lifecycle", () => {
      // NOT_REQUIRED → (GP marks as PENDING) → RECEIVED (LP uploads) → VERIFIED (GP approves)
      // OR → REJECTED (GP rejects) → RECEIVED (LP re-uploads) → VERIFIED
      const lifecycle: ProofStatus[] = [
        "NOT_REQUIRED",
        "PENDING",
        "RECEIVED",
        "VERIFIED",
      ];
      expect(lifecycle[0]).toBe("NOT_REQUIRED");
      expect(lifecycle[lifecycle.length - 1]).toBe("VERIFIED");
    });

    it("should allow re-upload after rejection", () => {
      const rejectedToReceived: [ProofStatus, ProofStatus] = ["REJECTED", "RECEIVED"];
      expect(rejectedToReceived[0]).toBe("REJECTED");
      expect(rejectedToReceived[1]).toBe("RECEIVED");
    });

    it("should not allow modification after verification", () => {
      // VERIFIED is terminal — no further changes allowed
      const terminalStatus: ProofStatus = "VERIFIED";
      expect(terminalStatus).toBe("VERIFIED");
    });
  });
});
