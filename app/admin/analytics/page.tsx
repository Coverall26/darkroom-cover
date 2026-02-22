import { Suspense } from "react";
import DataroomAnalyticsClient from "./page-client";

export const metadata = {
  title: "Dataroom Analytics | FundRoom",
};

export default function DataroomAnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-lg" />
            ))}
          </div>
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      }
    >
      <DataroomAnalyticsClient />
    </Suspense>
  );
}
