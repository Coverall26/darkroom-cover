"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Shield,
  FileText,
  Eye,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Loader2,
  Download,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  documentId: string;
  event: string;
  recipientEmail: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface SignatureDocument {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  recipients: { email: string; status: string }[];
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  "document.created": { label: "Created", color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300" },
  "document.sent": { label: "Sent", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  "document.viewed": { label: "Viewed", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  "recipient.signed": { label: "Signed", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  "recipient.declined": { label: "Declined", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  "document.completed": { label: "Completed", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  "document.declined": { label: "Declined", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  "document.voided": { label: "Voided", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  "document.expired": { label: "Expired", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  "document.downloaded": { label: "Downloaded", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300" },
  "reminder.sent": { label: "Reminder Sent", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300" },
};

// ─── Main Component ─────────────────────────────────────────────────────────

export function SignatureAuditSection({ teamId }: { teamId: string }) {
  const [documents, setDocuments] = useState<SignatureDocument[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const fetchDocuments = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/signature-documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch {
      // Signature documents may not exist
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Fetch audit logs when document selected
  useEffect(() => {
    if (!teamId || !selectedDocId) {
      setAuditLogs([]);
      return;
    }
    setAuditLoading(true);
    fetch(`/api/teams/${teamId}/signature-documents/${selectedDocId}/audit-log`)
      .then((r) => r.json())
      .then((data) => setAuditLogs(data.auditLogs || []))
      .catch((e) => console.error("Failed to load audit logs:", e))
      .finally(() => setAuditLoading(false));
  }, [teamId, selectedDocId]);

  const handleExport = async (format: "csv" | "pdf") => {
    if (!teamId) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (selectedDocId) params.append("documentId", selectedDocId);
      if (dateStart) params.append("startDate", dateStart);
      if (dateEnd) params.append("endDate", dateEnd);
      params.append("format", format);

      const res = await fetch(
        `/api/teams/${teamId}/signature-audit/export?${params.toString()}`,
      );
      if (!res.ok) {
        toast.error("Failed to export");
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "csv" ? "csv" : "html";
      a.download = `signature-audit-${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Audit report exported");
    } catch {
      toast.error("Failed to export");
    } finally {
      setExporting(false);
    }
  };

  const filteredDocs = documents.filter(
    (doc) =>
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.recipients.some((r) =>
        r.email.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
  );

  const getEventIcon = (event: string) => {
    switch (event) {
      case "document.viewed":
        return <Eye className="h-3 w-3" />;
      case "recipient.signed":
      case "document.completed":
        return <CheckCircle2 className="h-3 w-3" />;
      case "document.declined":
      case "recipient.declined":
        return <XCircle className="h-3 w-3" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
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
    <div className="space-y-4">
      {/* Info bar + Export */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          SEC 506(c) compliance: full traceability on all signature events
        </p>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => handleExport("csv")}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => handleExport("pdf")}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FileText className="h-3 w-3" />
            )}
            Report
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2 rounded-md border bg-muted/30 p-3 dark:border-gray-800">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by title or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
          <select
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            className="h-8 rounded-md border px-2 text-xs dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">Select document...</option>
            {filteredDocs.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Date range:</Label>
          <Input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="h-7 w-32 text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="h-7 w-32 text-xs"
          />
          {(selectedDocId || searchQuery || dateStart || dateEnd) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setSelectedDocId("");
                setSearchQuery("");
                setDateStart("");
                setDateEnd("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Audit Log */}
      {!selectedDocId ? (
        <div className="rounded-md border border-dashed px-4 py-8 text-center dark:border-gray-800">
          <Shield className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            Select a document above to view its audit trail
          </p>
        </div>
      ) : auditLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : auditLogs.length === 0 ? (
        <div className="rounded-md border border-dashed px-4 py-6 text-center dark:border-gray-800">
          <p className="text-sm text-muted-foreground">
            No audit events recorded for this document
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b dark:border-gray-800">
                <th className="pb-2 text-left font-medium text-muted-foreground">
                  Event
                </th>
                <th className="pb-2 text-left font-medium text-muted-foreground">
                  Recipient
                </th>
                <th className="pb-2 text-left font-medium text-muted-foreground">
                  IP
                </th>
                <th className="pb-2 text-left font-medium text-muted-foreground">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-800">
              {auditLogs.map((log) => {
                const eventInfo = EVENT_LABELS[log.event];
                return (
                  <tr key={log.id}>
                    <td className="py-2">
                      <div className="flex items-center gap-1.5">
                        {getEventIcon(log.event)}
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            eventInfo?.color ||
                            "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
                          }`}
                        >
                          {eventInfo?.label || log.event}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 font-mono text-[11px]">
                      {log.recipientEmail || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        {log.ipAddress || "N/A"}
                      </code>
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Documents */}
      {documents.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Recent Signature Documents
          </p>
          <div className="space-y-1.5">
            {documents.slice(0, 10).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 dark:border-gray-800"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium truncate">
                    {doc.title}
                  </span>
                  <Badge
                    variant={
                      doc.status === "COMPLETED"
                        ? "default"
                        : doc.status === "DECLINED"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-[10px]"
                  >
                    {doc.status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {doc.recipients.length} recipient
                    {doc.recipients.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-[10px]"
                  onClick={() => setSelectedDocId(doc.id)}
                >
                  <Eye className="h-3 w-3" />
                  Audit
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
