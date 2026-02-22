"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";

interface Document {
  id: string;
  name: string;
  type: string;
  status: string;
  file: string | null;
  createdAt: string;
  approvalNotes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  UPLOADED_PENDING_REVIEW:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  APPROVED:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  REJECTED:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  REVISION_REQUESTED:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  SIGNED:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

interface DocumentReviewPanelProps {
  documents: Document[];
  actionLoading: string | null;
  onDocumentAction: (
    docId: string,
    action: "approve" | "reject" | "request-revision",
    notes?: string,
  ) => void;
}

/**
 * DocumentReviewPanel — Pending document review + all documents list.
 */
export function DocumentReviewPanel({
  documents,
  actionLoading,
  onDocumentAction,
}: DocumentReviewPanelProps) {
  const pendingDocs = documents.filter(
    (d) => d.status === "UPLOADED_PENDING_REVIEW",
  );

  return (
    <>
      {/* Pending Documents */}
      {pendingDocs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText size={16} />
              Pending Document Review ({pendingDocs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {doc.name || doc.type}
                    </p>
                    <p className="text-xs text-gray-500">
                      Uploaded{" "}
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDocumentAction(doc.id, "approve")}
                      disabled={actionLoading === doc.id}
                      className="text-emerald-600 hover:text-emerald-700"
                    >
                      {actionLoading === doc.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      <span className="ml-1">Approve</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDocumentAction(doc.id, "reject")}
                      disabled={actionLoading === doc.id}
                      className="text-red-600 hover:text-red-700"
                    >
                      <XCircle size={14} />
                      <span className="ml-1">Reject</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        onDocumentAction(doc.id, "request-revision")
                      }
                      disabled={actionLoading === doc.id}
                      className="text-amber-600 hover:text-amber-700"
                    >
                      <AlertTriangle size={14} />
                      <span className="ml-1">Revise</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText size={16} />
            All Documents ({documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-gray-400">No documents uploaded</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <FileText
                      size={16}
                      className="text-gray-400 shrink-0"
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {doc.name || doc.type}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={
                      STATUS_COLORS[doc.status] ||
                      "bg-gray-100 text-gray-600"
                    }
                  >
                    {doc.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
