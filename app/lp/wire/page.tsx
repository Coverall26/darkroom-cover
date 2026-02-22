import { Metadata } from "next";
import { Suspense } from "react";
import LPWireClient from "./page-client";

export const metadata: Metadata = {
  title: "Wire Instructions | FundRoom Investor Portal",
  description: "View wire transfer instructions and upload proof of payment",
};

export default function LPWirePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      }
    >
      <LPWireClient />
    </Suspense>
  );
}
