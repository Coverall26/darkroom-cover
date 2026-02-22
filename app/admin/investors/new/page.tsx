import { Suspense } from "react";
import ManualInvestorWizardClient from "./page-client";

export default function ManualInvestorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      }
    >
      <ManualInvestorWizardClient />
    </Suspense>
  );
}
