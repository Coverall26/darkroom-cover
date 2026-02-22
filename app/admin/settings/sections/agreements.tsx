"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Trash2,
  Download,
  Loader2,
  X,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Agreement {
  id: string;
  name: string;
  content: string;
  contentType: string;
  requireName: boolean;
  deletedAt: string | null;
  updatedAt: string;
  _count?: { links: number };
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function AgreementsSection({ teamId }: { teamId: string }) {
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formContentType, setFormContentType] = useState<"LINK" | "TEXT">("TEXT");
  const [formRequireName, setFormRequireName] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchAgreements = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/agreements`);
      if (res.ok) {
        const data = await res.json();
        const active = (Array.isArray(data) ? data : []).filter(
          (a: Agreement) => !a.deletedAt,
        );
        setAgreements(active);
      }
    } catch {
      toast.error("Failed to load agreements");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchAgreements();
  }, [fetchAgreements]);

  const resetForm = () => {
    setFormName("");
    setFormContent("");
    setFormContentType("TEXT");
    setFormRequireName(false);
    setShowCreateForm(false);
  };

  const handleCreate = async () => {
    const name = formName.trim();
    if (!name) {
      toast.error("Agreement name is required");
      return;
    }
    if (!formContent.trim()) {
      toast.error("Agreement content is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}/agreements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          content: formContent.trim(),
          contentType: formContentType,
          requireName: formRequireName,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to create agreement");
        return;
      }
      toast.success("Agreement created");
      resetForm();
      fetchAgreements();
    } catch {
      toast.error("Failed to create agreement");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (agreement: Agreement) => {
    if (!confirm(`Delete agreement "${agreement.name}"?`)) return;
    setDeleting(agreement.id);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/agreements/${agreement.id}`,
        { method: "PUT" },
      );
      if (!res.ok) {
        toast.error("Failed to delete agreement");
        return;
      }
      toast.success("Agreement deleted");
      fetchAgreements();
    } catch {
      toast.error("Failed to delete agreement");
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = async (agreement: Agreement) => {
    setDownloading(agreement.id);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/agreements/${agreement.id}/download`,
        { method: "POST" },
      );
      if (!res.ok) {
        toast.error("Failed to download agreement");
        return;
      }
      const contentDisposition = res.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="([^"]+)"/);
      const filename = filenameMatch
        ? filenameMatch[1]
        : `${agreement.name}.txt`;

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
      }, 100);
      toast.success("Agreement downloaded");
    } catch {
      toast.error("Failed to download agreement");
    } finally {
      setDownloading(null);
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
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {agreements.length} agreement{agreements.length !== 1 ? "s" : ""}
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
          Create Agreement
        </Button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="rounded-md border border-dashed border-blue-300 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/10">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">New Agreement</p>
            <button
              onClick={resetForm}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value.slice(0, 150))}
                placeholder="e.g. Non-Disclosure Agreement"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Content Type
              </Label>
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => setFormContentType("TEXT")}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    formContentType === "TEXT"
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "border-gray-200 text-muted-foreground hover:bg-muted dark:border-gray-700"
                  }`}
                >
                  Text
                </button>
                <button
                  onClick={() => setFormContentType("LINK")}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    formContentType === "LINK"
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "border-gray-200 text-muted-foreground hover:bg-muted dark:border-gray-700"
                  }`}
                >
                  Link
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                {formContentType === "LINK"
                  ? "Agreement URL"
                  : "Agreement Text"}
              </Label>
              {formContentType === "LINK" ? (
                <Input
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="https://..."
                  className="mt-1 text-sm"
                />
              ) : (
                <textarea
                  value={formContent}
                  onChange={(e) =>
                    setFormContent(e.target.value.slice(0, 1500))
                  }
                  placeholder="Enter the NDA or agreement text..."
                  rows={4}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
              )}
              {formContentType === "TEXT" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formContent.length}/1500 characters
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id="requireName"
                checked={formRequireName}
                onChange={(e) => setFormRequireName(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="requireName" className="text-xs text-muted-foreground">
                Require viewer to enter their name when signing
              </label>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={
                  submitting || !formName.trim() || !formContent.trim()
                }
                className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
              >
                {submitting && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Create
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Agreement List */}
      {agreements.length === 0 ? (
        <div className="rounded-md border border-dashed px-4 py-6 text-center dark:border-gray-800">
          <FileText className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No agreements yet. Create your first NDA or agreement for document
            sharing.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...agreements].reverse().map((agreement) => (
            <div
              key={agreement.id}
              className="flex items-center justify-between rounded-md border px-3 py-2.5 dark:border-gray-800"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {agreement.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Updated{" "}
                    {new Date(agreement.updatedAt).toLocaleDateString()}
                    {agreement._count?.links !== undefined && (
                      <> &middot; {agreement._count.links} link{agreement._count.links !== 1 ? "s" : ""}</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => handleDownload(agreement)}
                  disabled={downloading === agreement.id}
                >
                  {downloading === agreement.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700 dark:text-red-400"
                  onClick={() => handleDelete(agreement)}
                  disabled={deleting === agreement.id}
                >
                  {deleting === agreement.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
