/**
 * Team Settings SWR Hook
 * 
 * Fetches and caches team-specific settings with automatic revalidation.
 * Used throughout the application to access team configuration including
 * security settings, feature flags, and behavioral preferences.
 * 
 * ## Features
 * - Automatic cache management via SWR
 * - Revalidates on window focus and reconnection
 * - Short deduplication interval for fresh settings
 * - Type-safe settings interface
 * 
 * ## Available Settings
 * 
 * ### Document Settings
 * - `replicateDataroomFolders`: Mirror dataroom folder structure in main documents
 * - `enableExcelAdvancedMode`: Enable advanced Excel viewing features
 * 
 * ### Security Settings
 * - `enableClientSideEncryption`: Enable AES-256-GCM encryption before upload
 * - `requireEncryptionForSensitive`: Require encryption for sensitive documents
 * 
 * ## Usage Example
 * ```tsx
 * function UploadComponent() {
 *   const { settings, isLoading } = useTeamSettings(teamId);
 *   
 *   if (settings?.enableClientSideEncryption) {
 *     // Encrypt file before upload
 *   }
 * }
 * ```
 * 
 * @module lib/swr/use-team-settings
 * @see pages/api/teams/[teamId]/settings.ts - API endpoint
 * @see components/upload-zone.tsx - Usage in upload flow
 */

import useSWR from "swr";

import { fetcher } from "@/lib/utils";

/**
 * Team settings interface
 * 
 * @property replicateDataroomFolders - Mirror dataroom folders in main documents
 * @property enableExcelAdvancedMode - Enable advanced Excel viewing features
 * @property enableClientSideEncryption - Enable client-side file encryption
 * @property requireEncryptionForSensitive - Require encryption for sensitive docs
 */
interface TeamSettings {
  replicateDataroomFolders: boolean;
  enableExcelAdvancedMode: boolean;
  enableClientSideEncryption: boolean;
  requireEncryptionForSensitive: boolean;
}

/**
 * Hook to fetch fresh team settings with proper revalidation.
 * 
 * Automatically revalidates on focus/reconnect to ensure settings
 * are up-to-date across browser tabs and sessions.
 * 
 * @param teamId - The team ID to fetch settings for (null skips fetch)
 * @returns Object containing settings data, loading state, and error state
 */
export function useTeamSettings(teamId: string | undefined | null) {
  const { data, error, isValidating } = useSWR<TeamSettings>(
    teamId ? `/api/teams/${teamId}/settings` : null,
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000, // Short deduping for settings
    },
  );

  return {
    settings: data,
    isLoading: !data && !error,
    isError: error,
    isValidating,
  };
}
