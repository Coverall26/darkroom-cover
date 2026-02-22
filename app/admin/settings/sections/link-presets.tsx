"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Sliders,
  Plus,
  Loader2,
  Trash2,
  Copy,
  Check,
  Share2,
  Edit,
  Eye,
  Lock,
  Mail,
  Download,
  Bell,
  Droplets,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LinkPreset {
  id: string;
  pId?: string;
  name: string;
  emailProtected: boolean;
  emailAuthenticated: boolean;
  allowDownload: boolean;
  enableNotification: boolean;
  enableWatermark: boolean;
  enableScreenshotProtection: boolean;
  password: string | null;
  expiresAt: string | null;
  enableAgreement: boolean;
  enableCustomFields: boolean;
  createdAt: string;
}

interface DataroomBasic {
  id: string;
  pId: string;
  name: string;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function LinkPresetsSection({ teamId }: { teamId: string }) {
  const [presets, setPresets] = useState<LinkPreset[]>([]);
  const [datarooms, setDatarooms] = useState<DataroomBasic[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPreset, setEditingPreset] = useState<LinkPreset | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmailProtected, setFormEmailProtected] = useState(false);
  const [formAllowDownload, setFormAllowDownload] = useState(false);
  const [formNotifications, setFormNotifications] = useState(true);
  const [formWatermark, setFormWatermark] = useState(false);
  const [formScreenshotProtection, setFormScreenshotProtection] = useState(false);
  const [formPassword, setFormPassword] = useState("");
  const [formExpDays, setFormExpDays] = useState("");
  const [formAgreement, setFormAgreement] = useState(false);
  const [saving, setSaving] = useState(false);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const resetForm = () => {
    setFormName("");
    setFormEmailProtected(false);
    setFormAllowDownload(false);
    setFormNotifications(true);
    setFormWatermark(false);
    setFormScreenshotProtection(false);
    setFormPassword("");
    setFormExpDays("");
    setFormAgreement(false);
  };

  const loadPresetIntoForm = (preset: LinkPreset) => {
    setFormName(preset.name);
    setFormEmailProtected(preset.emailProtected);
    setFormAllowDownload(preset.allowDownload);
    setFormNotifications(preset.enableNotification);
    setFormWatermark(preset.enableWatermark);
    setFormScreenshotProtection(preset.enableScreenshotProtection ?? false);
    setFormPassword(preset.password || "");
    setFormExpDays(preset.expiresAt ? "" : "");
    setFormAgreement(preset.enableAgreement ?? false);
  };

