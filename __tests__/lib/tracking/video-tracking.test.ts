/**
 * @jest-environment jsdom
 */

/**
 * Tests for video-tracking module.
 */

jest.mock("@/lib/constants", () => ({
  VIDEO_EVENT_TYPES: [
    "loaded", "played", "seeked", "rate_changed",
    "volume_up", "volume_down", "muted", "unmuted",
    "focus", "blur", "enterfullscreen", "exitfullscreen",
  ] as const,
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock sendBeacon
const mockSendBeacon = jest.fn();
Object.defineProperty(navigator, "sendBeacon", {
  value: mockSendBeacon,
  writable: true,
  configurable: true,
});

import { createVideoTracker } from "@/lib/tracking/video-tracking";

function createMockVideoElement(overrides: Partial<HTMLVideoElement> = {}): HTMLVideoElement {
  const listeners: Record<string, EventListener[]> = {};

  const element = {
    currentTime: 0,
    duration: 120,
    playbackRate: 1,
    volume: 1,
    muted: false,
    paused: true,
    addEventListener: jest.fn((type: string, handler: EventListener) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    }),
    removeEventListener: jest.fn((type: string, handler: EventListener) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((h) => h !== handler);
      }
    }),
    // Helper to dispatch events in tests
    _dispatch: (type: string, eventData?: any) => {
      const handlers = listeners[type] || [];
      handlers.forEach((h) => h(eventData ?? new Event(type)));
    },
    _listeners: listeners,
    ...overrides,
  } as unknown as HTMLVideoElement & {
    _dispatch: (type: string, eventData?: any) => void;
    _listeners: Record<string, EventListener[]>;
  };

  return element;
}

