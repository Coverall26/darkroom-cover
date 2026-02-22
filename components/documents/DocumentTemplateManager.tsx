"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Upload,
  Eye,
  Trash2,
  RotateCcw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
  Shield,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { TemplateUploadModal } from "./template-upload-modal";
import { TemplatePreviewModal } from "./template-preview-modal";

// ─── Types ───────────────────────────────────────────────────────────────────

type FundMode = "GP_FUND" | "STARTUP";
type TemplateStatus = "DEFAULT_TEMPLATE" | "CUSTOM_UPLOADED" | "NOT_CONFIGURED";

interface CustomTemplate {
  id: string;
  name: string;
  file: string;
  storageType: string;
  numPages: number | null;
  createdAt: string;
  updatedAt: string;
}

interface DocumentTemplate {
  documentType: string;
  label: string;
  hasDefaultTemplate: boolean;
  mergeFields: string[];
  status: TemplateStatus;
  customTemplate: CustomTemplate | null;
}

interface DocumentTemplateManagerProps {
  orgId: string;
  teamId: string;
  fundId?: string;
  mode: FundMode;
  instrumentType?: string; // For STARTUP: "SAFE" | "CONVERTIBLE_NOTE" | "PRICED_EQUITY" | "SPV"
}

// ─── GP Fund Mode Document Configuration ────────────────────────────────────

interface DocTypeConfig {
  type: string;
  required: boolean | "configurable";
}

const GP_FUND_DOCS: DocTypeConfig[] = [
  { type: "NDA", required: "configurable" },
  { type: "LPA", required: true },
  { type: "SUBSCRIPTION", required: true },
  { type: "PPM", required: false },
  { type: "SIDE_LETTER", required: false },
  { type: "INVESTOR_QUESTIONNAIRE", required: false },
];

// ─── Startup Mode Document Configuration (varies by instrument) ─────────────

function getStartupDocs(instrumentType?: string): DocTypeConfig[] {
  const base: DocTypeConfig[] = [
    { type: "NDA", required: "configurable" },
  ];

  switch (instrumentType) {
    case "SAFE":
      return [
        ...base,
        { type: "SAFE", required: true },
        { type: "BOARD_CONSENT", required: false },
      ];
    case "CONVERTIBLE_NOTE":
      return [
        ...base,
        { type: "CONVERTIBLE_NOTE", required: true },
        { type: "BOARD_CONSENT", required: false },
      ];
    case "PRICED_EQUITY":
      return [
        ...base,
        { type: "SPA", required: true },
        { type: "IRA", required: true },
        { type: "VOTING_AGREEMENT", required: false },
        { type: "ROFR", required: false },
        { type: "BOARD_CONSENT", required: false },
      ];
    case "SPV":
      return [
        ...base,
        { type: "LPA", required: true },
        { type: "SUBSCRIPTION", required: true },
      ];
    default:
      // Show all startup doc types when instrument not yet selected
      return [
        ...base,
        { type: "SAFE", required: false },
        { type: "CONVERTIBLE_NOTE", required: false },
        { type: "SPA", required: false },
        { type: "IRA", required: false },
        { type: "VOTING_AGREEMENT", required: false },
        { type: "ROFR", required: false },
        { type: "BOARD_CONSENT", required: false },
      ];
  }
}

// ─── Status Badge Config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  TemplateStatus,
  {
    variant: "default" | "secondary" | "outline";
    label: string;
    className: string;
  }
