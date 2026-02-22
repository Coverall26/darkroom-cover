"use client";

/**
 * StepSkeleton — Skeleton loader for lazy-loaded LP onboarding step components.
 * Dark-themed to match the LP onboarding gradient background.
 */
export default function StepSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading step content">
      {/* Field row 1 */}
      <div className="space-y-2">
        <div className="h-4 w-24 bg-gray-700 rounded" />
        <div className="h-10 w-full bg-gray-700/50 rounded-md" />
      </div>

      {/* Field row 2 */}
      <div className="space-y-2">
        <div className="h-4 w-32 bg-gray-700 rounded" />
        <div className="h-10 w-full bg-gray-700/50 rounded-md" />
      </div>

      {/* Field row 3 — two columns */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <div className="h-4 w-20 bg-gray-700 rounded" />
          <div className="h-10 w-full bg-gray-700/50 rounded-md" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-20 bg-gray-700 rounded" />
          <div className="h-10 w-full bg-gray-700/50 rounded-md" />
        </div>
      </div>

      {/* Field row 4 */}
      <div className="space-y-2">
        <div className="h-4 w-28 bg-gray-700 rounded" />
        <div className="h-10 w-full bg-gray-700/50 rounded-md" />
      </div>
    </div>
  );
}
