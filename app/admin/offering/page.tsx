import { Suspense } from "react";
import OfferingEditorClient from "./page-client";

export const metadata = {
  title: "Offering Page Editor | FundRoom",
};

export default function OfferingEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 space-y-4">
          <div className="h-8 w-64 bg-muted animate-pulse rounded" />
          <div className="h-96 bg-muted animate-pulse rounded-xl" />
        </div>
      }
    >
      <OfferingEditorClient />
    </Suspense>
  );
}
