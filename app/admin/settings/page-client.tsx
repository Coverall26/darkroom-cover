"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Settings,
  Shield,
  FileText,
  Eye,
  Link2,
  Building2,
  Users,
  Landmark,
  Layers,
  Palette,
  UserCheck,
  Info,
  Tag,
  ShieldCheck,
  Globe,
  Mail,
  FileSignature,
  PenLine,
  ClipboardCheck,
  Webhook,
  Key,
  Sliders,
  Database,
  Bot,
  Landmark as LandmarkIcon,
  Search,
  X,
  AlertTriangle,
  Bell,
  Monitor,
  CreditCard,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

// ─── Shared types + utilities (used by section components) ───────────────────
import { SettingsCard } from "./shared";
import type { OrgData, OrgDefaultsData, TierInfo } from "./shared";

// ─── Section Components (lazy-loaded for bundle optimization) ────────────────
import dynamic from "next/dynamic";

function SectionSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

// Previously extracted sections (self-contained, accept teamId)
const TeamManagementSection = dynamic(() => import("./sections/team-management").then(m => ({ default: m.TeamManagementSection })), { loading: () => <SectionSkeleton /> });
const TagsSection = dynamic(() => import("./sections/tags-management").then(m => ({ default: m.TagsSection })), { loading: () => <SectionSkeleton /> });
const AccessControlsSection = dynamic(() => import("./sections/access-controls").then(m => ({ default: m.AccessControlsSection })), { loading: () => <SectionSkeleton /> });
const CustomDomainsSection = dynamic(() => import("./sections/custom-domains").then(m => ({ default: m.CustomDomainsSection })), { loading: () => <SectionSkeleton /> });
const EmailDomainSection = dynamic(() => import("./sections/email-domain").then(m => ({ default: m.EmailDomainSection })), { loading: () => <SectionSkeleton /> });
const AgreementsSection = dynamic(() => import("./sections/agreements").then(m => ({ default: m.AgreementsSection })), { loading: () => <SectionSkeleton /> });
const SignatureTemplatesSection = dynamic(() => import("./sections/signature-templates").then(m => ({ default: m.SignatureTemplatesSection })), { loading: () => <SectionSkeleton /> });
const SignatureAuditSection = dynamic(() => import("./sections/signature-audit").then(m => ({ default: m.SignatureAuditSection })), { loading: () => <SectionSkeleton /> });
const WebhooksSection = dynamic(() => import("./sections/webhooks").then(m => ({ default: m.WebhooksSection })), { loading: () => <SectionSkeleton /> });
const ApiTokensSection = dynamic(() => import("./sections/api-tokens").then(m => ({ default: m.ApiTokensSection })), { loading: () => <SectionSkeleton /> });
const LinkPresetsSection = dynamic(() => import("./sections/link-presets").then(m => ({ default: m.LinkPresetsSection })), { loading: () => <SectionSkeleton /> });
const DataMigrationSection = dynamic(() => import("./sections/data-migration").then(m => ({ default: m.DataMigrationSection })), { loading: () => <SectionSkeleton /> });
const AISettingsSection = dynamic(() => import("./sections/ai-settings").then(m => ({ default: m.AISettingsSection })), { loading: () => <SectionSkeleton /> });
const FundSettingsSection = dynamic(() => import("./sections/fund-settings").then(m => ({ default: m.FundSettingsSection })), { loading: () => <SectionSkeleton /> });
const BillingCrmSection = dynamic(() => import("./sections/billing-crm").then(m => ({ default: m.BillingCrmSection })), { loading: () => <SectionSkeleton /> });
const CrmPreferencesSection = dynamic(() => import("./sections/crm-preferences").then(m => ({ default: m.CrmPreferencesSection })), { loading: () => <SectionSkeleton /> });

