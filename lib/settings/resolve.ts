/**
 * Settings Inheritance Resolver for FundRoom AI
 *
 * Implements the 3-tier settings cascade:
 *   Organization Defaults → Fund Overrides → Object Overrides
 *
 * At runtime, settings are resolved by merging layers.
 * Lower layers (more specific) override higher layers.
 *
 * Usage:
 *   const settings = await resolveSettings({ orgId, fundId, objectOverrides });
 *   const ndaRequired = settings.ndaGateEnabled;
 */

import prisma from "@/lib/prisma";

/** All settings that can be configured at any level */
export interface FundRoomSettings {
  // Feature toggles
  ndaGateEnabled: boolean;
  kycRequired: boolean;
  accreditationRequired: boolean;
  stagedCommitmentsEnabled: boolean;
  marketplaceEnabled: boolean;
  dataroomEnabled: boolean;

  // Dataroom defaults
  dataroomConversationsEnabled: boolean;
  dataroomAllowBulkDownload: boolean;
  dataroomShowLastUpdated: boolean;

  // Link defaults
  linkEmailProtected: boolean;
  linkAllowDownload: boolean;
  linkEnableNotifications: boolean;
  linkEnableWatermark: boolean;
  linkExpirationDays: number | null;

  // Fund settings
  callFrequency: string;
  requireMfa: boolean;
  auditLogRetentionDays: number;

  // Operating mode
  mode: "GP_FUND" | "STARTUP";
}

/** System-wide defaults — the base layer */
const SYSTEM_DEFAULTS: FundRoomSettings = {
  ndaGateEnabled: true,
  kycRequired: true,
  accreditationRequired: true,
  stagedCommitmentsEnabled: false,
  marketplaceEnabled: false,
  dataroomEnabled: true,

  dataroomConversationsEnabled: false,
  dataroomAllowBulkDownload: true,
  dataroomShowLastUpdated: true,

  linkEmailProtected: true,
  linkAllowDownload: true,
  linkEnableNotifications: true,
  linkEnableWatermark: false,
  linkExpirationDays: null,

  callFrequency: "AS_NEEDED",
  requireMfa: false,
  auditLogRetentionDays: 2555, // 7 years for SEC/FINRA

  mode: "GP_FUND",
};

interface ResolveParams {
  orgId?: string;
  teamId?: string;
  fundId?: string;
  /** Direct overrides (e.g., from a specific object like a link or dataroom) */
  objectOverrides?: Partial<FundRoomSettings>;
}

/**
 * Resolve settings by merging: System → Org → Team → Fund → Object overrides.
 *
 * Each layer only overrides fields that are explicitly set.
 * Null/undefined values in higher layers are skipped (don't override).
 */
export async function resolveSettings(
  params: ResolveParams,
): Promise<FundRoomSettings> {
  const { orgId, teamId, fundId, objectOverrides } = params;
  let result = { ...SYSTEM_DEFAULTS };

  // Layer 1: Organization defaults
  if (orgId) {
    const orgDefaults = await prisma.organizationDefaults.findUnique({
      where: { organizationId: orgId },
    });

    if (orgDefaults) {
      result = mergeSettings(result, extractOrgSettings(orgDefaults));
    }

    // Also check org-level feature flags
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { featureFlags: true },
    });

    if (org?.featureFlags) {
      const flags = org.featureFlags as Record<string, unknown>;
      result = mergeSettings(result, extractFeatureFlagSettings(flags));
    }
  }

  // Layer 2: Team defaults (if team overrides org)
  if (teamId) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: {
        overrideOrgDefaults: true,
        featureFlags: true,
        organizationId: true,
      },
    });

    if (team?.overrideOrgDefaults && team.featureFlags) {
      const flags = team.featureFlags as Record<string, unknown>;
      result = mergeSettings(result, extractFeatureFlagSettings(flags));
    }
  }

  // Layer 3: Fund overrides
  if (fundId) {
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      select: {
        ndaGateEnabled: true,
        callFrequency: true,
        stagedCommitmentsEnabled: true,
        entityMode: true,
        featureFlags: true,
        customSettings: true,
      },
    });

    if (fund) {
      result = mergeSettings(result, extractFundSettings(fund));
    }
  }

  // Layer 4: Object overrides (direct, e.g., a specific link or dataroom)
  if (objectOverrides) {
    result = mergeSettings(result, objectOverrides);
  }

  return result;
}

/**
 * Resolve settings synchronously from pre-fetched data.
 * Use this when you already have the org/fund data loaded.
 */
export function resolveSettingsSync(params: {
  orgDefaults?: Record<string, unknown> | null;
  orgFeatureFlags?: Record<string, unknown> | null;
  teamFeatureFlags?: Record<string, unknown> | null;
  teamOverridesOrg?: boolean;
  fundData?: Record<string, unknown> | null;
  objectOverrides?: Partial<FundRoomSettings>;
}): FundRoomSettings {
  let result = { ...SYSTEM_DEFAULTS };

  if (params.orgDefaults) {
    result = mergeSettings(result, extractOrgSettings(params.orgDefaults));
  }

  if (params.orgFeatureFlags) {
    result = mergeSettings(
      result,
      extractFeatureFlagSettings(params.orgFeatureFlags),
    );
  }

  if (params.teamOverridesOrg && params.teamFeatureFlags) {
    result = mergeSettings(
      result,
      extractFeatureFlagSettings(params.teamFeatureFlags),
    );
  }

  if (params.fundData) {
    result = mergeSettings(result, extractFundSettings(params.fundData));
  }

  if (params.objectOverrides) {
    result = mergeSettings(result, params.objectOverrides);
  }

  return result;
}

