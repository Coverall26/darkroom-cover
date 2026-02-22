/**
 * Marketplace Analytics Tests
 *
 * Tests for analytics event tracking and buffering logic.
 */

import { trackMarketplaceEvent } from "@/lib/marketplace/analytics";
import type { MarketplaceEvent } from "@/lib/marketplace/analytics";

describe("Marketplace Analytics", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("trackMarketplaceEvent", () => {
    it("should accept deal.created events without throwing", () => {
      expect(() => {
        trackMarketplaceEvent({
          event: "deal.created",
          dealId: "deal_123",
          teamId: "team_456",
          dealType: "EQUITY",
        });
      }).not.toThrow();
    });

    it("should accept deal.stage_changed events", () => {
      expect(() => {
        trackMarketplaceEvent({
          event: "deal.stage_changed",
          dealId: "deal_123",
          teamId: "team_456",
          fromStage: "SOURCED",
          toStage: "SCREENING",
        });
      }).not.toThrow();
    });

    it("should accept interest.expressed events", () => {
      expect(() => {
        trackMarketplaceEvent({
          event: "interest.expressed",
          dealId: "deal_123",
          teamId: "team_456",
          investorId: "inv_789",
          amount: 100000,
        });
      }).not.toThrow();
    });

    it("should accept listing.published events", () => {
      expect(() => {
        trackMarketplaceEvent({
          event: "listing.published",
          listingId: "list_123",
          dealId: "deal_456",
          teamId: "team_789",
        });
      }).not.toThrow();
    });

    it("should accept marketplace.searched events", () => {
      expect(() => {
        trackMarketplaceEvent({
          event: "marketplace.searched",
          query: "real estate",
          filters: { sector: "Real Estate" },
          resultCount: 15,
        });
      }).not.toThrow();
    });

    it("should handle multiple events in sequence", () => {
      expect(() => {
        for (let i = 0; i < 10; i++) {
          trackMarketplaceEvent({
            event: "listing.viewed",
            listingId: `list_${i}`,
            userId: `user_${i}`,
          });
        }
      }).not.toThrow();
    });
  });
});
