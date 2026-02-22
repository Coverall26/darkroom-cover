"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import dynamic from "next/dynamic";
import { PendingDocumentsTable } from "@/components/admin/pending-documents-table";

const DocumentTemplateManager = dynamic(
  () => import("@/components/documents/DocumentTemplateManager").then(m => ({ default: m.DocumentTemplateManager })),
  { loading: () => <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div> }
);
import {
  RefreshCw,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  FolderOpen,
  Upload,
} from "lucide-react";
import { AdminPageSkeleton, EmptyState } from "@/components/admin/shared/empty-state";

interface StatusCounts {
  PENDING_REVIEW?: number;
  APPROVED?: number;
  REJECTED?: number;
  REVISION_REQUESTED?: number;
}

interface TeamContext {
  teamId: string;
  orgId: string | null;
  mode: "GP_FUND" | "STARTUP";
  instrumentType: string | null;
  funds: Array<{
    id: string;
    name: string;
    entityMode: string | null;
    fundSubType: string | null;
  }>;
}

export default function AdminDocumentsPage() {
  const [view, setView] = useState<"review" | "templates">("review");
  const [documents, setDocuments] = useState<any[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Team context for templates view
  const [teamContext, setTeamContext] = useState<TeamContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [selectedFundId, setSelectedFundId] = useState<string>("");

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const response = await fetch(`/api/admin/documents?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch documents");
      }

      setDocuments(data.documents);
      setStatusCounts(data.statusCounts || {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Fetch team context when switching to templates view
  useEffect(() => {
    if (view !== "templates" || teamContext) return;

    setContextLoading(true);
    fetch("/api/admin/team-context")
      .then((r) => r.json())
      .then((data) => {
        if (data.teamId) {
          setTeamContext(data);
          if (data.funds?.length > 0 && !selectedFundId) {
            setSelectedFundId(data.funds[0].id);
          }
        }
      })
      .catch((e) => console.error("Failed to load team context:", e))
      .finally(() => setContextLoading(false));
  }, [view, teamContext, selectedFundId]);

  const pendingCount = statusCounts.PENDING_REVIEW || 0;
  const approvedCount = statusCounts.APPROVED || 0;
  const rejectedCount = statusCounts.REJECTED || 0;
  const revisionCount = statusCounts.REVISION_REQUESTED || 0;

  // Resolve mode and instrument type from selected fund
  const selectedFund = teamContext?.funds.find((f) => f.id === selectedFundId);
  const resolvedMode = (
    selectedFund?.entityMode === "STARTUP"
      ? "STARTUP"
      : teamContext?.mode || "GP_FUND"
  ) as "GP_FUND" | "STARTUP";
  const resolvedInstrumentType =
    selectedFund?.fundSubType || teamContext?.instrumentType || undefined;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-muted-foreground">
            {view === "review"
              ? "Review and manage documents uploaded by investors"
              : "Configure document templates for LP onboarding"}
          </p>
        </div>
        {view === "review" && (
          <Button
            variant="outline"
            onClick={fetchDocuments}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        )}
      </div>

      {/* Top-level view toggle */}
      <div className="flex gap-2 border-b pb-0">
        <button
          onClick={() => setView("review")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            view === "review"
              ? "border-[#0066FF] text-[#0066FF]"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
          }`}
        >
          <FileText className="h-4 w-4" />
          LP Documents
          {pendingCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-amber-100 text-amber-800 text-xs font-medium px-1.5">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setView("templates")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            view === "templates"
              ? "border-[#0066FF] text-[#0066FF]"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300"
          }`}
        >
          <FolderOpen className="h-4 w-4" />
          Document Templates
        </button>
      </div>

      {/* LP Documents view */}
      {view === "review" && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Pending Review
                </CardTitle>
                <Clock className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingCount}</div>
                <p className="text-xs text-muted-foreground">
                  Awaiting your review
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Approved</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{approvedCount}</div>
                <p className="text-xs text-muted-foreground">
                  Documents approved
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Revisions
                </CardTitle>
                <AlertCircle className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{revisionCount}</div>
                <p className="text-xs text-muted-foreground">
                  Awaiting LP updates
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rejected</CardTitle>
                <XCircle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{rejectedCount}</div>
                <p className="text-xs text-muted-foreground">
                  Documents rejected
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs
            defaultValue="pending"
            onValueChange={(v) =>
              setStatusFilter(
                v === "pending"
                  ? "PENDING_REVIEW"
                  : v === "all"
                    ? "all"
                    : v.toUpperCase(),
              )
            }
          >
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="pending" className="gap-2">
                  <Clock className="h-4 w-4" />
                  Pending {pendingCount > 0 && `(${pendingCount})`}
                </TabsTrigger>
                <TabsTrigger value="all">All Documents</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
              </TabsList>
            </div>

            {error ? (
              <div className="flex items-center gap-2 p-4 mt-4 text-red-600 bg-red-50 dark:bg-red-950/50 rounded-lg">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchDocuments}
                  className="ml-auto"
                >
                  Retry
                </Button>
              </div>
            ) : loading ? (
              <AdminPageSkeleton rows={5} showStats statCount={4} />
            ) : documents.length === 0 ? (
              <EmptyState
                icon={Upload}
                title="No documents to review"
                description="When LPs upload documents, they will appear here for your review."
              />
            ) : (
              <div className="mt-4">
                <PendingDocumentsTable
                  documents={documents}
                  onRefresh={fetchDocuments}
                />
              </div>
            )}
          </Tabs>
        </>
      )}

      {/* Document Templates view */}
      {view === "templates" && (
        <>
          {contextLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !teamContext?.orgId ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-sm">
                Complete your organization setup to manage document templates.
              </p>
            </div>
          ) : (
            <>
              {/* Fund selector */}
              {teamContext.funds.length > 1 && (
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-muted-foreground">
                    Fund:
                  </label>
                  <select
                    value={selectedFundId}
                    onChange={(e) => setSelectedFundId(e.target.value)}
                    className="rounded-md border border-border px-3 py-2 text-sm bg-background"
                  >
                    {teamContext.funds.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <DocumentTemplateManager
                orgId={teamContext.orgId}
                teamId={teamContext.teamId}
                fundId={selectedFundId || undefined}
                mode={resolvedMode}
                instrumentType={resolvedInstrumentType}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
