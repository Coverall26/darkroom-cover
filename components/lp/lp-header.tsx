"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";

interface OrgBranding {
  orgName: string;
  logoUrl: string | null;
  brandColor: string | null;
}

// Module-level cache so re-mounts don't re-fetch
let brandingCache: OrgBranding | null = null;
let brandingCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const NAV_ITEMS = [
  { label: "Home", href: "/lp/dashboard", match: ["/lp/dashboard"] },
  { label: "Documents", href: "/lp/docs", match: ["/lp/docs"] },
  { label: "Transactions", href: "/lp/transactions", match: ["/lp/transactions", "/lp/wire"] },
  { label: "Settings", href: "/account/general", match: ["/account"] },
];

export function LPHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [branding, setBranding] = useState<OrgBranding | null>(brandingCache);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Use cache if fresh
    if (brandingCache && Date.now() - brandingCacheTime < CACHE_TTL_MS) {
      setBranding(brandingCache);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchBranding(attempt = 0) {
      try {
        const res = await fetch("/api/lp/fund-context", {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          const result: OrgBranding = {
            orgName: data.orgName || "FundRoom",
            logoUrl: data.logoUrl || null,
            brandColor: data.brandColor || null,
          };
          brandingCache = result;
          brandingCacheTime = Date.now();
          setBranding(result);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        // Retry once after 2s on network failure
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 2000));
          if (!controller.signal.aborted) {
            return fetchBranding(attempt + 1);
          }
        }
        console.error("[LPHeader] Branding fetch failed:", err);
      }
    }
    fetchBranding();

    return () => {
      controller.abort();
    };
  }, []);

  const displayName =
    session?.user?.name ||
    session?.user?.email?.split("@")[0] ||
    "Investor";
  const brandColor = branding?.brandColor || "#0066FF";

  return (
    <nav className="bg-black/60 backdrop-blur-md border-b border-gray-800/50 sticky top-0 z-40 shadow-lg shadow-black/10" aria-label="LP portal navigation">
      <div className="max-w-[800px] mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo + Org Name */}
          <Link
            href="/lp/dashboard"
            className="flex items-center gap-2 flex-shrink-0"
          >
            {branding?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={branding.orgName}
                className="h-7 w-7 rounded object-cover"
              />
            ) : (
              <div
                className="h-7 w-7 rounded flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: brandColor }}
              >
                {(branding?.orgName || "F")[0]}
              </div>
            )}
            <span className="text-base font-semibold text-white tracking-tight hidden sm:inline">
              {branding?.orgName || "FundRoom"}
            </span>
          </Link>

          {/* Center: Nav links (desktop only — mobile uses bottom tab bar) */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.match.some((p) =>
                pathname?.startsWith(p),
              );
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    isActive
                      ? "text-white font-medium"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                  style={isActive ? { backgroundColor: `${brandColor}20` } : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Right: User + Sign Out */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
              <User className="h-4 w-4 text-gray-300" />
            </div>
            <span className="text-gray-400 text-xs hidden sm:inline max-w-[120px] truncate">
              {displayName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white hover:bg-gray-800 min-h-[44px] min-w-[44px] p-2"
              onClick={() => router.push("/api/auth/signout")}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
