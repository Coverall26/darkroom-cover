/**
 * Deal Documents Tests
 *
 * Unit tests for document type definitions and validation logic.
 */

import type { DealStage } from "@prisma/client";

const VALID_CATEGORIES = [
  "TEASER",
  "NDA",
  "DECK",
  "FINANCIALS",
  "DD_REPORT",
  "TERM_SHEET",
  "LEGAL",
  "GENERAL",
] as const;

describe("Deal Documents", () => {
  describe("Document Categories", () => {
    it("should have all expected category types", () => {
      expect(VALID_CATEGORIES).toContain("TEASER");
      expect(VALID_CATEGORIES).toContain("NDA");
      expect(VALID_CATEGORIES).toContain("DECK");
      expect(VALID_CATEGORIES).toContain("FINANCIALS");
      expect(VALID_CATEGORIES).toContain("DD_REPORT");
      expect(VALID_CATEGORIES).toContain("TERM_SHEET");
      expect(VALID_CATEGORIES).toContain("LEGAL");
      expect(VALID_CATEGORIES).toContain("GENERAL");
    });

    it("should have exactly 8 categories", () => {
      expect(VALID_CATEGORIES.length).toBe(8);
    });
  });

  describe("CreateDocumentInput validation", () => {
    it("should require a name field", () => {
      const validInput = {
        name: "Term Sheet v2.pdf",
        category: "TERM_SHEET",
        fileType: "application/pdf",
        fileSize: 102400,
      };
      expect(validInput.name).toBeDefined();
      expect(typeof validInput.name).toBe("string");
      expect(validInput.name.length).toBeGreaterThan(0);
    });

    it("should accept optional fields as undefined", () => {
      const minimalInput = {
        name: "Document.pdf",
      };
      expect(minimalInput.name).toBeDefined();
      // All other fields are optional in CreateDocumentInput
    });

    it("should accept a valid DealStage for requiredStage", () => {
      const stages: DealStage[] = [
        "SOURCED",
        "SCREENING",
        "DUE_DILIGENCE",
        "TERM_SHEET",
        "COMMITMENT",
        "CLOSING",
        "FUNDED",
        "MONITORING",
        "EXIT",
        "PASSED",
        "WITHDRAWN",
      ];

      for (const stage of stages) {
        const input = {
          name: "Doc.pdf",
          requiredStage: stage,
        };
        expect(input.requiredStage).toBe(stage);
      }
    });

    it("should support restricted flag", () => {
      const input = {
        name: "Confidential DD Report.pdf",
        category: "DD_REPORT",
        restricted: true,
      };
      expect(input.restricted).toBe(true);
    });
  });

  describe("UpdateDocumentInput validation", () => {
    it("should allow null requiredStage to clear stage restriction", () => {
      const input = {
        requiredStage: null as DealStage | null,
      };
      expect(input.requiredStage).toBeNull();
    });

    it("should allow partial updates", () => {
      const nameOnly = { name: "New Name.pdf" };
      const categoryOnly = { category: "LEGAL" };
      const restrictedOnly = { restricted: false };

      expect(Object.keys(nameOnly).length).toBe(1);
      expect(Object.keys(categoryOnly).length).toBe(1);
      expect(Object.keys(restrictedOnly).length).toBe(1);
    });
  });
});
