"use client";

import { useState, useRef } from "react";
import { ArrowLeft, Upload, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTier } from "@/lib/hooks/use-tier";
import { ContactCapCounter } from "@/components/crm/ContactCapCounter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedRow {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone?: string;
  title?: string;
  status?: string;
  source?: string;
  tags?: string;
  error?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  overLimit: number;
  invalid: number;
  errors: Array<{ row: number; error: string }>;
  upgradeNeeded?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportPage() {
  const { tier, mutate: mutateTier } = useTier();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "review" | "result">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Parse CSV
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) {
          setParseError("CSV must have a header row and at least one data row");
          return;
        }

        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
        const emailIdx = headers.indexOf("email");
        if (emailIdx === -1) {
          setParseError("CSV must have an 'email' column");
          return;
        }

        const parsed: ParsedRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i]);
          const email = cols[emailIdx]?.trim();
          if (!email) continue;

          const row: ParsedRow = { email };
          const firstNameIdx = headers.indexOf("firstname") !== -1 ? headers.indexOf("firstname") : headers.indexOf("first_name");
          const lastNameIdx = headers.indexOf("lastname") !== -1 ? headers.indexOf("lastname") : headers.indexOf("last_name");
          const companyIdx = headers.indexOf("company");
          const phoneIdx = headers.indexOf("phone");
          const titleIdx = headers.indexOf("title");
          const statusIdx = headers.indexOf("status");
          const sourceIdx = headers.indexOf("source");
          const tagsIdx = headers.indexOf("tags");

          if (firstNameIdx !== -1) row.firstName = cols[firstNameIdx]?.trim();
          if (lastNameIdx !== -1) row.lastName = cols[lastNameIdx]?.trim();
          if (companyIdx !== -1) row.company = cols[companyIdx]?.trim();
          if (phoneIdx !== -1) row.phone = cols[phoneIdx]?.trim();
          if (titleIdx !== -1) row.title = cols[titleIdx]?.trim();
          if (statusIdx !== -1) row.status = cols[statusIdx]?.trim().toUpperCase();
          if (sourceIdx !== -1) row.source = cols[sourceIdx]?.trim();
          if (tagsIdx !== -1) row.tags = cols[tagsIdx]?.trim();

          // Validate email
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            row.error = "Invalid email format";
          }

          parsed.push(row);
        }

        if (parsed.length === 0) {
          setParseError("No valid rows found in CSV");
          return;
        }

        if (parsed.length > 500) {
          setParseError("Maximum 500 rows per import");
          return;
        }

        setRows(parsed);
        setStep("review");
      } catch {
        setParseError("Failed to parse CSV file");
      }
    };
    reader.readAsText(file);
  };

  // Import
  const handleImport = async () => {
    const validRows = rows.filter((r) => !r.error);
    if (validRows.length === 0) return;

    setImporting(true);
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: validRows.map((r) => ({
            email: r.email,
            firstName: r.firstName,
            lastName: r.lastName,
            company: r.company,
            phone: r.phone,
            title: r.title,
            status: r.status,
            source: r.source || "BULK_IMPORT",
            tags: r.tags ? r.tags.split(";").map((t) => t.trim()).filter(Boolean) : undefined,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setStep("result");
        mutateTier();
      } else {
        const data = await res.json();
        setParseError(data.error || "Import failed");
      }
    } catch {
      setParseError("Import failed");
    } finally {
      setImporting(false);
    }
  };

  // Download template
  const downloadTemplate = () => {
    const csv = "email,firstName,lastName,company,phone,title,status,source,tags\njohn@example.com,John,Smith,Acme Corp,555-1234,Partner,PROSPECT,MANUAL_ENTRY,\"tag1;tag2\"";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => window.location.href = "/admin/crm"}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Import Contacts</h1>
            <p className="text-sm text-muted-foreground">Upload a CSV file to bulk import contacts</p>
          </div>
        </div>
        <ContactCapCounter />
      </div>

      {/* Upload step */}
      {step === "upload" && (
        <div className="space-y-4">
          <div
            className="rounded-lg border-2 border-dashed border-border p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") fileInputRef.current?.click(); }}
          >
            <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Click to upload CSV</p>
            <p className="text-xs text-muted-foreground mt-1">Maximum 500 rows</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Download Template
          </Button>

          {parseError && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">{parseError}</p>
          )}
        </div>
      )}

      {/* Review step */}
      {step === "review" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm">
              <span className="font-mono font-medium">{rows.length}</span> rows parsed
              {rows.filter((r) => r.error).length > 0 && (
                <span className="text-amber-600 dark:text-amber-400 ml-2">
                  ({rows.filter((r) => r.error).length} with errors)
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setStep("upload"); setRows([]); }}>
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={importing || rows.filter((r) => !r.error).length === 0}
              >
                {importing ? "Importing..." : `Import ${rows.filter((r) => !r.error).length} Contacts`}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Name</th>
                  <th className="px-3 py-2 text-left font-medium">Company</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className={`border-b ${row.error ? "bg-red-50/50 dark:bg-red-950/20" : ""}`}>
                    <td className="px-3 py-1.5 font-mono text-xs">{row.email}</td>
                    <td className="px-3 py-1.5">{[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}</td>
                    <td className="px-3 py-1.5">{row.company || "—"}</td>
                    <td className="px-3 py-1.5">
                      {row.error ? (
                        <span className="text-xs text-red-600 dark:text-red-400">{row.error}</span>
                      ) : (
                        <span className="text-xs">{row.status || "PROSPECT"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Showing first 50 of {rows.length} rows
              </p>
            )}
          </div>
        </div>
      )}

      {/* Result step */}
      {step === "result" && result && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-6 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" aria-hidden="true" />
            <p className="text-lg font-medium">Import Complete</p>
            <div className="mt-3 flex justify-center gap-6 text-sm">
              <div>
                <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">{result.imported}</span>
                <span className="ml-1 text-muted-foreground">imported</span>
              </div>
              {result.skipped > 0 && (
                <div>
                  <span className="font-mono font-medium text-amber-600 dark:text-amber-400">{result.skipped}</span>
                  <span className="ml-1 text-muted-foreground">skipped (duplicate)</span>
                </div>
              )}
              {result.overLimit > 0 && (
                <div>
                  <span className="font-mono font-medium text-red-600 dark:text-red-400">{result.overLimit}</span>
                  <span className="ml-1 text-muted-foreground">over limit</span>
                </div>
              )}
            </div>
            {result.upgradeNeeded && (
              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Some contacts were skipped due to the FREE tier limit. Upgrade for unlimited contacts.
              </div>
            )}
          </div>
          <div className="flex justify-center">
            <Button onClick={() => window.location.href = "/admin/crm"}>
              Back to CRM
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV parser (handles quoted fields)
// ---------------------------------------------------------------------------

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
