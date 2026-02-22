"use client";

import React from "react";
import {
  Settings,
  Building2,
  Users,
  Landmark,
  Layers,
  Loader2,
  ChevronDown,
  ChevronRight,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Shared Types ────────────────────────────────────────────────────────────

export interface OrgData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  entityType: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  addressCountry: string;
  brandColor: string | null;
  accentColor: string | null;
  logo: string | null;
  favicon: string | null;
  companyDescription: string | null;
  sector: string | null;
  geography: string | null;
  website: string | null;
  foundedYear: number | null;
}

export interface OrgDefaultsData {
  dataroomConversationsEnabled: boolean;
  dataroomAllowBulkDownload: boolean;
  dataroomShowLastUpdated: boolean;
  linkEmailProtected: boolean;
  linkAllowDownload: boolean;
  linkEnableNotifications: boolean;
  linkEnableWatermark: boolean;
  linkExpirationDays: number | null;
  linkPasswordRequired: boolean;
  fundroomNdaGateEnabled: boolean;
  fundroomKycRequired: boolean;
  fundroomAccreditationRequired: boolean;
  fundroomStagedCommitmentsEnabled: boolean;
  fundroomCallFrequency: string;
  auditLogRetentionDays: number;
  requireMfa: boolean;
  // LP Onboarding Settings
  allowExternalDocUpload: boolean;
  allowGpDocUploadForLp: boolean;
  requireGpApproval: boolean;
  accreditationMethod: string | null;
  minimumInvestThreshold: number | null;
  // Notification Preferences
  notifyGpLpOnboardingStart: boolean;
  notifyGpCommitment: boolean;
  notifyGpWireUpload: boolean;
  notifyGpLpInactive: boolean;
  notifyGpExternalDocUpload: boolean;
  notifyLpStepComplete: boolean;
  notifyLpWireConfirm: boolean;
  notifyLpNewDocument: boolean;
  notifyLpChangeRequest: boolean;
  notifyLpOnboardingReminder: boolean;
}

export interface TierInfo {
  value: unknown;
  source: "System" | "Organization" | "Team" | "Fund";
}

// ─── Tier badge colors ──────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  System: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  Organization: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Team: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Fund: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const TIER_ICONS: Record<string, typeof Building2> = {
  System: Layers,
  Organization: Building2,
  Team: Users,
  Fund: Landmark,
};

// ─── Collapsible Card ───────────────────────────────────────────────────────

export function SettingsCard({
  id,
  title,
  icon: Icon,
  expanded,
  onToggle,
  highlighted,
  dirty,
  children,
}: {
  id: string;
  title: string;
  icon: typeof Settings;
  expanded: boolean;
  onToggle: () => void;
  highlighted?: boolean;
  dirty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        highlighted
          ? "border-yellow-300 bg-yellow-50/50 dark:border-yellow-700 dark:bg-yellow-900/10"
          : "border-gray-200 dark:border-gray-800",
      )}
    >
      <button
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900/50",
          expanded && "border-b border-gray-200 dark:border-gray-800",
        )}
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="flex-1 text-sm font-semibold">{title}</h2>
        {dirty && (
          <span className="mr-1 h-2 w-2 rounded-full bg-amber-500" title="Unsaved changes" />
        )}
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && <div className="p-4">{children}</div>}
    </div>
  );
}

// ─── Tier Badge ─────────────────────────────────────────────────────────────

export function TierBadge({ source }: { source: string }) {
  const Icon = TIER_ICONS[source] || Layers;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TIER_COLORS[source] || TIER_COLORS.System}`}
    >
      <Icon className="h-3 w-3" />
      {source}
    </span>
  );
}

// ─── Toggle Row ─────────────────────────────────────────────────────────────

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  tierSource,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  tierSource?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {tierSource && <TierBadge source={tierSource} />}
        <button
          onClick={() => onChange(!checked)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform",
              checked ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>
    </div>
  );
}

// ─── Save Button ────────────────────────────────────────────────────────────

export function SaveButton({
  saving,
  dirty,
  onClick,
}: {
  saving: boolean;
  dirty: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex justify-end pt-3">
      <Button
        size="sm"
        onClick={onClick}
        disabled={saving || !dirty}
        className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Save className="h-3.5 w-3.5" />
        )}
        Save
      </Button>
    </div>
  );
}
