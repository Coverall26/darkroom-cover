/**
 * Encryption Roundtrip & Masking Unit Tests
 *
 * Covers: AES-256 encrypt/decrypt roundtrip, SSN/EIN masking,
 * tax ID encryption/decryption, key derivation verification.
 */

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }), findUnique: jest.fn() },
  },
}));

import {
  encryptServerSide,
  decryptServerSide,
  encryptToString,
  decryptFromString,
  encryptTaxId,
  decryptTaxId,
  isEncryptedTaxId,
  generateSecureToken,
  computeDocumentChecksum,
  verifyDocumentChecksum,
  createDocumentIntegrityRecord,
  verifyDocumentIntegrity,
} from "@/lib/crypto/secure-storage";

import {
  maskTaxId,
  validateSSN,
  validateEIN,
  getTaxIdLabel,
} from "@/lib/entity/validation";

describe("AES-256 Encrypt/Decrypt Roundtrip", () => {
  it("encrypts and decrypts string data correctly", () => {
    const original = "Sensitive investor data: SSN 123-45-6789";
    const encrypted = encryptToString(original);
    expect(encrypted).not.toBe(original);

    const decrypted = decryptFromString(encrypted);
    expect(decrypted).toBe(original);
  });

  it("encrypts and decrypts Buffer data correctly", () => {
    const original = Buffer.from("Binary document content", "utf-8");
    const encrypted = encryptServerSide(original);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    expect(encrypted.version).toBeDefined();

    const decrypted = decryptServerSide(encrypted);
    expect(decrypted.toString("utf-8")).toBe("Binary document content");
  });

  it("produces different ciphertext for same input (random IV)", () => {
    const data = "Same input data";
    const enc1 = encryptServerSide(data);
    const enc2 = encryptServerSide(data);

    // Different IVs mean different ciphertext
    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);

    // But both decrypt to the same value
    expect(decryptServerSide(enc1).toString("utf-8")).toBe(data);
    expect(decryptServerSide(enc2).toString("utf-8")).toBe(data);
  });

  it("fails decryption with tampered ciphertext", () => {
    const encrypted = encryptServerSide("Original data");
    const tampered = { ...encrypted, ciphertext: "tampered" + encrypted.ciphertext };

    expect(() => decryptServerSide(tampered)).toThrow();
  });

  it("fails decryption with tampered auth tag", () => {
    const encrypted = encryptServerSide("Original data");
    const tampered = { ...encrypted, authTag: "0000000000000000" };

    expect(() => decryptServerSide(tampered)).toThrow();
  });

  it("handles empty string encryption/decryption", () => {
    const encrypted = encryptToString("");
    const decrypted = decryptFromString(encrypted);
    expect(decrypted).toBe("");
  });

  it("handles Unicode content", () => {
    const unicode = "投资者信息 — données d'investisseur — 投資家情報 🔐";
    const encrypted = encryptToString(unicode);
    const decrypted = decryptFromString(encrypted);
    expect(decrypted).toBe(unicode);
  });
});

describe("Tax ID Encryption", () => {
  it("encrypts a tax ID", () => {
    const taxId = "123-45-6789";
    const encrypted = encryptTaxId(taxId);
    expect(encrypted).not.toBe(taxId);

    // Should be valid JSON with required fields
    const parsed = JSON.parse(encrypted);
    expect(parsed.ciphertext).toBeDefined();
    expect(parsed.iv).toBeDefined();
    expect(parsed.authTag).toBeDefined();
  });

  it("decrypts a tax ID back to original", () => {
    const taxId = "123-45-6789";
    const encrypted = encryptTaxId(taxId);
    const decrypted = decryptTaxId(encrypted);
    expect(decrypted).toBe(taxId);
  });

  it("is idempotent — does not double-encrypt", () => {
    const taxId = "12-3456789";
    const encrypted1 = encryptTaxId(taxId);
    const encrypted2 = encryptTaxId(encrypted1); // Should detect already encrypted

    expect(decryptTaxId(encrypted1)).toBe(taxId);
    expect(decryptTaxId(encrypted2)).toBe(taxId);
  });

  it("returns original value for non-encrypted input", () => {
    // Non-JSON strings are detected as not encrypted, returned as-is
    const result = decryptTaxId("not-valid-encrypted-data");
    expect(result).toBe("not-valid-encrypted-data");
  });

  it("returns masked value when decryption fails on valid-looking encrypted data", () => {
    // Craft a value that looks encrypted (valid JSON with required fields) but can't decrypt
    const fakeEncrypted = JSON.stringify({
      ciphertext: "bad",
      iv: "bad",
      authTag: "bad",
      version: 1,
    });
    const result = decryptTaxId(fakeEncrypted);
    expect(result).toBe("***-**-****");
  });

  it("detects encrypted values correctly", () => {
    const taxId = "123-45-6789";
    const encrypted = encryptTaxId(taxId);

    expect(isEncryptedTaxId(taxId)).toBe(false);
    expect(isEncryptedTaxId(encrypted)).toBe(true);
    expect(isEncryptedTaxId("random-string")).toBe(false);
    expect(isEncryptedTaxId("")).toBe(false);
  });
});