// Newly extracted sections (accept props from parent state)
const CompanySection = dynamic(() => import("./sections/company").then(m => ({ default: m.CompanySection })), { loading: () => <SectionSkeleton /> });
const BrandingSection = dynamic(() => import("./sections/branding").then(m => ({ default: m.BrandingSection })), { loading: () => <SectionSkeleton /> });
const ComplianceSection = dynamic(() => import("./sections/compliance").then(m => ({ default: m.ComplianceSection })), { loading: () => <SectionSkeleton /> });
const DataroomDefaultsSection = dynamic(() => import("./sections/dataroom-defaults").then(m => ({ default: m.DataroomDefaultsSection })), { loading: () => <SectionSkeleton /> });
const LinkDefaultsSection = dynamic(() => import("./sections/link-defaults").then(m => ({ default: m.LinkDefaultsSection })), { loading: () => <SectionSkeleton /> });
const LPOnboardingSection = dynamic(() => import("./sections/lp-onboarding").then(m => ({ default: m.LPOnboardingSection })), { loading: () => <SectionSkeleton /> });
const AuditSection = dynamic(() => import("./sections/audit").then(m => ({ default: m.AuditSection })), { loading: () => <SectionSkeleton /> });
const NotificationsSection = dynamic(() => import("./sections/notifications").then(m => ({ default: m.NotificationsSection })), { loading: () => <SectionSkeleton /> });
const LPPortalSettingsSection = dynamic(() => import("./sections/lp-portal").then(m => ({ default: m.LPPortalSettingsSection })), { loading: () => <SectionSkeleton /> });
const IntegrationsStatusCard = dynamic(() => import("./sections/integrations-status").then(m => ({ default: m.IntegrationsStatusCard })), { loading: () => <SectionSkeleton /> });
const MarketplacePlaceholderCard = dynamic(() => import("./sections/marketplace-placeholder").then(m => ({ default: m.MarketplacePlaceholderCard })), { loading: () => <SectionSkeleton /> });

// ─── Types ──────────────────────────────────────────────────────────────────

interface FullSettingsData {
  org: OrgData | null;
  orgDefaults: OrgDefaultsData | null;
  team: {
    id: string;
    name: string;
    emailFromName: string | null;
    emailFromAddress: string | null;
    emailDomain: string | null;
  };
  funds: Array<{ id: string; name: string }>;
  tierMap: Record<string, TierInfo>;
  resolved: Record<string, unknown>;
  counts: { datarooms: number; links: number; funds: number };
}

// ─── Tab Configuration ──────────────────────────────────────────────────────

type TabKey = "organization" | "fundInvestor" | "lpVisibility" | "docsSigning" | "teamAccess" | "domainEmail" | "advanced";

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof Settings;
  sections: string[];
}

const TABS: TabDef[] = [
  {
    key: "organization",
    label: "Organization",
    icon: Building2,
    sections: ["company", "branding", "integrations", "billing", "crmPreferences"],
  },
  {
    key: "fundInvestor",
    label: "Fund & Investor",
    icon: Landmark,
    sections: ["compliance", "fundSettings", "notifications", "marketplace"],
  },
  {
    key: "lpVisibility",
    label: "LP Visibility",
    icon: Eye,
    sections: ["lpPortalSettings", "lpOnboarding"],
  },
  {
    key: "docsSigning",
    label: "Documents & Signing",
    icon: FileSignature,
    sections: ["agreements", "signatureTemplates", "signatureAudit"],
  },
  {
    key: "teamAccess",
    label: "Team & Access",
    icon: Users,
    sections: ["team", "tags", "accessControls", "apiTokens"],
  },
  {
    key: "domainEmail",
    label: "Domain & Email",
    icon: Globe,
    sections: ["domains", "emailDomain"],
  },
  {
    key: "advanced",
    label: "Advanced",
    icon: Sliders,
    sections: ["dataroomDefaults", "linkDefaults", "linkPresets", "webhooks", "aiSettings", "dataMigration", "audit"],
  },
];

