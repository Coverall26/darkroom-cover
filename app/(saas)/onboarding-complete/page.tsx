import { Suspense } from "react";
import OnboardingCompleteClient from "./page-client";

export const metadata = {
  title: "You're All Set | FundRoom AI",
};

export default function OnboardingCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-gray-950">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      }
    >
      <OnboardingCompleteClient />
    </Suspense>
  );
}
