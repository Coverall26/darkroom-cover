"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ShieldBan,
  EyeOff,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TeamSettings {
  enableExcelAdvancedMode?: boolean;
  replicateDataroomFolders?: boolean;
  enableClientSideEncryption?: boolean;
  requireEncryptionForSensitive?: boolean;
  blockedDomains?: string[];
  ignoredDomains?: string[];
}

// ─── Domain List Component ──────────────────────────────────────────────────

function DomainList({
  title,
  description,
  icon: Icon,
  domains,
  onAdd,
  onRemove,
  placeholder,
}: {
  title: string;
  description: string;
  icon: typeof ShieldBan;
  domains: string[];
  onAdd: (domain: string) => void;
  onRemove: (domain: string) => void;
  placeholder: string;
}) {
  const [newDomain, setNewDomain] = useState("");

  const handleAdd = () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    if (domains.includes(domain)) {
      toast.error("Domain already in list");
      return;
    }
    onAdd(domain);
    setNewDomain("");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Input
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder={placeholder}
          className="flex-1 text-sm"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button size="sm" variant="outline" onClick={handleAdd} disabled={!newDomain.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {domains.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {domains.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-mono"
            >
              {d}
              <button
                onClick={() => onRemove(d)}
                className="ml-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Toggle Row ─────────────────────────────────────────────────────────────

function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function AccessControlsSection({ teamId }: { teamId: string }) {
  const [settings, setSettings] = useState<TeamSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch {
      // Settings may not exist yet
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // ── Toggle handlers ──
  const handleToggle = async (endpoint: string, field: string, value: boolean) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/${endpoint}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: String(value) }),
      });
      if (!res.ok) {
        toast.error("Failed to update setting");
        return;
      }
      setSettings((prev) => ({ ...prev, [field]: value }));
      toast.success("Setting updated");
    } catch {
      toast.error("Failed to update setting");
    } finally {
      setSaving(false);
    }
  };

  // ── Domain list handlers ──
  const handleAddBlockedDomain = (domain: string) => {
    const updated = [...(settings.blockedDomains || []), domain];
    setSettings((prev) => ({ ...prev, blockedDomains: updated }));
    saveDomainList("blockedDomains", updated);
  };

  const handleRemoveBlockedDomain = (domain: string) => {
    const updated = (settings.blockedDomains || []).filter((d) => d !== domain);
    setSettings((prev) => ({ ...prev, blockedDomains: updated }));
    saveDomainList("blockedDomains", updated);
  };

  const handleAddIgnoredDomain = (domain: string) => {
    const updated = [...(settings.ignoredDomains || []), domain];
    setSettings((prev) => ({ ...prev, ignoredDomains: updated }));
    saveDomainList("ignoredDomains", updated);
  };

  const handleRemoveIgnoredDomain = (domain: string) => {
    const updated = (settings.ignoredDomains || []).filter((d) => d !== domain);
    setSettings((prev) => ({ ...prev, ignoredDomains: updated }));
    saveDomainList("ignoredDomains", updated);
  };

  const saveDomainList = async (field: string, domains: string[]) => {
    try {
      await fetch(`/api/teams/${teamId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: domains }),
      });
    } catch {
      toast.error("Failed to save domain list");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Dataroom Toggle Settings ── */}
      <div className="space-y-1">
        <SettingToggle
          label="Excel Advanced Mode"
          description="Enable advanced Excel file rendering in datarooms"
          checked={settings.enableExcelAdvancedMode ?? false}
          onChange={(v) => handleToggle("update-advanced-mode", "enableExcelAdvancedMode", v)}
        />
        <SettingToggle
          label="Replicate Dataroom Folders"
          description="Automatically replicate folder structure across datarooms"
          checked={settings.replicateDataroomFolders ?? false}
          onChange={(v) => handleToggle("update-replicate-folders", "replicateDataroomFolders", v)}
        />
        <SettingToggle
          label="Client-Side Encryption"
          description="Enable end-to-end encryption for document storage"
          checked={settings.enableClientSideEncryption ?? false}
          onChange={(v) => handleToggle("update-encryption-settings", "enableClientSideEncryption", v)}
        />
      </div>

      {/* ── Domain Lists ── */}
      <div className="border-t pt-4 dark:border-gray-800">
        <DomainList
          title="Blocked Domains"
          description="Email domains blocked from accessing your datarooms"
          icon={ShieldBan}
          domains={settings.blockedDomains || []}
          onAdd={handleAddBlockedDomain}
          onRemove={handleRemoveBlockedDomain}
          placeholder="competitor.com"
        />
      </div>

      <div className="border-t pt-4 dark:border-gray-800">
        <DomainList
          title="Ignored Domains (Analytics)"
          description="Domains excluded from viewer analytics (e.g., your own team)"
          icon={EyeOff}
          domains={settings.ignoredDomains || []}
          onAdd={handleAddIgnoredDomain}
          onRemove={handleRemoveIgnoredDomain}
          placeholder="yourcompany.com"
        />
      </div>
    </div>
  );
}
