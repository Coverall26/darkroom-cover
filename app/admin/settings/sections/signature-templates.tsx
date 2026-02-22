"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  LayoutTemplate,
  Plus,
  Trash2,
  Copy,
  Loader2,
  X,
  Upload,
  FileIcon,
  PenLine,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SignatureTemplate {
  id: string;
  name: string;
  description: string | null;
  numPages: number | null;
  usageCount: number;
  createdAt: string;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SignatureTemplatesSection({ teamId }: { teamId: string }) {
  const [templates, setTemplates] = useState<SignatureTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [using, setUsing] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/signature-templates`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : data.templates || []);
      }
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const resetForm = () => {
    setFormName("");
    setFormDesc("");
    setSelectedFile(null);
    setShowCreateForm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("Please select a PDF file");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File must be under 10MB");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleCreate = async () => {
    if (!formName.trim() || !selectedFile) return;
    setSubmitting(true);
    setUploading(true);

    try {
      // Dynamic import to avoid bundling putFile when not needed
      const { putFile } = await import("@/lib/files/put-file");
      const { type, data } = await putFile({
        file: selectedFile,
        teamId,
      });
      setUploading(false);

      const res = await fetch(`/api/teams/${teamId}/signature-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDesc.trim() || null,
          file: data,
          storageType: type,
          defaultRecipients: [{ role: "SIGNER", name: "Signer 1", order: 1 }],
          fields: [],
        }),
      });

      if (!res.ok) {
        toast.error("Failed to create template");
        return;
      }
      toast.success("Template created");
      resetForm();
      fetchTemplates();
    } catch {
      toast.error("Failed to create template");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const handleDelete = async (template: SignatureTemplate) => {
    if (!confirm(`Delete template "${template.name}"? Documents created from this template will not be affected.`)) return;
    setDeleting(template.id);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/signature-templates/${template.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        toast.error("Failed to delete template");
        return;
      }
      toast.success("Template deleted");
      fetchTemplates();
    } catch {
      toast.error("Failed to delete template");
    } finally {
      setDeleting(null);
    }
  };

  const handleUse = async (template: SignatureTemplate) => {
    setUsing(template.id);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/signature-templates/${template.id}/use`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        toast.error("Failed to create document from template");
        return;
      }
      const doc = await res.json();
      toast.success("Document created from template");
      window.location.href = `/sign/${doc.id}`;
    } catch {
      toast.error("Failed to create document from template");
    } finally {
      setUsing(null);
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
          {templates.length} template{templates.length !== 1 ? "s" : ""}
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
          New Template
        </Button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="rounded-md border border-dashed border-blue-300 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/10">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Create Signature Template</p>
            <button
              onClick={resetForm}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">
                Template Name *
              </Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. NDA Agreement, Subscription Document"
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Description (optional)
              </Label>
              <Input
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Brief description..."
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                PDF Document *
              </Label>
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              {selectedFile ? (
                <div className="mt-1 flex items-center gap-3 rounded-md border bg-muted/50 p-2 dark:border-gray-700">
                  <FileIcon className="h-4 w-4 text-red-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 w-full rounded-md border-2 border-dashed p-4 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/50 dark:border-gray-700 dark:hover:border-blue-700 dark:hover:bg-blue-900/10"
                >
                  <Upload className="mx-auto h-5 w-5 text-muted-foreground" />
                  <p className="mt-1 text-xs font-medium">Click to upload PDF</p>
                  <p className="text-xs text-muted-foreground">
                    PDF only, up to 10MB
                  </p>
                </button>
              )}
            </div>
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={submitting || !formName.trim() || !selectedFile}
                className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
              >
                {submitting && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                {uploading ? "Uploading..." : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Template List */}
      {templates.length === 0 ? (
        <div className="rounded-md border border-dashed px-4 py-6 text-center dark:border-gray-800">
          <LayoutTemplate className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No templates yet. Create reusable templates for NDAs and subscription
            documents.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between rounded-md border px-3 py-2.5 dark:border-gray-800"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-purple-100 dark:bg-purple-900/30">
                  <LayoutTemplate className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {template.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {template.numPages ? `${template.numPages} pages` : ""}
                    {template.numPages && template.usageCount > 0 ? " · " : ""}
                    {template.usageCount > 0 ? `Used ${template.usageCount} time${template.usageCount !== 1 ? "s" : ""}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => handleUse(template)}
                  disabled={using === template.id}
                >
                  {using === template.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  Use
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() =>
                    (window.location.href = `/sign/templates/${template.id}/prepare`)
                  }
                >
                  <PenLine className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700 dark:text-red-400"
                  onClick={() => handleDelete(template)}
                  disabled={deleting === template.id}
                >
                  {deleting === template.id ? (
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