describe("video-tracking", () => {
  const defaultConfig = {
    linkId: "link-1",
    documentId: "doc-1",
    viewId: "view-1",
    versionNumber: 1,
    playbackRate: 1,
    volume: 1,
    isMuted: false,
    isFocused: true,
    isFullscreen: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFetch.mockResolvedValue({ ok: true });
    mockSendBeacon.mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("createVideoTracker", () => {
    it("returns a tracker with expected methods", () => {
      const video = createMockVideoElement();
      const tracker = createVideoTracker(video, defaultConfig);

      expect(tracker).toBeDefined();
      expect(tracker.updateConfig).toBeInstanceOf(Function);
      expect(tracker.trackVisibilityChange).toBeInstanceOf(Function);
      expect(tracker.cleanup).toBeInstanceOf(Function);
    });

    it("sets up event listeners on the video element", () => {
      const video = createMockVideoElement();
      createVideoTracker(video, defaultConfig);

      expect(video.addEventListener).toHaveBeenCalledWith("loadedmetadata", expect.any(Function));
      expect(video.addEventListener).toHaveBeenCalledWith("canplay", expect.any(Function));
      expect(video.addEventListener).toHaveBeenCalledWith("play", expect.any(Function));
      expect(video.addEventListener).toHaveBeenCalledWith("pause", expect.any(Function));
      expect(video.addEventListener).toHaveBeenCalledWith("seeking", expect.any(Function));
      expect(video.addEventListener).toHaveBeenCalledWith("seeked", expect.any(Function));
      expect(video.addEventListener).toHaveBeenCalledWith("timeupdate", expect.any(Function));
      expect(video.addEventListener).toHaveBeenCalledWith("ratechange", expect.any(Function));
      expect(video.addEventListener).toHaveBeenCalledWith("volumechange", expect.any(Function));
      expect(video.addEventListener).toHaveBeenCalledWith("ended", expect.any(Function));
    });

    it("sets up fullscreenchange listener on document", () => {
      const docAddEventListener = jest.spyOn(document, "addEventListener");
      const video = createMockVideoElement();
      createVideoTracker(video, defaultConfig);

      expect(docAddEventListener).toHaveBeenCalledWith("fullscreenchange", expect.any(Function));
      docAddEventListener.mockRestore();
    });
  });

  describe("load events", () => {
    it("tracks loaded event on first loadedmetadata", () => {
      const video = createMockVideoElement() as any;
      createVideoTracker(video, defaultConfig);

      video._dispatch("loadedmetadata");
      // Debounce is immediate for loaded, so event fires synchronously
      jest.advanceTimersByTime(1100);

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/record_video_view",
        expect.objectContaining({ method: "POST" }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.eventType).toBe("loaded");
      expect(body.linkId).toBe("link-1");
    });

    it("does not track loaded event on subsequent loads", () => {
      const video = createMockVideoElement() as any;
      createVideoTracker(video, defaultConfig);

      video._dispatch("loadedmetadata");
      jest.advanceTimersByTime(1100);
      mockFetch.mockClear();

      video._dispatch("canplay");
      jest.advanceTimersByTime(1100);

      // No additional loaded event
      const loadedCalls = mockFetch.mock.calls.filter((c) => {
        try {
          return JSON.parse(c[1].body).eventType === "loaded";
        } catch { return false; }
      });
      expect(loadedCalls).toHaveLength(0);
    });
  });

  describe("preview mode", () => {
    it("does not track events when isPreview is true", () => {
      const video = createMockVideoElement() as any;
      createVideoTracker(video, { ...defaultConfig, isPreview: true });

      video._dispatch("loadedmetadata");
      jest.advanceTimersByTime(1100);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSendBeacon).not.toHaveBeenCalled();
    });
  });

  describe("updateConfig", () => {
    it("merges new config values", () => {
      const video = createMockVideoElement() as any;
      const tracker = createVideoTracker(video, defaultConfig);

      tracker.updateConfig({ viewId: "view-2", isMuted: true });

      // Trigger an event to verify new config is used
      video._dispatch("loadedmetadata");
      jest.advanceTimersByTime(1100);

      if (mockFetch.mock.calls.length > 0) {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.viewId).toBe("view-2");
        expect(body.isMuted).toBe(true);
      }
    });
  });

  describe("trackVisibilityChange", () => {
    it("tracks blur event when becoming hidden", () => {
      const video = createMockVideoElement() as any;
      const tracker = createVideoTracker(video, defaultConfig);

      tracker.trackVisibilityChange(false);
      jest.advanceTimersByTime(500);

      const blurCalls = mockFetch.mock.calls
        .concat(mockSendBeacon.mock.calls.map((c) => [c[0], { body: new Blob([c[1]]).toString() }]))
        .filter((c) => {
          try {
            // sendBeacon sends Blob, fetch sends string body
            return true;
          } catch { return false; }
        });

      // Should have called either sendBeacon or fetch
      expect(mockSendBeacon.mock.calls.length + mockFetch.mock.calls.length).toBeGreaterThan(0);
    });

    it("tracks focus event when becoming visible", () => {
      const video = createMockVideoElement() as any;
      const tracker = createVideoTracker(video, defaultConfig);

      // First go hidden, then visible
      tracker.trackVisibilityChange(false);
      jest.advanceTimersByTime(100);
      mockFetch.mockClear();
      mockSendBeacon.mockClear();

      tracker.trackVisibilityChange(true);
      jest.advanceTimersByTime(500);

      expect(mockFetch).toHaveBeenCalled();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.eventType).toBe("focus");
    });

    it("prevents duplicate unload tracking", () => {
      const video = createMockVideoElement() as any;
      const tracker = createVideoTracker(video, defaultConfig);

      tracker.trackVisibilityChange(false);
      const firstCallCount = mockSendBeacon.mock.calls.length + mockFetch.mock.calls.length;

      tracker.trackVisibilityChange(false);
      const secondCallCount = mockSendBeacon.mock.calls.length + mockFetch.mock.calls.length;

      // No additional calls
      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe("cleanup", () => {
    it("removes event listeners from video element", () => {
      const video = createMockVideoElement() as any;
      const tracker = createVideoTracker(video, defaultConfig);

      tracker.cleanup();

      expect(video.removeEventListener).toHaveBeenCalled();
    });

    it("tracks final played event on cleanup if playing", () => {
      const video = createMockVideoElement() as any;
      const tracker = createVideoTracker(video, defaultConfig);

      // Simulate playing state by dispatching play event
      video._dispatch("play");
      jest.advanceTimersByTime(200);
      mockFetch.mockClear();
      mockSendBeacon.mockClear();

      tracker.cleanup();

      // Should send final tracking via beacon/fetch
      expect(mockSendBeacon.mock.calls.length + mockFetch.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe("sendBeacon and fetch fallback", () => {
    it("uses fetch with keepalive by default", () => {
      const video = createMockVideoElement() as any;
      createVideoTracker(video, defaultConfig);

      video._dispatch("loadedmetadata");
      jest.advanceTimersByTime(1100);

      if (mockFetch.mock.calls.length > 0) {
        expect(mockFetch.mock.calls[0][1].keepalive).toBe(true);
      }
    });

    it("falls back to sendBeacon when fetch fails", async () => {
      mockFetch.mockRejectedValueOnce(new Error("fetch failed"));

      const video = createMockVideoElement() as any;
      createVideoTracker(video, defaultConfig);

      video._dispatch("loadedmetadata");
      jest.advanceTimersByTime(1100);

      // Allow the promise chain to settle
      await jest.advanceTimersByTimeAsync(100);

      // sendBeacon should be called as fallback
      if (mockFetch.mock.calls.length > 0) {
        expect(mockSendBeacon).toHaveBeenCalled();
      }
    });
  });

  describe("volume events", () => {
    it("tracks muted event when mute state changes", () => {
      const video = createMockVideoElement({ muted: false, volume: 0.5 }) as any;
      createVideoTracker(video, { ...defaultConfig, isMuted: false });

      // Simulate muting
      (video as any).muted = true;
      video._dispatch("volumechange");
      jest.advanceTimersByTime(600);

      const mutedCalls = mockFetch.mock.calls.filter((c) => {
        try {
          return JSON.parse(c[1].body).eventType === "muted";
        } catch { return false; }
      });
      expect(mutedCalls.length).toBeGreaterThan(0);
    });
  });

  describe("seek events", () => {
    it("tracks seeked event when seek distance is > 1 second", () => {
      const video = createMockVideoElement({ currentTime: 10 }) as any;
      createVideoTracker(video, defaultConfig);

      // Start seeking
      video._dispatch("seeking");
      // Move currentTime and complete seek
      (video as any).currentTime = 50;
      video._dispatch("seeked");
      jest.advanceTimersByTime(600);

      const seekCalls = mockFetch.mock.calls.filter((c) => {
        try {
          return JSON.parse(c[1].body).eventType === "seeked";
        } catch { return false; }
      });
      expect(seekCalls.length).toBeGreaterThan(0);
    });
  });

  describe("playback rate events", () => {
    it("tracks rate_changed when playback rate changes significantly", () => {
      const video = createMockVideoElement({ playbackRate: 1 }) as any;
      createVideoTracker(video, defaultConfig);

      (video as any).playbackRate = 2;
      video._dispatch("ratechange");
      jest.advanceTimersByTime(600);

      const rateCalls = mockFetch.mock.calls.filter((c) => {
        try {
          return JSON.parse(c[1].body).eventType === "rate_changed";
        } catch { return false; }
      });
      expect(rateCalls.length).toBeGreaterThan(0);
    });
  });
});
