/**
 * Settings module — hierarchical settings resolution for FundRoom AI.
 *
 * Implements the 3-tier cascade:
 *   System Defaults → Organization Defaults → Fund Overrides → Object Overrides
 *
 * All settings are computed at runtime, never cached.
 */

export {
  resolveSettings,
  resolveSettingsSync,
  getSystemDefaults,
} from "./resolve";

export type { FundRoomSettings } from "./resolve";
