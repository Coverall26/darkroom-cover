"use client";

import { Store } from "lucide-react";

export function MarketplacePlaceholderCard() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-lg border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-800 dark:bg-purple-900/10">
        <div className="rounded-full bg-purple-100 p-2.5 dark:bg-purple-900/30">
          <Store className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">FundRoom Marketplace</p>
          <p className="text-xs text-muted-foreground">
            List your fund on the FundRoom Marketplace for investor discovery.
            Manage listings, deal profiles, and investor interest expressions.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            Coming Q2 2026
          </span>
        </div>
      </div>
      <div className="rounded-md border border-dashed border-muted-foreground/25 bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          Marketplace features include: fund listing publication, deal profiles with financials,
          investor interest tracking, allocation management, and secondary market transactions.
          You can opt in to the marketplace during fund setup (Fund Details &gt; Marketplace Listing).
        </p>
      </div>
    </div>
  );
}
