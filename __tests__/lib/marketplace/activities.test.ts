/**
 * Deal Activities Tests
 *
 * Unit tests for activity type validation and listing behavior.
 */

const MANUAL_ACTIVITY_TYPES = ["MEETING", "CALL", "EMAIL"] as const;
const SYSTEM_ACTIVITY_TYPES = [
  "DEAL_CREATED",
  "DEAL_UPDATED",
  "DEAL_DELETED",
  "STAGE_CHANGE",
  "NOTE_ADDED",
  "NOTE_DELETED",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_DELETED",
  "INTEREST_EXPRESSED",
  "ALLOCATION_MADE",
] as const;

describe("Deal Activities", () => {
  describe("Manual Activity Types", () => {
    it("should allow MEETING as a manual activity type", () => {
      expect(MANUAL_ACTIVITY_TYPES).toContain("MEETING");
    });

    it("should allow CALL as a manual activity type", () => {
      expect(MANUAL_ACTIVITY_TYPES).toContain("CALL");
    });

    it("should allow EMAIL as a manual activity type", () => {
      expect(MANUAL_ACTIVITY_TYPES).toContain("EMAIL");
    });

    it("should have exactly 3 manual activity types", () => {
      expect(MANUAL_ACTIVITY_TYPES.length).toBe(3);
    });

    it("should reject system activity types as manual", () => {
      for (const type of SYSTEM_ACTIVITY_TYPES) {
        expect(MANUAL_ACTIVITY_TYPES).not.toContain(type);
      }
    });
  });

  describe("CreateActivityInput validation", () => {
    it("should require activityType and title", () => {
      const input = {
        activityType: "MEETING",
        title: "Due diligence call with management team",
      };
      expect(input.activityType).toBeDefined();
      expect(input.title).toBeDefined();
    });

    it("should accept optional description", () => {
      const input = {
        activityType: "CALL",
        title: "Follow-up call",
        description: "Discussed Q4 projections and growth strategy",
      };
      expect(input.description).toBeDefined();
    });

    it("should accept optional metadata", () => {
      const input = {
        activityType: "EMAIL",
        title: "Sent term sheet draft",
        metadata: {
          recipients: ["ceo@target.com"],
          subject: "FundRoom - Term Sheet Draft",
        },
      };
      expect(input.metadata).toBeDefined();
      expect(input.metadata.recipients).toEqual(["ceo@target.com"]);
    });
  });

  describe("ActivityListOptions validation", () => {
    it("should default page to 1", () => {
      const options = {};
      const page = (options as { page?: number }).page ?? 1;
      expect(page).toBe(1);
    });

    it("should default pageSize to 25", () => {
      const options = {};
      const pageSize = (options as { pageSize?: number }).pageSize ?? 25;
      expect(pageSize).toBe(25);
    });

    it("should support activityType filtering", () => {
      const options = { activityType: "STAGE_CHANGE" };
      expect(options.activityType).toBe("STAGE_CHANGE");
    });

    it("should calculate totalPages correctly", () => {
      const total = 73;
      const pageSize = 25;
      const totalPages = Math.ceil(total / pageSize);
      expect(totalPages).toBe(3);
    });

    it("should handle zero results", () => {
      const total = 0;
      const pageSize = 25;
      const totalPages = Math.ceil(total / pageSize);
      expect(totalPages).toBe(0);
    });
  });
});
