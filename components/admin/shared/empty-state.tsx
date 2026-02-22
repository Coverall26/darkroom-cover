"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * Shared empty state component for GP admin pages.
 * Renders a centered icon, title, description, and optional action button.
 * Uses Deep Navy/gray theme consistent with admin dashboard.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 text-center ${className}`}>
      <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-gray-400" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-medium text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-400 max-w-md mb-6">{description}</p>
      {actionLabel && (onAction || actionHref) && (
        actionHref ? (
          <Button asChild variant="outline" className="min-h-[44px]">
            <a href={actionHref}>{actionLabel}</a>
          </Button>
        ) : (
          <Button variant="outline" className="min-h-[44px]" onClick={onAction}>
            {actionLabel}
          </Button>
        )
      )}
    </div>
  );
}

interface AdminPageSkeletonProps {
  /** Number of skeleton rows to render in the table area */
  rows?: number;
  /** Whether to show stat cards above the table */
  showStats?: boolean;
  /** Number of stat cards */
  statCount?: number;
}

/**
 * Shared loading skeleton for admin list/table pages.
 * Renders header + optional stat cards + table rows with animate-pulse.
 */
export function AdminPageSkeleton({
  rows = 5,
  showStats = false,
  statCount = 4,
}: AdminPageSkeletonProps) {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading content">
      {/* Page header */}
      <div className="flex justify-between items-center">
        <div>
          <div className="h-7 w-48 bg-gray-700/50 rounded" />
          <div className="h-4 w-32 bg-gray-700/30 rounded mt-2" />
        </div>
        <div className="h-9 w-28 bg-gray-700/50 rounded" />
      </div>

      {/* Stat cards */}
      {showStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: statCount }).map((_, i) => (
            <div key={i} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
              <div className="h-3 w-20 bg-gray-700/30 rounded mb-2" />
              <div className="h-7 w-16 bg-gray-700/50 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Search/filter bar */}
      <div className="flex gap-3">
        <div className="h-9 flex-1 max-w-sm bg-gray-700/30 rounded" />
        <div className="h-9 w-24 bg-gray-700/30 rounded" />
      </div>

      {/* Table rows */}
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg overflow-hidden">
        {/* Header row */}
        <div className="flex gap-4 p-3 border-b border-gray-700/50">
          <div className="h-4 w-32 bg-gray-700/30 rounded" />
          <div className="h-4 w-24 bg-gray-700/30 rounded" />
          <div className="h-4 w-20 bg-gray-700/30 rounded" />
          <div className="h-4 w-16 bg-gray-700/30 rounded ml-auto" />
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-3 border-b border-gray-700/20 last:border-0"
          >
            <div className="h-4 w-36 bg-gray-700/20 rounded" />
            <div className="h-4 w-28 bg-gray-700/20 rounded" />
            <div className="h-4 w-20 bg-gray-700/20 rounded" />
            <div className="h-6 w-16 bg-gray-700/20 rounded-full ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
