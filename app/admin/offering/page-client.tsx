"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  GripVertical,
  Image as ImageIcon,
  Landmark,
  LayoutTemplate,
  Palette,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Type,
  Users,
  X,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TeamContext {
  teamId: string;
  orgId: string;
  mode: string;
  funds: Array<{ id: string; name: string; status: string }>;
}

interface OfferingFormData {
  slug: string;
  isPublic: boolean;
  heroHeadline: string;
  heroSubheadline: string;
  heroImageUrl: string;
  heroBadgeText: string;
  offeringDescription: string;
  keyMetrics: Array<{ label: string; value: string; subtext: string }>;
  highlights: Array<{ title: string; description: string; icon: string }>;
  dealTerms: Array<{ label: string; value: string }>;
  timeline: Array<{
    date: string;
    title: string;
    description: string;
    status: "completed" | "current" | "upcoming";
  }>;
  leadership: Array<{
    name: string;
    title: string;
    bio: string;
    imageUrl: string;
  }>;
  gallery: Array<{ url: string; caption: string; type: "image" | "video" }>;
  dataroomDocuments: Array<{
    name: string;
    type: string;
    isGated: boolean;
    url: string;
  }>;
  financialProjections: {
    sections: Array<{
      title: string;
      headers: string[];
      rows: Array<{ label: string; values: string[] }>;
    }>;
  } | null;
  advantages: Array<{ title: string; description: string; icon: string }>;
  ctaText: string;
  ctaSecondary: string;
  emailGateEnabled: boolean;
  brandColor: string;
  accentColor: string;
  logoUrl: string;
  customCss: string;
  disclaimerText: string;
  removeBranding: boolean;
  metaTitle: string;
  metaDescription: string;
  metaImageUrl: string;
}

const INITIAL_FORM: OfferingFormData = {
  slug: "",
  isPublic: false,
  heroHeadline: "",
  heroSubheadline: "",
  heroImageUrl: "",
  heroBadgeText: "Now Open",
  offeringDescription: "",
  keyMetrics: [],
  highlights: [],
  dealTerms: [],
  timeline: [],
  leadership: [],
  gallery: [],
  dataroomDocuments: [],
  financialProjections: null,
  advantages: [],
  ctaText: "I Want to Invest",
  ctaSecondary: "View Documents",
  emailGateEnabled: true,
  brandColor: "#0066FF",
  accentColor: "#0A1628",
  logoUrl: "",
  customCss: "",
  disclaimerText: "",
  removeBranding: false,
  metaTitle: "",
  metaDescription: "",
  metaImageUrl: "",
};

const ICON_OPTIONS = [
  "trending",
  "target",
  "users",
  "shield",
  "dollar",
  "building",
  "chart",
  "briefcase",
  "award",
  "globe",
  "landmark",
];

// ─── Main Editor ───────────────────────────────────────────────────────────────

