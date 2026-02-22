"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

// --- Tab configuration per entity mode ---

export interface FundTab {
  value: string;
  label: string;
  badge?: string;
}

const GP_FUND_TABS: FundTab[] = [
  { value: "overview", label: "Overview" },
  { value: "pipeline", label: "Investor Pipeline" },
  { value: "documents", label: "Documents" },
  { value: "capitalCalls", label: "Capital Calls" },
  { value: "capital", label: "Capital Tracking" },
  { value: "timeline", label: "CRM Timeline" },
  { value: "marketplace", label: "Marketplace", badge: "Soon" },
];

const STARTUP_TABS: FundTab[] = [
  { value: "overview", label: "Overview" },
  { value: "pipeline", label: "Investor Pipeline" },
  { value: "documents", label: "Documents" },
  { value: "capital", label: "Capital Tracking" },
  { value: "timeline", label: "CRM Timeline" },
  { value: "marketplace", label: "Marketplace", badge: "Soon" },
];

const DATAROOM_ONLY_TABS: FundTab[] = [
  { value: "overview", label: "Overview" },
  { value: "documents", label: "Documents" },
  { value: "timeline", label: "Activity" },
];

/**
 * Resolve the tab set for a given entity mode.
 */
export function getTabsForMode(entityMode: string | null): FundTab[] {
  switch (entityMode) {
    case "STARTUP":
      return STARTUP_TABS;
    case "DATAROOM_ONLY":
      return DATAROOM_ONLY_TABS;
    case "FUND":
    default:
      return GP_FUND_TABS;
  }
}

/**
 * Validate and clamp a tab value to the available tabs for the current mode.
 * Falls back to "overview" if the tab is invalid for the mode.
 */
export function resolveTab(tab: string | null, entityMode: string | null): string {
  const tabs = getTabsForMode(entityMode);
  if (tab && tabs.some((t) => t.value === tab)) return tab;
  return "overview";
}

// --- Component ---

interface FundTabNavProps {
  entityMode: string | null;
}

/**
 * Mode-aware fund tab navigation (renders TabsList only).
 * Must be placed inside a <Tabs> parent.
 * Shows different tabs based on GP_FUND / STARTUP / DATAROOM_ONLY mode.
 */
export function FundTabNav({ entityMode }: FundTabNavProps) {
  const tabs = useMemo(() => getTabsForMode(entityMode), [entityMode]);

  return (
    <TabsList>
      {tabs.map((tab) => (
        <TabsTrigger key={tab.value} value={tab.value} className={tab.badge ? "gap-1" : undefined}>
          {tab.label}
          {tab.badge && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
              {tab.badge}
            </Badge>
          )}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
