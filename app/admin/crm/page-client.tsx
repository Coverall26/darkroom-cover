"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users,
  Plus,
  Upload,
  Search,
  X,
  LayoutGrid,
  List,
  ListTodo,
  Sparkles,
  Lock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import dynamic from "next/dynamic";
import { useTier } from "@/lib/hooks/use-tier";
import { ContactTable } from "@/components/crm/ContactTable";
import { ContactCapCounter } from "@/components/crm/ContactCapCounter";
import { EsigCapCounter } from "@/components/crm/EsigCapCounter";
import { UpgradeBanner } from "@/components/crm/UpgradeBanner";

// Dynamically import heavy components that are conditionally rendered
const ContactKanban = dynamic(
  () => import("@/components/crm/ContactKanban").then(m => ({ default: m.ContactKanban })),
  { loading: () => <div className="h-64 animate-pulse bg-muted rounded-lg" /> }
);
const ContactSidebar = dynamic(
  () => import("@/components/crm/ContactSidebar").then(m => ({ default: m.ContactSidebar })),
  { loading: () => <div className="h-64 animate-pulse bg-muted rounded-lg" /> }
);
const EmailCompose = dynamic(
  () => import("@/components/crm/EmailCompose").then(m => ({ default: m.EmailCompose })),
  { loading: () => <div className="h-64 animate-pulse bg-muted rounded-lg" /> }
);
const OutreachQueue = dynamic(
  () => import("@/components/crm/OutreachQueue").then(m => ({ default: m.OutreachQueue })),
  { loading: () => <div className="h-64 animate-pulse bg-muted rounded-lg" /> }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  company: string | null;
  title: string | null;
  status: string;
  source: string;
  engagementScore: number;
  lastEngagedAt: string | null;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  tags: string[] | null;
  investorId: string | null;
  investor?: {
    id: string;
    onboardingStep: number | null;
    accreditationStatus: string | null;
    entityType: string | null;
    investments?: Array<{
      id: string;
      commitmentAmount: number | null;
      fundedAmount: number | null;
      status: string;
    }>;
  } | null;
  contactActivities?: Array<{
    id: string;
    type: string;
    description: string | null;
    createdAt: string;
  }>;
  createdAt: string;
}

type CrmRole = "VIEWER" | "CONTRIBUTOR" | "MANAGER";
type ViewMode = "table" | "kanban" | "outreach";
type SortField = string;
type SortDir = "asc" | "desc";

/** Mode-aware pipeline stage label formatting. */
const STAGE_LABELS: Record<string, Record<string, string>> = {
  GP_FUND: {
    LEAD: "Lead",
    CONTACTED: "Contacted",
    INTERESTED: "Interested",
    CONVERTED: "Converted",
    NDA_SIGNED: "NDA Signed",
    ACCREDITED: "Accredited",
    COMMITTED: "Committed",
    FUNDED: "Funded",
  },
  STARTUP: {
    LEAD: "Lead",
    CONTACTED: "Contacted",
    INTERESTED: "Interested",
    CONVERTED: "Converted",
    NDA_SIGNED: "NDA Signed",
    ACCREDITED: "Accredited",
    COMMITTED: "Committed",
    FUNDED: "Funded",
  },
  DATAROOM_ONLY: {
    LEAD: "Lead",
    CONTACTED: "Contacted",
    INTERESTED: "Interested",
    CONVERTED: "Converted",
  },
};

function formatStageLabel(stage: string, mode: string): string {
  return STAGE_LABELS[mode]?.[stage] ?? stage.replace(/_/g, " ");
}

