"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Users,
  Mail,
  Calendar,
  Eye,
  Zap,
  Loader2,
  Save,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CrmPrefs {
  digestEnabled: boolean;
  digestFrequency: "daily" | "weekly" | "off";
  autoCaptureDateroom: boolean;
  autoCaptureWaitlist: boolean;
  defaultOutreachSignature: string;
  engagementThresholdHot: number;
  engagementThresholdWarm: number;
}

const DEFAULT_PREFS: CrmPrefs = {
  digestEnabled: true,
  digestFrequency: "daily",
  autoCaptureDateroom: true,
  autoCaptureWaitlist: true,
  defaultOutreachSignature: "",
  engagementThresholdHot: 15,
  engagementThresholdWarm: 5,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CrmPreferencesSection({ teamId }: { teamId: string }) {
  const [prefs, setPrefs] = useState<CrmPrefs>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load CRM preferences from org featureFlags
  const fetchPrefs = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/settings/full?teamId=${teamId}`,
      );
      if (res.ok) {
        const data = await res.json();
        const flags = data.orgDefaults?.featureFlags ?? {};
        const crmPrefs = flags.crmPreferences ?? {};
        setPrefs({
          digestEnabled: crmPrefs.digestEnabled ?? DEFAULT_PREFS.digestEnabled,
          digestFrequency:
            crmPrefs.digestFrequency ?? DEFAULT_PREFS.digestFrequency,
          autoCaptureDateroom:
            crmPrefs.autoCaptureDateroom ??
            DEFAULT_PREFS.autoCaptureDateroom,
          autoCaptureWaitlist:
            crmPrefs.autoCaptureWaitlist ??
            DEFAULT_PREFS.autoCaptureWaitlist,
          defaultOutreachSignature:
            crmPrefs.defaultOutreachSignature ??
            DEFAULT_PREFS.defaultOutreachSignature,
          engagementThresholdHot:
            crmPrefs.engagementThresholdHot ??
            DEFAULT_PREFS.engagementThresholdHot,
          engagementThresholdWarm:
            crmPrefs.engagementThresholdWarm ??
            DEFAULT_PREFS.engagementThresholdWarm,
        });
      }
    } catch {
      // Non-critical — use defaults
    }
  }, [teamId]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const update = (key: keyof CrmPrefs, value: unknown) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          section: "crmPreferences",
          data: { crmPreferences: prefs },
        }),
      });
      if (res.ok) {
        toast.success("CRM preferences saved");
        setDirty(false);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save CRM preferences");
      }
    } catch {
      toast.error("Failed to save CRM preferences");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ── AI Digest Settings ── */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Mail className="h-4 w-4 text-muted-foreground" />
          AI Daily Digest
        </h3>
        <div className="space-y-3 rounded-lg border p-3">
          <ToggleRow
            label="Enable digest emails"
            description="Receive AI-generated CRM summaries with metrics and priority actions"
            checked={prefs.digestEnabled}
            onChange={(v) => update("digestEnabled", v)}
          />
          {prefs.digestEnabled && (
            <div className="ml-6 flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">
                Frequency:
              </Label>
              <select
                value={prefs.digestFrequency}
                onChange={(e) =>
                  update(
                    "digestFrequency",
                    e.target.value as CrmPrefs["digestFrequency"],
                  )
                }
                className="rounded-md border bg-background px-2 py-1 text-xs"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (Monday)</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Auto-Capture Settings ── */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-muted-foreground" />
          Contact Auto-Capture
        </h3>
        <div className="space-y-3 rounded-lg border p-3">
          <ToggleRow
            label="Auto-capture dataroom viewers"
            description="Automatically create contacts from dataroom visitor email gate entries"
            checked={prefs.autoCaptureDateroom}
            onChange={(v) => update("autoCaptureDateroom", v)}
          />
          <ToggleRow
            label="Auto-capture waitlist signups"
            description="Automatically create contacts from marketplace interest expressions"
            checked={prefs.autoCaptureWaitlist}
            onChange={(v) => update("autoCaptureWaitlist", v)}
          />
        </div>
      </div>

      {/* ── Engagement Scoring ── */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Zap className="h-4 w-4 text-muted-foreground" />
          Engagement Scoring Thresholds
        </h3>
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label className="text-xs">
                Hot lead threshold (≥)
              </Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={prefs.engagementThresholdHot}
                  onChange={(e) =>
                    update(
                      "engagementThresholdHot",
                      parseInt(e.target.value) || 15,
                    )
                  }
                  className="w-20 rounded-md border bg-background px-2 py-1 text-sm font-mono tabular-nums"
                />
                <span className="text-xs text-muted-foreground">
                  points
                </span>
                <span className="ml-1 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  Hot
                </span>
              </div>
            </div>
            <div className="flex-1">
              <Label className="text-xs">
                Warm lead threshold (≥)
              </Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={prefs.engagementThresholdWarm}
                  onChange={(e) =>
                    update(
                      "engagementThresholdWarm",
                      parseInt(e.target.value) || 5,
                    )
                  }
                  className="w-20 rounded-md border bg-background px-2 py-1 text-sm font-mono tabular-nums"
                />
                <span className="text-xs text-muted-foreground">
                  points
                </span>
                <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  Warm
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2.5 py-2">
            <Info className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <p className="text-[11px] text-muted-foreground">
              Contacts below the warm threshold are classified as Cool.
              Scores are calculated from page views (1pt), return visits
              (3pt), downloads (2pt), NDA (5pt), commitment (10pt), and
              wire proof (5pt).
            </p>
          </div>
        </div>
      </div>

      {/* ── Outreach Defaults ── */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Outreach Defaults
        </h3>
        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <Label className="text-xs">Default email signature</Label>
            <textarea
              value={prefs.defaultOutreachSignature}
              onChange={(e) =>
                update("defaultOutreachSignature", e.target.value)
              }
              rows={3}
              maxLength={500}
              placeholder="Best regards,&#10;[Your Name]&#10;[Your Title]"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/50"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Appended to AI-drafted and template-based outreach emails.
              Max 500 characters.
            </p>
          </div>
        </div>
      </div>

      {/* ── Save Button ── */}
      {dirty && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save CRM Preferences
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle Row Sub-Component
// ---------------------------------------------------------------------------

function ToggleRow({
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
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-blue-600" : "bg-muted-foreground/25",
        )}
      >
        <span
          className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
      <div className="flex-1">
        <span className="text-sm font-medium">{label}</span>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </label>
  );
}
