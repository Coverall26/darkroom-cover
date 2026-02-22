"use client";

/**
 * StepSkeleton — Generic skeleton matching wizard step card layout.
 * Shown as Suspense fallback while lazy-loaded step components are loading.
 */
export default function StepSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading step content">
      {/* Step title skeleton */}
      <div className="h-7 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
      <div className="h-4 w-72 bg-gray-100 dark:bg-gray-800 rounded" />

      {/* Card skeleton */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6 space-y-5">
        {/* Field row 1 */}
        <div className="space-y-2">
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-10 w-full bg-gray-100 dark:bg-gray-800 rounded-md" />
        </div>

        {/* Field row 2 */}
        <div className="space-y-2">
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-10 w-full bg-gray-100 dark:bg-gray-800 rounded-md" />
        </div>

        {/* Field row 3 — two columns */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-10 w-full bg-gray-100 dark:bg-gray-800 rounded-md" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-10 w-full bg-gray-100 dark:bg-gray-800 rounded-md" />
          </div>
        </div>

        {/* Field row 4 */}
        <div className="space-y-2">
          <div className="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-10 w-full bg-gray-100 dark:bg-gray-800 rounded-md" />
        </div>

        {/* Field row 5 */}
        <div className="space-y-2">
          <div className="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-24 w-full bg-gray-100 dark:bg-gray-800 rounded-md" />
        </div>
      </div>
    </div>
  );
}
