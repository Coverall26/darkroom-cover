"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  Wallet,
  FileText,
  Settings,
  Shield,
  Building2,
  PlusCircle,
  Store,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  ClipboardCheck,
  FolderOpen,
  Rocket,
  Landmark,
  Menu,
  X,
  CreditCard,
  UserSearch,
  LayoutTemplate,
  FolderIcon,
  PenLine,
  Contact,
  Brush,
  ServerIcon,
  Send,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// ── Mode type (matches Organization.featureFlags.mode) ──

type OrgMode = "GP_FUND" | "STARTUP" | "DATAROOM_ONLY";

// ── Nav item definition ──

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  matchPaths: string[];
  comingSoon?: boolean;
  badgeKey?: string;
  sectionLabel?: string; // Renders a small label above this item as section header
}

interface PendingCounts {
  pendingWires: number;
  pendingDocs: number;
  needsReview: number;
  awaitingWire: number;
  total: number;
}

// ── Mode-specific navigation items ──

const COMMON_TOP: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
    matchPaths: ["/admin/dashboard"],
  },
  {
    label: "Documents",
    href: "/documents",
    icon: FolderIcon,
    matchPaths: ["/documents"],
  },
  {
    label: "Datarooms",
    href: "/datarooms",
    icon: ServerIcon,
    matchPaths: ["/datarooms"],
  },
  {
    label: "E-Signature",
    href: "/sign",
    icon: PenLine,
    matchPaths: ["/sign"],
  },
  {
    label: "Visitors",
    href: "/visitors",
    icon: Contact,
    matchPaths: ["/visitors"],
  },
  {
    label: "Analytics",
    href: "/admin/analytics",
    icon: BarChart3,
    matchPaths: ["/admin/analytics", "/dashboard"],
  },
  {
    label: "Branding",
    href: "/branding",
    icon: Brush,
    matchPaths: ["/branding"],
  },
];

const GP_FUND_ITEMS: NavItem[] = [
  {
    label: "Funds",
    href: "/admin/fund",
    icon: Landmark,
    matchPaths: ["/admin/fund"],
    sectionLabel: "Fund Operations",
  },
  {
    label: "Investor CRM",
    href: "/admin/crm",
    icon: UserSearch,
    matchPaths: ["/admin/crm"],
  },
  {
    label: "Investors",
    href: "/admin/investors",
    icon: Users,
    matchPaths: ["/admin/investors"],
    badgeKey: "needsReview",
  },
  {
    label: "Manual Entry",
    href: "/admin/investors/new",
    icon: Wallet,
    matchPaths: ["/admin/investors/new", "/admin/manual-investment"],
  },
  {
    label: "Approvals",
    href: "/admin/approvals",
    icon: ClipboardCheck,
    matchPaths: ["/admin/approvals"],
    badgeKey: "needsReview",
  },
  {
    label: "LP Documents",
    href: "/admin/documents",
    icon: FileText,
    matchPaths: ["/admin/documents"],
    badgeKey: "pendingDocs",
  },
  {
    label: "Transactions",
    href: "/admin/transactions",
    icon: CreditCard,
    matchPaths: ["/admin/transactions"],
    badgeKey: "pendingWires",
  },
  {
    label: "Outreach",
    href: "/admin/outreach",
    icon: Send,
    matchPaths: ["/admin/outreach"],
  },
  {
    label: "Reports",
    href: "/admin/reports",
    icon: TrendingUp,
    matchPaths: ["/admin/reports"],
  },
  {
    label: "Offering Page",
    href: "/admin/offering",
    icon: LayoutTemplate,
    matchPaths: ["/admin/offering"],
  },
  {
    label: "Marketplace",
    href: "/admin/marketplace",
    icon: Store,
    matchPaths: ["/admin/marketplace"],
    comingSoon: true,
  },
];

const STARTUP_ITEMS: NavItem[] = [
  {
    label: "Raises",
    href: "/admin/fund",
    icon: Rocket,
    matchPaths: ["/admin/fund"],
    sectionLabel: "Raise Operations",
  },
  {
    label: "Investor CRM",
    href: "/admin/crm",
    icon: UserSearch,
    matchPaths: ["/admin/crm"],
  },
  {
    label: "Investors",
    href: "/admin/investors",
    icon: Users,
    matchPaths: ["/admin/investors"],
    badgeKey: "needsReview",
  },
  {
    label: "Manual Entry",
    href: "/admin/investors/new",
    icon: Wallet,
    matchPaths: ["/admin/investors/new", "/admin/manual-investment"],
  },
  {
    label: "Approvals",
    href: "/admin/approvals",
    icon: ClipboardCheck,
    matchPaths: ["/admin/approvals"],
    badgeKey: "needsReview",
  },
  {
    label: "LP Documents",
    href: "/admin/documents",
    icon: FileText,
    matchPaths: ["/admin/documents"],
    badgeKey: "pendingDocs",
  },
  {
    label: "Transactions",
    href: "/admin/transactions",
    icon: CreditCard,
    matchPaths: ["/admin/transactions"],
    badgeKey: "pendingWires",
  },
  {
    label: "Outreach",
    href: "/admin/outreach",
    icon: Send,
    matchPaths: ["/admin/outreach"],
  },
  {
    label: "Reports",
    href: "/admin/reports",
    icon: TrendingUp,
    matchPaths: ["/admin/reports"],
  },
];

const DATAROOM_ONLY_ITEMS: NavItem[] = [
  {
    label: "CRM / Leads",
    href: "/admin/crm",
    icon: UserSearch,
    matchPaths: ["/admin/crm"],
    sectionLabel: "Management",
  },
  {
    label: "LP Documents",
    href: "/admin/documents",
    icon: FileText,
    matchPaths: ["/admin/documents"],
  },
];