export default function OfferingEditorClient() {
  const router = useRouter();
  const [teamContext, setTeamContext] = useState<TeamContext | null>(null);
  const [selectedFundId, setSelectedFundId] = useState<string>("");
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [form, setForm] = useState<OfferingFormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    hero: true,
    content: false,
    highlights: false,
    timeline: false,
    terms: false,
    projections: false,
    advantages: false,
    leadership: false,
    gallery: false,
    documents: false,
    cta: false,
    branding: false,
    seo: false,
  });

  // Load team context
  useEffect(() => {
    fetch("/api/admin/team-context")
      .then((r) => r.json())
      .then((data) => {
        setTeamContext(data);
        if (data.funds?.length > 0) {
          setSelectedFundId(data.funds[0].id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load existing offering when fund changes
  useEffect(() => {
    if (!teamContext?.teamId || !selectedFundId) return;
    fetch(`/api/teams/${teamContext.teamId}/offering`)
      .then((r) => r.json())
      .then((data) => {
        const existing = data.offerings?.find(
          (o: { fund: { id: string } }) => o.fund.id === selectedFundId
        );
        if (existing) {
          setOfferingId(existing.id);
          setForm({
            ...INITIAL_FORM,
            ...existing,
            keyMetrics: existing.keyMetrics || [],
            highlights: existing.highlights || [],
            dealTerms: existing.dealTerms || [],
            timeline: existing.timeline || [],
            leadership: existing.leadership || [],
            gallery: existing.gallery || [],
            dataroomDocuments: existing.dataroomDocuments || [],
            financialProjections: existing.financialProjections || null,
            advantages: existing.advantages || [],
          });
        } else {
          setOfferingId(null);
          // Auto-populate slug from fund name
          const fund = teamContext.funds.find((f) => f.id === selectedFundId);
          setForm({
            ...INITIAL_FORM,
            slug: fund
              ? fund.name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "")
              : "",
            heroHeadline: fund?.name || "",
          });
        }
      })
      .catch((e) => console.error("Failed to load offering data:", e));
  }, [teamContext, selectedFundId]);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateField = useCallback(
    <K extends keyof OfferingFormData>(key: K, value: OfferingFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSave = async () => {
    if (!teamContext?.teamId || !selectedFundId) return;
    setSaving(true);
    try {
      const method = offeringId ? "PATCH" : "POST";
      const body = offeringId
        ? { offeringId, ...form }
        : { fundId: selectedFundId, ...form };

      const res = await fetch(`/api/teams/${teamContext.teamId}/offering`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      const data = await res.json();
      setOfferingId(data.offering.id);
      toast.success("Offering page saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = () => {
    const url = `${window.location.origin}/offering/${form.slug}`;
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-[600px] bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!teamContext) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Unable to load team context.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.back()}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <LayoutTemplate className="w-6 h-6" />
            Premium Offering Page
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create a branded, investor-facing landing page for your fund offering.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {offeringId && form.slug && (
            <div className="flex items-center gap-2">
              <button
                onClick={copyUrl}
                className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
                title="Copy URL"
              >
                <Copy className="w-4 h-4" />
              </button>
              <a
                href={`/offering/${form.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
                title="Preview"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !form.slug}
            className="px-5 py-2.5 bg-[#0066FF] text-white rounded-lg font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Fund Selector */}
      {teamContext.funds.length > 1 && (
        <div className="mb-6">
          <label className="text-sm font-medium text-foreground mb-1.5 block">
            Fund
          </label>
          <select
            value={selectedFundId}
            onChange={(e) => setSelectedFundId(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
          >
            {teamContext.funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.status})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Publish Toggle + URL */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => updateField("isPublic", !form.isPublic)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form.isPublic ? "bg-green-500" : "bg-gray-600"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                form.isPublic ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <div>
            <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
              {form.isPublic ? (
                <>
                  <Globe className="w-4 h-4 text-green-500" /> Published
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4 text-muted-foreground" /> Draft
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {form.isPublic
                ? "Visible to anyone with the link"
                : "Only you can see this page"}
            </p>
          </div>
        </div>
        {form.slug && (
          <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded hidden sm:block">
            /offering/{form.slug}
          </code>
        )}
      </div>

      {/* Editor Sections */}
      <div className="space-y-3">
        {/* Hero Section */}
        <EditorSection
          title="Hero Section"
          icon={<Sparkles className="w-4 h-4" />}
          expanded={expandedSections.hero}
          onToggle={() => toggleSection("hero")}
        >
          <div className="space-y-4">
            <Field label="URL Slug" required>
              <input
                value={form.slug}
                onChange={(e) =>
                  updateField(
                    "slug",
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "")
                  )
                }
                placeholder="acme-capital-fund-i"
                className="input-field"
              />
            </Field>
            <Field label="Headline">
              <input
                value={form.heroHeadline}
                onChange={(e) => updateField("heroHeadline", e.target.value)}
                placeholder="Acme Capital Fund I"
                className="input-field"
              />
            </Field>
            <Field label="Subheadline">
              <textarea
                value={form.heroSubheadline}
                onChange={(e) =>
                  updateField("heroSubheadline", e.target.value)
                }
                placeholder="A premier investment opportunity in franchise expansion..."
                rows={3}
                className="input-field"
              />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Badge Text">
                <input
                  value={form.heroBadgeText}
                  onChange={(e) =>
                    updateField("heroBadgeText", e.target.value)
                  }
                  placeholder="Now Open"
                  className="input-field"
                />
              </Field>
              <Field label="Hero Image URL">
                <input
                  value={form.heroImageUrl}
                  onChange={(e) =>
                    updateField("heroImageUrl", e.target.value)
                  }
                  placeholder="https://..."
                  className="input-field"
                />
              </Field>
            </div>
          </div>
        </EditorSection>

        {/* Offering Content */}
        <EditorSection
          title="Offering Description"
          icon={<Type className="w-4 h-4" />}
          expanded={expandedSections.content}
          onToggle={() => toggleSection("content")}
        >
          <Field label="Description">
            <textarea
              value={form.offeringDescription}
              onChange={(e) =>
                updateField("offeringDescription", e.target.value)
              }
              placeholder="Detailed description of the investment opportunity..."
              rows={6}
              className="input-field"
            />
          </Field>
        </EditorSection>

        {/* Key Metrics */}
        <EditorSection
          title={`Key Metrics (${form.keyMetrics.length})`}
          icon={<Landmark className="w-4 h-4" />}
          expanded={expandedSections.highlights}
          onToggle={() => toggleSection("highlights")}
          count={form.keyMetrics.length}
        >
          <ArrayEditor
            items={form.keyMetrics}
            onChange={(v) => updateField("keyMetrics", v)}
            renderItem={(item, i, update, remove) => (
              <div className="flex gap-2 items-start">
                <div className="flex-1 grid sm:grid-cols-3 gap-2">
                  <input
                    value={item.label}
                    onChange={(e) =>
                      update(i, { ...item, label: e.target.value })
                    }
                    placeholder="Label"
                    className="input-field text-sm"
                  />
                  <input
                    value={item.value}
                    onChange={(e) =>
                      update(i, { ...item, value: e.target.value })
                    }
                    placeholder="$9.55M"
                    className="input-field text-sm"
                  />
                  <input
                    value={item.subtext || ""}
                    onChange={(e) =>
                      update(i, { ...item, subtext: e.target.value })
                    }
                    placeholder="Subtext (optional)"
                    className="input-field text-sm"
                  />
                </div>
                <button
                  onClick={() => remove(i)}
                  className="p-1.5 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            newItem={{ label: "", value: "", subtext: "" }}
            addLabel="Add Metric"
          />
        </EditorSection>

        {/* Investment Highlights */}
        <EditorSection
          title={`Investment Highlights (${form.highlights.length})`}
          icon={<Sparkles className="w-4 h-4" />}
          expanded={expandedSections.highlights}
          onToggle={() => toggleSection("highlights")}
        >
          <ArrayEditor
            items={form.highlights}
            onChange={(v) => updateField("highlights", v)}
            renderItem={(item, i, update, remove) => (
              <div className="flex gap-2 items-start">
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={item.icon}
                      onChange={(e) =>
                        update(i, { ...item, icon: e.target.value })
                      }
                      className="input-field text-sm w-32"
                    >
                      <option value="">Icon...</option>
                      {ICON_OPTIONS.map((ic) => (
                        <option key={ic} value={ic}>
                          {ic}
                        </option>
                      ))}
                    </select>
                    <input
                      value={item.title}
                      onChange={(e) =>
                        update(i, { ...item, title: e.target.value })
                      }
                      placeholder="Title"
                      className="input-field text-sm flex-1"
                    />
                  </div>
                  <textarea
                    value={item.description}
                    onChange={(e) =>
                      update(i, { ...item, description: e.target.value })
                    }
                    placeholder="Description..."
                    rows={2}
                    className="input-field text-sm"
                  />
                </div>
                <button
                  onClick={() => remove(i)}
                  className="p-1.5 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            newItem={{ title: "", description: "", icon: "" }}
            addLabel="Add Highlight"
          />
        </EditorSection>

        {/* Timeline */}
        <EditorSection
          title={`Timeline (${form.timeline.length})`}
          icon={<Settings2 className="w-4 h-4" />}
          expanded={expandedSections.timeline}
          onToggle={() => toggleSection("timeline")}
        >
          <ArrayEditor
            items={form.timeline}
            onChange={(v) => updateField("timeline", v)}
            renderItem={(item, i, update, remove) => (
              <div className="flex gap-2 items-start">
                <div className="flex-1 grid sm:grid-cols-4 gap-2">
                  <input
                    value={item.date}
                    onChange={(e) =>
                      update(i, { ...item, date: e.target.value })
                    }
                    placeholder="Q1 2026"
                    className="input-field text-sm"
                  />
                  <input
                    value={item.title}
                    onChange={(e) =>
                      update(i, { ...item, title: e.target.value })
                    }
                    placeholder="Milestone title"
                    className="input-field text-sm"
                  />
                  <input
                    value={item.description || ""}
                    onChange={(e) =>
                      update(i, { ...item, description: e.target.value })
                    }
                    placeholder="Description"
                    className="input-field text-sm"
                  />
                  <select
                    value={item.status}
                    onChange={(e) =>
                      update(i, {
                        ...item,
                        status: e.target.value as "completed" | "current" | "upcoming",
                      })
                    }
                    className="input-field text-sm"
                  >
                    <option value="completed">Completed</option>
                    <option value="current">Current</option>
                    <option value="upcoming">Upcoming</option>
                  </select>
                </div>
                <button
                  onClick={() => remove(i)}
                  className="p-1.5 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            newItem={{
              date: "",
              title: "",
              description: "",
              status: "upcoming" as const,
            }}
            addLabel="Add Milestone"
          />
        </EditorSection>

        {/* Deal Terms */}
        <EditorSection
          title={`Deal Terms (${form.dealTerms.length})`}
          icon={<Landmark className="w-4 h-4" />}
          expanded={expandedSections.terms}
          onToggle={() => toggleSection("terms")}
        >
          <p className="text-xs text-muted-foreground mb-3">
            Leave empty to auto-generate from fund data (management fee,
            carry, hurdle, etc.)
          </p>
          <ArrayEditor
            items={form.dealTerms}
            onChange={(v) => updateField("dealTerms", v)}
            renderItem={(item, i, update, remove) => (
              <div className="flex gap-2 items-center">
                <input
                  value={item.label}
                  onChange={(e) =>
                    update(i, { ...item, label: e.target.value })
                  }
                  placeholder="Term label"
                  className="input-field text-sm flex-1"
                />
                <input
                  value={item.value}
                  onChange={(e) =>
                    update(i, { ...item, value: e.target.value })
                  }
                  placeholder="Value"
                  className="input-field text-sm flex-1"
                />
                <button
                  onClick={() => remove(i)}
                  className="p-1.5 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            newItem={{ label: "", value: "" }}
            addLabel="Add Term"
          />
        </EditorSection>

        {/* Competitive Advantages */}
        <EditorSection
          title={`Competitive Advantages (${form.advantages.length})`}
          icon={<Sparkles className="w-4 h-4" />}
          expanded={expandedSections.advantages}
          onToggle={() => toggleSection("advantages")}
        >
          <ArrayEditor
            items={form.advantages}
            onChange={(v) => updateField("advantages", v)}
            renderItem={(item, i, update, remove) => (
              <div className="flex gap-2 items-start">
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={item.icon}
                      onChange={(e) =>
                        update(i, { ...item, icon: e.target.value })
                      }
                      className="input-field text-sm w-32"
                    >
                      <option value="">Icon...</option>
                      {ICON_OPTIONS.map((ic) => (
                        <option key={ic} value={ic}>
                          {ic}
                        </option>
                      ))}
                    </select>
                    <input
                      value={item.title}
                      onChange={(e) =>
                        update(i, { ...item, title: e.target.value })
                      }
                      placeholder="Advantage title"
                      className="input-field text-sm flex-1"
                    />
                  </div>
                  <input
                    value={item.description}
                    onChange={(e) =>
                      update(i, { ...item, description: e.target.value })
                    }
                    placeholder="Short description"
                    className="input-field text-sm"
                  />
                </div>
                <button
                  onClick={() => remove(i)}
                  className="p-1.5 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            newItem={{ title: "", description: "", icon: "" }}
            addLabel="Add Advantage"
          />
        </EditorSection>

        {/* Leadership */}
        <EditorSection
          title={`Leadership Team (${form.leadership.length})`}
          icon={<Users className="w-4 h-4" />}
          expanded={expandedSections.leadership}
          onToggle={() => toggleSection("leadership")}
        >
          <ArrayEditor
            items={form.leadership}
            onChange={(v) => updateField("leadership", v)}
            renderItem={(item, i, update, remove) => (
              <div className="flex gap-2 items-start">
                <div className="flex-1 space-y-2">
                  <div className="grid sm:grid-cols-3 gap-2">
                    <input
                      value={item.name}
                      onChange={(e) =>
                        update(i, { ...item, name: e.target.value })
                      }
                      placeholder="Full name"
                      className="input-field text-sm"
                    />
                    <input
                      value={item.title}
                      onChange={(e) =>
                        update(i, { ...item, title: e.target.value })
                      }
                      placeholder="Title / Role"
                      className="input-field text-sm"
                    />
                    <input
                      value={item.imageUrl || ""}
                      onChange={(e) =>
                        update(i, { ...item, imageUrl: e.target.value })
                      }
                      placeholder="Photo URL (optional)"
                      className="input-field text-sm"
                    />
                  </div>
                  <textarea
                    value={item.bio || ""}
                    onChange={(e) =>
                      update(i, { ...item, bio: e.target.value })
                    }
                    placeholder="Bio (optional)"
                    rows={2}
                    className="input-field text-sm"
                  />
                </div>
                <button
                  onClick={() => remove(i)}
                  className="p-1.5 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            newItem={{ name: "", title: "", bio: "", imageUrl: "" }}
            addLabel="Add Team Member"
          />
        </EditorSection>

        {/* Dataroom Documents */}
        <EditorSection
          title={`Documents (${form.dataroomDocuments.length})`}
          icon={<Landmark className="w-4 h-4" />}
          expanded={expandedSections.documents}
          onToggle={() => toggleSection("documents")}
        >
          <ArrayEditor
            items={form.dataroomDocuments}
            onChange={(v) => updateField("dataroomDocuments", v)}
            renderItem={(item, i, update, remove) => (
              <div className="flex gap-2 items-center">
                <div className="flex-1 grid sm:grid-cols-4 gap-2">
                  <input
                    value={item.name}
                    onChange={(e) =>
                      update(i, { ...item, name: e.target.value })
                    }
                    placeholder="Document name"
                    className="input-field text-sm"
                  />
                  <input
                    value={item.type}
                    onChange={(e) =>
                      update(i, { ...item, type: e.target.value })
                    }
                    placeholder="Type (PDF, DOCX)"
                    className="input-field text-sm"
                  />
                  <input
                    value={item.url || ""}
                    onChange={(e) =>
                      update(i, { ...item, url: e.target.value })
                    }
                    placeholder="URL (optional)"
                    className="input-field text-sm"
                  />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={item.isGated}
                      onChange={(e) =>
                        update(i, { ...item, isGated: e.target.checked })
                      }
                      className="rounded"
                    />
                    Gated
                  </label>
                </div>
                <button
                  onClick={() => remove(i)}
                  className="p-1.5 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            newItem={{ name: "", type: "PDF", isGated: true, url: "" }}
            addLabel="Add Document"
          />
        </EditorSection>

        {/* CTA Configuration */}
        <EditorSection
          title="CTA & Email Gate"
          icon={<Sparkles className="w-4 h-4" />}
          expanded={expandedSections.cta}
          onToggle={() => toggleSection("cta")}
        >
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Primary CTA Text">
                <input
                  value={form.ctaText}
                  onChange={(e) => updateField("ctaText", e.target.value)}
                  placeholder="I Want to Invest"
                  className="input-field"
                />
              </Field>
              <Field label="Secondary CTA Text">
                <input
                  value={form.ctaSecondary}
                  onChange={(e) =>
                    updateField("ctaSecondary", e.target.value)
                  }
                  placeholder="View Documents"
                  className="input-field"
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.emailGateEnabled}
                onChange={(e) =>
                  updateField("emailGateEnabled", e.target.checked)
                }
                className="rounded"
              />
              <span className="text-foreground">
                Require email to access gated documents
              </span>
            </label>
          </div>
        </EditorSection>

        {/* Branding */}
        <EditorSection
          title="Branding & Styling"
          icon={<Palette className="w-4 h-4" />}
          expanded={expandedSections.branding}
          onToggle={() => toggleSection("branding")}
        >
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Brand Color">
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={form.brandColor}
                    onChange={(e) =>
                      updateField("brandColor", e.target.value)
                    }
                    className="w-10 h-10 rounded cursor-pointer border border-border"
                  />
                  <input
                    value={form.brandColor}
                    onChange={(e) =>
                      updateField("brandColor", e.target.value)
                    }
                    className="input-field flex-1"
                  />
                </div>
              </Field>
              <Field label="Accent Color">
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={form.accentColor}
                    onChange={(e) =>
                      updateField("accentColor", e.target.value)
                    }
                    className="w-10 h-10 rounded cursor-pointer border border-border"
                  />
                  <input
                    value={form.accentColor}
                    onChange={(e) =>
                      updateField("accentColor", e.target.value)
                    }
                    className="input-field flex-1"
                  />
                </div>
              </Field>
            </div>
            <Field label="Logo URL">
              <input
                value={form.logoUrl}
                onChange={(e) => updateField("logoUrl", e.target.value)}
                placeholder="https://..."
                className="input-field"
              />
            </Field>
            <Field label="Custom Disclaimer">
              <textarea
                value={form.disclaimerText}
                onChange={(e) =>
                  updateField("disclaimerText", e.target.value)
                }
                placeholder="Additional compliance disclaimer text..."
                rows={3}
                className="input-field"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.removeBranding}
                onChange={(e) =>
                  updateField("removeBranding", e.target.checked)
                }
                className="rounded"
              />
              <span className="text-foreground">
                Remove &ldquo;Powered by FundRoom&rdquo; badge ($40/mo)
              </span>
            </label>
          </div>
        </EditorSection>

        {/* SEO */}
        <EditorSection
          title="SEO & Social"
          icon={<Globe className="w-4 h-4" />}
          expanded={expandedSections.seo}
          onToggle={() => toggleSection("seo")}
        >
          <div className="space-y-4">
            <Field label="Meta Title">
              <input
                value={form.metaTitle}
                onChange={(e) => updateField("metaTitle", e.target.value)}
                placeholder="Auto-generated from fund name"
                className="input-field"
              />
            </Field>
            <Field label="Meta Description">
              <textarea
                value={form.metaDescription}
                onChange={(e) =>
                  updateField("metaDescription", e.target.value)
                }
                placeholder="Auto-generated from fund description"
                rows={2}
                className="input-field"
              />
            </Field>
            <Field label="OG Image URL">
              <input
                value={form.metaImageUrl}
                onChange={(e) =>
                  updateField("metaImageUrl", e.target.value)
                }
                placeholder="https://..."
                className="input-field"
              />
            </Field>
          </div>
        </EditorSection>
      </div>

      {/* Shared input styles injected via className */}
      <style jsx global>{`
        .input-field {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          color: hsl(var(--foreground));
          font-size: 0.875rem;
        }
        .input-field:focus {
          outline: none;
          ring: 2px;
          border-color: #0066ff;
          box-shadow: 0 0 0 2px rgba(0, 102, 255, 0.2);
        }
        .input-field::placeholder {
          color: hsl(var(--muted-foreground));
        }
      `}</style>
    </div>
  );
}

// ─── Reusable Sub-Components ───────────────────────────────────────────────────

function EditorSection({
  title,
  icon,
  expanded,
  onToggle,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {icon}
          {title}
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {expanded && <div className="px-4 pb-4 pt-2">{children}</div>}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-foreground mb-1.5 block">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function ArrayEditor<T>({
  items,
  onChange,
  renderItem,
  newItem,
  addLabel,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (
    item: T,
    index: number,
    update: (index: number, item: T) => void,
    remove: (index: number) => void
  ) => React.ReactNode;
  newItem: T;
  addLabel: string;
}) {
  const update = (index: number, item: T) => {
    const next = [...items];
    next[index] = item;
    onChange(next);
  };
  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };
  const add = () => {
    onChange([...items, { ...newItem }]);
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i}>{renderItem(item, i, update, remove)}</div>
      ))}
      <button
        onClick={add}
        className="text-sm text-[#0066FF] hover:text-[#0055DD] flex items-center gap-1"
      >
        <Plus className="w-3.5 h-3.5" />
        {addLabel}
      </button>
    </div>
  );
}
