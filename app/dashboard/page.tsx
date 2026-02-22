import { Suspense } from "react";
import { Metadata } from "next";
import { requireAdminPortalAccess } from "@/lib/auth/admin-guard";
import DashboardPageClient from "./page-client";
import LoadingSpinner from "@/components/ui/loading-spinner";

export const metadata: Metadata = {
  title: "Dashboard | FundRoom",
  description: "Admin dashboard for FundRoom Investor Dataroom",
};

export default async function DashboardPage() {
  await requireAdminPortalAccess();

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <LoadingSpinner className="h-8 w-8" />
        </div>
      }
    >
      <DashboardPageClient />
    </Suspense>
  );
}
