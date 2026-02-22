"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Download,
  Upload,
  FileSpreadsheet,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";

/**
 * Bulk Investor Import Page
 *
 * 1. Download CSV/Excel template
 * 2. Fill out template with investor data
 * 3. Upload filled template
 * 4. Auto-column mapping & validation
 * 5. Review & import
 */

interface ParsedRow {
  name: string;
  email: string;
  phone?: string;
  entityType: string;
  entityName?: string;
  commitmentAmount: number;
  commitmentDate?: string;
  fundingStatus: string;
  accreditationStatus: string;
  address?: string;
  notes?: string;
  valid: boolean;
  errors: string[];
}

interface ImportResult {
  email: string;
  name: string;
  success: boolean;
  error?: string;
}

export default function BulkImportClient() {
  const [step, setStep] = useState<
    "upload" | "mapping" | "review" | "importing" | "results"
  >("upload");
  const [fundId, setFundId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [funds, setFunds] = useState<
    Array<{ id: string; name: string; teamId: string }>
  >([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetch("/api/fund-settings/funds")
      .then((res) => res.json())
      .then((data) => {
        const fundsList = data.funds || [];
        setFunds(fundsList);
        if (fundsList.length > 0) {
          setFundId(fundsList[0].id);
          setTeamId(fundsList[0].teamId);
        }
      })
      .catch((e) => console.error("Failed to load funds:", e));
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const lines = text.split("\n").filter((l) => l.trim());

        if (lines.length < 2) {
          toast.error("CSV must have a header row and at least one data row");
          return;
        }

        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
        const rows: ParsedRow[] = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map((v) => v.trim());
          const errors: string[] = [];

          const name = values[headers.indexOf("name")] || "";
          const email = values[headers.indexOf("email")] || "";
          const commitmentStr =
            values[headers.indexOf("commitmentamount")] || "0";
          const commitmentAmount = Number(commitmentStr);

          if (!name) errors.push("Name is required");
          if (!email || !email.includes("@")) errors.push("Valid email required");
          if (commitmentAmount <= 0) errors.push("Commitment amount must be positive");

          rows.push({
            name,
            email,
            phone: values[headers.indexOf("phone")] || undefined,
            entityType:
              values[headers.indexOf("entitytype")] || "INDIVIDUAL",
            entityName:
              values[headers.indexOf("entityname")] || undefined,
            commitmentAmount,
            commitmentDate:
              values[headers.indexOf("commitmentdate")] || undefined,
            fundingStatus:
              values[headers.indexOf("fundingstatus")] || "COMMITTED",
            accreditationStatus:
              values[headers.indexOf("accreditationstatus")] ||
              "SELF_CERTIFIED",
            address: values[headers.indexOf("address")] || undefined,
            notes: values[headers.indexOf("notes")] || undefined,
            valid: errors.length === 0,
            errors,
          });
        }

        setParsedRows(rows);
        setStep("review");
      };
      reader.readAsText(file);
    },
    [],
  );

  const handleImport = async () => {
    const validRows = parsedRows.filter((r) => r.valid);
    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setImporting(true);
    setStep("importing");

    try {
      const res = await fetch("/api/admin/investors/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fundId,
          teamId,
          investors: validRows.map(({ valid, errors, ...row }) => row),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setImportResults(data.results);
        setStep("results");
        toast.success(data.message);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Import failed");
        setStep("review");
      }
    } catch {
      toast.error("An error occurred during import");
      setStep("review");
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedRows.filter((r) => r.valid).length;
  const invalidCount = parsedRows.filter((r) => !r.valid).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/investors">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Bulk Import Investors</h1>
          <p className="text-sm text-muted-foreground">
            Upload a CSV to import multiple investors at once
          </p>
        </div>
      </div>

      {/* Fund Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Select Fund for Import
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={fundId}
            onValueChange={(v) => {
              setFundId(v);
              const fund = funds.find((f) => f.id === v);
              if (fund) setTeamId(fund.teamId);
            }}
          >
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="Select a fund" />
            </SelectTrigger>
            <SelectContent>
              {funds.map((fund) => (
                <SelectItem key={fund.id} value={fund.id}>
                  {fund.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {step === "upload" && (
        <>
          {/* Template Download */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Download className="h-4 w-4" />
                Step 1: Download Template
              </CardTitle>
              <CardDescription>
                Use our CSV template to ensure proper formatting
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => {
                  window.open(
                    "/api/admin/investors/bulk-import",
                    "_blank",
                  );
                }}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Download CSV Template
              </Button>
            </CardContent>
          </Card>

          {/* File Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Upload className="h-4 w-4" />
                Step 2: Upload Filled Template
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12">
                <div className="text-center">
                  <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-gray-400" />
                  <p className="mb-2 text-sm font-medium">
                    Drop your CSV file here or click to browse
                  </p>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Supports .csv files up to 500 rows
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {step === "review" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Step 3: Review & Import
            </CardTitle>
            <CardDescription>
              {validCount} valid rows, {invalidCount} with errors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {row.valid ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <X className="h-4 w-4 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.entityType}</Badge>
                      </TableCell>
                      <TableCell>
                        ${row.commitmentAmount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {row.errors.length > 0 && (
                          <span className="text-xs text-red-500">
                            {row.errors.join(", ")}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Upload Different File
              </Button>
              <Button
                onClick={handleImport}
                disabled={validCount === 0 || !fundId}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                Import {validCount} Investors
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "importing" && (
        <Card>
          <CardContent className="flex h-64 items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-blue-600" />
              <p className="font-medium">Importing investors...</p>
              <p className="text-sm text-muted-foreground">
                Processing {validCount} records
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "results" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex gap-4">
              <Badge variant="default">
                {importResults.filter((r) => r.success).length} Succeeded
              </Badge>
              <Badge variant="destructive">
                {importResults.filter((r) => !r.success).length} Failed
              </Badge>
            </div>

            <div className="max-h-64 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importResults.map((result, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {result.success ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell>{result.name}</TableCell>
                      <TableCell>{result.email}</TableCell>
                      <TableCell>
                        {result.error && (
                          <span className="text-xs text-red-500">
                            {result.error}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4">
              <Link href="/admin/investors">
                <Button className="bg-blue-600 text-white hover:bg-blue-700">
                  View All Investors
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
