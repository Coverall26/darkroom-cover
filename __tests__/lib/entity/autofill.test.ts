/**
 * Entity Auto-Fill Tests
 *
 * Tests for document auto-fill generation from entity data.
 */

import { buildDocumentAutoFill, getSignatoryInfo } from "@/lib/entity/autofill";

describe("Entity Auto-Fill", () => {
  describe("buildDocumentAutoFill", () => {
    it("should return individual auto-fill data", () => {
      const fill = buildDocumentAutoFill(
        {
          entityType: "INDIVIDUAL",
          legalName: "John Smith",
          taxId: "123-45-6789",
          mailingAddress: {
            street1: "123 Main St",
            city: "Miami",
            state: "FL",
            zip: "33101",
            country: "US",
          },
        },
        "John Smith",
      );

      expect(fill.legalName).toBe("John Smith");
      expect(fill.taxIdType).toBe("SSN");
      expect(fill.taxId).toBe("123-45-6789");
      expect(fill.signatoryName).toBe("John Smith");
      expect(fill.signatoryTitle).toBe("");
      expect(fill.entityTypeDescription).toBe("Individual");
      expect(fill.formattedAddress).toContain("123 Main St");
    });

    it("should return LLC auto-fill with signatory", () => {
      const fill = buildDocumentAutoFill({
        entityType: "LLC",
        legalName: "Smith Holdings LLC",
        taxId: "12-3456789",
        authorizedSignatory: "Jane Smith",
        signatoryTitle: "Managing Member",
      } as any);

      expect(fill.legalName).toBe("Smith Holdings LLC");
      expect(fill.taxIdType).toBe("EIN");
      expect(fill.signatoryName).toBe("Jane Smith");
      expect(fill.signatoryTitle).toBe("Managing Member");
      expect(fill.entityTypeDescription).toBe("Limited Liability Company");
    });

    it("should return trust auto-fill with trustee", () => {
      const fill = buildDocumentAutoFill({
        entityType: "TRUST",
        legalName: "Smith Family Trust",
        trusteeName: "Jane Smith",
        trustType: "REVOCABLE",
      } as any);

      expect(fill.signatoryName).toBe("Jane Smith");
      expect(fill.signatoryTitle).toBe("Trustee");
      expect(fill.entityTypeDescription).toBe("REVOCABLE Trust");
    });

    it("should return retirement auto-fill with custodian info", () => {
      const fill = buildDocumentAutoFill({
        entityType: "RETIREMENT",
        legalName: "Smith IRA at Fidelity",
        accountType: "SELF_DIRECTED_IRA",
        accountHolderName: "John Smith",
      } as any);

      expect(fill.signatoryName).toBe("John Smith");
      expect(fill.signatoryTitle).toBe("Account Holder");
      expect(fill.entityTypeDescription).toBe("SELF_DIRECTED_IRA");
    });

    it("should handle missing investor name gracefully", () => {
      const fill = buildDocumentAutoFill({
        entityType: "INDIVIDUAL",
        legalName: "John Smith",
      });

      expect(fill.signatoryName).toBe("John Smith");
    });

    it("should format address without country for US", () => {
      const fill = buildDocumentAutoFill({
        entityType: "INDIVIDUAL",
        legalName: "John",
        mailingAddress: {
          street1: "123 Main",
          city: "Miami",
          state: "FL",
          zip: "33101",
          country: "US",
        },
      });

      expect(fill.formattedAddress).not.toContain("US");
      expect(fill.formattedAddress).toContain("Miami, FL, 33101");
    });

    it("should include country for non-US addresses", () => {
      const fill = buildDocumentAutoFill({
        entityType: "INDIVIDUAL",
        legalName: "John",
        mailingAddress: {
          street1: "10 Downing St",
          city: "London",
          state: "England",
          zip: "SW1A 2AA",
          country: "UK",
        },
      });

      expect(fill.formattedAddress).toContain("UK");
    });
  });

  describe("getSignatoryInfo", () => {
    it("should return correct signatory for LLC", () => {
      const info = getSignatoryInfo(
        {
          entityType: "LLC",
          legalName: "Acme LLC",
          authorizedSignatory: "Bob Jones",
        } as any,
        "Bob Jones",
      );

      expect(info.name).toBe("Bob Jones");
      expect(info.title).toBe("Managing Member");
      expect(info.entityName).toBe("Acme LLC");
    });

    it("should use investor name as fallback", () => {
      const info = getSignatoryInfo(
        { entityType: "INDIVIDUAL", legalName: "" },
        "Fallback Name",
      );

      expect(info.name).toBe("Fallback Name");
    });
  });
});