> = {
  DEFAULT_TEMPLATE: {
    variant: "default",
    label: "Default Template",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  CUSTOM_UPLOADED: {
    variant: "default",
    label: "Custom Uploaded",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  NOT_CONFIGURED: {
    variant: "outline",
    label: "Not Configured",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

// ─── Main Component ─────────────────────────────────────────────────────────

export function DocumentTemplateManager({
  orgId,
  teamId,
  fundId,
  mode,
  instrumentType,
}: DocumentTemplateManagerProps) {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<string>("");
  const [uploadDocLabel, setUploadDocLabel] = useState<string>("");

  // Preview modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(
    null,
  );
  const [previewTemplateName, setPreviewTemplateName] = useState("");

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [deleteDocType, setDeleteDocType] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Merge fields expansion state
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ mode });
      if (fundId) params.set("fundId", fundId);

      const res = await fetch(
        `/api/org/${orgId}/document-templates?${params.toString()}`,
      );
      if (!res.ok) {
        throw new Error("Failed to fetch templates");
      }
      const data = await res.json();
      setTemplates(data.templates);
    } catch {
      setError("Failed to load document templates");
    } finally {
      setLoading(false);
    }
  }, [orgId, mode, fundId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Get the document configs for the current mode
  const docConfigs =
    mode === "GP_FUND" ? GP_FUND_DOCS : getStartupDocs(instrumentType);

  // ─── Handlers ──────────────────��────────────────────────────────────────────

  const handleUploadClick = (docType: string, label: string) => {
    setUploadDocType(docType);
    setUploadDocLabel(label);
    setUploadModalOpen(true);
  };

  const handlePreviewClick = (templateId: string, name: string) => {
    setPreviewTemplateId(templateId);
    setPreviewTemplateName(name);
    setPreviewModalOpen(true);
  };

  const handleDeleteClick = (templateId: string, docType: string) => {
    setDeleteTemplateId(templateId);
    setDeleteDocType(docType);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTemplateId) return;

    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/org/${orgId}/document-templates/${deleteTemplateId}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete template");
      }

      toast.success("Custom template removed");
      fetchTemplates();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete template",
      );
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setDeleteTemplateId(null);
      setDeleteDocType("");
    }
  };

  const toggleFieldExpansion = (docType: string) => {
    setExpandedFields((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(docType)) {
        next.delete(docType);
      } else {
        next.add(docType);
      }
      return next;
    });
  };

  // ─── Loading & Error States ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-8 w-8 text-destructive mb-2" />
        <p className="text-destructive text-sm">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchTemplates}
          className="mt-3"
        >
          Retry
        </Button>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Document Templates</h3>
        <p className="text-sm text-muted-foreground">
          Configure which documents LPs must sign during onboarding. Use
          FundRoom default templates or upload your own.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold">{docConfigs.length}</p>
            <p className="text-xs text-muted-foreground">Document Types</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-green-600">
              {
                templates.filter(
                  (t) =>
                    t.status === "DEFAULT_TEMPLATE" ||
                    t.status === "CUSTOM_UPLOADED",
                ).length
              }
            </p>
            <p className="text-xs text-muted-foreground">Configured</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-amber-600">
              {templates.filter((t) => t.status === "NOT_CONFIGURED").length}
            </p>
            <p className="text-xs text-muted-foreground">Not Configured</p>
          </CardContent>
        </Card>
      </div>

      {/* Document template list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {mode === "GP_FUND" ? "GP Fund" : "Startup"} Documents
          </CardTitle>
          <CardDescription>
            {mode === "GP_FUND"
              ? "Standard fund documents for LP onboarding"
              : instrumentType
                ? `Documents for ${instrumentType.replace(/_/g, " ").toLowerCase()} raise`
                : "Select an instrument type to see required documents"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {docConfigs.map((config) => {
              const template = templates.find(
                (t) => t.documentType === config.type,
              );
              if (!template) return null;

              return (
                <DocumentTemplateRow
                  key={config.type}
                  template={template}
                  required={config.required}
                  isExpanded={expandedFields.has(config.type)}
                  onToggleFields={() => toggleFieldExpansion(config.type)}
                  onUpload={() =>
                    handleUploadClick(config.type, template.label)
                  }
                  onPreview={() => {
                    if (template.customTemplate) {
                      handlePreviewClick(
                        template.customTemplate.id,
                        template.label,
                      );
                    }
                  }}
                  onDelete={() => {
                    if (template.customTemplate) {
                      handleDeleteClick(
                        template.customTemplate.id,
                        config.type,
                      );
                    }
                  }}
                  onUseDefault={() => {
                    if (template.customTemplate) {
                      handleDeleteClick(
                        template.customTemplate.id,
                        config.type,
                      );
                    }
                  }}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
          Default Template
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
          Custom Uploaded
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
          Not Configured
        </div>
      </div>

      {/* Upload Modal */}
      <TemplateUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        orgId={orgId}
        teamId={teamId}
        documentType={uploadDocType}
        documentLabel={uploadDocLabel}
        fundId={fundId}
        onSuccess={fetchTemplates}
      />

      {/* Preview Modal */}
      <TemplatePreviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        orgId={orgId}
        templateId={previewTemplateId}
        templateName={previewTemplateName}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Custom Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the custom template for &quot;{deleteDocType}&quot;.
              {templates.find((t) => t.documentType === deleteDocType)
                ?.hasDefaultTemplate
                ? " The FundRoom default template will be used instead."
                : " This document type will show as Not Configured."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Template"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Document Row Sub-Component ─────────────────────────────────────────────

interface DocumentTemplateRowProps {
  template: DocumentTemplate;
  required: boolean | "configurable";
  isExpanded: boolean;
  onToggleFields: () => void;
  onUpload: () => void;
  onPreview: () => void;
  onDelete: () => void;
  onUseDefault: () => void;
}

function DocumentTemplateRow({
  template,
  required,
  isExpanded,
  onToggleFields,
  onUpload,
  onPreview,
  onDelete,
  onUseDefault,
}: DocumentTemplateRowProps) {
  const statusConfig = STATUS_CONFIG[template.status];

  return (
    <div className="border rounded-lg transition-colors hover:bg-muted/50">
      {/* Main row */}
      <div className="flex items-center justify-between p-3 sm:p-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Status icon */}
          <div className="flex-shrink-0">
            {template.status === "CUSTOM_UPLOADED" ? (
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
            ) : template.status === "DEFAULT_TEMPLATE" ? (
              <Shield className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-500" />
            )}
          </div>

          {/* Document info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm">{template.label}</p>
              {/* Required badge */}
              {required === true && (
                <Badge
                  variant="secondary"
                  className="text-xs flex-shrink-0 bg-red-50 text-red-700 border-red-200"
                >
                  Required
                </Badge>
              )}
              {required === "configurable" && (
                <Badge variant="outline" className="text-xs flex-shrink-0">
                  Configurable
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <Badge variant="outline" className={`text-xs ${statusConfig.className}`}>
                {statusConfig.label}
              </Badge>
              {template.customTemplate?.numPages && (
                <span>{template.customTemplate.numPages} pages</span>
              )}
              {template.customTemplate?.createdAt && (
                <span>
                  Uploaded{" "}
                  {new Date(template.customTemplate.createdAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 ml-2">
          {/* Merge fields toggle */}
          {template.mergeFields.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleFields}
              className="min-h-[44px] min-w-[44px] text-muted-foreground"
              title="Show merge fields"
            >
              <Info className="h-4 w-4" />
              {isExpanded ? (
                <ChevronUp className="h-3 w-3 ml-0.5" />
              ) : (
                <ChevronDown className="h-3 w-3 ml-0.5" />
              )}
            </Button>
          )}

          {/* Preview button (only for custom uploads) */}
          {template.customTemplate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onPreview}
              className="min-h-[44px] min-w-[44px]"
              title="Preview template"
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}

          {/* Upload / Replace button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onUpload}
            className="min-h-[44px] text-base sm:text-sm"
          >
            <Upload className="h-3 w-3 mr-1" />
            <span className="hidden sm:inline">
              {template.customTemplate ? "Replace" : "Upload Custom"}
            </span>
            <span className="sm:hidden">
              {template.customTemplate ? "Replace" : "Upload"}
            </span>
          </Button>

          {/* Use Default button (only for custom with default available) */}
          {template.customTemplate && template.hasDefaultTemplate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onUseDefault}
              className="min-h-[44px] min-w-[44px] text-muted-foreground"
              title="Revert to default template"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}

          {/* Delete custom upload (only for custom without default) */}
          {template.customTemplate && !template.hasDefaultTemplate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-red-600"
              title="Remove custom template"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Merge fields expansion */}
      {isExpanded && template.mergeFields.length > 0 && (
        <div className="border-t px-3 sm:px-4 py-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Auto-Fill Merge Fields
          </p>
          <div className="flex flex-wrap gap-2">
            {template.mergeFields.map((field) => (
              <span
                key={field}
                className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-mono text-muted-foreground border border-border"
              >
                {field}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            These fields are automatically filled from investor data during the
            signing process.
          </p>
        </div>
      )}
    </div>
  );
}
