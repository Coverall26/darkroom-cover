import { Suspense } from "react";
import ApprovalsPageClient from "./page-client";

export default function ApprovalsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
        </div>
      }
    >
      <ApprovalsPageClient />
    </Suspense>
  );
}
