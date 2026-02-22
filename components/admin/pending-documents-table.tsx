"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CheckCircle2,
  XCircle,
  RotateCcw,
  MoreHorizontal,
  Download,
  Eye,
  Loader2,
  FileText,
  Clock,
  AlertCircle,
} from "lucide-react";

interface LPDocument {
  id: string;
  title: string;
  documentType: string;
  status: string;
  uploadSource?: string;
  originalFilename: string;
  fileSize?: string;
  lpNotes?: string;
  gpNotes?: string;
  isOfflineSigned: boolean;
  createdAt: string;
  reviewedAt?: string;
  fund: { id: string; name: string };
  investor: { id: string; name?: string; email?: string };
  uploadedBy?: { name?: string; email?: string };
  reviewedBy?: { name?: string };
}

interface PendingDocumentsTableProps {
  documents: LPDocument[];
  onRefresh: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING_REVIEW: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  REVISION_REQUESTED: "bg-orange-100 text-orange-800",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  SUBSCRIPTION_AGREEMENT: "Subscription Agreement",
  LPA: "LPA",
  SIDE_LETTER: "Side Letter",
  NDA: "NDA",
  K1_TAX_FORM: "K-1 Tax Form",
  PROOF_OF_FUNDS: "Proof of Funds",
  WIRE_CONFIRMATION: "Wire Confirmation",
  ACH_RECEIPT: "ACH Receipt",
  ACCREDITATION_PROOF: "Accreditation Proof",
  IDENTITY_DOCUMENT: "Identity Document",
  OTHER: "Other",
};

export function PendingDocumentsTable({
  documents,
  onRefresh,
}: PendingDocumentsTableProps) {
  const [reviewingDoc, setReviewingDoc] = useState<LPDocument | null>(null);
  const [reviewAction, setReviewAction] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReview = async () => {
    if (!reviewingDoc || !reviewAction) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/documents/${reviewingDoc.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: reviewAction,
            reviewNotes: reviewNotes || undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to review document");
      }

      setReviewingDoc(null);
      setReviewAction(null);
      setReviewNotes("");
      onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = async (doc: LPDocument) => {
    window.open(`/api/admin/documents/${doc.id}/download`, "_blank");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatFileSize = (size?: string) => {
    if (!size) return "Unknown";
    const bytes = parseInt(size);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const openReviewDialog = (doc: LPDocument, action: string) => {
    setReviewingDoc(doc);
    setReviewAction(action);
    setReviewNotes("");
    setError(null);
  };

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No documents found</h3>
        <p className="text-sm text-muted-foreground mt-1">
          There are no pending documents to review.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Investor</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.originalFilename} ({formatFileSize(doc.fileSize)})
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {DOC_TYPE_LABELS[doc.documentType] || doc.documentType}
                  </Badge>
                  {doc.uploadSource === "GP_UPLOADED_FOR_LP" && (
                    <Badge variant="secondary" className="ml-1 text-xs bg-sky-100 text-sky-700">
                      GP Upload
                    </Badge>
                  )}
                  {doc.uploadSource === "LP_UPLOADED_EXTERNAL" && (
                    <Badge variant="secondary" className="ml-1 text-xs bg-purple-100 text-purple-700">
                      External
                    </Badge>
                  )}
                  {doc.isOfflineSigned && !doc.uploadSource?.includes("EXTERNAL") && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      Offline
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">
                      {doc.investor.name || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {doc.investor.email}
                    </p>
                  </div>
                </TableCell>
                <TableCell>{doc.fund.name}</TableCell>
                <TableCell>
                  <Badge className={STATUS_COLORS[doc.status] || "bg-gray-100"}>
                    {doc.status.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDate(doc.createdAt)}
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleDownload(doc)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </DropdownMenuItem>
                      {doc.status === "PENDING_REVIEW" && (
                        <>
                          <DropdownMenuItem
                            onClick={() => openReviewDialog(doc, "APPROVE")}
                            className="text-green-600"
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Approve
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              openReviewDialog(doc, "REQUEST_REVISION")
                            }
                            className="text-orange-600"
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Request Revision
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openReviewDialog(doc, "REJECT")}
                            className="text-red-600"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Reject
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!reviewingDoc}
        onOpenChange={() => {
          setReviewingDoc(null);
          setReviewAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {reviewAction === "APPROVE" && (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              )}
              {reviewAction === "REQUEST_REVISION" && (
                <RotateCcw className="h-5 w-5 text-orange-600" />
              )}
              {reviewAction === "REJECT" && (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              {reviewAction === "APPROVE" && "Approve Document"}
              {reviewAction === "REQUEST_REVISION" && "Request Revision"}
              {reviewAction === "REJECT" && "Reject Document"}
            </DialogTitle>
            <DialogDescription>
              {reviewingDoc && (
                <>
                  <strong>{reviewingDoc.title}</strong> from{" "}
                  {reviewingDoc.investor.name || reviewingDoc.investor.email}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {reviewingDoc?.lpNotes && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-1">LP Notes:</p>
                <p className="text-sm text-muted-foreground">
                  {reviewingDoc.lpNotes}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Review Notes{" "}
                {reviewAction !== "APPROVE" && (
                  <span className="text-muted-foreground">(recommended)</span>
                )}
              </label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={
                  reviewAction === "APPROVE"
                    ? "Optional notes for the investor..."
                    : "Explain what changes are needed or why the document was rejected..."
                }
                rows={4}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewingDoc(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReview}
              disabled={isSubmitting}
              variant={
                reviewAction === "REJECT"
                  ? "destructive"
                  : reviewAction === "APPROVE"
                  ? "default"
                  : "outline"
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {reviewAction === "APPROVE" && "Approve"}
                  {reviewAction === "REQUEST_REVISION" && "Request Revision"}
                  {reviewAction === "REJECT" && "Reject"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
