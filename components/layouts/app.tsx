"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useTeam } from "@/context/team-context";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { DashboardHeader } from "@/components/admin/dashboard-header";
import { Skeleton } from "@/components/ui/skeleton";

const LoadingState = () => (
  <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] dark:bg-muted/20">
    <div className="space-y-4 text-center">
      <Skeleton className="mx-auto h-8 w-48" />
      <Skeleton className="mx-auto h-4 w-32" />
    </div>
  </div>
);

/**
 * Unified app layout wrapper.
 *
 * Previously used the Papermark-era AppSidebar. Now uses the FundRoom AdminSidebar
 * and DashboardHeader to provide a single, consistent navigation experience for GP users.
 * This unification was done as part of the pre-launch UI/UX consolidation (Feb 19, 2026).
 *
 * Used by ~45 pages across documents, datarooms, visitors, e-signature, branding, and analytics.
 * Admin pages under /admin/* use the server-side AdminLayout (app/admin/layout.tsx) instead.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const teamInfo = useTeam();

  // Redirect to viewer portal when no teams after full hydration
  useEffect(() => {
    if (!teamInfo.isLoading && teamInfo.teams.length === 0) {
      router.replace("/viewer-portal");
    }
  }, [teamInfo.isLoading, teamInfo.teams.length, router]);

  // Show loading while hydrating or waiting for redirect
  if (teamInfo.isLoading || !teamInfo.currentTeam) {
    return <LoadingState />;
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-[#f8fafc] dark:bg-muted/20">
          <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-4 lg:py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
