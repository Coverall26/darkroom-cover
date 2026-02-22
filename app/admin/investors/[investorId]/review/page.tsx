import { Suspense } from "react";
import ReviewPageClient from "./page-client";

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0066FF] border-t-transparent" />
        </div>
      }
    >
      <ReviewPageClient />
    </Suspense>
  );
}
