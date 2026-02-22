"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Eye,
  Loader2,
  Pencil,
  Rocket,
  Save,
  Shield,
  Shuffle,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FundingRoundsConfig } from "@/components/admin/funding-rounds-config";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FundSettings {
  id: string;
  name: string;
  status: string;
  entityMode: string | null;
  // Investor Portal
  ndaGateEnabled: boolean;
  stagedCommitmentsEnabled: boolean;
  callFrequency: string | null;
  minimumInvestment: number | null;
  capitalCallThresholdEnabled: boolean;
  capitalCallThreshold: number | null;
  // Fund Economics
  managementFeePct: number | null;
  carryPct: number | null;
  hurdleRate: number | null;
  waterfallType: string | null;
  currency: string | null;
  termYears: number | null;
  extensionYears: number | null;
  highWaterMark: boolean;
  gpCommitmentAmount: number | null;
  gpCommitmentPct: number | null;
  investmentPeriodYears: number | null;
  preferredReturnMethod: string | null;
  recyclingEnabled: boolean;
  clawbackProvision: boolean;
  // Wire Instructions
  wireInstructions: Record<string, string> | null;
  wireInstructionsUpdatedAt: string | null;
  // LP Visibility
  featureFlags: Record<string, boolean> | null;
  // Raise
  currentRaise: number;
  targetRaise: number;
  regulationDExemption: string | null;
}

