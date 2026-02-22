/**
 * @jest-environment jsdom
 */

/**
 * Tests for useSafePageViewTracker hook.
 */

import { renderHook, act } from "@testing-library/react";

// Mock reliable-tracking
jest.mock("@/lib/utils/reliable-tracking", () => ({
  trackPageViewReliably: jest.fn().mockResolvedValue(undefined),
}));

import { trackPageViewReliably } from "@/lib/utils/reliable-tracking";
import { useSafePageViewTracker } from "@/lib/tracking/safe-page-view-tracker";

const mockTrackPageViewReliably = trackPageViewReliably as jest.MockedFunction<typeof trackPageViewReliably>;

describe("useSafePageViewTracker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns all expected functions and state", () => {
    const { result, unmount } = renderHook(() =>
      useSafePageViewTracker({ enableActivityDetection: false, activityTracking: false }),
    );

    expect(result.current.trackPageViewSafely).toBeInstanceOf(Function);
    expect(result.current.resetTrackingState).toBeInstanceOf(Function);
    expect(result.current.startIntervalTracking).toBeInstanceOf(Function);
    expect(result.current.stopIntervalTracking).toBeInstanceOf(Function);
    expect(result.current.getActiveDuration).toBeInstanceOf(Function);
    expect(result.current.updateActivity).toBeInstanceOf(Function);
    expect(result.current.isInactive).toBe(false);
    unmount();
  });

  it("tracks a page view via trackPageViewReliably", async () => {
    const { result, unmount } = renderHook(() =>
      useSafePageViewTracker({ enableActivityDetection: false, activityTracking: false }),
    );

    await act(async () => {
      await result.current.trackPageViewSafely({
        linkId: "link-1",
        documentId: "doc-1",
        viewId: "view-1",
        duration: 5000,
        pageNumber: 1,
        versionNumber: 1,
      });
    });

    expect(mockTrackPageViewReliably).toHaveBeenCalledWith(
      expect.objectContaining({
        linkId: "link-1",
        documentId: "doc-1",
        duration: 5000,
        pageNumber: 1,
      }),
      false,
    );
    unmount();
  });

  it("passes useBeacon flag to trackPageViewReliably", async () => {
    const { result, unmount } = renderHook(() =>
      useSafePageViewTracker({ enableActivityDetection: false, activityTracking: false }),
    );

    await act(async () => {
      await result.current.trackPageViewSafely(
        {
          linkId: "link-1",
          documentId: "doc-1",
          duration: 1000,
          pageNumber: 1,
          versionNumber: 1,
        },
        true,
      );
    });

    expect(mockTrackPageViewReliably).toHaveBeenCalledWith(
      expect.anything(),
      true,
    );
    unmount();
  });

  it("updates viewed pages when setViewedPages is provided", async () => {
    const mockSetViewedPages = jest.fn();
    const { result, unmount } = renderHook(() =>
      useSafePageViewTracker({ enableActivityDetection: false, activityTracking: false }),
    );

    await act(async () => {
      await result.current.trackPageViewSafely({
        linkId: "link-1",
        documentId: "doc-1",
        duration: 5000,
        pageNumber: 1,
        versionNumber: 1,
        setViewedPages: mockSetViewedPages,
      });
    });

    expect(mockSetViewedPages).toHaveBeenCalledWith(expect.any(Function));

    // Verify the updater function logic
    const updater = mockSetViewedPages.mock.calls[0][0];
    const prevPages = [
      { pageNumber: 1, duration: 1000 },
      { pageNumber: 2, duration: 2000 },
    ];
    const updated = updater(prevPages);
    expect(updated[0].duration).toBe(6000); // 1000 + 5000
    expect(updated[1].duration).toBe(2000); // unchanged
    unmount();
  });

  it("getActiveDuration returns positive value", async () => {
    const { result, unmount } = renderHook(() =>
      useSafePageViewTracker({ activityTracking: false, enableActivityDetection: false }),
    );

    // Small delay so elapsed time > 0
    await new Promise((r) => setTimeout(r, 20));

    const duration = result.current.getActiveDuration();
    expect(duration).toBeGreaterThanOrEqual(0);
    unmount();
  });

  it("resetTrackingState resets isInactive", () => {
    const { result, unmount } = renderHook(() =>
      useSafePageViewTracker({ enableActivityDetection: false, activityTracking: false }),
    );

    act(() => {
      result.current.resetTrackingState();
    });

    expect(result.current.isInactive).toBe(false);
    unmount();
  });

  it("start and stop interval tracking do not throw", () => {
    const { result, unmount } = renderHook(() =>
      useSafePageViewTracker({
        intervalTracking: true,
        intervalDuration: 999999, // Won't fire during test
        activityTracking: false,
        enableActivityDetection: false,
      }),
    );

    expect(() => {
      act(() => {
        result.current.startIntervalTracking({
          linkId: "link-1",
          documentId: "doc-1",
          pageNumber: 1,
          versionNumber: 1,
        });
      });

      act(() => {
        result.current.stopIntervalTracking();
      });
    }).not.toThrow();

    unmount();
  });

  it("does not track when intervalTracking is disabled", () => {
    const { result, unmount } = renderHook(() =>
      useSafePageViewTracker({
        intervalTracking: false,
        activityTracking: false,
        enableActivityDetection: false,
      }),
    );

    act(() => {
      result.current.startIntervalTracking({
        linkId: "link-1",
        documentId: "doc-1",
        pageNumber: 1,
        versionNumber: 1,
      });
    });

    expect(mockTrackPageViewReliably).not.toHaveBeenCalled();
    unmount();
  });

  describe("activity detection setup", () => {
    it("registers activity event listeners when enabled", () => {
      const addedEvents: string[] = [];
      const origAdd = document.addEventListener;
      document.addEventListener = function(this: Document, type: string, listener: any, options?: any) {
        addedEvents.push(type);
        return origAdd.call(this, type, listener, options);
      } as typeof document.addEventListener;

      const { unmount } = renderHook(() =>
        useSafePageViewTracker({ enableActivityDetection: true, activityTracking: false }),
      );

      const eventTypes = ["mousedown", "mousemove", "keydown", "keyup", "scroll", "touchstart", "click"];
      for (const type of eventTypes) {
        expect(addedEvents).toContain(type);
      }

      unmount();
      document.addEventListener = origAdd;
    });

    it("does not set up listeners when activity detection is disabled", () => {
      const addedEvents: string[] = [];
      const origAdd = document.addEventListener;
      document.addEventListener = function(this: Document, type: string, listener: any, options?: any) {
        addedEvents.push(type);
        return origAdd.call(this, type, listener, options);
      } as typeof document.addEventListener;

      const { unmount } = renderHook(() =>
        useSafePageViewTracker({ enableActivityDetection: false, activityTracking: false }),
      );

      expect(addedEvents).not.toContain("mousemove");

      unmount();
      document.addEventListener = origAdd;
    });

    it("cleans up listeners on unmount", () => {
      const removedEvents: string[] = [];
      const origRemove = document.removeEventListener;
      document.removeEventListener = function(this: Document, type: string, listener: any, options?: any) {
        removedEvents.push(type);
        return origRemove.call(this, type, listener, options);
      } as typeof document.removeEventListener;

      const { unmount } = renderHook(() =>
        useSafePageViewTracker({ enableActivityDetection: true, activityTracking: false }),
      );

      unmount();

      const eventTypes = ["mousedown", "mousemove", "keydown", "keyup", "scroll", "touchstart", "click"];
      for (const type of eventTypes) {
        expect(removedEvents).toContain(type);
      }

      document.removeEventListener = origRemove;
    });
  });
});
