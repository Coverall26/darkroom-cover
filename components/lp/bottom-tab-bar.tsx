"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  CreditCard,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LPBadgeCounts {
  pendingDocs: number;
  pendingSignatures: number;
}

// Module-level cache — shares TTL pattern with LPHeader
let badgeCache: LPBadgeCounts | null = null;
let badgeCacheTime = 0;
let brandCache: string | null = null;
let brandCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute for badges
const BRAND_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for brand color

const TABS = [
  {
    label: "Home",
    href: "/lp/dashboard",
    icon: LayoutDashboard,
    matchPaths: ["/lp/dashboard"],
    badgeKey: "pendingSignatures" as const,
  },
  {
    label: "Docs",
    href: "/lp/docs",
    icon: FileText,
    matchPaths: ["/lp/docs"],
    badgeKey: "pendingDocs" as const,
  },
  {
    label: "Payments",
    href: "/lp/transactions",
    icon: CreditCard,
    matchPaths: ["/lp/transactions", "/lp/wire"],
    badgeKey: null,
  },
  {
    label: "Settings",
    href: "/account/general",
    icon: User,
    matchPaths: ["/account"],
    badgeKey: null,
  },
];

export function LPBottomTabBar() {
  const pathname = usePathname();
  const [brandColor, setBrandColor] = useState(brandCache || "#0066FF");
  const [badges, setBadges] = useState<LPBadgeCounts>(
    badgeCache || { pendingDocs: 0, pendingSignatures: 0 },
  );

  // Fetch brand color from fund-context
  useEffect(() => {
    if (brandCache && Date.now() - brandCacheTime < BRAND_CACHE_TTL_MS) {
      setBrandColor(brandCache);
      return;
    }
    async function fetchBrand() {
      try {
        const res = await fetch("/api/lp/fund-context");
        if (res.ok) {
          const data = await res.json();
          const color = data.brandColor || "#0066FF";
          brandCache = color;
          brandCacheTime = Date.now();
          setBrandColor(color);
        }
      } catch {
        // Use default
      }
    }
    fetchBrand();
  }, []);

  // Fetch badge counts (pending docs + signatures)
  const fetchBadges = useCallback(async () => {
    if (badgeCache && Date.now() - badgeCacheTime < CACHE_TTL_MS) {
      setBadges(badgeCache);
      return;
    }
    try {
      const res = await fetch("/api/lp/pending-counts");
      if (res.ok) {
        const data = await res.json();
        const counts: LPBadgeCounts = {
          pendingDocs: data.pendingDocs || 0,
          pendingSignatures: data.pendingSignatures || 0,
        };
        badgeCache = counts;
        badgeCacheTime = Date.now();
        setBadges(counts);
      }
    } catch {
      // Ignore — keep current values
    }
  }, []);

  useEffect(() => {
    fetchBadges();
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, [fetchBadges]);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 block md:hidden bg-black/90 backdrop-blur-md border-t border-gray-800"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      role="tablist"
      aria-label="LP navigation"
    >
      <div className="flex items-center justify-around h-14">
        {TABS.map((tab) => {
          const isActive = tab.matchPaths.some((p) =>
            pathname?.startsWith(p),
          );
          const Icon = tab.icon;
          const badgeCount = tab.badgeKey ? badges[tab.badgeKey] : 0;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              role="tab"
              aria-selected={isActive}
              aria-label={
                badgeCount > 0
                  ? `${tab.label}, ${badgeCount} pending`
                  : tab.label
              }
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5",
                "min-w-[64px] min-h-[48px] h-full text-[11px] font-medium transition-colors",
                "active:scale-95 active:opacity-80",
                isActive ? "text-blue-400" : "text-gray-500",
              )}
              style={isActive ? { color: brandColor } : undefined}
            >
              <Icon className="h-5 w-5" />
              <span>{tab.label}</span>
              {badgeCount > 0 && (
                <span
                  className="absolute top-1 right-2 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-black/90"
                  role="status"
                  aria-label={`${badgeCount} pending`}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
