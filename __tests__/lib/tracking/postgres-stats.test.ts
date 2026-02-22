/**
 * Tests for postgres-stats module.
 *
 * Mocks the Prisma client to test query construction and data transformation.
 */

jest.mock("@/lib/prisma", () => {
  const mockPrisma = {
    pageView: {
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    view: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
  return { __esModule: true, default: mockPrisma };
});

import prisma from "@/lib/prisma";

import {
  getTotalAvgPageDurationPg,
  getTotalDocumentDurationPg,
  getViewDurationStatsPg,
  getViewCompletionStatsPg,
  getViewTotalDurationPg,
  getViewPagesViewedPg,
  getTotalLinkDurationPg,
} from "@/lib/tracking/postgres-stats";

const mockPageViewGroupBy = prisma.pageView.groupBy as jest.Mock;
const mockPageViewAggregate = prisma.pageView.aggregate as jest.Mock;
const mockViewFindMany = (prisma.view as any).findMany as jest.Mock;
const mockQueryRaw = prisma.$queryRaw as jest.Mock;

describe("postgres-stats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getTotalAvgPageDurationPg", () => {
    it("returns empty data for empty documentId", async () => {
      const result = await getTotalAvgPageDurationPg({
        documentId: "",
        excludedViewIds: [],
      });
      expect(result).toEqual({ data: [] });
      expect(mockPageViewGroupBy).not.toHaveBeenCalled();
    });

    it("returns average durations grouped by page", async () => {
      mockPageViewGroupBy.mockResolvedValue([
        { pageNumber: 1, versionNumber: 1, _avg: { duration: 5000 } },
        { pageNumber: 2, versionNumber: 1, _avg: { duration: 10000 } },
      ]);

      const result = await getTotalAvgPageDurationPg({
        documentId: "doc-1",
        excludedViewIds: [],
      });

      expect(result.data).toEqual([
        { pageNumber: "1", versionNumber: 1, avg_duration: 5 },
        { pageNumber: "2", versionNumber: 1, avg_duration: 10 },
      ]);
    });

    it("handles null avg duration", async () => {
      mockPageViewGroupBy.mockResolvedValue([
        { pageNumber: 1, versionNumber: 1, _avg: { duration: null } },
      ]);

      const result = await getTotalAvgPageDurationPg({
        documentId: "doc-1",
        excludedViewIds: [],
      });

      expect(result.data[0].avg_duration).toBe(0);
    });

    it("passes excludedViewIds to where clause", async () => {
      mockPageViewGroupBy.mockResolvedValue([]);

      await getTotalAvgPageDurationPg({
        documentId: "doc-1",
        excludedViewIds: ["view-1", "view-2"],
      });

      expect(mockPageViewGroupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            documentId: "doc-1",
            viewId: { notIn: ["view-1", "view-2"] },
          }),
        }),
      );
    });

    it("omits viewId filter when excludedViewIds is empty", async () => {
      mockPageViewGroupBy.mockResolvedValue([]);

      await getTotalAvgPageDurationPg({
        documentId: "doc-1",
        excludedViewIds: [],
      });

      expect(mockPageViewGroupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            documentId: "doc-1",
            viewId: undefined,
          }),
        }),
      );
    });
  });

  describe("getTotalDocumentDurationPg", () => {
    it("returns zero for empty documentId", async () => {
      const result = await getTotalDocumentDurationPg({
        documentId: "",
        excludedViewIds: [],
      });
      expect(result).toEqual({ data: [{ sum_duration: 0 }] });
    });

    it("returns total duration in seconds", async () => {
      mockPageViewAggregate.mockResolvedValue({
        _sum: { duration: 120000 },
      });

      const result = await getTotalDocumentDurationPg({
        documentId: "doc-1",
        excludedViewIds: [],
      });

      expect(result.data[0].sum_duration).toBe(120);
    });

    it("handles null sum", async () => {
      mockPageViewAggregate.mockResolvedValue({
        _sum: { duration: null },
      });

      const result = await getTotalDocumentDurationPg({
        documentId: "doc-1",
        excludedViewIds: [],
      });

      expect(result.data[0].sum_duration).toBe(0);
    });
  });

  describe("getViewDurationStatsPg", () => {
    it("returns empty data for empty documentId", async () => {
      const result = await getViewDurationStatsPg({
        documentId: "",
        viewId: "view-1",
      });
      expect(result).toEqual({ data: [] });
    });

    it("returns empty data for empty viewId", async () => {
      const result = await getViewDurationStatsPg({
        documentId: "doc-1",
        viewId: "",
      });
      expect(result).toEqual({ data: [] });
    });

    it("returns per-page duration stats", async () => {
      mockPageViewGroupBy.mockResolvedValue([
        { pageNumber: 1, _sum: { duration: 30000 } },
        { pageNumber: 2, _sum: { duration: 15000 } },
      ]);

      const result = await getViewDurationStatsPg({
        documentId: "doc-1",
        viewId: "view-1",
      });

      expect(result.data).toEqual([
        { pageNumber: "1", sum_duration: 30 },
        { pageNumber: "2", sum_duration: 15 },
      ]);
    });
  });

  describe("getViewCompletionStatsPg", () => {
    it("returns empty data for empty documentId", async () => {
      const result = await getViewCompletionStatsPg({
        documentId: "",
        excludedViewIds: [],
      });
      expect(result).toEqual({ data: [] });
    });

    it("runs raw query with excluded view IDs", async () => {
      mockQueryRaw.mockResolvedValue([
        { viewId: "v1", versionNumber: 1, pages_viewed: BigInt(5) },
      ]);

      const result = await getViewCompletionStatsPg({
        documentId: "doc-1",
        excludedViewIds: ["excluded-1"],
      });

      expect(mockQueryRaw).toHaveBeenCalled();
      expect(result.data).toEqual([
        { viewId: "v1", versionNumber: 1, pages_viewed: 5 },
      ]);
    });

    it("runs raw query without excluded view IDs", async () => {
      mockQueryRaw.mockResolvedValue([
        { viewId: "v1", versionNumber: 1, pages_viewed: BigInt(3) },
        { viewId: "v2", versionNumber: 2, pages_viewed: BigInt(7) },
      ]);

      const result = await getViewCompletionStatsPg({
        documentId: "doc-1",
        excludedViewIds: [],
      });

      expect(result.data).toEqual([
        { viewId: "v1", versionNumber: 1, pages_viewed: 3 },
        { viewId: "v2", versionNumber: 2, pages_viewed: 7 },
      ]);
    });
  });

  describe("getViewTotalDurationPg", () => {
    it("returns 0 for empty viewId", async () => {
      const result = await getViewTotalDurationPg({ viewId: "" });
      expect(result).toBe(0);
    });

    it("returns total duration in seconds", async () => {
      mockPageViewAggregate.mockResolvedValue({
        _sum: { duration: 45000 },
      });

      const result = await getViewTotalDurationPg({ viewId: "view-1" });
      expect(result).toBe(45);
    });

    it("returns 0 when no durations found", async () => {
      mockPageViewAggregate.mockResolvedValue({
        _sum: { duration: null },
      });

      const result = await getViewTotalDurationPg({ viewId: "view-1" });
      expect(result).toBe(0);
    });
  });

  describe("getViewPagesViewedPg", () => {
    it("returns 0 for empty viewId", async () => {
      const result = await getViewPagesViewedPg({ viewId: "" });
      expect(result).toBe(0);
    });

    it("returns count of distinct pages", async () => {
      mockPageViewGroupBy.mockResolvedValue([
        { pageNumber: 1 },
        { pageNumber: 2 },
        { pageNumber: 3 },
      ]);

      const result = await getViewPagesViewedPg({ viewId: "view-1" });
      expect(result).toBe(3);
    });

    it("returns 0 when no pages viewed", async () => {
      mockPageViewGroupBy.mockResolvedValue([]);

      const result = await getViewPagesViewedPg({ viewId: "view-1" });
      expect(result).toBe(0);
    });
  });

  describe("getTotalLinkDurationPg", () => {
    it("returns zeroes for empty linkId", async () => {
      const result = await getTotalLinkDurationPg({ linkId: "" });
      expect(result).toEqual({ sum_duration: 0, view_count: 0 });
    });

    it("returns zeroes when no views exist", async () => {
      mockViewFindMany.mockResolvedValue([]);

      const result = await getTotalLinkDurationPg({ linkId: "link-1" });
      expect(result).toEqual({ sum_duration: 0, view_count: 0 });
    });

    it("returns aggregated duration and view count", async () => {
      mockViewFindMany.mockResolvedValue([
        { id: "v1" },
        { id: "v2" },
        { id: "v3" },
      ]);
      mockPageViewAggregate.mockResolvedValue({
        _sum: { duration: 90000 },
      });

      const result = await getTotalLinkDurationPg({ linkId: "link-1" });
      expect(result).toEqual({ sum_duration: 90, view_count: 3 });
    });

    it("passes view IDs to aggregate query", async () => {
      mockViewFindMany.mockResolvedValue([{ id: "v1" }, { id: "v2" }]);
      mockPageViewAggregate.mockResolvedValue({ _sum: { duration: 0 } });

      await getTotalLinkDurationPg({ linkId: "link-1" });

      expect(mockPageViewAggregate).toHaveBeenCalledWith({
        where: { viewId: { in: ["v1", "v2"] } },
        _sum: { duration: true },
      });
    });
  });
});
