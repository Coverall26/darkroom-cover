import { Suspense } from "react";
import BulkImportClient from "./page-client";

export default function BulkImportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      }
    >
      <BulkImportClient />
    </Suspense>
  );
}
