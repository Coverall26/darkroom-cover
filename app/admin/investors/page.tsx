import { Suspense } from "react";
import InvestorsListClient from "./page-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Investors | FundRoom Admin",
};

export default function InvestorsListPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <InvestorsListClient />
    </Suspense>
  );
}
