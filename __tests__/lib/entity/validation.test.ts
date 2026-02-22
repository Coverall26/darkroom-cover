/**
 * Entity Validation Tests
 *
 * Unit tests for entity type validation, PO Box detection,
 * SSN/EIN format validation, and compliance checks.
 */

import {
  validateEntityOnboarding,
  validateEntityCompliance,
  validateNotPOBox,
  validateSSN,
  validateEIN,
  validatePhone,
  validateZip,
  maskTaxId,
  getTaxIdLabel,
} from "@/lib/entity/validation";
import type { MailingAddress } from "@/lib/entity/types";

describe("Entity Validation", () => {
  describe("PO Box Detection", () => {
    const validAddresses: MailingAddress[] = [
      { street1: "123 Main Street", city: "Miami", state: "FL", zip: "33101", country: "US" },
      { street1: "456 Box Canyon Road", city: "Denver", state: "CO", zip: "80201", country: "US" },
      { street1: "789 Boxer Lane", city: "Austin", state: "TX", zip: "73301", country: "US" },
    ];

    const poBoxAddresses: MailingAddress[] = [
      { street1: "PO Box 123", city: "Miami", state: "FL", zip: "33101", country: "US" },
      { street1: "P.O. Box 456", city: "Miami", state: "FL", zip: "33101", country: "US" },
      { street1: "Post Office Box 789", city: "Miami", state: "FL", zip: "33101", country: "US" },
      { street1: "Box 100", city: "Miami", state: "FL", zip: "33101", country: "US" },
      { street1: "po box 999", city: "Miami", state: "FL", zip: "33101", country: "US" },
    ];

    it("should accept valid street addresses", () => {
      for (const addr of validAddresses) {
        const errors = validateNotPOBox(addr);
        expect(errors).toHaveLength(0);
      }
    });

    it("should reject PO Box addresses", () => {
      for (const addr of poBoxAddresses) {
        const errors = validateNotPOBox(addr);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].field).toBe("mailingAddress.street1");
      }
    });

    it("should detect PO Box in street2", () => {
      const addr: MailingAddress = {
        street1: "123 Main Street",
        street2: "PO Box 456",
        city: "Miami",
        state: "FL",
        zip: "33101",
        country: "US",
      };
      const errors = validateNotPOBox(addr);
      expect(errors.length).toBe(1);
      expect(errors[0].field).toBe("mailingAddress.street2");
    });
  });

  describe("SSN Validation", () => {
    it("should accept valid SSN formats", () => {
      expect(validateSSN("123-45-6789")).toBe(true);
      expect(validateSSN("123456789")).toBe(true);
      expect(validateSSN("123 45 6789")).toBe(true);
    });

    it("should reject invalid SSN formats", () => {
      expect(validateSSN("12345")).toBe(false);
      expect(validateSSN("abc-de-fghi")).toBe(false);
      expect(validateSSN("")).toBe(false);
      expect(validateSSN("1234567890")).toBe(false); // 10 digits
    });
  });

  describe("EIN Validation", () => {
    it("should accept valid EIN formats", () => {
      expect(validateEIN("12-3456789")).toBe(true);
      expect(validateEIN("123456789")).toBe(true);
    });

    it("should reject invalid EIN formats", () => {
      expect(validateEIN("12345")).toBe(false);
      expect(validateEIN("ab-cdefghi")).toBe(false);
    });
  });

  describe("Phone Validation", () => {
    it("should accept valid phone formats", () => {
      expect(validatePhone("(555) 123-4567")).toBe(true);
      expect(validatePhone("555-123-4567")).toBe(true);
      expect(validatePhone("5551234567")).toBe(true);
      expect(validatePhone("+1 555 123 4567")).toBe(true);
      expect(validatePhone("1.555.123.4567")).toBe(true);
    });

    it("should reject invalid phone formats", () => {
      expect(validatePhone("555-1234")).toBe(false);
      expect(validatePhone("12345")).toBe(false);
    });
  });

  describe("ZIP Validation", () => {
    it("should accept valid ZIP codes", () => {
      expect(validateZip("12345")).toBe(true);
      expect(validateZip("12345-6789")).toBe(true);
    });

    it("should reject invalid ZIP codes", () => {
      expect(validateZip("1234")).toBe(false);
      expect(validateZip("123456")).toBe(false);
      expect(validateZip("abcde")).toBe(false);
    });
  });

  describe("Onboarding Validation", () => {
    it("should pass for individual with name", () => {
      const result = validateEntityOnboarding({
        entityType: "INDIVIDUAL",
        legalName: "John Smith",
      });
      expect(result.valid).toBe(true);
    });

    it("should fail for individual without name", () => {
      const result = validateEntityOnboarding({
        entityType: "INDIVIDUAL",
        legalName: "",
      });
      expect(result.valid).toBe(false);
    });

    it("should pass for LLC with name", () => {
      const result = validateEntityOnboarding({
        entityType: "LLC",
        legalName: "Smith Holdings LLC",
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("Compliance Validation", () => {
    it("should require full fields for individual compliance", () => {
      const result = validateEntityCompliance({
        entityType: "INDIVIDUAL",
        legalName: "John Smith",
        // Missing taxId and mailingAddress
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "taxId")).toBe(true);
      expect(result.errors.some((e) => e.field === "mailingAddress")).toBe(true);
    });

    it("should pass full individual compliance", () => {
      const result = validateEntityCompliance({
        entityType: "INDIVIDUAL",
        legalName: "John Smith",
        taxId: "123-45-6789",
        mailingAddress: {
          street1: "123 Main Street",
          city: "Miami",
          state: "FL",
          zip: "33101",
          country: "US",
        },
      });
      expect(result.valid).toBe(true);
    });

    it("should require LLC-specific fields", () => {
      const result = validateEntityCompliance({
        entityType: "LLC",
        legalName: "Smith Holdings LLC",
        // Missing ein, authorizedSignatory, stateOfFormation, mailingAddress
      });
      expect(result.valid).toBe(false);
    });

    it("should validate SSN format on individual compliance", () => {
      const result = validateEntityCompliance({
        entityType: "INDIVIDUAL",
        legalName: "John Smith",
        taxId: "invalid-ssn",
        mailingAddress: {
          street1: "123 Main",
          city: "Miami",
          state: "FL",
          zip: "33101",
          country: "US",
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "taxId")).toBe(true);
    });
  });

  describe("Tax ID Masking", () => {
    it("should mask SSN correctly", () => {
      expect(maskTaxId("123-45-6789", "INDIVIDUAL")).toBe("***-**-6789");
    });

    it("should mask EIN correctly", () => {
      expect(maskTaxId("12-3456789", "LLC")).toBe("**-***6789");
    });

    it("should handle short inputs", () => {
      expect(maskTaxId("12", "INDIVIDUAL")).toBe("****");
    });
  });

  describe("Tax ID Label", () => {
    it("should return SSN for individual", () => {
      expect(getTaxIdLabel("INDIVIDUAL")).toBe("SSN");
    });

    it("should return EIN for entities", () => {
      expect(getTaxIdLabel("LLC")).toBe("EIN");
      expect(getTaxIdLabel("TRUST")).toBe("EIN");
      expect(getTaxIdLabel("RETIREMENT")).toBe("EIN");
      expect(getTaxIdLabel("OTHER")).toBe("EIN");
    });
  });
});