// Section metadata for search
const SECTION_META: Record<string, { title: string; keywords: string; icon: typeof Settings }> = {
  company: { title: "Company Information", keywords: "organization name entity type address phone sector geography website", icon: Building2 },
  branding: { title: "Branding", keywords: "brand color accent logo email sender theme", icon: Palette },
  compliance: { title: "Compliance & Verification", keywords: "nda accreditation kyc mfa verification security", icon: Shield },
  lpOnboarding: { title: "LP Onboarding Defaults", keywords: "investor onboarding staged commitments nda accreditation", icon: UserCheck },
  fundSettings: { title: "Fund Settings", keywords: "fund nda gate features toggle", icon: LandmarkIcon },
  agreements: { title: "Agreements & NDAs", keywords: "agreement nda template document", icon: FileSignature },
  signatureTemplates: { title: "Signature Templates", keywords: "signature template esign document", icon: PenLine },
  signatureAudit: { title: "Signature Audit Log", keywords: "audit log signature compliance sec 506", icon: ClipboardCheck },
  team: { title: "Team Management", keywords: "team member invite role permission", icon: Users },
  tags: { title: "Tags", keywords: "tag label category organize", icon: Tag },
  accessControls: { title: "Access Controls", keywords: "access control permission security", icon: ShieldCheck },
  apiTokens: { title: "API Tokens", keywords: "api token key developer integration", icon: Key },
  domains: { title: "Custom Domains", keywords: "domain custom url branding", icon: Globe },
  emailDomain: { title: "Email Domain", keywords: "email domain dns sender verification", icon: Mail },
  dataroomDefaults: { title: "Dataroom Defaults", keywords: "dataroom conversation download updated", icon: FileText },
  linkDefaults: { title: "Link Defaults", keywords: "link email gate download notification watermark password expiration", icon: Link2 },
  linkPresets: { title: "Link Presets", keywords: "link preset share social", icon: Sliders },
  webhooks: { title: "Webhooks", keywords: "webhook integration outgoing incoming event", icon: Webhook },
  aiSettings: { title: "AI Agents", keywords: "ai agent automation", icon: Bot },
  dataMigration: { title: "Data Export / Import", keywords: "export import migration data backup", icon: Database },
  audit: { title: "Audit & Retention", keywords: "audit log retention sec finra compliance", icon: Eye },
  notifications: { title: "Notification Preferences", keywords: "notification email alert gp lp commitment wire onboarding document", icon: Bell },
  lpPortalSettings: { title: "LP Portal Settings", keywords: "lp portal investor document upload approval accreditation", icon: Monitor },
  integrations: { title: "Integrations", keywords: "integration persona kyc stripe ach quickbooks wolters kluwer phase 2", icon: Layers },
  billing: { title: "Billing & Subscription", keywords: "billing subscription plan payment stripe upgrade", icon: CreditCard },
  crmPreferences: { title: "CRM Preferences", keywords: "crm digest auto capture engagement scoring outreach signature", icon: Users },
  marketplace: { title: "Marketplace", keywords: "marketplace listing deal profile publish investor discovery", icon: Store },
};

