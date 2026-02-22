"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const GPApprovalQueue = dynamic(
  () => import("@/components/approval/GPApprovalQueue"),
  { loading: () => <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin h-8 w-8 text-muted-foreground" /></div> }
);

export default function ApprovalsPageClient() {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [funds, setFunds] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedFundId, setSelectedFundId] = useState<string>("");
  const [pendingCount, setPendingCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/fund-settings/funds")
      .then((res) => res.json())
      .then((data) => {
        if (data.funds?.length > 0) {
          setFunds(data.funds);
          setTeamId(data.teamId || null);
        }
        setLoaded(true);
      })
      .catch((e) => {
        console.error("Failed to load approvals context:", e);
        setLoaded(true);
      });
  }, []);

  // Loading skeleton
  if (!loaded) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 py-4">
        <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading approvals">
          <div className="h-8 bg-gray-700/50 rounded w-48" />
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-9 bg-gray-700/30 rounded w-24" />
            ))}
          </div>
          <div className="h-10 bg-gray-700/20 rounded w-full" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-gray-700/15 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Empty state when no funds/team exist
  if (!teamId) {
    return (
      <div className="max-w-5xl mx-auto py-4">
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center mb-4">
            <ClipboardCheck className="h-7 w-7 text-gray-400" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-medium text-white mb-1">No approvals to review</h3>
          <p className="text-sm text-gray-400 max-w-md mb-6">
            Set up a fund and start onboarding investors. Pending investor approvals will appear here for your review.
          </p>
          <Button asChild variant="outline" className="min-h-[44px]">
            <a href="/admin/setup">Set Up Fund</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Fund selector */}
      {funds.length > 1 && (
        <div className="mb-6">
          <select
            value={selectedFundId}
            onChange={(e) => setSelectedFundId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">All Funds</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <GPApprovalQueue
        teamId={teamId}
        fundId={selectedFundId || undefined}
        onApprovalCountChange={setPendingCount}
      />
    </div>
  );
}
