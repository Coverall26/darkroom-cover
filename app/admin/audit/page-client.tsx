"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const AuditDashboard = dynamic(
  () => import("@/components/admin/audit-dashboard").then(m => ({ default: m.AuditDashboard })),
  { loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin h-8 w-8 text-muted-foreground" /></div> }
);

interface AuditPageClientProps {
  teamId: string;
  teamName: string;
}

export default function AuditPageClient({ teamId, teamName }: AuditPageClientProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Compliance Audit</h1>
        <p className="text-sm text-muted-foreground">{teamName}</p>
      </div>

      <AuditDashboard teamId={teamId} />
    </div>
  );
}
