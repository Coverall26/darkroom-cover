"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Download,
  Eye,
  Calendar,
  Shield,
  Upload,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Filter,
  FolderOpen,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UploadDocumentModal } from "@/components/lp/upload-document-modal";
import { DocumentIntegrityBadge } from "@/components/documents/integrity-badge";

interface InvestorDocument {
  id: string;
  title: string;
  documentType: string;
  fileUrl: string;
  signedAt: string | null;
  createdAt: string;
}

interface LPUploadedDocument {
  id: string;
  title: string;
  documentType: string;
  status: string;
  uploadSource: string | null;
  originalFilename: string | null;
  fileSize: string | null;
  lpNotes: string | null;
  gpNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  isOfflineSigned: boolean;
  externalSigningDate: string | null;
  createdAt: string;
  fund: { id: string; name: string };
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; className: string }
> = {
  PENDING_REVIEW: {
    label: "Pending Review",
    icon: <Clock className="h-3.5 w-3.5" />,
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  APPROVED: {
    label: "Approved",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  REJECTED: {
    label: "Rejected",
    icon: <XCircle className="h-3.5 w-3.5" />,
    className: "bg-red-500/20 text-red-400 border-red-500/30",
  },
  REVISION_REQUESTED: {
    label: "Revision Needed",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    className: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  },
};

export default function LPDocsClient() {
  const router = useRouter();
  const [documents, setDocuments] = useState<InvestorDocument[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<LPUploadedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [fundInfo, setFundInfo] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setFetchError(null);
    try {
      const [docsRes, uploadedRes, fundRes] = await Promise.all([
        fetch("/api/lp/docs"),
        fetch("/api/lp/documents"),
        fetch("/api/lp/fund-details"),
      ]);

      if (docsRes.ok) {
        const data = await docsRes.json();
        setDocuments(data.documents || []);
      }

      if (uploadedRes.ok) {
        const data = await uploadedRes.json();
        setUploadedDocs(data.documents || []);
      }

      if (fundRes.ok) {
        const data = await fundRes.json();
        if (data.funds?.[0]) {
          setFundInfo({ id: data.funds[0].id, name: data.funds[0].name });
        }
      }

      if (!docsRes.ok && !uploadedRes.ok) {
        setFetchError("Unable to load documents. Please try again.");
      }
    } catch (error) {
      console.error("Failed to fetch documents:", error);
      setFetchError("Connection error. Please check your internet and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const getDocTypeBadge = (type: string) => {
    const types: Record<
      string,
      { label: string; variant: "default" | "secondary" | "outline" }
    > = {
      NDA: { label: "NDA", variant: "default" },
      SUBSCRIPTION: { label: "Subscription", variant: "secondary" },
      SUBSCRIPTION_AGREEMENT: {
        label: "Subscription Agreement",
        variant: "secondary",
      },
      LPA: { label: "LPA", variant: "secondary" },
      SIDE_LETTER: { label: "Side Letter", variant: "outline" },
      K1_TAX_FORM: { label: "K-1 Tax Form", variant: "outline" },
      PROOF_OF_FUNDS: { label: "Proof of Funds", variant: "outline" },
      WIRE_CONFIRMATION: { label: "Wire Confirmation", variant: "outline" },
      ACH_RECEIPT: { label: "ACH Receipt", variant: "outline" },
      ACCREDITATION_PROOF: {
        label: "Accreditation Proof",
        variant: "outline",
      },
      IDENTITY_DOCUMENT: { label: "Identity Document", variant: "outline" },
      TAX: { label: "Tax Document", variant: "outline" },
      REPORT: { label: "Report", variant: "outline" },
      OTHER: { label: "Document", variant: "outline" },
    };
    return types[type] || types.OTHER;
  };

  const filteredUploads =
    statusFilter === "ALL"
      ? uploadedDocs
      : uploadedDocs.filter((d) => d.status === statusFilter);

  const pendingCount = uploadedDocs.filter(
    (d) => d.status === "PENDING_REVIEW",
  ).length;
  const revisionCount = uploadedDocs.filter(
    (d) => d.status === "REVISION_REQUESTED",
  ).length;
  const approvedCount = uploadedDocs.filter(
    (d) => d.status === "APPROVED",
  ).length;

  // Group uploaded documents by type for organized display
  const groupedUploads = useMemo(() => {
    const groups: Record<string, LPUploadedDocument[]> = {};
    for (const doc of filteredUploads) {
      const type = doc.documentType || "OTHER";
      if (!groups[type]) groups[type] = [];
      groups[type].push(doc);
    }
    // Sort groups by doc type label
    return Object.entries(groups).sort(([a], [b]) => {
      const labelA = getDocTypeBadge(a).label;
      const labelB = getDocTypeBadge(b).label;
      return labelA.localeCompare(labelB);
    });
  }, [filteredUploads]);

  return (
    <main>
      <div className="max-w-[800px] mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/lp/dashboard">
            <Button
              variant="ghost"
              className="text-gray-400 hover:text-white mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">My Documents</h1>
              <p className="text-gray-400 mt-1 text-sm">
                Your secure document vault
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchDocuments}
                className="text-gray-400 hover:text-white min-h-[44px] min-w-[44px]"
                aria-label="Refresh documents"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </Button>
              {fundInfo && (
                <Button
                  onClick={() => setShowUploadModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 min-h-[44px]"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Error State */}
        {fetchError && !loading && (
          <div className="mb-6 p-4 rounded-xl border border-red-700/50 bg-red-900/20" role="alert">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-200">{fetchError}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchDocuments}
                className="text-red-300 hover:text-white hover:bg-red-900/50 min-h-[44px]"
              >
                Try Again
              </Button>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {!loading && !fetchError && (documents.length > 0 || uploadedDocs.length > 0) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 border-l-4 border-l-emerald-500">
              <p className="text-xs text-gray-400">Signed</p>
              <p className="text-lg font-bold text-white font-mono tabular-nums">{documents.length}</p>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 border-l-4 border-l-blue-500">
              <p className="text-xs text-gray-400">Uploaded</p>
              <p className="text-lg font-bold text-white font-mono tabular-nums">{uploadedDocs.length}</p>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 border-l-4 border-l-amber-500">
              <p className="text-xs text-gray-400">Pending Review</p>
              <p className="text-lg font-bold text-white font-mono tabular-nums">{pendingCount}</p>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3 border-l-4 border-l-orange-500">
              <p className="text-xs text-gray-400">Needs Revision</p>
              <p className="text-lg font-bold text-white font-mono tabular-nums">{revisionCount}</p>
            </div>
          </div>
        )}

        {/* Uploaded Documents Section */}
        {(uploadedDocs.length > 0 || fundInfo) && (
          <Card className="bg-gray-800/50 border-gray-700 mb-6">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-white flex items-center gap-2 flex-wrap">
                  <Upload className="h-5 w-5 text-blue-400 shrink-0" aria-hidden="true" />
                  <span>Uploaded Documents</span>
                  {pendingCount > 0 && (
                    <Badge
                      variant="outline"
                      className="bg-amber-500/20 text-amber-400 border-amber-500/30"
                    >
                      {pendingCount} pending
                    </Badge>
                  )}
                  {revisionCount > 0 && (
                    <Badge
                      variant="outline"
                      className="bg-orange-500/20 text-orange-400 border-orange-500/30"
                    >
                      {revisionCount} revision
                    </Badge>
                  )}
                </CardTitle>
                {uploadedDocs.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Filter className="h-4 w-4 text-gray-400 hidden sm:block" aria-hidden="true" />
                    <Select
                      value={statusFilter}
                      onValueChange={setStatusFilter}
                    >
                      <SelectTrigger className="w-full sm:w-[160px] bg-gray-700 border-gray-600 text-gray-200 min-h-[36px] text-sm" aria-label="Filter documents by status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Statuses</SelectItem>
                        <SelectItem value="PENDING_REVIEW">
                          Pending Review
                        </SelectItem>
                        <SelectItem value="APPROVED">Approved</SelectItem>
                        <SelectItem value="REJECTED">Rejected</SelectItem>
                        <SelectItem value="REVISION_REQUESTED">
                          Revision Needed
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="animate-pulse space-y-3 py-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-3 rounded-lg">
                      <div className="h-10 w-10 bg-gray-700/50 rounded" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-700/50 rounded w-48" />
                        <div className="h-3 bg-gray-700/50 rounded w-32" />
                      </div>
                      <div className="h-6 bg-gray-700/50 rounded w-20" />
                    </div>
                  ))}
                </div>
              ) : filteredUploads.length === 0 ? (
                <div className="text-center py-8">
                  <Upload className="h-10 w-10 text-gray-600 mx-auto mb-3" aria-hidden="true" />
                  <p className="text-gray-400">
                    {uploadedDocs.length === 0
                      ? "No documents uploaded yet"
                      : "No documents match this filter"}
                  </p>
                  {uploadedDocs.length === 0 && fundInfo && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 min-h-[44px] border-gray-600 text-gray-300 hover:bg-gray-700"
                      onClick={() => setShowUploadModal(true)}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload your first document
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {groupedUploads.map(([docType, docs]) => {
                    const groupBadge = getDocTypeBadge(docType);
                    return (
                      <div key={docType}>
                        {/* Group header */}
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <FolderOpen className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                            {groupBadge.label}
                          </span>
                          <span className="text-xs text-gray-600 font-mono tabular-nums">({docs.length})</span>
                        </div>
                        <div className="space-y-2">
                          {docs.map((doc) => {
                            const statusInfo = STATUS_CONFIG[doc.status] ||
                              STATUS_CONFIG.PENDING_REVIEW;

                            return (
                              <div
                                key={doc.id}
                                className={`p-4 rounded-lg border transition-colors ${
                                  doc.status === "REVISION_REQUESTED"
                                    ? "bg-orange-900/10 border-orange-700/30 hover:bg-orange-900/20"
                                    : doc.status === "REJECTED"
                                      ? "bg-red-900/10 border-red-700/30 hover:bg-red-900/20"
                                      : "bg-gray-700/50 border-gray-600 hover:bg-gray-700/70"
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex items-start gap-3">
                                    <div className="p-2 bg-gray-600 rounded-lg mt-0.5">
                                      <FileText className="h-5 w-5 text-blue-400" aria-hidden="true" />
                                    </div>
                                    <div>
                                      <h3 className="text-white font-medium">
                                        {doc.title}
                                      </h3>
                                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <Badge
                                          variant="outline"
                                          className={statusInfo.className}
                                        >
                                          <span className="flex items-center gap-1">
                                            {statusInfo.icon}
                                            {statusInfo.label}
                                          </span>
                                        </Badge>
                                        {doc.uploadSource === "GP_UPLOADED_FOR_LP" && (
                                          <Badge
                                            variant="outline"
                                            className="text-sky-400 border-sky-500/30 bg-sky-500/10"
                                          >
                                            Uploaded by GP
                                          </Badge>
                                        )}
                                        {doc.uploadSource === "LP_UPLOADED_EXTERNAL" && (
                                          <Badge
                                            variant="outline"
                                            className="text-purple-400 border-purple-500/30 bg-purple-500/10"
                                          >
                                            External Signing
                                          </Badge>
                                        )}
                                        {doc.isOfflineSigned && doc.uploadSource !== "LP_UPLOADED_EXTERNAL" && (
                                          <Badge
                                            variant="outline"
                                            className="text-gray-400 border-gray-500"
                                          >
                                            Offline Signed
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-gray-500 text-xs mt-2">
                                        Uploaded{" "}
                                        {new Date(doc.createdAt).toLocaleDateString()}
                                        {doc.fund?.name && ` for ${doc.fund.name}`}
                                      </p>

                                      {/* GP Review Notes */}
                                      {doc.gpNotes && (
                                        <div
                                          className={`mt-2 p-2 rounded text-sm ${
                                            doc.status === "REVISION_REQUESTED"
                                              ? "bg-orange-900/20 text-orange-300 border border-orange-700/30"
                                              : doc.status === "REJECTED"
                                                ? "bg-red-900/20 text-red-300 border border-red-700/30"
                                                : "bg-gray-600/50 text-gray-300"
                                          }`}
                                          role="alert"
                                        >
                                          <span className="font-medium">
                                            {doc.status === "REVISION_REQUESTED"
                                              ? "Revision requested: "
                                              : doc.status === "REJECTED"
                                                ? "Rejection reason: "
                                                : "Reviewer note: "}
                                          </span>
                                          {doc.gpNotes}
                                          {doc.reviewedBy && (
                                            <span className="text-gray-500 ml-1">
                                              — {doc.reviewedBy}
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      {/* Revision CTA */}
                                      {doc.status === "REVISION_REQUESTED" &&
                                        fundInfo && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="mt-2 min-h-[44px] border-orange-600 text-orange-400 hover:bg-orange-900/30 active:bg-orange-900/40"
                                            onClick={() => setShowUploadModal(true)}
                                          >
                                            <Upload className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                                            Upload Revised
                                          </Button>
                                        )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Signed Documents Section */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-500" aria-hidden="true" />
              Signed Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="animate-pulse space-y-3 py-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-lg">
                    <div className="h-10 w-10 bg-gray-700/50 rounded" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-700/50 rounded w-56" />
                      <div className="h-3 bg-gray-700/50 rounded w-36" />
                    </div>
                    <div className="h-8 bg-gray-700/50 rounded w-24" />
                  </div>
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-gray-600 mx-auto mb-4" aria-hidden="true" />
                <p className="text-gray-400">No signed documents yet</p>
                <p className="text-gray-500 text-sm mt-2">
                  Signed documents will appear here after completion
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {documents.map((doc) => {
                  const badgeInfo = getDocTypeBadge(doc.documentType);
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-4 min-h-[56px] bg-gray-700/50 rounded-lg hover:bg-gray-700/70 active:bg-gray-700/80 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-gray-600 rounded-lg">
                          <FileText className="h-6 w-6 text-emerald-400" aria-hidden="true" />
                        </div>
                        <div>
                          <h3 className="text-white font-medium">
                            {doc.title}
                          </h3>
                          <div className="flex items-center gap-3 mt-1">
                            <Badge variant={badgeInfo.variant}>
                              {badgeInfo.label}
                            </Badge>
                            <DocumentIntegrityBadge
                              signedAt={doc.signedAt}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-white active:text-white transition-colors"
                          aria-label={`View ${doc.title}`}
                        >
                          <Eye className="h-5 w-5" />
                        </a>
                        <a
                          href={doc.fileUrl}
                          download
                          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-emerald-400 active:text-emerald-400 transition-colors"
                          aria-label={`Download ${doc.title}`}
                        >
                          <Download className="h-5 w-5" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upload Document Modal */}
      {fundInfo && (
        <UploadDocumentModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          fundId={fundInfo.id}
          fundName={fundInfo.name}
          onSuccess={() => {
            setShowUploadModal(false);
            fetchDocuments();
          }}
        />
      )}
    </main>
  );
}
