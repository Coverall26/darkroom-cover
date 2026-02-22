import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { DashboardHeader } from "@/components/admin/dashboard-header";
import { AIAssistantFAB } from "@/components/admin/ai-assistant-fab";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // Unauthenticated users see pages without sidebar (e.g. /admin/login)
  if (!session?.user) {
    return <>{children}</>;
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
      <AIAssistantFAB />
    </div>
  );
}
