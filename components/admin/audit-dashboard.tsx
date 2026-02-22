import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Shield,
  Download,
  Search,
  Filter,
  FileText,
  Eye,
  PenTool,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Printer,
  ShieldCheck,
  Link2,
  Hash,
  User,
  Activity,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// ─── Signature Audit Types ──────────────────────────────────────────────────

interface SignatureAuditLog {
  id: string;
  event: string;
  documentId: string;
  documentTitle?: string;
  recipientEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  device?: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

// ─── General Audit Log Types ────────────────────────────────────────────────

interface GeneralAuditLog {
  id: string;
  timestamp: string;
  eventType: string;
  resourceType: string | null;
  resourceId: string | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, any> | null;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface AuditDashboardProps {
  teamId: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SIGNATURE_EVENT_TYPES = [
  { value: "all", label: "All Events" },
  { value: "document.created", label: "Document Created" },
  { value: "document.sent", label: "Document Sent" },
  { value: "document.viewed", label: "Document Viewed" },
  { value: "document.downloaded", label: "Document Downloaded" },
  { value: "recipient.signed", label: "Signature Completed" },
  { value: "recipient.declined", label: "Signature Declined" },
  { value: "document.completed", label: "Document Completed" },
  { value: "document.voided", label: "Document Voided" },
  { value: "document.expired", label: "Document Expired" },
  { value: "reminder.sent", label: "Reminder Sent" },
];

const GENERAL_EVENT_TYPES = [
  { value: "all", label: "All Events" },
  { value: "SETTINGS_UPDATED", label: "Settings Updated" },
  { value: "INVESTOR_CREATED", label: "Investor Created" },
  { value: "INVESTOR_UPDATED", label: "Investor Updated" },
  { value: "INVESTOR_APPROVED", label: "Investor Approved" },
  { value: "INVESTOR_REJECTED", label: "Investor Rejected" },
  { value: "INVESTOR_REVIEWED", label: "Investor Reviewed" },
  { value: "INVESTOR_MANUAL_ENTRY", label: "Manual Entry" },
  { value: "BULK_INVESTOR_IMPORT", label: "Bulk Import" },
  { value: "DOCUMENT_VIEWED", label: "Document Viewed" },
  { value: "DOCUMENT_DOWNLOADED", label: "Document Downloaded" },
  { value: "DOCUMENT_SIGNED", label: "Document Signed" },
  { value: "DOCUMENT_COMPLETED", label: "Document Completed" },
  { value: "SUBSCRIPTION_CREATED", label: "Subscription Created" },
  { value: "NDA_SIGNED", label: "NDA Signed" },
  { value: "KYC_INITIATED", label: "KYC Initiated" },
  { value: "KYC_COMPLETED", label: "KYC Completed" },
  { value: "CAPITAL_CALL_CREATED", label: "Capital Call" },
  { value: "DISTRIBUTION_CREATED", label: "Distribution" },
  { value: "FUND_SETTINGS_UPDATE", label: "Fund Settings" },
  { value: "FUNDROOM_ACTIVATED", label: "FundRoom Activated" },
  { value: "USER_LOGIN", label: "User Login" },
  { value: "USER_REGISTERED", label: "User Registered" },
  { value: "ADMIN_ACTION", label: "Admin Action" },
  { value: "AUDIT_LOG_EXPORT", label: "Audit Export" },
];

const RESOURCE_TYPES = [
  { value: "all", label: "All Resources" },
  { value: "Document", label: "Document" },
  { value: "SignatureDocument", label: "Signature Document" },
  { value: "Investor", label: "Investor" },
  { value: "Investment", label: "Investment" },
  { value: "Fund", label: "Fund" },
  { value: "User", label: "User" },
  { value: "Organization", label: "Organization" },
  { value: "Transaction", label: "Transaction" },
  { value: "Subscription", label: "Subscription" },
  { value: "AuditLog", label: "Audit Log" },
  { value: "FundroomActivation", label: "Activation" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

const getSignatureEventIcon = (event: string) => {
  switch (event) {
    case "document.created":
      return <FileText className="h-4 w-4 text-blue-500" />;
    case "document.sent":
      return <PenTool className="h-4 w-4 text-purple-500" />;
    case "document.viewed":
      return <Eye className="h-4 w-4 text-gray-500" />;
    case "recipient.signed":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "recipient.declined":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "document.completed":
      return <CheckCircle className="h-4 w-4 text-emerald-600" />;
    case "document.voided":
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    case "document.expired":
      return <Clock className="h-4 w-4 text-amber-500" />;
    case "reminder.sent":
      return <RefreshCw className="h-4 w-4 text-indigo-500" />;
    default:
      return <Shield className="h-4 w-4 text-gray-400" />;
  }
};

const getSignatureEventLabel = (event: string) => {
  const eventType = SIGNATURE_EVENT_TYPES.find((e) => e.value === event);
  return eventType?.label || event.replace(".", " ").replace(/_/g, " ");
};

const getSignatureEventBadgeVariant = (event: string) => {
  if (event.includes("signed") || event.includes("completed")) return "default";
  if (event.includes("declined") || event.includes("voided")) return "destructive";
  if (event.includes("viewed") || event.includes("downloaded")) return "secondary";
  return "outline";
};

const getGeneralEventBadgeVariant = (eventType: string) => {
  if (eventType.includes("APPROVED") || eventType.includes("COMPLETED") || eventType.includes("SIGNED") || eventType.includes("ACTIVATED"))
    return "default";
  if (eventType.includes("REJECTED") || eventType.includes("FAILED") || eventType.includes("DEACTIVATED"))
    return "destructive";
  if (eventType.includes("VIEWED") || eventType.includes("DOWNLOADED") || eventType.includes("LOGIN"))
    return "secondary";
  return "outline";
};

const formatEventType = (eventType: string) => {
  return eventType
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

// ─── Chain Integrity Types ──────────────────────────────────────────────────

interface ChainIntegrity {
  isValid: boolean;
  chainLength: number;
  lastVerifiedAt: string;
  genesisHash: string;
  latestHash: string;
}

interface VerificationResult {
  isValid: boolean;
  totalEntries: number;
  verifiedEntries: number;
  firstInvalidEntry?: string;
  errors: string[];
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function AuditDashboard({ teamId }: AuditDashboardProps) {
  const [activeTab, setActiveTab] = useState<"general" | "signature">("general");

  return (
    <div className="space-y-6">
      {/* Tab Bar */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          onClick={() => setActiveTab("general")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "general"
              ? "bg-white text-foreground shadow-sm dark:bg-gray-800"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Activity className="mr-2 inline-block h-4 w-4" />
          All Activity
        </button>
        <button
          onClick={() => setActiveTab("signature")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "signature"
              ? "bg-white text-foreground shadow-sm dark:bg-gray-800"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <PenTool className="mr-2 inline-block h-4 w-4" />
          Signature Audit
        </button>
      </div>

      {activeTab === "general" ? (
        <GeneralAuditTab teamId={teamId} />
      ) : (
        <SignatureAuditTab teamId={teamId} />
      )}
    </div>
  );
}

// ─── General Audit Tab ──────────────────────────────────────────────────────

function GeneralAuditTab({ teamId }: { teamId: string }) {
  const [logs, setLogs] = useState<GeneralAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ format: "json" });
      if (eventFilter && eventFilter !== "all") params.set("eventType", eventFilter);
      if (resourceFilter && resourceFilter !== "all") params.set("resourceType", resourceFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("limit", "5000");

      const res = await fetch(`/api/admin/audit/export?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const allLogs: GeneralAuditLog[] = data.logs || [];

        let filteredLogs = allLogs;
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          filteredLogs = allLogs.filter(
            (log) =>
              log.user?.email?.toLowerCase().includes(term) ||
              log.user?.name?.toLowerCase().includes(term) ||
              log.eventType.toLowerCase().includes(term) ||
              log.resourceId?.toLowerCase().includes(term) ||
              log.ipAddress?.includes(term)
          );
        }

        setLogs(filteredLogs);
        setTotalCount(filteredLogs.length);
      }
    } catch {
      toast.error("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [eventFilter, resourceFilter, startDate, endDate, searchTerm]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Client-side pagination
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const totalPages = Math.ceil(totalCount / pageSize);
  const paginatedLogs = logs.slice((page - 1) * pageSize, page * pageSize);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [eventFilter, resourceFilter, startDate, endDate, searchTerm]);

  const handleExport = async (fmt: "csv" | "json") => {
    try {
      const params = new URLSearchParams({ format: fmt });
      if (eventFilter && eventFilter !== "all") params.set("eventType", eventFilter);
      if (resourceFilter && resourceFilter !== "all") params.set("resourceType", resourceFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (fmt === "json") params.set("download", "true");
      params.set("limit", "10000");

      const res = await fetch(`/api/admin/audit/export?${params.toString()}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.${fmt}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success(`Audit log exported as ${fmt.toUpperCase()}`);
      }
    } catch {
      toast.error("Export failed");
    }
  };

  // Stats
  const statsMap = logs.reduce(
    (acc, log) => {
      acc.total++;
      if (log.eventType.includes("INVESTOR")) acc.investorActions++;
      if (log.eventType.includes("DOCUMENT") || log.eventType.includes("SIGNED")) acc.docActions++;
      if (log.eventType.includes("SETTINGS") || log.eventType.includes("ADMIN")) acc.adminActions++;
      return acc;
    },
    { total: 0, investorActions: 0, docActions: 0, adminActions: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Activity className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{statsMap.total.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Total Events</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <User className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{statsMap.investorActions.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Investor Actions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FileText className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{statsMap.docActions.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Document Actions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Shield className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{statsMap.adminActions.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Admin Actions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Activity Log
              </CardTitle>
              <CardDescription>
                All platform actions including investor management, settings changes, and document operations
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("csv")}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("json")}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by actor, email, event, or IP..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Event type" />
                </SelectTrigger>
                <SelectContent>
                  {GENERAL_EVENT_TYPES.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Resource type" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Label className="text-sm whitespace-nowrap">From:</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm whitespace-nowrap">To:</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-[150px]"
                />
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : paginatedLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No audit events found</p>
                <p className="text-sm mt-1">
                  {searchTerm || eventFilter !== "all" || resourceFilter !== "all" || startDate || endDate
                    ? "Try adjusting your filters"
                    : "Events will appear here as actions are performed"}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[170px]">Timestamp</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Resource</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedLogs.map((log) => (
                        <>
                          <TableRow
                            key={log.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                          >
                            <TableCell className="font-mono text-xs">
                              {format(new Date(log.timestamp), "MMM d, HH:mm:ss")}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {log.user?.name || "System"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {log.user?.email || "—"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getGeneralEventBadgeVariant(log.eventType)}>
                                {formatEventType(log.eventType)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {log.resourceType ? (
                                <span className="text-sm">
                                  {log.resourceType}
                                  {log.resourceId && (
                                    <span className="ml-1 text-xs text-muted-foreground font-mono">
                                      {log.resourceId.slice(0, 8)}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {log.ipAddress || "—"}
                            </TableCell>
                            <TableCell>
                              {log.metadata && Object.keys(log.metadata).length > 0 && (
                                expandedRow === log.id ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )
                              )}
                            </TableCell>
                          </TableRow>
                          {expandedRow === log.id && log.metadata && Object.keys(log.metadata).length > 0 && (
                            <TableRow key={`${log.id}-detail`}>
                              <TableCell colSpan={6} className="bg-muted/30 py-3">
                                <div className="px-2">
                                  <p className="text-xs font-medium text-muted-foreground mb-2">Event Details</p>
                                  <pre className="text-xs bg-muted rounded p-2 overflow-x-auto max-h-40">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                  {log.userAgent && (
                                    <p className="text-xs text-muted-foreground mt-2 truncate">
                                      <span className="font-medium">User Agent:</span> {log.userAgent}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1} to{" "}
                    {Math.min(page * pageSize, totalCount)} of {totalCount} events
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {page} of {totalPages || 1}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Signature Audit Tab ────────────────────────────────────────────────────

function SignatureAuditTab({ teamId }: { teamId: string }) {
  const [logs, setLogs] = useState<SignatureAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  const [searchTerm, setSearchTerm] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [stats, setStats] = useState({
    totalEvents: 0,
    signatures: 0,
    views: 0,
    declined: 0,
  });

  const [chainIntegrity, setChainIntegrity] = useState<ChainIntegrity | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [exportingCompliance, setExportingCompliance] = useState(false);

  useEffect(() => {
    fetchAuditLogs();
    fetchChainIntegrity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, page, eventFilter, startDate, endDate]);

  const fetchChainIntegrity = async () => {
    try {
      const res = await fetch(`/api/teams/${teamId}/audit/verify`);
      if (res.ok) {
        const data = await res.json();
        setChainIntegrity(data);
      }
    } catch (error) {
      console.error("Failed to fetch chain integrity:", error);
    }
  };

  const handleVerifyChain = async () => {
    try {
      setVerifying(true);
      setVerificationResult(null);

      const res = await fetch(`/api/teams/${teamId}/audit/verify`);

      if (res.ok) {
        const data = await res.json();
        setVerificationResult(data.verification);
        if (data.verification.isValid) {
          toast.success("Audit chain verified successfully! No tampering detected.");
        } else {
          toast.error("Chain verification failed! Tampering may have occurred.");
        }
        setChainIntegrity({
          isValid: data.integrity.isValid,
          chainLength: data.integrity.chainLength,
          lastVerifiedAt: data.verifiedAt,
          genesisHash: data.integrity.genesisHash,
          latestHash: data.integrity.latestHash,
        });
      } else {
        toast.error("Failed to verify audit chain");
      }
    } catch (error) {
      console.error("Verification failed:", error);
      toast.error("Failed to verify audit chain");
    } finally {
      setVerifying(false);
    }
  };

  const handleComplianceExport = async () => {
    try {
      setExportingCompliance(true);

      const fromDate = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const toDate = endDate || new Date().toISOString().split("T")[0];

      const res = await fetch(`/api/teams/${teamId}/audit/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDate, toDate }),
      });

      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `compliance-audit-${format(new Date(), "yyyy-MM-dd")}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success("Compliance export downloaded successfully");
      } else {
        toast.error("Failed to export compliance data");
      }
    } catch {
      toast.error("Failed to export compliance data");
    } finally {
      setExportingCompliance(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (eventFilter && eventFilter !== "all") params.append("event", eventFilter);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const res = await fetch(
        `/api/teams/${teamId}/signature-audit/export?${params.toString()}`
      );

      if (res.ok) {
        const data = await res.json();
        const allLogs = data.auditLogs || [];

        let filteredLogs = allLogs;
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          filteredLogs = allLogs.filter(
            (log: SignatureAuditLog) =>
              log.recipientEmail?.toLowerCase().includes(term) ||
              log.documentTitle?.toLowerCase().includes(term) ||
              log.ipAddress?.includes(term)
          );
        }

        const startIndex = (page - 1) * pageSize;
        const paginatedLogs = filteredLogs.slice(startIndex, startIndex + pageSize);

        setLogs(paginatedLogs);
        setTotalCount(filteredLogs.length);

        const signatures = allLogs.filter((l: SignatureAuditLog) => l.event === "recipient.signed").length;
        const views = allLogs.filter((l: SignatureAuditLog) => l.event === "document.viewed").length;
        const declined = allLogs.filter((l: SignatureAuditLog) => l.event === "recipient.declined").length;

        setStats({
          totalEvents: allLogs.length,
          signatures,
          views,
          declined,
        });
      }
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (fmt: "csv" | "pdf") => {
    try {
      setExporting(true);
      const params = new URLSearchParams();
      params.append("format", fmt);
      if (eventFilter && eventFilter !== "all") params.append("event", eventFilter);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const res = await fetch(
        `/api/teams/${teamId}/signature-audit/export?${params.toString()}`
      );

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fmt === "csv" ? "audit-report.csv" : "audit-report.html";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchAuditLogs();
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Shield className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.totalEvents.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Total Events</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.signatures.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Signatures</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Eye className="h-8 w-8 text-gray-500" />
              <div>
                <p className="text-2xl font-bold">{stats.views.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Document Views</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">{stats.declined.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Declined</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={chainIntegrity?.isValid === false ? "border-destructive" : chainIntegrity?.isValid === true ? "border-emerald-500" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Audit Chain Integrity
              </CardTitle>
              <CardDescription>
                Cryptographic hash chain verification for tamper detection
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleComplianceExport}
                disabled={exportingCompliance}
              >
                {exportingCompliance ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Compliance Export
              </Button>
              <Button
                onClick={handleVerifyChain}
                disabled={verifying}
                variant={chainIntegrity?.isValid === false ? "destructive" : "default"}
              >
                {verifying ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ShieldCheck className="h-4 w-4 mr-2" />
                )}
                Verify Chain
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chainIntegrity ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                {chainIntegrity.isValid ? (
                  <CheckCircle className="h-8 w-8 text-emerald-500" />
                ) : (
                  <XCircle className="h-8 w-8 text-destructive" />
                )}
                <div>
                  <p className="font-medium">
                    {chainIntegrity.isValid ? "Chain Valid" : "Chain Invalid"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {chainIntegrity.isValid
                      ? "No tampering detected"
                      : "Tampering may have occurred"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <Hash className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="font-medium">{chainIntegrity.chainLength.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Entries in Chain</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <Clock className="h-8 w-8 text-gray-500" />
                <div>
                  <p className="font-medium">
                    {format(new Date(chainIntegrity.lastVerifiedAt), "MMM d, HH:mm")}
                  </p>
                  <p className="text-sm text-muted-foreground">Last Verified</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {verificationResult && (
            <div className={`mt-4 p-4 rounded-lg ${verificationResult.isValid ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-destructive/10"}`}>
              <div className="flex items-start gap-3">
                {verificationResult.isValid ? (
                  <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                )}
                <div className="flex-1">
                  <h4 className={`font-medium ${verificationResult.isValid ? "text-emerald-800 dark:text-emerald-200" : "text-destructive"}`}>
                    {verificationResult.isValid
                      ? "Verification Successful"
                      : "Verification Failed"}
                  </h4>
                  <p className="text-sm mt-1">
                    Verified {verificationResult.verifiedEntries} of {verificationResult.totalEntries} entries
                  </p>
                  {verificationResult.verifiedEntries > 0 && (
                    <Progress
                      value={(verificationResult.verifiedEntries / verificationResult.totalEntries) * 100}
                      className="mt-2 h-2"
                    />
                  )}
                  {verificationResult.errors.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {verificationResult.errors.slice(0, 3).map((err, i) => (
                        <p key={i} className="text-xs text-destructive">{err}</p>
                      ))}
                      {verificationResult.errors.length > 3 && (
                        <p className="text-xs text-muted-foreground">
                          +{verificationResult.errors.length - 3} more errors
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Compliance Audit Trail
              </CardTitle>
              <CardDescription>
                SEC 506(c) compliant audit logs for all signature events
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={exporting}>
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("csv")}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")}>
                  <Printer className="h-4 w-4 mr-2" />
                  Export Report (HTML)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by email, document, or IP..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="pl-9"
                  />
                </div>
              </div>

              <Select value={eventFilter} onValueChange={setEventFilter}>
                <SelectTrigger className="w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by event" />
                </SelectTrigger>
                <SelectContent>
                  {SIGNATURE_EVENT_TYPES.map((event) => (
                    <SelectItem key={event.value} value={event.value}>
                      {event.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Label className="text-sm whitespace-nowrap">From:</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-[150px]"
                />
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-sm whitespace-nowrap">To:</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-[150px]"
                />
              </div>

              <Button onClick={handleSearch} variant="secondary">
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No signature audit events found</p>
                <p className="text-sm mt-1">
                  {searchTerm || eventFilter !== "all" || startDate || endDate
                    ? "Try adjusting your filters"
                    : "Events will appear here once documents are signed"}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">Timestamp</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Document</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead>Device</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-sm">
                            {format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getSignatureEventIcon(log.event)}
                              <Badge variant={getSignatureEventBadgeVariant(log.event)}>
                                {getSignatureEventLabel(log.event)}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {log.documentTitle || log.documentId.slice(0, 8)}
                          </TableCell>
                          <TableCell>{log.recipientEmail || "—"}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {log.ipAddress || "—"}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {log.browser && log.os
                                ? `${log.browser} / ${log.os}`
                                : log.device || "—"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1} to{" "}
                    {Math.min(page * pageSize, totalCount)} of {totalCount} events
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {page} of {totalPages || 1}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-800 dark:text-amber-200">SEC 506(c) Compliance Notice</h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                This audit trail maintains records of all electronic signature events including
                IP addresses, timestamps, user agents, and device information. These records are
                required for &quot;reasonable steps&quot; verification of accredited investor status under
                SEC Rule 506(c). Audit logs are retained for 7 years per regulatory requirements.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