/**
 * Get system defaults (useful for displaying defaults in settings UI).
 */
export function getSystemDefaults(): Readonly<FundRoomSettings> {
  return SYSTEM_DEFAULTS;
}

// --- Internal helpers ---

function mergeSettings(
  base: FundRoomSettings,
  overrides: Partial<FundRoomSettings>,
): FundRoomSettings {
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

function extractOrgSettings(
  orgDefaults: Record<string, unknown>,
): Partial<FundRoomSettings> {
  const settings: Partial<FundRoomSettings> = {};

  if (typeof orgDefaults.fundroomNdaGateEnabled === "boolean")
    settings.ndaGateEnabled = orgDefaults.fundroomNdaGateEnabled as boolean;
  if (typeof orgDefaults.fundroomKycRequired === "boolean")
    settings.kycRequired = orgDefaults.fundroomKycRequired as boolean;
  if (typeof orgDefaults.fundroomAccreditationRequired === "boolean")
    settings.accreditationRequired =
      orgDefaults.fundroomAccreditationRequired as boolean;
  if (typeof orgDefaults.fundroomStagedCommitmentsEnabled === "boolean")
    settings.stagedCommitmentsEnabled =
      orgDefaults.fundroomStagedCommitmentsEnabled as boolean;
  if (typeof orgDefaults.fundroomCallFrequency === "string")
    settings.callFrequency = orgDefaults.fundroomCallFrequency as string;

  if (typeof orgDefaults.dataroomConversationsEnabled === "boolean")
    settings.dataroomConversationsEnabled =
      orgDefaults.dataroomConversationsEnabled as boolean;
  if (typeof orgDefaults.dataroomAllowBulkDownload === "boolean")
    settings.dataroomAllowBulkDownload =
      orgDefaults.dataroomAllowBulkDownload as boolean;
  if (typeof orgDefaults.dataroomShowLastUpdated === "boolean")
    settings.dataroomShowLastUpdated =
      orgDefaults.dataroomShowLastUpdated as boolean;

  if (typeof orgDefaults.linkEmailProtected === "boolean")
    settings.linkEmailProtected = orgDefaults.linkEmailProtected as boolean;
  if (typeof orgDefaults.linkAllowDownload === "boolean")
    settings.linkAllowDownload = orgDefaults.linkAllowDownload as boolean;
  if (typeof orgDefaults.linkEnableNotifications === "boolean")
    settings.linkEnableNotifications =
      orgDefaults.linkEnableNotifications as boolean;
  if (typeof orgDefaults.linkEnableWatermark === "boolean")
    settings.linkEnableWatermark = orgDefaults.linkEnableWatermark as boolean;
  if (orgDefaults.linkExpirationDays !== undefined)
    settings.linkExpirationDays = orgDefaults.linkExpirationDays as
      | number
      | null;

  if (typeof orgDefaults.requireMfa === "boolean")
    settings.requireMfa = orgDefaults.requireMfa as boolean;
  if (typeof orgDefaults.auditLogRetentionDays === "number")
    settings.auditLogRetentionDays =
      orgDefaults.auditLogRetentionDays as number;

  return settings;
}

function extractFeatureFlagSettings(
  flags: Record<string, unknown>,
): Partial<FundRoomSettings> {
  const settings: Partial<FundRoomSettings> = {};

  if (flags.mode === "GP_FUND" || flags.mode === "STARTUP")
    settings.mode = flags.mode;
  if (typeof flags["dataroom.enabled"] === "boolean")
    settings.dataroomEnabled = flags["dataroom.enabled"] as boolean;
  if (typeof flags["marketplace.enabled"] === "boolean")
    settings.marketplaceEnabled = flags["marketplace.enabled"] as boolean;

  return settings;
}

function extractFundSettings(
  fund: Record<string, unknown>,
): Partial<FundRoomSettings> {
  const settings: Partial<FundRoomSettings> = {};

  if (typeof fund.ndaGateEnabled === "boolean")
    settings.ndaGateEnabled = fund.ndaGateEnabled as boolean;
  if (typeof fund.callFrequency === "string")
    settings.callFrequency = fund.callFrequency as string;
  if (typeof fund.stagedCommitmentsEnabled === "boolean")
    settings.stagedCommitmentsEnabled =
      fund.stagedCommitmentsEnabled as boolean;
  if (fund.entityMode === "FUND") settings.mode = "GP_FUND";
  if (fund.entityMode === "STARTUP") settings.mode = "STARTUP";

  // Fund-level feature flags
  if (fund.featureFlags && typeof fund.featureFlags === "object") {
    const ff = fund.featureFlags as Record<string, unknown>;
    Object.assign(settings, extractFeatureFlagSettings(ff));
  }

  return settings;
}