/** Client-side CRM permission check matching the server-side hierarchy. */
function hasCrmPermission(role: CrmRole, minimum: CrmRole): boolean {
  const hierarchy: Record<CrmRole, number> = { VIEWER: 0, CONTRIBUTOR: 1, MANAGER: 2 };
  return hierarchy[role] >= hierarchy[minimum];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CRMPageClient() {
  const { tier, aiCrmEnabled, productMode, limits, usage, isLoading: tierLoading, mutate: mutateTier } = useTier();

  // CRM role — defaults to VIEWER (most restrictive) until API confirms
  const [crmRole, setCrmRole] = useState<CrmRole>("VIEWER");
  const canContribute = hasCrmPermission(crmRole, "CONTRIBUTOR");
  const canManage = hasCrmPermission(crmRole, "MANAGER");

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortField>("lastEngagedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Data
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sidebar
  const [sidebarContactId, setSidebarContactId] = useState<string | null>(null);

  // Email compose
  const [composeTarget, setComposeTarget] = useState<Contact | null>(null);

  // Add contact form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", email: "", company: "" });
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);

  // Recalculate engagement
  const [recalculating, setRecalculating] = useState(false);

  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [search]);

  // Pipeline stages from tier: FREE/CRM_PRO = 4, FUNDROOM = 5
  const pipelineStages = limits?.pipelineStages ?? [
    "LEAD", "CONTACTED", "INTERESTED", "CONVERTED",
  ];

  // Fetch contacts
  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        sortBy,
        sortDir,
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/contacts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
        setTotal(data.total || 0);
        if (data.crmRole) setCrmRole(data.crmRole as CrmRole);
      }
    } catch {
      // Keep existing data
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortDir, debouncedSearch, statusFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Handlers
  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  };

  const handleStatusChange = async (contactId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/contacts/${contactId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        fetchContacts();
        if (sidebarContactId === contactId) {
          // Sidebar will refresh on its own
        }
      }
    } catch {
      // Silent fail, user can retry
    }
  };

  const handleDelete = async (contactId: string) => {
    try {
      const res = await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
      if (res.ok) {
        setSidebarContactId(null);
        fetchContacts();
        mutateTier();
      }
    } catch {
      // Silent fail
    }
  };

  const handleAddContact = async () => {
    if (!addForm.email.trim()) {
      setAddError("Email is required");
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: addForm.firstName.trim() || undefined,
          lastName: addForm.lastName.trim() || undefined,
          email: addForm.email.trim(),
          company: addForm.company.trim() || undefined,
          source: "MANUAL_ENTRY",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setAddError(data.error || "Failed to add contact");
        return;
      }
      setShowAddForm(false);
      setAddForm({ firstName: "", lastName: "", email: "", company: "" });
      fetchContacts();
      mutateTier();
    } catch {
      setAddError("Failed to add contact");
    } finally {
      setAddSaving(false);
    }
  };

  const handleComposeEmail = (contact: Contact) => {
    if (!canContribute) return;
    setComposeTarget(contact);
  };

  const handleRecalculateEngagement = async () => {
    if (!canManage || recalculating) return;
    setRecalculating(true);
    try {
      const res = await fetch("/api/contacts/recalculate-engagement", {
        method: "POST",
      });
      if (res.ok) {
        fetchContacts();
      }
    } catch {
      // Silent fail, user can retry
    } finally {
      setRecalculating(false);
    }
  };

  const totalPages = Math.ceil(total / 50);
  const hasKanban = limits?.hasKanban ?? false;
  const hasOutreachQueue = limits?.hasOutreachQueue ?? false;

  // Contact cap logic
  const contactLimit = usage?.contactLimit ?? null;
  const contactCount = usage?.contactCount ?? 0;
  const isAtContactLimit = contactLimit !== null && contactCount >= contactLimit;
  const remainingSlots = contactLimit !== null ? Math.max(0, contactLimit - contactCount) : null;

  // Loading skeleton for initial page load
  if (tierLoading || (loading && contacts.length === 0)) {
    return (
      <div className="space-y-4 p-4 sm:p-6 animate-pulse" aria-busy="true" aria-label="Loading CRM">
        {/* Header skeleton */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="h-6 w-48 bg-gray-700/50 rounded" />
            <div className="h-4 w-64 bg-gray-700/30 rounded mt-2" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 bg-gray-700/30 rounded" />
            <div className="h-8 w-28 bg-gray-700/40 rounded" />
            <div className="h-8 w-20 bg-gray-700/30 rounded" />
          </div>
        </div>
        {/* View tabs + filter skeleton */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1 rounded-lg border border-gray-700/30 p-1">
            <div className="h-7 w-16 bg-gray-700/40 rounded" />
            <div className="h-7 w-18 bg-gray-700/20 rounded" />
            <div className="h-7 w-20 bg-gray-700/20 rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-48 bg-gray-700/30 rounded" />
            <div className="h-8 w-36 bg-gray-700/30 rounded" />
          </div>
        </div>
        {/* Table skeleton */}
        <div className="rounded-lg border border-gray-700/30 overflow-hidden">
          <div className="flex gap-4 p-3 border-b border-gray-700/30">
            <div className="h-4 w-8 bg-gray-700/20 rounded" />
            <div className="h-4 w-32 bg-gray-700/30 rounded" />
            <div className="h-4 w-28 bg-gray-700/20 rounded" />
            <div className="h-4 w-24 bg-gray-700/20 rounded" />
            <div className="h-4 w-20 bg-gray-700/20 rounded" />
            <div className="h-4 w-16 bg-gray-700/20 rounded ml-auto" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3 border-b border-gray-700/10 last:border-0">
              <div className="h-4 w-8 bg-gray-700/10 rounded" />
              <div className="h-4 w-36 bg-gray-700/15 rounded" />
              <div className="h-4 w-40 bg-gray-700/10 rounded" />
              <div className="h-4 w-28 bg-gray-700/10 rounded" />
              <div className="h-4 w-20 bg-gray-700/15 rounded" />
              <div className="h-6 w-16 bg-gray-700/10 rounded-full ml-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state when no contacts exist and no search/filter active
  if (!loading && contacts.length === 0 && !debouncedSearch && statusFilter === "all") {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center mb-4">
            <Users className="h-7 w-7 text-gray-400" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-medium text-white mb-1">
            {tier === "FUNDROOM" ? "No investors yet" : "No contacts yet"}
          </h3>
          <p className="text-sm text-gray-400 max-w-md mb-6">
            {tier === "FUNDROOM"
              ? "Investors will appear here as they sign up through your dataroom or onboarding flow. You can also add them manually."
              : "Add your first contact to start building your pipeline. Contacts are also captured automatically from dataroom visitors."}
          </p>
          {canContribute && (
            <Button
              onClick={() => setShowAddForm(true)}
              className="min-h-[44px]"
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Add First Contact
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" aria-hidden="true" />
            {productMode === "DATAROOM_ONLY"
              ? "Leads"
              : productMode === "STARTUP"
              ? "Contact Pipeline"
              : tier === "FUNDROOM"
              ? "Investor Pipeline"
              : "Lead Management"}
            {aiCrmEnabled && (
              <Badge variant="outline" className="text-[10px] border-purple-400 text-purple-600 dark:text-purple-400">
                <Sparkles className="mr-0.5 h-3 w-3" aria-hidden="true" />
                AI
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {productMode === "DATAROOM_ONLY"
              ? "Track dataroom viewers and manage outreach"
              : tier === "FREE"
              ? "Manage up to 20 leads"
              : tier === "CRM_PRO"
              ? "Unlimited contacts with outreach tools"
              : "Full compliance pipeline with LP onboarding"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <ContactCapCounter />
            {usage && (
              <EsigCapCounter
                used={usage.esigUsedThisMonth ?? 0}
                limit={usage.esigLimit}
              />
            )}
          </div>
          {canContribute && (
            <Button
              size="sm"
              onClick={() => setShowAddForm(true)}
              disabled={isAtContactLimit}
              title={isAtContactLimit ? "Contact limit reached — upgrade to add more" : undefined}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {isAtContactLimit ? "Limit Reached" : "Add Contact"}
            </Button>
          )}
          {canContribute && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = "/admin/crm/import"}
              disabled={isAtContactLimit}
              title={isAtContactLimit ? "Contact limit reached — upgrade to import more" : remainingSlots !== null ? `${remainingSlots} CSV import slots remaining` : undefined}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {remainingSlots !== null ? `Import (${remainingSlots} slots)` : "Import"}
            </Button>
          )}
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecalculateEngagement}
              disabled={recalculating}
              title="Recalculate engagement scores for all contacts"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${recalculating ? "animate-spin" : ""}`} aria-hidden="true" />
              {recalculating ? "Recalculating..." : "Refresh Scores"}
            </Button>
          )}
        </div>
      </div>

      {/* Upgrade banner for FREE tier */}
      {tier === "FREE" && usage && usage.contactCount >= (usage.contactLimit ?? 20) && (
        <UpgradeBanner
          feature="contacts"
          currentTier={tier}
          message="You've reached the 20-contact limit. Upgrade to CRM Pro for unlimited contacts."
        />
      )}

      {/* View mode tabs + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-0.5">
          <ViewTab
            active={viewMode === "table"}
            onClick={() => setViewMode("table")}
            icon={List}
            label="Table"
          />
          <ViewTab
            active={viewMode === "kanban"}
            onClick={() => hasKanban ? setViewMode("kanban") : undefined}
            icon={LayoutGrid}
            label="Kanban"
            locked={!hasKanban}
          />
          <ViewTab
            active={viewMode === "outreach"}
            onClick={() => hasOutreachQueue ? setViewMode("outreach") : undefined}
            icon={ListTodo}
            label="Outreach"
            locked={!hasOutreachQueue}
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 pl-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2"
                aria-label="Clear search"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="h-8 w-36 text-sm" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {pipelineStages.map((s) => (
                <SelectItem key={s} value={s}>
                  {formatStageLabel(s, productMode)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quick add form */}
      {showAddForm && (
        <div className="rounded-lg border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">Quick Add Contact</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)} className="h-7 w-7 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <Input
              placeholder="First name"
              value={addForm.firstName}
              onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))}
              className="text-sm"
            />
            <Input
              placeholder="Last name"
              value={addForm.lastName}
              onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))}
              className="text-sm"
            />
            <Input
              placeholder="Email *"
              type="email"
              value={addForm.email}
              onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
              className="text-sm"
            />
            <Input
              placeholder="Company"
              value={addForm.company}
              onChange={(e) => setAddForm((f) => ({ ...f, company: e.target.value }))}
              className="text-sm"
            />
          </div>
          {addError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">{addError}</p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAddContact} disabled={addSaving}>
              {addSaving ? "Adding..." : "Add Contact"}
            </Button>
          </div>
        </div>
      )}

      {/* Main content */}
      {viewMode === "table" && (
        <>
          <ContactTable
            contacts={contacts as import("@/components/crm/ContactTable").ContactRow[]}
            tier={tier}
            aiCrmEnabled={aiCrmEnabled}
            pipelineStages={pipelineStages}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleAll={handleToggleAll}
            onRowClick={(c) => setSidebarContactId(c.id)}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
            crmRole={crmRole}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of{" "}
                <span className="font-mono">{total}</span> contacts
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {viewMode === "kanban" && hasKanban && (
        <ContactKanban
          contacts={contacts as import("@/components/crm/ContactTable").ContactRow[]}
          pipelineStages={pipelineStages}
          tier={tier}
          aiCrmEnabled={aiCrmEnabled}
          onCardClick={(c: import("@/components/crm/ContactTable").ContactRow) => setSidebarContactId(c.id)}
          onStatusChange={canContribute ? handleStatusChange : undefined}
          crmRole={crmRole}
        />
      )}

      {viewMode === "outreach" && hasOutreachQueue && (
        <OutreachQueue
          onContactClick={(id) => setSidebarContactId(id)}
          onComposeEmail={(c) => handleComposeEmail(c as unknown as Contact)}
          crmRole={crmRole}
        />
      )}

      {/* Contact sidebar */}
      {sidebarContactId && (
        <ContactSidebar
          contactId={sidebarContactId}
          tier={tier}
          aiCrmEnabled={aiCrmEnabled}
          pipelineStages={pipelineStages}
          crmRole={crmRole}
          onClose={() => setSidebarContactId(null)}
          onStatusChange={handleStatusChange}
          onOpenCompose={(contactId) => {
            const contact = contacts.find((c) => c.id === contactId);
            if (contact) handleComposeEmail(contact);
          }}
        />
      )}

      {/* Email compose */}
      {composeTarget && (
        <div className="fixed inset-x-0 bottom-0 z-50 p-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[480px]">
          <EmailCompose
            contactId={composeTarget.id}
            contactEmail={composeTarget.email}
            contactName={
              [composeTarget.firstName, composeTarget.lastName].filter(Boolean).join(" ") ||
              composeTarget.email
            }
            onClose={() => setComposeTarget(null)}
            onSent={() => {
              setComposeTarget(null);
              fetchContacts();
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ViewTab
// ---------------------------------------------------------------------------

function ViewTab({
  active,
  onClick,
  icon: Icon,
  label,
  locked,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  locked?: boolean;
}) {
  return (
    <button
      onClick={locked ? undefined : onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-background text-foreground shadow-sm"
          : locked
          ? "text-muted-foreground/50 cursor-not-allowed"
          : "text-muted-foreground hover:text-foreground"
      }`}
      disabled={locked}
      title={locked ? `Upgrade to unlock ${label} view` : undefined}
    >
      {locked ? (
        <Lock className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
