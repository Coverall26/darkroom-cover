/**
 * Tests for Document Template Merge Field Engine
 *
 * Covers: merge field replacement, MergeFieldData building,
 * tax ID masking, and all entity type auto-fill.
 */
import {
  replaceMergeFields,
  buildMergeFieldData,
  MERGE_FIELDS_BY_DOC_TYPE,
  MERGE_FIELD_TAGS,
} from "@/lib/documents/merge-fields";
import { buildDocumentAutoFill } from "@/lib/entity/autofill";
import type { DocumentAutoFill } from "@/lib/entity/autofill";

describe("Document Merge Field Engine", () => {
  describe("replaceMergeFields", () => {
    it("replaces all tags with provided data", () => {
      const template =
        "I, {{investor_name}}, representing {{investor_entity}}, hereby commit {{investment_amount}} to {{fund_name}} managed by {{gp_entity}} on {{date}}.";

      const result = replaceMergeFields(template, {
        investorName: "John Doe",
        investorEntity: "Doe Capital LLC",
        investmentAmount: "$100,000.00",
        fundName: "Bermuda Club Fund I",
        gpEntity: "Bermuda Franchise Group",
        date: "February 18, 2026",
      });

      expect(result).toBe(
        "I, John Doe, representing Doe Capital LLC, hereby commit $100,000.00 to Bermuda Club Fund I managed by Bermuda Franchise Group on February 18, 2026.",
      );
    });

    it("leaves unresolved tags unchanged when data is missing", () => {
      const template = "Fund: {{fund_name}}, Amount: {{investment_amount}}";
      const result = replaceMergeFields(template, { fundName: "Test Fund" });
      expect(result).toBe("Fund: Test Fund, Amount: {{investment_amount}}");
    });

    it("replaces multiple occurrences of the same tag", () => {
      const template = "{{fund_name}} is great. Invest in {{fund_name}} today.";
      const result = replaceMergeFields(template, { fundName: "Alpha Fund" });
      expect(result).toBe("Alpha Fund is great. Invest in Alpha Fund today.");
    });

    it("handles empty string input", () => {
      expect(replaceMergeFields("", { fundName: "Test" })).toBe("");
    });

    it("handles template with no tags", () => {
      const text = "No merge fields here.";
      expect(replaceMergeFields(text, { fundName: "Test" })).toBe(text);
    });

    it("does not replace tags when value is empty string", () => {
      const template = "Name: {{investor_name}}";
      expect(replaceMergeFields(template, { investorName: "" })).toBe("Name: {{investor_name}}");
    });

    it("replaces all supported merge field tags", () => {
      const template = MERGE_FIELD_TAGS.join(" | ");
      const data = {
        investorName: "Alice",
        investorEntity: "Alice LLC",
        investmentAmount: "$50,000.00",
        fundName: "Fund X",
        gpEntity: "GP Corp",
        date: "Jan 1, 2026",
        commitmentUnits: "5",
        signatoryName: "Alice Smith",
        signatoryTitle: "Managing Member",
        address: "123 Main St",
        entityType: "LLC",
        taxId: "***-**-1234",
        email: "alice@example.com",
        wireBank: "First National Bank",
        wireAccount: "1234567890",
        wireRouting: "021000021",
        managementFee: "2.0%",
        carriedInterest: "20%",
        fundTerm: "10 years",
        effectiveDate: "January 1, 2026",
        orgName: "GP Corp LLC",
        orgAddress: "456 Wall St, New York, NY 10005",
        investorAddress: "123 Main St, Suite 100",
      };
      const result = replaceMergeFields(template, data);
      // No {{...}} tags should remain
      expect(result).not.toContain("{{");
    });
  });

  describe("buildMergeFieldData", () => {
    const mockAutoFill: DocumentAutoFill = {
      legalName: "Doe Capital LLC",
      taxId: "123456789",
      taxIdType: "EIN",
      signatoryName: "John Doe",
      signatoryTitle: "Managing Member",
      formattedAddress: "123 Main St\nNew York, NY, 10001",
      entityType: "LLC",
      entityTypeDescription: "Limited Liability Company",
    };

    it("builds complete merge field data with all sources", () => {
      const result = buildMergeFieldData({
        autoFill: mockAutoFill,
        fundName: "Bermuda Club Fund I",
        gpEntity: "Bermuda Franchise Group",
        investmentAmount: 100000,
        unitPrice: 10000,
        email: "john@example.com",
      });

      expect(result.investorName).toBe("John Doe");
      expect(result.investorEntity).toBe("Doe Capital LLC");
      expect(result.investmentAmount).toBe("$100,000.00");
      expect(result.fundName).toBe("Bermuda Club Fund I");
      expect(result.gpEntity).toBe("Bermuda Franchise Group");
      expect(result.date).toBeDefined();
      expect(result.commitmentUnits).toBe("10");
      expect(result.signatoryName).toBe("John Doe");
      expect(result.signatoryTitle).toBe("Managing Member");
      expect(result.address).toContain("123 Main St");
      expect(result.entityType).toBe("Limited Liability Company");
      expect(result.taxId).toBe("**-***6789");
      expect(result.email).toBe("john@example.com");
    });

    it("formats investment amount as currency", () => {
      const result = buildMergeFieldData({ investmentAmount: 250000.5 });
      expect(result.investmentAmount).toBe("$250,000.50");
    });

    it("calculates commitment units from amount and unit price", () => {
      const result = buildMergeFieldData({
        investmentAmount: 90000,
        unitPrice: 9550,
      });
      expect(result.commitmentUnits).toBe("9"); // Math.floor(90000 / 9550) = 9
    });

    it("returns undefined commitmentUnits when unitPrice is 0", () => {
      const result = buildMergeFieldData({
        investmentAmount: 100000,
        unitPrice: 0,
      });
      expect(result.commitmentUnits).toBeUndefined();
    });

    it("returns undefined for missing optional fields", () => {
      const result = buildMergeFieldData({});
      expect(result.investmentAmount).toBeUndefined();
      expect(result.fundName).toBeUndefined();
      expect(result.commitmentUnits).toBeUndefined();
    });

    it("masks SSN as ***-**-XXXX", () => {
      const ssnAutoFill = { ...mockAutoFill, taxId: "123456789", taxIdType: "SSN" as const };
      const result = buildMergeFieldData({ autoFill: ssnAutoFill });
      expect(result.taxId).toBe("***-**-6789");
    });

    it("masks EIN as **-***XXXX", () => {
      const result = buildMergeFieldData({ autoFill: mockAutoFill });
      expect(result.taxId).toBe("**-***6789");
    });
  });

  describe("MERGE_FIELDS_BY_DOC_TYPE", () => {
    it("defines merge fields for all 13 document types", () => {
      const types = Object.keys(MERGE_FIELDS_BY_DOC_TYPE);
      expect(types).toContain("NDA");
      expect(types).toContain("LPA");
      expect(types).toContain("SUBSCRIPTION");
      expect(types).toContain("PPM");
      expect(types).toContain("SAFE");
      expect(types).toContain("CONVERTIBLE_NOTE");
      expect(types).toContain("SPA");
      expect(types).toContain("BOARD_CONSENT");
      expect(types.length).toBe(13);
    });

    it("uses only valid merge field tags", () => {
      const validTags = new Set(MERGE_FIELD_TAGS);
      for (const [, tags] of Object.entries(MERGE_FIELDS_BY_DOC_TYPE)) {
        for (const tag of tags) {
          expect(validTags.has(tag as typeof MERGE_FIELD_TAGS[number])).toBe(true);
        }
      }
    });

    it("always includes {{date}} for all document types", () => {
      for (const [, tags] of Object.entries(MERGE_FIELDS_BY_DOC_TYPE)) {
        expect(tags).toContain("{{date}}");
      }
    });
  });

  describe("Entity type auto-fill for all 7 types", () => {
    it("fills INDIVIDUAL with name and SSN", () => {
      const result = buildDocumentAutoFill(
        { entityType: "INDIVIDUAL", legalName: "Alice Johnson", ssn: "123-45-6789" } as Record<string, string>,
        "Alice Johnson",
      );
      expect(result.signatoryName).toBe("Alice Johnson");
      expect(result.taxIdType).toBe("SSN");
      expect(result.entityTypeDescription).toBe("Individual");
      expect(result.signatoryTitle).toBe("");
    });

    it("fills LLC with managing member signatory", () => {
      const result = buildDocumentAutoFill(
        {
          entityType: "LLC",
          legalName: "Doe Capital LLC",
          ein: "12-3456789",
          authorizedSignatory: "John Doe",
          signatoryTitle: "Managing Member",
        } as Record<string, string>,
      );
      expect(result.signatoryName).toBe("John Doe");
      expect(result.signatoryTitle).toBe("Managing Member");
      expect(result.taxIdType).toBe("EIN");
      expect(result.entityTypeDescription).toBe("Limited Liability Company");
    });

    it("fills TRUST with trustee signatory", () => {
      const result = buildDocumentAutoFill(
        {
          entityType: "TRUST",
          legalName: "Johnson Family Trust",
          ein: "98-7654321",
          trusteeName: "Alice Johnson",
          trustType: "Irrevocable",
        } as Record<string, string>,
      );
      expect(result.signatoryName).toBe("Alice Johnson");
      expect(result.signatoryTitle).toBe("Trustee");
      expect(result.entityTypeDescription).toBe("Irrevocable Trust");
    });

    it("fills RETIREMENT with account holder signatory", () => {
      const result = buildDocumentAutoFill(
        {
          entityType: "RETIREMENT",
          legalName: "Fidelity IRA - Alice Johnson",
          custodianEin: "12-3456789",
          accountHolderName: "Alice Johnson",
          accountType: "Self-Directed IRA",
        } as Record<string, string>,
      );
      expect(result.signatoryName).toBe("Alice Johnson");
      expect(result.signatoryTitle).toBe("Account Holder");
      expect(result.entityTypeDescription).toBe("Self-Directed IRA");
    });

    it("fills JOINT with primary name", () => {
      const result = buildDocumentAutoFill(
        {
          entityType: "JOINT",
          legalName: "John & Jane Doe",
          ssn: "123-45-6789",
          primaryName: "John Doe",
        } as Record<string, string>,
      );
      expect(result.signatoryName).toBe("John Doe");
      expect(result.taxIdType).toBe("SSN");
      expect(result.entityTypeDescription).toBe("Joint Account");
    });

    it("fills PARTNERSHIP with general partner signatory", () => {
      const result = buildDocumentAutoFill(
        {
          entityType: "PARTNERSHIP",
          legalName: "Smith & Associates LP",
          ein: "56-7890123",
          authorizedSignatory: "Robert Smith",
          signatoryTitle: "General Partner",
        } as Record<string, string>,
      );
      expect(result.signatoryName).toBe("Robert Smith");
      expect(result.signatoryTitle).toBe("General Partner");
      expect(result.entityTypeDescription).toBe("Partnership");
    });

    it("fills CHARITY with authorized officer", () => {
      const result = buildDocumentAutoFill(
        {
          entityType: "CHARITY",
          legalName: "Johnson Foundation",
          ein: "45-6789012",
          authorizedSignatory: "Sarah Johnson",
          signatoryTitle: "Executive Director",
        } as Record<string, string>,
      );
      expect(result.signatoryName).toBe("Sarah Johnson");
      expect(result.signatoryTitle).toBe("Executive Director");
      expect(result.entityTypeDescription).toBe("Charitable Organization");
    });

    it("fills OTHER with generic authorized representative", () => {
      const result = buildDocumentAutoFill(
        {
          entityType: "OTHER",
          legalName: "Custom Entity Corp",
          ein: "11-2233445",
          otherTypeDescription: "Corporation",
        } as Record<string, string>,
      );
      expect(result.signatoryTitle).toBe("Authorized Representative");
      expect(result.entityTypeDescription).toBe("Corporation");
    });
  });

  describe("Address formatting", () => {
    it("formats US address without country", () => {
      const result = buildDocumentAutoFill({
        entityType: "INDIVIDUAL",
        legalName: "Test",
        mailingAddress: {
          street1: "123 Main St",
          street2: "Suite 100",
          city: "New York",
          state: "NY",
          zip: "10001",
          country: "US",
        },
      });
      expect(result.formattedAddress).toBe("123 Main St\nSuite 100\nNew York, NY, 10001");
    });

    it("formats international address with country", () => {
      const result = buildDocumentAutoFill({
        entityType: "INDIVIDUAL",
        legalName: "Test",
        mailingAddress: {
          street1: "10 Downing St",
          city: "London",
          state: "England",
          zip: "SW1A 2AA",
          country: "UK",
        },
      });
      expect(result.formattedAddress).toContain("UK");
    });

    it("returns empty string when no address", () => {
      const result = buildDocumentAutoFill({
        entityType: "INDIVIDUAL",
        legalName: "Test",
      });
      expect(result.formattedAddress).toBe("");
    });
  });
});