// ─── Tier badge colors (used in legend) ─────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  System: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  Organization: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Team: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Fund: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const TIER_ICONS: Record<string, typeof Building2> = {
  System: Layers,
  Organization: Building2,
  Team: Users,
  Fund: Landmark,
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function SettingsCenterPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [fullData, setFullData] = useState<FullSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState("");
  const [selectedFundId, setSelectedFundId] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["company", "compliance", "dataroomDefaults", "lpOnboarding"]),
  );
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [applyBanner, setApplyBanner] = useState<{ section: string; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("organization");
  const [searchQuery, setSearchQuery] = useState("");
  const [dirtySections, setDirtySections] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  // Track dirty sections for unsaved changes warning
  const markDirty = useCallback((sectionId: string) => {
    setDirtySections((prev) => new Set(prev).add(sectionId));
  }, []);
  const clearDirty = useCallback((sectionId: string) => {
    setDirtySections((prev) => {
      const next = new Set(prev);
      next.delete(sectionId);
      return next;
    });
  }, []);

  const hasDirtyChanges = dirtySections.size > 0;

  // Warn on browser navigation/close when there are unsaved changes
  useEffect(() => {
    if (!hasDirtyChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasDirtyChanges]);

  // Read URL params on mount to support deep links (e.g. from fund card gear icon)
  useEffect(() => {
    const tab = searchParams?.get("tab");
    const fundId = searchParams?.get("fundId");
    if (tab && TABS.some((t) => t.key === tab)) {
      setActiveTab(tab as TabKey);
    }
    if (fundId) {
      setSelectedFundId(fundId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  // Fetch user's team
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/teams")
      .then((r) => r.json())
      .then((teams) => {
        if (teams?.length > 0) setTeamId(teams[0].id);
      })
      .catch((e) => console.error("Failed to load teams:", e));
  }, [status]);

  // Fetch full settings data
  const fetchSettings = useCallback(() => {
    if (!teamId) return;
    setLoading(true);
    const params = new URLSearchParams({ teamId });
    if (selectedFundId) params.set("fundId", selectedFundId);

    fetch(`/api/admin/settings/full?${params}`)
      .then((r) => r.json())
      .then((result) => {
        setFullData(result);
        if (!selectedFundId && result.funds?.length > 0) {
          setSelectedFundId(result.funds[0].id);
        }
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, [teamId, selectedFundId]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async (section: string, data: Record<string, unknown>) => {
    setSavingSection(section);
    try {
      const res = await fetch("/api/admin/settings/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, section, data }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save settings");
        return;
      }

      toast.success("Settings saved");
      clearDirty(section);
      fetchSettings();

      // Show apply banner for cascadable sections
      const counts = fullData?.counts;
      if (section === "dataroomDefaults" && counts && counts.datarooms > 0) {
        setApplyBanner({
          section,
          message: `Apply to ${counts.datarooms} existing dataroom${counts.datarooms > 1 ? "s" : ""}?`,
        });
      } else if (section === "linkDefaults" && counts && counts.links > 0) {
        setApplyBanner({
          section,
          message: `Apply to ${counts.links} existing link${counts.links > 1 ? "s" : ""}?`,
        });
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSavingSection(null);
    }
  };

  const handleApplyToExisting = async () => {
    if (!applyBanner) return;
    setSavingSection(applyBanner.section);
    try {
      await fetch("/api/admin/settings/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          section: applyBanner.section,
          data: {},
          applyToExisting: true,
        }),
      });
      toast.success("Applied to existing resources");
    } catch {
      toast.error("Failed to apply");
    } finally {
      setSavingSection(null);
      setApplyBanner(null);
    }
  };

  // Tab change with unsaved changes warning
  const handleTabChange = (tab: TabKey) => {
    if (hasDirtyChanges) {
      const currentTabSections = TABS.find((t) => t.key === activeTab)?.sections || [];
      const dirtyInCurrentTab = currentTabSections.some((s) => dirtySections.has(s));
      if (dirtyInCurrentTab) {
        const proceed = window.confirm(
          "You have unsaved changes in this tab. Switch anyway?",
        );
        if (!proceed) return;
        // Clear dirty for sections in old tab
        currentTabSections.forEach((s) => clearDirty(s));
      }
    }
    setActiveTab(tab);
  };

  // Search filtering
  const isSearching = searchQuery.trim().length > 0;
  const searchLower = searchQuery.toLowerCase();

  const visibleSections = useMemo(() => {
    if (!isSearching) {
      return TABS.find((t) => t.key === activeTab)?.sections || [];
    }
    // When searching, show matching sections from ALL tabs
    return Object.entries(SECTION_META)
      .filter(([, meta]) => {
        const combined = `${meta.title} ${meta.keywords}`.toLowerCase();
        return combined.includes(searchLower);
      })
      .map(([id]) => id);
  }, [activeTab, isSearching, searchLower]);

  // Loading skeleton
  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="mt-2 h-4 w-80" />
          </div>
          <Skeleton className="h-8 w-8 rounded" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-md" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!fullData) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
        <Settings className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">No settings data available.</p>
        <Button variant="outline" size="sm" onClick={fetchSettings}>
          Retry
        </Button>
      </div>
    );
  }

  const { org, orgDefaults, team, funds, tierMap, counts } = fullData;

  // Render section by ID
  const renderSection = (sectionId: string) => {
    const meta = SECTION_META[sectionId];
    if (!meta) return null;

    const isHighlighted = isSearching;

    return (
      <SettingsCard
        key={sectionId}
        id={sectionId}
        title={meta.title}
        icon={meta.icon}
        expanded={expandedSections.has(sectionId)}
        onToggle={() => toggleSection(sectionId)}
        highlighted={isHighlighted}
        dirty={dirtySections.has(sectionId)}
      >
        {renderSectionContent(sectionId)}
      </SettingsCard>
    );
  };

  const renderSectionContent = (sectionId: string) => {
    switch (sectionId) {
      case "company":
        return (
          <CompanySection
            org={org}
            saving={savingSection === "company"}
            onSave={(data) => handleSave("company", data)}
            onDirty={() => markDirty("company")}
          />
        );
      case "branding":
        return (
          <BrandingSection
            org={org}
            team={team}
            saving={savingSection === "branding"}
            onSave={(data) => handleSave("branding", data)}
            onDirty={() => markDirty("branding")}
          />
        );
      case "compliance":
        return (
          <ComplianceSection
            orgDefaults={orgDefaults}
            tierMap={tierMap}
            saving={savingSection === "compliance"}
            onSave={(data) => handleSave("compliance", data)}
            onDirty={() => markDirty("compliance")}
          />
        );
      case "dataroomDefaults":
        return (
          <DataroomDefaultsSection
            orgDefaults={orgDefaults}
            tierMap={tierMap}
            saving={savingSection === "dataroomDefaults"}
            onSave={(data) => handleSave("dataroomDefaults", data)}
            onDirty={() => markDirty("dataroomDefaults")}
          />
        );
      case "linkDefaults":
        return (
          <LinkDefaultsSection
            orgDefaults={orgDefaults}
            tierMap={tierMap}
            saving={savingSection === "linkDefaults"}
            onSave={(data) => handleSave("linkDefaults", data)}
            onDirty={() => markDirty("linkDefaults")}
          />
        );
      case "lpOnboarding":
        return (
          <LPOnboardingSection
            orgDefaults={orgDefaults}
            tierMap={tierMap}
            saving={savingSection === "lpOnboarding"}
            onSave={(data) => handleSave("lpOnboarding", data)}
            onDirty={() => markDirty("lpOnboarding")}
          />
        );
      case "audit":
        return (
          <AuditSection
            orgDefaults={orgDefaults}
            tierMap={tierMap}
            saving={savingSection === "audit"}
            onSave={(data) => handleSave("audit", data)}
            onDirty={() => markDirty("audit")}
          />
        );
      case "team":
        return <TeamManagementSection teamId={teamId} />;
      case "tags":
        return <TagsSection teamId={teamId} />;
      case "accessControls":
        return <AccessControlsSection teamId={teamId} />;
      case "domains":
        return <CustomDomainsSection teamId={teamId} />;
      case "emailDomain":
        return <EmailDomainSection teamId={teamId} />;
      case "agreements":
        return <AgreementsSection teamId={teamId} />;
      case "signatureTemplates":
        return <SignatureTemplatesSection teamId={teamId} />;
      case "signatureAudit":
        return <SignatureAuditSection teamId={teamId} />;
      case "webhooks":
        return <WebhooksSection teamId={teamId} />;
      case "apiTokens":
        return <ApiTokensSection teamId={teamId} />;
      case "linkPresets":
        return <LinkPresetsSection teamId={teamId} />;
      case "fundSettings":
        return <FundSettingsSection teamId={teamId} />;
      case "aiSettings":
        return <AISettingsSection teamId={teamId} />;
      case "dataMigration":
        return <DataMigrationSection teamId={teamId} />;
      case "notifications":
        return (
          <NotificationsSection
            orgDefaults={orgDefaults}
            saving={savingSection === "notifications"}
            onSave={(data) => handleSave("notifications", data)}
            onDirty={() => markDirty("notifications")}
          />
        );
      case "lpPortalSettings":
        return (
          <LPPortalSettingsSection
            orgDefaults={orgDefaults}
            saving={savingSection === "lpPortalSettings"}
            onSave={(data) => handleSave("lpPortalSettings", data)}
            onDirty={() => markDirty("lpPortalSettings")}
          />
        );
      case "integrations":
        return <IntegrationsStatusCard />;
      case "billing":
        return <BillingCrmSection teamId={teamId} />;
      case "crmPreferences":
        return <CrmPreferencesSection teamId={teamId} />;
      case "marketplace":
        return <MarketplacePlaceholderCard />;
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your organization, branding, compliance, and defaults.
            Changes cascade via Settings Inheritance.
          </p>
        </div>
        <Settings className="h-8 w-8 text-muted-foreground" />
      </div>

      {/* Unsaved changes banner */}
      {hasDirtyChanges && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-800 dark:bg-amber-900/20">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-sm text-amber-700 dark:text-amber-300">
            You have unsaved changes in:{" "}
            {Array.from(dirtySections)
              .map((s) => SECTION_META[s]?.title || s)
              .join(", ")}
          </span>
        </div>
      )}

      {/* Search box */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search settings..."
          className="pl-10 pr-10 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(""); searchRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Tab bar (hidden during search) */}
      {!isSearching && (
        <div className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-px dark:border-gray-800">
          {TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.key;
            const dirtyCount = tab.sections.filter((s) => dirtySections.has(s)).length;
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    : "border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground dark:hover:border-gray-600",
                )}
              >
                <TabIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                {dirtyCount > 0 && (
                  <span className="ml-1 h-2 w-2 rounded-full bg-amber-500" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Tier Legend + Fund selector row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {["System", "Organization", "Team", "Fund"].map((tier) => {
            const Icon = TIER_ICONS[tier];
            return (
              <span
                key={tier}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TIER_COLORS[tier]}`}
              >
                <Icon className="h-3 w-3" />
                {tier}
              </span>
            );
          })}
        </div>
        {funds.length > 0 && (
          <select
            value={selectedFundId}
            onChange={(e) => setSelectedFundId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Team-level only</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Apply Banner */}
      {applyBanner && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-900/20">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-500" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {applyBanner.message}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setApplyBanner(null)}
              className="text-sm"
            >
              Skip
            </Button>
            <Button
              size="sm"
              onClick={handleApplyToExisting}
              disabled={savingSection !== null}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              Apply to All
            </Button>
          </div>
        </div>
      )}

      {/* Search results indicator */}
      {isSearching && (
        <p className="text-xs text-muted-foreground">
          Showing {visibleSections.length} matching section{visibleSections.length !== 1 ? "s" : ""} across all tabs
        </p>
      )}

      {/* Sections */}
      <div className="space-y-4">
        {/* LP Visibility tab callout banner */}
        {activeTab === "lpVisibility" && !searchQuery && (
          <div className="rounded-lg border border-[#0066FF]/20 bg-[#0066FF]/5 dark:bg-[#0066FF]/10 p-4">
            <div className="flex items-start gap-3">
              <Eye className="h-5 w-5 text-[#0066FF] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">White-Label LP Portal Controls</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Control what investors see and can do in their portal. These settings shape the LP experience
                  for your fund — document uploads, accreditation workflows, approval gates, and onboarding steps.
                </p>
              </div>
            </div>
          </div>
        )}
        {visibleSections.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No settings match &quot;{searchQuery}&quot;
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery("")}
              className="text-xs"
            >
              Clear search
            </Button>
          </div>
        ) : (
          visibleSections.map((sectionId) => renderSection(sectionId))
        )}
      </div>
    </div>
  );
}
