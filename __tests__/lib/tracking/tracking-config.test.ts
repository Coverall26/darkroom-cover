/**
 * Tests for tracking-config module.
 */

import { TRACKING_CONFIG, getTrackingOptions } from "@/lib/tracking/tracking-config";

describe("tracking-config", () => {
  describe("TRACKING_CONFIG", () => {
    it("has expected default values", () => {
      expect(TRACKING_CONFIG.INTERVAL_TRACKING_ENABLED).toBe(true);
      expect(TRACKING_CONFIG.INTERVAL_DURATION).toBe(10000);
      expect(TRACKING_CONFIG.ACTIVITY_TRACKING_ENABLED).toBe(true);
      expect(TRACKING_CONFIG.INACTIVITY_THRESHOLD).toBe(300000); // 5 minutes
      expect(TRACKING_CONFIG.ACTIVITY_DETECTION_ENABLED).toBe(true);
      expect(TRACKING_CONFIG.MIN_TRACKING_DURATION).toBe(1000);
    });
  });

  describe("getTrackingOptions", () => {
    it("returns defaults when no overrides provided", () => {
      const options = getTrackingOptions();
      expect(options).toEqual({
        intervalTracking: true,
        intervalDuration: 10000,
        activityTracking: true,
        inactivityThreshold: 300000,
        enableActivityDetection: true,
      });
    });

    it("returns defaults when empty overrides provided", () => {
      const options = getTrackingOptions({});
      expect(options).toEqual({
        intervalTracking: true,
        intervalDuration: 10000,
        activityTracking: true,
        inactivityThreshold: 300000,
        enableActivityDetection: true,
      });
    });

    it("applies partial overrides", () => {
      const options = getTrackingOptions({
        INTERVAL_DURATION: 5000,
        INACTIVITY_THRESHOLD: 60000,
      });
      expect(options).toEqual({
        intervalTracking: true,
        intervalDuration: 5000,
        activityTracking: true,
        inactivityThreshold: 60000,
        enableActivityDetection: true,
      });
    });

    it("allows disabling features via overrides", () => {
      const options = getTrackingOptions({
        INTERVAL_TRACKING_ENABLED: false,
        ACTIVITY_TRACKING_ENABLED: false,
        ACTIVITY_DETECTION_ENABLED: false,
      });
      expect(options.intervalTracking).toBe(false);
      expect(options.activityTracking).toBe(false);
      expect(options.enableActivityDetection).toBe(false);
    });

    it("handles all overrides at once", () => {
      const options = getTrackingOptions({
        INTERVAL_TRACKING_ENABLED: false,
        INTERVAL_DURATION: 30000,
        ACTIVITY_TRACKING_ENABLED: false,
        INACTIVITY_THRESHOLD: 120000,
        ACTIVITY_DETECTION_ENABLED: false,
      });
      expect(options).toEqual({
        intervalTracking: false,
        intervalDuration: 30000,
        activityTracking: false,
        inactivityThreshold: 120000,
        enableActivityDetection: false,
      });
    });
  });
});
