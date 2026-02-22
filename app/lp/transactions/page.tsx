import { Suspense } from "react";
import TransactionsClient from "./page-client";

export const metadata = {
  title: "Transaction History | FundRoom",
};

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
          <div className="max-w-5xl mx-auto px-4 py-8 animate-pulse space-y-6">
            <div className="h-8 bg-gray-700/50 rounded w-48" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-gray-700/50 rounded-lg" />
              ))}
            </div>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-gray-700/50 rounded" />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <TransactionsClient />
    </Suspense>
  );
}
