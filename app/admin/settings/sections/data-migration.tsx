"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  Database,
  Download,
  Upload,
  Loader2,
  Check,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

const EXPORTABLE_MODELS = [
  { key: "fund", label: "Funds" },
  { key: "investor", label: "Investors" },
  { key: "investment", label: "Investments" },
  { key: "capitalCall", label: "Capital Calls" },
  { key: "capitalCallResponse", label: "Capital Call Responses" },
  { key: "distribution", label: "Distributions" },
  { key: "fundReport", label: "Fund Reports" },
  { key: "investorNote", label: "Investor Notes" },
  { key: "investorDocument", label: "Investor Documents" },
  { key: "accreditationAck", label: "Accreditation Records" },
  { key: "bankLink", label: "Bank Links" },
  { key: "transaction", label: "Transactions" },
] as const;

interface ExportResult {
  model: string;
  count: number;
  url?: string;
}

interface ImportResult {
  model: string;
  imported: number;
  errors: number;
  details?: string[];
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function DataMigrationSection({ teamId }: { teamId: string }) {
  const [activeTab, setActiveTab] = useState<"export" | "import">("export");

  // Export state
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [exporting, setExporting] = useState(false);
  const [exportResults, setExportResults] = useState<ExportResult[]>([]);

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);

  const toggleModel = (key: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedModels(new Set(EXPORTABLE_MODELS.map((m) => m.key)));
  };

  const deselectAll = () => {
    setSelectedModels(new Set());
  };

  const handleExport = useCallback(async () => {
    if (!teamId || selectedModels.size === 0) return;
    setExporting(true);
    setExportResults([]);
    try {
      const res = await fetch(`/api/admin/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          models: Array.from(selectedModels),
          format: exportFormat,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Export failed");
        return;
      }
      const data = await res.json();
      if (data.results) {
        setExportResults(data.results);
        toast.success("Export complete");
      } else {
        // Direct download
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fundroom-export-${new Date().toISOString().slice(0, 10)}.${exportFormat}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success("Export downloaded");
      }
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }, [teamId, selectedModels, exportFormat]);

  const handleBlobExport = useCallback(async () => {
    if (!teamId || selectedModels.size === 0) return;
    setExporting(true);
    setExportResults([]);
    try {
      const res = await fetch(`/api/admin/export-blobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          models: Array.from(selectedModels),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Blob export failed");
        return;
      }
      const data = await res.json();
      setExportResults(data.results || []);
      toast.success("Blob export complete — download links below");
    } catch {
      toast.error("Blob export failed");
    } finally {
      setExporting(false);
    }
  }, [teamId, selectedModels]);

  const handleImport = useCallback(async () => {
    if (!teamId || !importFile) return;
    setImporting(true);
    setImportResults([]);
    try {
      const text = await importFile.text();
      const res = await fetch(`/api/admin/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          data: JSON.parse(text),
          dryRun,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Import failed");
        return;
      }
      const data = await res.json();
      setImportResults(data.results || []);
      toast.success(dryRun ? "Dry run complete — review results below" : "Import complete");
    } catch {
      toast.error("Import failed — check file format");
    } finally {
      setImporting(false);
    }
  }, [teamId, importFile, dryRun]);

  return (
    <div className="space-y-4">
      {/* Tab Selector */}
      <div className="flex gap-1 rounded-md border p-0.5 dark:border-gray-800">
        <button
          onClick={() => setActiveTab("export")}
          className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "export"
              ? "bg-blue-600 text-white"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Download className="mr-1.5 inline h-3 w-3" />
          Export Data
        </button>
        <button
          onClick={() => setActiveTab("import")}
          className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "import"
              ? "bg-blue-600 text-white"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Upload className="mr-1.5 inline h-3 w-3" />
          Import Data
        </button>
      </div>

      {/* Export Tab */}
      {activeTab === "export" && (
        <div className="space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 dark:border-blue-800 dark:bg-blue-900/10">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Export your fund data for backup, compliance, or migration purposes.
              Select models below and choose a format.
            </p>
          </div>

          {/* Model selection */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Select Data Models ({selectedModels.size}/{EXPORTABLE_MODELS.length})
              </Label>
              <div className="flex gap-1.5">
                <button
                  onClick={selectAll}
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  Select All
                </button>
                <span className="text-xs text-muted-foreground">·</span>
                <button
                  onClick={deselectAll}
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {EXPORTABLE_MODELS.map((model) => (
                <label
                  key={model.key}
                  className="flex items-center gap-2 rounded-md border px-2.5 py-2 cursor-pointer hover:bg-muted/50 dark:border-gray-800"
                >
                  <input
                    type="checkbox"
                    checked={selectedModels.has(model.key)}
                    onChange={() => toggleModel(model.key)}
                    className="h-3.5 w-3.5 rounded"
                  />
                  <span className="text-xs">{model.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Format + Actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Format:</Label>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as "json" | "csv")}
                className="h-8 rounded-md border px-2 text-xs dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleBlobExport}
              disabled={exporting || selectedModels.size === 0}
            >
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
              Blob Export (S3)
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 text-xs"
              onClick={handleExport}
              disabled={exporting || selectedModels.size === 0}
            >
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Export
            </Button>
          </div>

          {/* Export Results */}
          {exportResults.length > 0 && (
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-3 dark:border-gray-800">
              <p className="text-xs font-medium text-muted-foreground">Export Results</p>
              {exportResults.map((result) => (
                <div
                  key={result.model}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-green-500" />
                    <span>{result.model}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {result.count} records
                    </Badge>
                  </div>
                  {result.url && (
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Download
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Import Tab */}
      {activeTab === "import" && (
        <div className="space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/10">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Import will create or update records. Use dry run first to validate.
              </p>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <Label className="text-xs text-muted-foreground">Upload JSON File</Label>
            <div className="mt-1">
              <label className="flex items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 cursor-pointer hover:bg-muted/50 dark:border-gray-700">
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setImportFile(file);
                  }}
                />
                {importFile ? (
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">{importFile.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(importFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="mx-auto h-6 w-6 text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">
                      Click to select a JSON export file
                    </p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Options + Import */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="h-3.5 w-3.5 rounded"
              />
              <span className="text-xs font-medium">Dry run (validate only)</span>
            </label>
            <div className="flex-1" />
            <Button
              size="sm"
              className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700 text-xs"
              onClick={handleImport}
              disabled={importing || !importFile}
            >
              {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {dryRun ? "Validate" : "Import"}
            </Button>
          </div>

          {/* Import Results */}
          {importResults.length > 0 && (
            <div className="space-y-1.5 rounded-md border bg-muted/30 p-3 dark:border-gray-800">
              <p className="text-xs font-medium text-muted-foreground">
                {dryRun ? "Validation" : "Import"} Results
              </p>
              {importResults.map((result) => (
                <div key={result.model} className="text-xs">
                  <div className="flex items-center gap-1.5">
                    {result.errors > 0 ? (
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                    ) : (
                      <Check className="h-3 w-3 text-green-500" />
                    )}
                    <span className="font-medium">{result.model}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {result.imported} imported
                    </Badge>
                    {result.errors > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {result.errors} errors
                      </Badge>
                    )}
                  </div>
                  {result.details && result.details.length > 0 && (
                    <ul className="mt-1 ml-5 list-disc text-[10px] text-muted-foreground">
                      {result.details.slice(0, 3).map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                      {result.details.length > 3 && (
                        <li>...and {result.details.length - 3} more</li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