const COMMON_BOTTOM: NavItem[] = [
  {
    label: "Audit Log",
    href: "/admin/audit",
    icon: Shield,
    matchPaths: ["/admin/audit"],
    sectionLabel: "Admin",
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
    matchPaths: ["/admin/settings"],
  },
];

function getNavItems(mode: OrgMode): NavItem[] {
  const modeItems =
    mode === "GP_FUND"
      ? GP_FUND_ITEMS
      : mode === "STARTUP"
        ? STARTUP_ITEMS
        : DATAROOM_ONLY_ITEMS;

  return [...COMMON_TOP, ...modeItems, ...COMMON_BOTTOM];
}

// ── Sidebar component ──

interface AdminSidebarProps {
  mode?: OrgMode;
}

export function AdminSidebar({ mode: propMode }: AdminSidebarProps) {
  const pathname = usePathname() ?? "";
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [orgMode, setOrgMode] = useState<OrgMode>(propMode ?? "GP_FUND");
  const [pendingCounts, setPendingCounts] = useState<PendingCounts | null>(null);

  // Detect tablet viewport (768-1023px) — force collapsed sidebar
  useEffect(() => {
    const tabletQuery = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsTablet(e.matches);
    };
    handleChange(tabletQuery);
    tabletQuery.addEventListener("change", handleChange);
    return () => tabletQuery.removeEventListener("change", handleChange);
  }, []);

  // Sidebar is collapsed on tablet regardless of user preference
  const collapsed = isTablet || userCollapsed;

  // Fetch org mode from API if not provided via props
  const fetchOrgMode = useCallback(async () => {
    if (propMode) return;
    try {
      const res = await fetch("/api/admin/team-context");
      if (res.ok) {
        const data = await res.json();
        if (data.mode === "STARTUP" || data.mode === "DATAROOM_ONLY") {
          setOrgMode(data.mode);
        }
      }
    } catch {
      // Fall back to GP_FUND
    }
  }, [propMode]);

  useEffect(() => {
    fetchOrgMode();
  }, [fetchOrgMode]);

  // Fetch pending action counts for badges
  const fetchPendingCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard-stats");
      if (res.ok) {
        const data = await res.json();
        setPendingCounts(data.pendingActions || null);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    fetchPendingCounts();
    const interval = setInterval(fetchPendingCounts, 60000);
    return () => clearInterval(interval);
  }, [fetchPendingCounts]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const navItems = getNavItems(orgMode);

  const modeLabel =
    orgMode === "GP_FUND"
      ? "GP Admin"
      : orgMode === "STARTUP"
        ? "Startup Admin"
        : "Dataroom Admin";

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-border">
        {!collapsed ? (
          <Link href="/admin/dashboard" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/_static/fundroom-icon.png"
              alt="FundRoom AI"
              className="h-7 w-7 rounded"
            />
            <span className="text-lg font-bold text-foreground tracking-tight">FundRoom</span>
          </Link>
        ) : (
          <Link href="/admin/dashboard">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/_static/fundroom-icon.png"
              alt="FundRoom AI"
              className="h-7 w-7 rounded"
            />
          </Link>
        )}
        <button
          onClick={() => setUserCollapsed(!userCollapsed)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hidden lg:flex lg:items-center lg:justify-center min-h-[44px] min-w-[44px]"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.matchPaths.some((p) =>
            pathname.startsWith(p),
          );
          const badgeCount = item.badgeKey && pendingCounts
            ? (pendingCounts as unknown as Record<string, number>)[item.badgeKey] || 0
            : 0;

          return (
            <div key={item.href}>
              {/* Section divider + label */}
              {item.sectionLabel && (
                <div className="pt-3 pb-1 first:pt-0">
                  <div className="border-t border-border mx-1 mb-2" />
                  {!collapsed && (
                    <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {item.sectionLabel}
                    </p>
                  )}
                </div>
              )}
              <Link
                href={item.comingSoon ? "#" : item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors min-h-[40px]",
                  isActive
                    ? "bg-[#0066FF]/10 text-[#0066FF] font-medium border-l-2 border-[#0066FF]"
                    : item.comingSoon
                      ? "text-muted-foreground/50 cursor-default"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  collapsed && "justify-center px-2",
                )}
                title={collapsed ? item.label : undefined}
                onClick={item.comingSoon ? (e) => e.preventDefault() : undefined}
              >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!collapsed && (
                <span className="flex items-center gap-2 flex-1">
                  {item.label}
                  {item.comingSoon && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-muted-foreground/30 text-muted-foreground/50">
                      Soon
                    </Badge>
                  )}
                  {badgeCount > 0 && (
                    <span className="ml-auto bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {badgeCount}
                    </span>
                  )}
                </span>
              )}
              {collapsed && badgeCount > 0 && (
                <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-amber-500" />
              )}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        {!collapsed && (
          <p className="text-xs text-muted-foreground text-center">
            {modeLabel}
          </p>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button — only visible below md (768px) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 p-2 rounded-md bg-background border border-border shadow-sm md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-screen w-64 bg-background border-r border-border flex flex-col z-50 transform transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 p-2 rounded hover:bg-muted text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop/Tablet sidebar — visible at md+ (768px+), auto-collapsed on tablet (768-1023px) */}
      <aside
        className={cn(
          "sticky top-0 h-screen border-r border-border bg-muted/30 flex-col transition-all duration-200 hidden md:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
