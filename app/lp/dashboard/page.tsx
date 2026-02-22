import { Metadata } from "next";
import { Suspense } from "react";

import LPDashboardClient from "./page-client";

export const metadata: Metadata = {
  title: "Investor Dashboard | FundRoom",
  description: "Your personalized investor portal for FundRoom",
};

export default function LPDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    }>
      <LPDashboardClient />
    </Suspense>
  );
}
