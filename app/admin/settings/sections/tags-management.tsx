"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Tag,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  X,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─── Color options (matching Papermark tag badge colors) ────────────────────

const TAG_COLORS = [
  { value: "red", label: "Red", bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", dot: "bg-red-500" },
  { value: "orange", label: "Orange", bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-400", dot: "bg-orange-500" },
  { value: "amber", label: "Amber", bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  { value: "yellow", label: "Yellow", bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-400", dot: "bg-yellow-500" },
  { value: "green", label: "Green", bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400", dot: "bg-green-500" },
  { value: "emerald", label: "Emerald", bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  { value: "blue", label: "Blue", bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", dot: "bg-blue-500" },
  { value: "indigo", label: "Indigo", bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-400", dot: "bg-indigo-500" },
  { value: "purple", label: "Purple", bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-400", dot: "bg-purple-500" },
  { value: "pink", label: "Pink", bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-400", dot: "bg-pink-500" },
  { value: "gray", label: "Gray", bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-400", dot: "bg-gray-500" },
];

function getColorConfig(color: string) {
  return TAG_COLORS.find((c) => c.value === color) || TAG_COLORS[TAG_COLORS.length - 1];
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface TagItem {
  id: string;
  name: string;
  description: string | null;
  color: string;
  _count?: { items: number };
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function TagsSection({ teamId }: { teamId: string }) {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formColor, setFormColor] = useState("blue");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(
        `/api/teams/${teamId}/tags?sortBy=name&sortOrder=asc&pageSize=100&includeLinksCount=true`,
      );
      if (res.ok) {
        const data = await res.json();
        setTags(data.tags || data || []);
      }
    } catch {
      toast.error("Failed to load tags");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const resetForm = () => {
    setFormName("");
    setFormDesc("");
    setFormColor("blue");
    setEditingTag(null);
    setShowCreateForm(false);
  };

  const openEdit = (tag: TagItem) => {
    setEditingTag(tag);
    setFormName(tag.name);
    setFormDesc(tag.description || "");
    setFormColor(tag.color);
    setShowCreateForm(true);
  };

  const handleSubmit = async () => {
    const name = formName.trim();
    if (!name || name.length < 1) {
      toast.error("Tag name is required");
      return;
    }
    if (name.length > 50) {
      toast.error("Tag name must be 50 characters or less");
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        name,
        description: formDesc.trim() || null,
        color: formColor,
      };

      const url = editingTag
        ? `/api/teams/${teamId}/tags/${editingTag.id}`
        : `/api/teams/${teamId}/tags`;
      const method = editingTag ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || `Failed to ${editingTag ? "update" : "create"} tag`);
        return;
      }

      toast.success(editingTag ? "Tag updated" : "Tag created");
      resetForm();
      fetchTags();
    } catch {
      toast.error("Failed to save tag");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (tag: TagItem) => {
    if (!confirm(`Delete tag "${tag.name}"? This will remove it from all documents and investors.`)) return;
    setDeleting(tag.id);
    try {
      const res = await fetch(`/api/teams/${teamId}/tags/${tag.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to delete tag");
        return;
      }
      toast.success("Tag deleted");
      fetchTags();
    } catch {
      toast.error("Failed to delete tag");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const displayTags = showAll ? tags : tags.slice(0, 20);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {tags.length} tag{tags.length !== 1 ? "s" : ""}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => {
            resetForm();
            setShowCreateForm(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Tag
        </Button>
      </div>

      {/* Create / Edit Form */}
      {showCreateForm && (
        <div className="rounded-md border border-dashed border-blue-300 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">
              {editingTag ? "Edit Tag" : "Create Tag"}
            </p>
            <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value.slice(0, 50))}
                placeholder="Tag name"
                className="mt-1 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description (optional)</Label>
              <Input
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value.slice(0, 120))}
                placeholder="Short description"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Color</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setFormColor(c.value)}
                    className={`h-6 w-6 rounded-full border-2 transition-all ${c.dot} ${
                      formColor === c.value
                        ? "border-foreground scale-110"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitting || !formName.trim()}
                className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingTag ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tag List */}
      {tags.length === 0 ? (
        <div className="rounded-md border border-dashed px-4 py-6 text-center dark:border-gray-800">
          <Tag className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No tags yet. Create your first tag to organize documents and investors.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {displayTags.map((tag) => {
            const colorCfg = getColorConfig(tag.color);
            return (
              <div
                key={tag.id}
                className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorCfg.bg} ${colorCfg.text}`}>
                    <span className={`h-2 w-2 rounded-full ${colorCfg.dot}`} />
                    {tag.name}
                  </span>
                  {tag.description && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {tag.description}
                    </span>
                  )}
                  {tag._count?.items !== undefined && tag._count.items > 0 && (
                    <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                      {tag._count.items} link{tag._count.items !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => openEdit(tag)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 dark:text-red-400"
                    onClick={() => handleDelete(tag)}
                    disabled={deleting === tag.id}
                  >
                    {deleting === tag.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
          {tags.length > 20 && !showAll && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => setShowAll(true)}
            >
              Show all {tags.length} tags
              <ChevronDown className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