describe("SSN/EIN Masking", () => {
  describe("maskTaxId", () => {
    it("masks SSN showing last 4 digits", () => {
      expect(maskTaxId("123-45-6789", "INDIVIDUAL")).toBe("***-**-6789");
    });

    it("masks SSN without dashes", () => {
      expect(maskTaxId("123456789", "INDIVIDUAL")).toBe("***-**-6789");
    });

    it("masks EIN showing last 4 digits", () => {
      expect(maskTaxId("12-3456789", "LLC")).toBe("**-***6789");
    });

    it("masks EIN without dashes", () => {
      expect(maskTaxId("123456789", "TRUST")).toBe("**-***6789");
    });

    it("handles short values gracefully", () => {
      expect(maskTaxId("12", "INDIVIDUAL")).toBe("****");
      expect(maskTaxId("", "LLC")).toBe("****");
    });

    it("works for all entity types needing EIN", () => {
      const einEntities: Array<"LLC" | "TRUST" | "RETIREMENT" | "OTHER"> = [
        "LLC", "TRUST", "RETIREMENT", "OTHER",
      ];
      for (const type of einEntities) {
        expect(maskTaxId("12-3456789", type)).toBe("**-***6789");
      }
    });
  });

  describe("getTaxIdLabel", () => {
    it("returns SSN for individual", () => {
      expect(getTaxIdLabel("INDIVIDUAL")).toBe("SSN");
    });

    it("returns EIN for entity types", () => {
      expect(getTaxIdLabel("LLC")).toBe("EIN");
      expect(getTaxIdLabel("TRUST")).toBe("EIN");
      expect(getTaxIdLabel("RETIREMENT")).toBe("EIN");
      expect(getTaxIdLabel("OTHER")).toBe("EIN");
    });
  });
});

describe("SSN/EIN Validation", () => {
  describe("validateSSN", () => {
    it("accepts valid SSN with dashes", () => {
      expect(validateSSN("123-45-6789")).toBe(true);
    });

    it("accepts valid SSN without dashes", () => {
      expect(validateSSN("123456789")).toBe(true);
    });

    it("rejects short SSN", () => {
      expect(validateSSN("12345678")).toBe(false);
    });

    it("rejects SSN with letters", () => {
      expect(validateSSN("123-45-678A")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(validateSSN("")).toBe(false);
    });
  });

  describe("validateEIN", () => {
    it("accepts valid EIN with dash", () => {
      expect(validateEIN("12-3456789")).toBe(true);
    });

    it("accepts valid EIN without dash", () => {
      expect(validateEIN("123456789")).toBe(true);
    });

    it("rejects short EIN", () => {
      expect(validateEIN("12345678")).toBe(false);
    });

    it("rejects EIN with letters", () => {
      expect(validateEIN("12-345678A")).toBe(false);
    });
  });
});

describe("Document Integrity", () => {
  it("creates and verifies integrity record", () => {
    const pdfBytes = Buffer.from("PDF document content");
    const record = createDocumentIntegrityRecord(pdfBytes);

    expect(record.checksum).toBeDefined();
    expect(record.algorithm).toBe("aes-256-gcm");
    expect(record.version).toBeDefined();

    const verified = verifyDocumentIntegrity(pdfBytes, record);
    expect(verified).toBe(true);
  });

  it("detects tampered documents", () => {
    const original = Buffer.from("Original PDF");
    const record = createDocumentIntegrityRecord(original);

    const tampered = Buffer.from("Tampered PDF");
    const verified = verifyDocumentIntegrity(tampered, record);
    expect(verified).toBe(false);
  });

  it("computes consistent checksums", () => {
    const data = Buffer.from("Consistent data");
    const checksum1 = computeDocumentChecksum(data);
    const checksum2 = computeDocumentChecksum(data);
    expect(checksum1).toBe(checksum2);
  });

  it("verifies checksum match", () => {
    const data = Buffer.from("Test data");
    const checksum = computeDocumentChecksum(data);
    expect(verifyDocumentChecksum(data, checksum)).toBe(true);
  });

  it("detects checksum mismatch", () => {
    const data = Buffer.from("Test data");
    // timingSafeEqual throws RangeError when lengths differ
    expect(() => verifyDocumentChecksum(data, "invalid-checksum")).toThrow();
  });
});

describe("Secure Token Generation", () => {
  it("generates tokens of specified length", () => {
    const token = generateSecureToken(32);
    // 32 bytes → 64 hex chars
    expect(token).toHaveLength(64);
  });

  it("generates unique tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateSecureToken());
    }
    expect(tokens.size).toBe(100);
  });

  it("generates hex-encoded tokens", () => {
    const token = generateSecureToken();
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });
});
