import { Suspense } from "react";
import CRMPageClient from "./page-client";

export default function CRMPage() {
  return (
    <Suspense fallback={<CRMSkeleton />}>
      <CRMPageClient />
    </Suspense>
  );
}

function CRMSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 w-32 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-9 w-20 animate-pulse rounded-full bg-muted" />
        <div className="h-9 w-20 animate-pulse rounded-full bg-muted" />
        <div className="h-9 w-20 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