  const fetchData = useCallback(async () => {
    if (!teamId) return;
    try {
      const [presetsRes, dataroomsRes] = await Promise.all([
        fetch(`/api/teams/${teamId}/presets`),
        fetch(`/api/teams/${teamId}/datarooms`),
      ]);
      if (presetsRes.ok) {
        const data = await presetsRes.json();
        setPresets(Array.isArray(data) ? data : []);
      }
      if (dataroomsRes.ok) {
        const data = await dataroomsRes.json();
        setDatarooms(data.datarooms || []);
      }
    } catch {
      // May not be configured
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error("Preset name is required");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
        emailProtected: formEmailProtected,
        allowDownload: formAllowDownload,
        enableNotification: formNotifications,
        enableWatermark: formWatermark,
        enableScreenshotProtection: formScreenshotProtection,
        enableAgreement: formAgreement,
      };
      if (formPassword) body.password = formPassword;
      if (formExpDays) {
        const days = parseInt(formExpDays, 10);
        if (days > 0) {
          const date = new Date();
          date.setDate(date.getDate() + days);
          body.expiresAt = date.toISOString();
        }
      }

      const isEditing = !!editingPreset;
      const url = isEditing
        ? `/api/teams/${teamId}/presets/${editingPreset.id}`
        : `/api/teams/${teamId}/presets`;
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || `Failed to ${isEditing ? "update" : "create"} preset`);
        return;
      }
      toast.success(`Preset ${isEditing ? "updated" : "created"}`);
      setShowCreate(false);
      setEditingPreset(null);
      resetForm();
      fetchData();
    } catch {
      toast.error("Failed to save preset");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (presetId: string) => {
    if (!confirm("Delete this link preset?")) return;
    setDeleting(presetId);
    try {
      const res = await fetch(`/api/teams/${teamId}/presets/${presetId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Failed to delete preset");
        return;
      }
      toast.success("Preset deleted");
      fetchData();
    } catch {
      toast.error("Failed to delete preset");
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Social Share Links ── */}
      {datarooms.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Social Share Links</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Public links for sharing datarooms on social media
          </p>
          <div className="space-y-1.5">
            {datarooms.filter((dr) => dr.pId).map((dr) => {
              const shareUrl = typeof window !== "undefined"
                ? `${window.location.origin}/public/dataroom/${dr.pId}`
                : "";
              return (
                <div
                  key={dr.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 dark:border-gray-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{dr.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{shareUrl}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs ml-2"
                    onClick={() => copyToClipboard(shareUrl, `share-${dr.id}`)}
                  >
                    {copiedField === `share-${dr.id}` ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    Copy
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Link Presets ── */}
      <div className={datarooms.length > 0 ? "border-t pt-4 dark:border-gray-800" : ""}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium">
              Link Presets ({presets.length})
            </p>
            <p className="text-xs text-muted-foreground">
              Reusable link configurations
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              if (showCreate || editingPreset) {
                setShowCreate(false);
                setEditingPreset(null);
                resetForm();
              } else {
                resetForm();
                setShowCreate(true);
              }
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            New Preset
          </Button>
        </div>

        {/* Create/Edit Form */}
        {(showCreate || editingPreset) && (
          <div className="rounded-md border border-dashed border-blue-300 bg-blue-50/50 p-3 space-y-3 mb-3 dark:border-blue-800 dark:bg-blue-900/10">
            <div>
              <Label className="text-xs text-muted-foreground">Preset Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="My Link Preset"
                className="mt-1 text-sm"
              />
            </div>

            {/* Settings Grid */}
            <div className="grid grid-cols-2 gap-2">
              <ToggleRow
                icon={Mail}
                label="Email Protection"
                checked={formEmailProtected}
                onChange={setFormEmailProtected}
              />
              <ToggleRow
                icon={Download}
                label="Allow Downloads"
                checked={formAllowDownload}
                onChange={setFormAllowDownload}
              />
              <ToggleRow
                icon={Bell}
                label="Notifications"
                checked={formNotifications}
                onChange={setFormNotifications}
              />
              <ToggleRow
                icon={Droplets}
                label="Watermark"
                checked={formWatermark}
                onChange={setFormWatermark}
              />
              <ToggleRow
                icon={Eye}
                label="Screenshot Protection"
                checked={formScreenshotProtection}
                onChange={setFormScreenshotProtection}
              />
              <ToggleRow
                icon={Lock}
                label="Agreement Required"
                checked={formAgreement}
                onChange={setFormAgreement}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Password (optional)</Label>
                <Input
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Set a password"
                  type="password"
                  className="mt-1 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Expires in (days)</Label>
                <Input
                  value={formExpDays}
                  onChange={(e) => setFormExpDays(e.target.value)}
                  placeholder="e.g., 30"
                  type="number"
                  min="1"
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreate(false);
                  setEditingPreset(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !formName.trim()}
                className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingPreset ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        )}

        {/* Presets List */}
        {presets.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-6 text-center dark:border-gray-800">
            <Sliders className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No link presets configured. Create one to quickly apply settings when sharing links.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 dark:border-gray-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{preset.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {preset.emailProtected && (
                      <Badge variant="secondary" className="text-[10px] gap-0.5">
                        <Mail className="h-2.5 w-2.5" /> Email
                      </Badge>
                    )}
                    {preset.allowDownload && (
                      <Badge variant="secondary" className="text-[10px] gap-0.5">
                        <Download className="h-2.5 w-2.5" /> Download
                      </Badge>
                    )}
                    {preset.enableWatermark && (
                      <Badge variant="secondary" className="text-[10px] gap-0.5">
                        <Droplets className="h-2.5 w-2.5" /> Watermark
                      </Badge>
                    )}
                    {preset.password && (
                      <Badge variant="secondary" className="text-[10px] gap-0.5">
                        <Lock className="h-2.5 w-2.5" /> Password
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(preset.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setEditingPreset(preset);
                      loadPresetIntoForm(preset);
                      setShowCreate(false);
                    }}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 dark:text-red-400"
                    onClick={() => handleDelete(preset.id)}
                    disabled={deleting === preset.id}
                  >
                    {deleting === preset.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Toggle Row ─────────────────────────────────────────────────────────────

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: typeof Eye;
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded"
      />
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs">{label}</span>
    </label>
  );
}
