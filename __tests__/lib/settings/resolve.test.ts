/**
 * Settings Inheritance Resolver Tests
 *
 * Tests the 3-tier settings cascade:
 *   System Defaults → Org Defaults → Fund Overrides → Object Overrides
 */

import {
  resolveSettingsSync,
  getSystemDefaults,
} from "@/lib/settings/resolve";

describe("Settings Inheritance Resolver", () => {
  describe("System Defaults", () => {
    it("should return complete system defaults", () => {
      const defaults = getSystemDefaults();
      expect(defaults.ndaGateEnabled).toBe(true);
      expect(defaults.kycRequired).toBe(true);
      expect(defaults.accreditationRequired).toBe(true);
      expect(defaults.stagedCommitmentsEnabled).toBe(false);
      expect(defaults.marketplaceEnabled).toBe(false);
      expect(defaults.dataroomEnabled).toBe(true);
      expect(defaults.mode).toBe("GP_FUND");
      expect(defaults.auditLogRetentionDays).toBe(2555);
      expect(defaults.callFrequency).toBe("AS_NEEDED");
    });
  });

  describe("resolveSettingsSync", () => {
    it("should return system defaults with no overrides", () => {
      const settings = resolveSettingsSync({});
      expect(settings).toEqual(getSystemDefaults());
    });

    it("should apply org defaults over system defaults", () => {
      const settings = resolveSettingsSync({
        orgDefaults: {
          fundroomNdaGateEnabled: false,
          fundroomKycRequired: false,
          fundroomCallFrequency: "QUARTERLY",
          dataroomAllowBulkDownload: false,
        },
      });

      expect(settings.ndaGateEnabled).toBe(false);
      expect(settings.kycRequired).toBe(false);
      expect(settings.callFrequency).toBe("QUARTERLY");
      expect(settings.dataroomAllowBulkDownload).toBe(false);
      // System defaults still apply for untouched fields
      expect(settings.accreditationRequired).toBe(true);
      expect(settings.mode).toBe("GP_FUND");
    });

    it("should apply org feature flags", () => {
      const settings = resolveSettingsSync({
        orgFeatureFlags: {
          mode: "STARTUP",
          "marketplace.enabled": true,
        },
      });

      expect(settings.mode).toBe("STARTUP");
      expect(settings.marketplaceEnabled).toBe(true);
    });

    it("should apply team overrides when enabled", () => {
      const settings = resolveSettingsSync({
        orgFeatureFlags: { mode: "GP_FUND" },
        teamOverridesOrg: true,
        teamFeatureFlags: { mode: "STARTUP" },
      });

      expect(settings.mode).toBe("STARTUP");
    });

    it("should NOT apply team overrides when disabled", () => {
      const settings = resolveSettingsSync({
        orgFeatureFlags: { mode: "GP_FUND" },
        teamOverridesOrg: false,
        teamFeatureFlags: { mode: "STARTUP" },
      });

      expect(settings.mode).toBe("GP_FUND");
    });

    it("should apply fund overrides over org defaults", () => {
      const settings = resolveSettingsSync({
        orgDefaults: {
          fundroomNdaGateEnabled: true,
          fundroomCallFrequency: "QUARTERLY",
        },
        fundData: {
          ndaGateEnabled: false,
          callFrequency: "MONTHLY",
          stagedCommitmentsEnabled: true,
        },
      });

      expect(settings.ndaGateEnabled).toBe(false);
      expect(settings.callFrequency).toBe("MONTHLY");
      expect(settings.stagedCommitmentsEnabled).toBe(true);
    });

    it("should apply object overrides as the final layer", () => {
      const settings = resolveSettingsSync({
        orgDefaults: {
          linkAllowDownload: true,
          linkEnableWatermark: false,
        },
        objectOverrides: {
          linkAllowDownload: false,
          linkEnableWatermark: true,
        },
      });

      expect(settings.linkAllowDownload).toBe(false);
      expect(settings.linkEnableWatermark).toBe(true);
    });

    it("should handle full cascade: system → org → fund → object", () => {
      const settings = resolveSettingsSync({
        orgDefaults: {
          fundroomNdaGateEnabled: false,
          fundroomCallFrequency: "QUARTERLY",
          linkEmailProtected: false,
        },
        orgFeatureFlags: {
          mode: "GP_FUND",
          "marketplace.enabled": false,
        },
        fundData: {
          ndaGateEnabled: true, // Fund re-enables NDA
          callFrequency: "MONTHLY",
          entityMode: "FUND",
        },
        objectOverrides: {
          linkEmailProtected: true, // Object re-enables email protection
        },
      });

      // Org disabled NDA, fund re-enabled it
      expect(settings.ndaGateEnabled).toBe(true);
      // Org set QUARTERLY, fund overrode to MONTHLY
      expect(settings.callFrequency).toBe("MONTHLY");
      // Org disabled email protect, object re-enabled it
      expect(settings.linkEmailProtected).toBe(true);
      // Org set mode
      expect(settings.mode).toBe("GP_FUND");
    });

    it("should not override with null/undefined values", () => {
      const settings = resolveSettingsSync({
        orgDefaults: {
          fundroomNdaGateEnabled: false,
        },
        objectOverrides: {
          ndaGateEnabled: undefined as unknown as boolean,
        },
      });

      // Should keep org value, not revert to system default
      expect(settings.ndaGateEnabled).toBe(false);
    });

    it("should handle fund entity mode mapping", () => {
      const fundSettings = resolveSettingsSync({
        fundData: { entityMode: "STARTUP" },
      });
      expect(fundSettings.mode).toBe("STARTUP");

      const gpSettings = resolveSettingsSync({
        fundData: { entityMode: "FUND" },
      });
      expect(gpSettings.mode).toBe("GP_FUND");
    });
  });
});