interface FundListItem {
  id: string;
  name: string;
  status: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
        checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"
      } ${disabled ? "opacity-50 cursor-wait" : ""}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function SettingRow({
  icon: Icon,
  label,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded bg-muted/30 px-2.5 py-2 dark:bg-gray-900/30">
      <div className="flex items-center gap-2 min-w-0 mr-3">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-medium">{label}</p>
          {description && (
            <p className="text-[10px] text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function GroupHeader({
  icon: Icon,
  title,
  expanded,
  onToggle,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 w-full py-1.5 text-left"
    >
      {expanded ? (
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <Icon className="h-3.5 w-3.5 text-blue-500" />
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      {badge && (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 ml-auto">
          {badge}
        </Badge>
      )}
    </button>
  );
}

const CALL_FREQUENCY_OPTIONS = [
  { value: "AS_NEEDED", label: "As Needed" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "SEMI_ANNUAL", label: "Semi-Annual" },
  { value: "ANNUAL", label: "Annual" },
];

const WATERFALL_OPTIONS = [
  { value: "EUROPEAN", label: "European (Whole Fund)" },
  { value: "AMERICAN", label: "American (Deal-by-Deal)" },
  { value: "DEAL_BY_DEAL", label: "Deal-by-Deal" },
];

const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "SGD"];

const LP_VISIBILITY_FLAGS = [
  { key: "showCapitalCalls", label: "Show Capital Calls", description: "LP can see capital call history" },
  { key: "showDistributions", label: "Show Distributions", description: "LP can see distribution history" },
  { key: "showNAV", label: "Show NAV / Valuation", description: "LP can see current fund NAV" },
  { key: "showDocuments", label: "Show Document Vault", description: "LP can access document vault" },
  { key: "showTransactions", label: "Show Transaction History", description: "LP can see all transactions" },
  { key: "showReports", label: "Show Reports / K-1", description: "LP can access tax documents" },
];

const WIRE_FIELDS = [
  { key: "bankName", label: "Bank Name" },
  { key: "accountName", label: "Account Name" },
  { key: "accountNumber", label: "Account Number" },
  { key: "routingNumber", label: "Routing Number" },
  { key: "swiftCode", label: "SWIFT / BIC" },
  { key: "memoFormat", label: "Memo / Reference Format" },
  { key: "specialInstructions", label: "Special Instructions" },
];

function formatCurrency(val: number | null): string {
  if (val === null || val === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(val);
}

function formatPct(val: number | null): string {
  if (val === null || val === undefined) return "—";
  return `${val.toFixed(2)}%`;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function FundSettingsSection({ teamId }: { teamId: string }) {
  const [funds, setFunds] = useState<FundListItem[]>([]);
  const [selectedFundId, setSelectedFundId] = useState<string>("");
  const [fundSettings, setFundSettings] = useState<FundSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["portal"])
  );
  const [editingWire, setEditingWire] = useState(false);
  const [wireForm, setWireForm] = useState<Record<string, string>>({});
  const [switchingMode, setSwitchingMode] = useState(false);
  const [modeConfirmOpen, setModeConfirmOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<string | null>(null);

  // Fetch fund list
  const fetchFunds = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/funds`);
      if (res.ok) {
        const data = await res.json();
        const fundList = (data.funds || []) as FundListItem[];
        setFunds(fundList);
        if (fundList.length > 0 && !selectedFundId) {
          setSelectedFundId(fundList[0].id);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [teamId, selectedFundId]);

  useEffect(() => {
    fetchFunds();
  }, [fetchFunds]);

  // Fetch selected fund settings
  const fetchFundSettings = useCallback(async () => {
    if (!selectedFundId) return;
    setLoadingSettings(true);
    try {
      const res = await fetch(`/api/funds/${selectedFundId}/settings`);
      if (res.ok) {
        const data = await res.json();
        setFundSettings(data.fund);
      } else {
        toast.error("Failed to load fund settings");
      }
    } catch {
      toast.error("Failed to load fund settings");
    } finally {
      setLoadingSettings(false);
    }
  }, [selectedFundId]);

  useEffect(() => {
    if (selectedFundId) fetchFundSettings();
  }, [selectedFundId, fetchFundSettings]);

  // Update a single field
  const updateField = async (field: string, value: unknown) => {
    if (!selectedFundId || !fundSettings) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/funds/${selectedFundId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to update");
        return;
      }
      const data = await res.json();
      setFundSettings(data.fund);
      toast.success("Setting updated");
    } catch {
      toast.error("Failed to update setting");
    } finally {
      setSaving(false);
    }
  };

  // Update feature flag
  const updateFeatureFlag = async (flagKey: string, value: boolean) => {
    if (!fundSettings) return;
    const merged = { ...(fundSettings.featureFlags || {}), [flagKey]: value };
    await updateField("featureFlags", merged);
  };

  // Save wire instructions
  const saveWireInstructions = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/funds/${selectedFundId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wireInstructions: wireForm }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to save wire instructions");
        return;
      }
      const data = await res.json();
      setFundSettings(data.fund);
      setEditingWire(false);
      toast.success("Wire instructions updated");
    } catch {
      toast.error("Failed to save wire instructions");
    } finally {
      setSaving(false);
    }
  };

  // Switch fund mode (FUND ↔ STARTUP)
  const switchFundMode = async (newMode: string) => {
    if (!selectedFundId || !teamId) return;
    setSwitchingMode(true);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/funds/${selectedFundId}/fund-mode`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: newMode }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to switch fund mode");
        return;
      }
      await fetchFundSettings();
      toast.success(`Fund mode switched to ${newMode === "STARTUP" ? "Startup" : "GP Fund"}`);
    } catch {
      toast.error("Failed to switch fund mode");
    } finally {
      setSwitchingMode(false);
      setModeConfirmOpen(false);
      setPendingMode(null);
    }
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      RAISING: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      CLOSED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
      DEPLOYED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    };
    return (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[status] || colors.CLOSED}`}>
        {status}
      </span>
    );
  };

  // ─── Loading / Empty states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (funds.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-4 py-6 text-center dark:border-gray-800">
        <Building2 className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No funds created yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Create a fund to manage investor portal settings
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Fund Selector */}
      {funds.length > 1 && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">Fund:</Label>
          <select
            value={selectedFundId}
            onChange={(e) => setSelectedFundId(e.target.value)}
            className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm border-border"
          >
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Fund Header */}
      {fundSettings && (
        <div className="flex items-center gap-2 pb-1">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{fundSettings.name}</span>
          {getStatusBadge(fundSettings.status)}
          {saving && <Loader2 className="h-3 w-3 animate-spin text-blue-500 ml-auto" />}
        </div>
      )}

      {loadingSettings && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {fundSettings && !loadingSettings && (
        <div className="space-y-3">
          {/* ─── GROUP: Fund Mode ──────────────────────────────────────────── */}
          <div className="rounded-md border dark:border-gray-800 p-2.5">
            <GroupHeader
              icon={Shuffle}
              title="Fund Mode"
              expanded={expandedGroups.has("mode")}
              onToggle={() => toggleGroup("mode")}
              badge={fundSettings.entityMode === "STARTUP" ? "Startup" : "GP Fund"}
            />
            {expandedGroups.has("mode") && (
              <div className="space-y-2 mt-2">
                <div className="flex items-center gap-3 rounded bg-muted/30 px-3 py-2.5 dark:bg-gray-900/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">Current Mode</p>
                    <p className="text-[10px] text-muted-foreground">
                      {fundSettings.entityMode === "STARTUP"
                        ? "Startup: Track funding rounds (Pre-Seed, Seed, Series A, etc.)"
                        : "GP Fund: Track tranches, capital calls, and distributions"}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] shrink-0 ${
                      fundSettings.entityMode === "STARTUP"
                        ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                    }`}
                  >
                    {fundSettings.entityMode === "STARTUP" ? "Startup" : "GP Fund"}
                  </Badge>
                </div>

                {!modeConfirmOpen ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    disabled={switchingMode}
                    onClick={() => {
                      const newMode = fundSettings.entityMode === "STARTUP" ? "FUND" : "STARTUP";
                      setPendingMode(newMode);
                      setModeConfirmOpen(true);
                    }}
                  >
                    <Shuffle className="h-3 w-3 mr-1" />
                    Switch to {fundSettings.entityMode === "STARTUP" ? "GP Fund" : "Startup"} Mode
                  </Button>
                ) : (
                  <div className="rounded border border-amber-500/30 bg-amber-50/50 dark:bg-amber-900/10 p-2.5 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium">
                          Switch to {pendingMode === "STARTUP" ? "Startup" : "GP Fund"} mode?
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          This will change how your fund tracks progress. The dashboard chart
                          will switch to {pendingMode === "STARTUP" ? "funding rounds" : "tranches"}.
                          This action may be blocked if there are active investors or completed transactions.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="text-xs h-7 bg-amber-600 hover:bg-amber-700"
                        disabled={switchingMode}
                        onClick={() => pendingMode && switchFundMode(pendingMode)}
                      >
                        {switchingMode ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Shuffle className="h-3 w-3 mr-1" />
                        )}
                        Confirm Switch
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => {
                          setModeConfirmOpen(false);
                          setPendingMode(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── GROUP: Funding Rounds (Startup Mode Only) ────────────────── */}
          {fundSettings.entityMode === "STARTUP" && (
            <div className="rounded-md border dark:border-gray-800 p-2.5">
              <GroupHeader
                icon={Rocket}
                title="Funding Rounds"
                expanded={expandedGroups.has("rounds")}
                onToggle={() => toggleGroup("rounds")}
              />
              {expandedGroups.has("rounds") && (
                <div className="mt-2">
                  <FundingRoundsConfig
                    fundId={selectedFundId}
                    teamId={teamId}
                  />
                </div>
              )}
            </div>
          )}

          {/* ─── GROUP: Investor Portal ──────────────────────────────────────── */}
          <div className="rounded-md border dark:border-gray-800 p-2.5">
            <GroupHeader
              icon={Shield}
              title="Investor Portal"
              expanded={expandedGroups.has("portal")}
              onToggle={() => toggleGroup("portal")}
            />
            {expandedGroups.has("portal") && (
              <div className="space-y-1.5 mt-2">
                <SettingRow
                  icon={Shield}
                  label="NDA Gate Required"
                  description="Require NDA + accreditation before LP portal access"
                >
                  <Toggle
                    checked={fundSettings.ndaGateEnabled}
                    onChange={(v) => updateField("ndaGateEnabled", v)}
                    disabled={saving}
                  />
                </SettingRow>

                <SettingRow
                  icon={Wallet}
                  label="Staged Commitments"
                  description="Allow LPs to commit in stages / tranches"
                >
                  <Toggle
                    checked={fundSettings.stagedCommitmentsEnabled}
                    onChange={(v) => updateField("stagedCommitmentsEnabled", v)}
                    disabled={saving}
                  />
                </SettingRow>

                <SettingRow
                  icon={Clock}
                  label="Capital Call Frequency"
                  description="How often capital calls are issued"
                >
                  <select
                    value={fundSettings.callFrequency || "AS_NEEDED"}
                    onChange={(e) => updateField("callFrequency", e.target.value)}
                    disabled={saving}
                    className="rounded border bg-background px-2 py-1 text-xs border-border"
                  >
                    {CALL_FREQUENCY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </SettingRow>

                <SettingRow
                  icon={DollarSign}
                  label="Minimum Investment"
                  description="Minimum LP commitment amount"
                >
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      value={fundSettings.minimumInvestment ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          updateField("minimumInvestment", null);
                        } else {
                          const num = parseFloat(val);
                          if (!isNaN(num) && num >= 0) updateField("minimumInvestment", num);
                        }
                      }}
                      placeholder="0"
                      className="w-28 h-7 text-xs font-mono"
                      disabled={saving}
                    />
                  </div>
                </SettingRow>

                <SettingRow
                  icon={Shield}
                  label="Capital Call Threshold"
                  description="Enable minimum threshold for capital calls"
                >
                  <div className="flex items-center gap-2">
                    <Toggle
                      checked={fundSettings.capitalCallThresholdEnabled}
                      onChange={(v) => updateField("capitalCallThresholdEnabled", v)}
                      disabled={saving}
                    />
                    {fundSettings.capitalCallThresholdEnabled && (
                      <Input
                        type="number"
                        value={fundSettings.capitalCallThreshold ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateField("capitalCallThreshold", val === "" ? null : parseFloat(val));
                        }}
                        placeholder="0"
                        className="w-24 h-7 text-xs font-mono"
                        disabled={saving}
                      />
                    )}
                  </div>
                </SettingRow>
              </div>
            )}
          </div>

          {/* ─── GROUP: Fund Economics ───────────────────────────────────────── */}
          <div className="rounded-md border dark:border-gray-800 p-2.5">
            <GroupHeader
              icon={DollarSign}
              title="Fund Economics"
              expanded={expandedGroups.has("economics")}
              onToggle={() => toggleGroup("economics")}
            />
            {expandedGroups.has("economics") && (
              <div className="space-y-1.5 mt-2">
                <SettingRow
                  icon={DollarSign}
                  label="Management Fee"
                  description="Annual management fee percentage"
                >
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={fundSettings.managementFeePct ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") updateField("managementFeePct", null);
                        else {
                          const num = parseFloat(val);
                          if (!isNaN(num) && num >= 0 && num <= 100) updateField("managementFeePct", num);
                        }
                      }}
                      placeholder="2.00"
                      className="w-20 h-7 text-xs font-mono"
                      disabled={saving}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </SettingRow>

                <SettingRow
                  icon={DollarSign}
                  label="Carried Interest"
                  description="GP carry on profits above hurdle"
                >
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={fundSettings.carryPct ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") updateField("carryPct", null);
                        else {
                          const num = parseFloat(val);
                          if (!isNaN(num) && num >= 0 && num <= 100) updateField("carryPct", num);
                        }
                      }}
                      placeholder="20.00"
                      className="w-20 h-7 text-xs font-mono"
                      disabled={saving}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </SettingRow>

                <SettingRow
                  icon={DollarSign}
                  label="Hurdle Rate"
                  description="Preferred return before carry"
                >
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={fundSettings.hurdleRate ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") updateField("hurdleRate", null);
                        else {
                          const num = parseFloat(val);
                          if (!isNaN(num) && num >= 0 && num <= 100) updateField("hurdleRate", num);
                        }
                      }}
                      placeholder="8.00"
                      className="w-20 h-7 text-xs font-mono"
                      disabled={saving}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </SettingRow>

                <SettingRow
                  icon={Wallet}
                  label="Waterfall Type"
                  description="Profit distribution model"
                >
                  <select
                    value={fundSettings.waterfallType || "EUROPEAN"}
                    onChange={(e) => updateField("waterfallType", e.target.value)}
                    disabled={saving}
                    className="rounded border bg-background px-2 py-1 text-xs border-border"
                  >
                    {WATERFALL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </SettingRow>

                <SettingRow
                  icon={DollarSign}
                  label="Currency"
                  description="Fund denomination currency"
                >
                  <select
                    value={fundSettings.currency || "USD"}
                    onChange={(e) => updateField("currency", e.target.value)}
                    disabled={saving}
                    className="rounded border bg-background px-2 py-1 text-xs border-border"
                  >
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </SettingRow>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <SettingRow
                      icon={Clock}
                      label="Term (Years)"
                      description="Fund term length"
                    >
                      <Input
                        type="number"
                        min="0"
                        max="99"
                        value={fundSettings.termYears ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "") updateField("termYears", null);
                          else {
                            const num = parseInt(val, 10);
                            if (!isNaN(num) && num >= 0 && num <= 99) updateField("termYears", num);
                          }
                        }}
                        placeholder="10"
                        className="w-16 h-7 text-xs font-mono"
                        disabled={saving}
                      />
                    </SettingRow>
                  </div>
                  <div className="flex-1">
                    <SettingRow
                      icon={Clock}
                      label="Extension (Years)"
                      description="Extension period"
                    >
                      <Input
                        type="number"
                        min="0"
                        max="10"
                        value={fundSettings.extensionYears ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "") updateField("extensionYears", null);
                          else {
                            const num = parseInt(val, 10);
                            if (!isNaN(num) && num >= 0 && num <= 10) updateField("extensionYears", num);
                          }
                        }}
                        placeholder="2"
                        className="w-16 h-7 text-xs font-mono"
                        disabled={saving}
                      />
                    </SettingRow>
                  </div>
                </div>

                <SettingRow
                  icon={Clock}
                  label="Investment Period (Years)"
                  description="Active investment period"
                >
                  <Input
                    type="number"
                    min="0"
                    max="30"
                    value={fundSettings.investmentPeriodYears ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") updateField("investmentPeriodYears", null);
                      else {
                        const num = parseInt(val, 10);
                        if (!isNaN(num) && num >= 0 && num <= 30) updateField("investmentPeriodYears", num);
                      }
                    }}
                    placeholder="5"
                    className="w-16 h-7 text-xs font-mono"
                    disabled={saving}
                  />
                </SettingRow>

                <SettingRow
                  icon={DollarSign}
                  label="GP Commitment"
                  description="GP co-investment amount"
                >
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      value={fundSettings.gpCommitmentAmount ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") updateField("gpCommitmentAmount", null);
                        else {
                          const num = parseFloat(val);
                          if (!isNaN(num) && num >= 0) updateField("gpCommitmentAmount", num);
                        }
                      }}
                      placeholder="0"
                      className="w-28 h-7 text-xs font-mono"
                      disabled={saving}
                    />
                  </div>
                </SettingRow>

                <SettingRow
                  icon={Wallet}
                  label="Preferred Return"
                  description="Method for preferred return calculation"
                >
                  <select
                    value={fundSettings.preferredReturnMethod || "NONE"}
                    onChange={(e) => updateField("preferredReturnMethod", e.target.value)}
                    disabled={saving}
                    className="rounded border bg-background px-2 py-1 text-xs border-border"
                  >
                    <option value="NONE">None</option>
                    <option value="SIMPLE">Simple</option>
                    <option value="COMPOUND">Compound</option>
                  </select>
                </SettingRow>

                {/* Advanced provisions toggles */}
                <div className="flex flex-wrap gap-2 mt-1">
                  <SettingRow
                    icon={Shield}
                    label="High-Water Mark"
                    description="Prevents double-charging carry"
                  >
                    <Toggle
                      checked={fundSettings.highWaterMark}
                      onChange={(v) => updateField("highWaterMark", v)}
                      disabled={saving}
                    />
                  </SettingRow>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <SettingRow
                      icon={Shield}
                      label="Recycling"
                      description="Recycle returned capital"
                    >
                      <Toggle
                        checked={fundSettings.recyclingEnabled}
                        onChange={(v) => updateField("recyclingEnabled", v)}
                        disabled={saving}
                      />
                    </SettingRow>
                  </div>
                  <div className="flex-1">
                    <SettingRow
                      icon={Shield}
                      label="Clawback"
                      description="GP clawback provision"
                    >
                      <Toggle
                        checked={fundSettings.clawbackProvision}
                        onChange={(v) => updateField("clawbackProvision", v)}
                        disabled={saving}
                      />
                    </SettingRow>
                  </div>
                </div>

                {/* Read-only raise metrics */}
                <div className="rounded bg-muted/30 px-2.5 py-2 dark:bg-gray-900/30 mt-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Raise Metrics</p>
                  <div className="flex gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground">Target: </span>
                      <span className="font-mono tabular-nums">{formatCurrency(fundSettings.targetRaise)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Current: </span>
                      <span className="font-mono tabular-nums">{formatCurrency(fundSettings.currentRaise)}</span>
                    </div>
                    {fundSettings.regulationDExemption && (
                      <div>
                        <span className="text-muted-foreground">Reg D: </span>
                        <span className="font-mono">{fundSettings.regulationDExemption}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─── GROUP: Wire Instructions ────────────────────────────────────── */}
          <div className="rounded-md border dark:border-gray-800 p-2.5">
            <GroupHeader
              icon={Wallet}
              title="Wire Instructions"
              expanded={expandedGroups.has("wire")}
              onToggle={() => toggleGroup("wire")}
            />
            {expandedGroups.has("wire") && (
              <div className="mt-2 space-y-2">
                {fundSettings.wireInstructionsUpdatedAt && (
                  <p className="text-[10px] text-muted-foreground">
                    Last updated:{" "}
                    {new Date(fundSettings.wireInstructionsUpdatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                )}

                {!editingWire ? (
                  <>
                    {fundSettings.wireInstructions ? (
                      <div className="space-y-1">
                        {WIRE_FIELDS.map(({ key, label }) => {
                          const val = (fundSettings.wireInstructions as Record<string, string>)?.[key];
                          if (!val) return null;
                          return (
                            <div key={key} className="flex justify-between rounded bg-muted/30 px-2.5 py-1.5 dark:bg-gray-900/30">
                              <span className="text-[10px] text-muted-foreground">{label}</span>
                              <span className="text-xs font-mono">
                                {key === "accountNumber" || key === "routingNumber"
                                  ? `••••${val.slice(-4)}`
                                  : val}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        No wire instructions configured
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => {
                        setWireForm(
                          (fundSettings.wireInstructions as Record<string, string>) || {}
                        );
                        setEditingWire(true);
                      }}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      {fundSettings.wireInstructions ? "Edit" : "Add Wire Instructions"}
                    </Button>
                  </>
                ) : (
                  <div className="space-y-2">
                    {WIRE_FIELDS.map(({ key, label }) => (
                      <div key={key}>
                        <Label className="text-[10px] text-muted-foreground">{label}</Label>
                        <Input
                          value={wireForm[key] || ""}
                          onChange={(e) =>
                            setWireForm((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder={label}
                          className="h-7 text-xs"
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        className="text-xs h-7 bg-blue-600 hover:bg-blue-700"
                        onClick={saveWireInstructions}
                        disabled={saving}
                      >
                        <Save className="h-3 w-3 mr-1" />
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setEditingWire(false)}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── GROUP: LP Visibility Controls ───────────────────────────────── */}
          <div className="rounded-md border dark:border-gray-800 p-2.5">
            <GroupHeader
              icon={Eye}
              title="LP Visibility Controls"
              expanded={expandedGroups.has("visibility")}
              onToggle={() => toggleGroup("visibility")}
            />
            {expandedGroups.has("visibility") && (
              <div className="space-y-1.5 mt-2">
                {LP_VISIBILITY_FLAGS.map(({ key, label, description }) => (
                  <SettingRow key={key} icon={Eye} label={label} description={description}>
                    <Toggle
                      checked={!!(fundSettings.featureFlags as Record<string, boolean>)?.[key]}
                      onChange={(v) => updateFeatureFlag(key, v)}
                      disabled={saving}
                    />
                  </SettingRow>
                ))}
              </div>
            )}
          </div>

          {/* ─── GROUP: Notifications ────────────────────────────────────────── */}
          <div className="rounded-md border dark:border-gray-800 p-2.5">
            <GroupHeader
              icon={Users}
              title="Notifications"
              expanded={expandedGroups.has("notifications")}
              onToggle={() => toggleGroup("notifications")}
              badge="Phase 2"
            />
            {expandedGroups.has("notifications") && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground">
                  Per-fund notification preferences are coming in Phase 2.
                  Current notifications are configured at the organization level
                  in the LP Onboarding section above.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
