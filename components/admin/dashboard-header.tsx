"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Search,
  Bell,
  ChevronDown,
  LogOut,
  User,
  CreditCard,
  X,
  Shield,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSSE } from "@/lib/hooks/use-sse";

// --- Types ---

interface OrgInfo {
  orgName: string;
  logoUrl?: string | null;
  brandColor?: string;
}

interface PendingCounts {
  total: number;
}

interface SessionInfo {
  lastLogin: {
    timestamp: string;
    ipAddress: string | null;
    browser: string | null;
  } | null;
}

// --- Component ---

export function DashboardHeader() {
  const { data: session } = useSession();
  const router = useRouter();
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Fetch org info
  useEffect(() => {
    async function fetchOrg() {
      try {
        const res = await fetch("/api/admin/team-context");
        if (res.ok) {
          const data = await res.json();
          setOrgInfo({
            orgName: data.orgName || data.teamName || "My Organization",
            logoUrl: data.logoUrl || null,
            brandColor: data.brandColor || "#0066FF",
          });
          if (data.teamId) setTeamId(data.teamId);
        }
      } catch {
        // Fallback
      }
    }
    fetchOrg();
  }, []);

  // Fetch pending action count
  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard-stats");
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.pendingActions?.total || 0);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 60000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  // Fetch session security info (once on mount)
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/session-info", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setSessionInfo(data); })
      .catch((e) => { if (e?.name !== "AbortError") console.error("Failed to load session info:", e); });
    return () => controller.abort();
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Global keyboard shortcuts: ⌘K / Ctrl+K for search, Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // ⌘K or Ctrl+K — open search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      // Escape — close all panels
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSearchQuery("");
        setUserMenuOpen(false);
        setNotifOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // SSE: real-time refresh of badge counts when mutations happen
  const handleSSEEvent = useCallback(() => {
    // Any dashboard-relevant event triggers a re-fetch of pending counts
    fetchPending();
  }, [fetchPending]);

  useSSE({
    orgId: teamId,
    onEvent: handleSSEEvent,
    enabled: !!teamId,
  });

  const userName = session?.user?.name || session?.user?.email?.split("@")[0] || "User";
  const userEmail = session?.user?.email || "";
  const userInitials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/95 backdrop-blur-sm flex items-center px-4 lg:px-6 gap-4">
      {/* Left: Org logo + name */}
      <div className="flex items-center gap-2.5 min-w-0 flex-shrink-0">
        {orgInfo?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={orgInfo.logoUrl}
            alt={orgInfo.orgName}
            className="h-7 w-7 rounded object-cover"
          />
        ) : (
          <div
            className="h-7 w-7 rounded flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: orgInfo?.brandColor || "#0066FF" }}
          >
            {(orgInfo?.orgName || "O")[0].toUpperCase()}
          </div>
        )}
        <span className="text-sm font-semibold text-foreground truncate max-w-[180px] hidden sm:block">
          {orgInfo?.orgName || "Organization"}
        </span>
      </div>

      {/* Center: Search */}
      <div className="flex-1 flex justify-center" ref={searchRef}>
        <div className="relative w-full max-w-md">
          <button
            onClick={() => setSearchOpen(true)}
            className={cn(
              "flex items-center gap-2 w-full h-8 px-3 rounded-md border border-border bg-muted/40 text-sm text-muted-foreground hover:bg-muted/60 transition-colors",
              searchOpen && "hidden",
            )}
          >
            <Search className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="hidden sm:block">Search investors, funds, docs...</span>
            <span className="sm:hidden">Search...</span>
            <kbd className="hidden lg:inline-flex ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
              ⌘K
            </kbd>
          </button>
          {searchOpen && (
            <div className="absolute inset-x-0 top-0 z-50">
              <div className="flex items-center gap-2 h-8 px-3 rounded-md border border-[#0066FF] bg-background shadow-sm">
                <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search investors, funds, documents..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearchOpen(false);
                      setSearchQuery("");
                    }
                    if (e.key === "Enter" && searchQuery.trim()) {
                      router.push(`/admin/investors?search=${encodeURIComponent(searchQuery.trim())}`);
                      setSearchOpen(false);
                      setSearchQuery("");
                    }
                  }}
                />
                <button
                  onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: AI toggle + Notification bell + User menu */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* AI Assistant toggle */}
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("toggle-ai-assistant"));
          }}
          className="p-2 rounded-md hover:bg-muted text-muted-foreground transition-colors"
          aria-label="Toggle AI Assistant"
          title="AI Assistant"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 rounded-md hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center font-mono">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-border bg-background shadow-lg z-50">
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Notifications</span>
                  {pendingCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] h-5 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                      {pendingCount} pending
                    </Badge>
                  )}
                </div>
              </div>
              <div className="p-3">
                {pendingCount > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      You have {pendingCount} pending action{pendingCount !== 1 ? "s" : ""} requiring attention.
                    </p>
                    <Link href="/admin/dashboard">
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs bg-[#0066FF] hover:bg-[#0052CC] text-white"
                        onClick={() => setNotifOpen(false)}
                      >
                        View Dashboard
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-3">
                    All caught up! No pending actions.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User avatar + dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1.5 pr-2 rounded-md hover:bg-muted transition-colors"
          >
            <div className="h-7 w-7 rounded-full bg-[#0066FF] flex items-center justify-center text-white text-xs font-bold">
              {userInitials}
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-border bg-background shadow-lg z-50">
              <div className="p-3 border-b border-border">
                <p className="text-sm font-medium truncate">{userName}</p>
                <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
              </div>
              {/* Session security indicator */}
              <div className="px-3 py-2 border-b border-border">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Shield className="h-3 w-3" aria-hidden="true" />
                  {sessionInfo?.lastLogin ? (
                    <span>
                      Last login:{" "}
                      {new Date(sessionInfo.lastLogin.timestamp).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                      {sessionInfo.lastLogin.browser
                        ? ` via ${sessionInfo.lastLogin.browser}`
                        : ""}
                    </span>
                  ) : (
                    <span>First session</span>
                  )}
                </div>
              </div>
              <div className="p-1">
                <Link
                  href="/admin/settings"
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  Profile & Settings
                </Link>
                <Link
                  href="/admin/settings?tab=billing"
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Billing
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/admin/login" })}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-red-600 dark:text-red-400"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
