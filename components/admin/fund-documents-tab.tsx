"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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
  FileTextIcon,
  Loader2,
  PenIcon,
  CheckCircle2,
  XCircleIcon,
  ClockIcon,
  AlertCircleIcon,
  Users,
  Plus,
  ExternalLink,
  Eye,
  Download,
} from "lucide-react";
import { DocumentIntegrityBadge } from "@/components/documents/integrity-badge";

interface Recipient {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  signedAt: string | null;
  signingOrder: number;
}

interface FundDocument {
  id: string;
  title: string;
  description: string | null;
  documentType: string | null;
  status: string;
  requiredForOnboarding: boolean;
  numPages: number | null;
  fieldCount: number;
  createdAt: string;
  completedAt: string | null;
  signedFileUrl: string | null;
  signedFileType: string | null;
  signedAt: string | null;
  recipients: Recipient[];
  signingStats: {
    total: number;
    signed: number;
    pending: number;
  };
}

interface FundDocumentsTabProps {
  fundId: string;
  teamId: string;
}

const STATUS_BADGES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  DRAFT: { variant: "outline", label: "Draft" },
  SENT: { variant: "default", label: "Sent" },
  VIEWED: { variant: "secondary", label: "Viewed" },
  PARTIALLY_SIGNED: { variant: "secondary", label: "Partially Signed" },
  COMPLETED: { variant: "default", label: "Completed" },
  DECLINED: { variant: "destructive", label: "Declined" },
  VOIDED: { variant: "destructive", label: "Voided" },
  EXPIRED: { variant: "destructive", label: "Expired" },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  NDA: "NDA",
  SUBSCRIPTION: "Subscription Agreement",
  LPA: "Limited Partnership Agreement",
  SIDE_LETTER: "Side Letter",
  K1: "K-1",
};

export function FundDocumentsTab({ fundId, teamId }: FundDocumentsTabProps) {
  const [documents, setDocuments] = useState<FundDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/teams/${teamId}/funds/${fundId}/signature-documents`,
      );
      if (!res.ok) {
        throw new Error("Failed to fetch documents");
      }
      const data = await res.json();
      setDocuments(data.documents);
    } catch (err) {
      setError("Failed to load fund documents");
    } finally {
      setLoading(false);
    }
  }, [fundId, teamId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

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
        <AlertCircleIcon className="h-8 w-8 text-destructive mb-2" />
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  const requiredDocs = documents.filter((d) => d.requiredForOnboarding);
  const otherDocs = documents.filter((d) => !d.requiredForOnboarding);

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Fund Documents</h3>
          <p className="text-sm text-muted-foreground">
            Manage signature documents for this fund. Documents marked as
            &quot;Required for Onboarding&quot; must be signed by LPs before
            proceeding.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/documents">
            <Button variant="outline" size="sm">
              <FileTextIcon className="h-4 w-4 mr-2" />
              Manage Templates
            </Button>
          </Link>
          <Link href={`/sign/new?fundId=${fundId}&teamId=${teamId}`}>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Document
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold">{documents.length}</p>
            <p className="text-xs text-muted-foreground">Total Documents</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold">{requiredDocs.length}</p>
            <p className="text-xs text-muted-foreground">Required for Onboarding</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-green-600">
              {documents.filter((d) => d.status === "COMPLETED").length}
            </p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold text-amber-600">
              {documents.filter(
                (d) =>
                  d.status === "SENT" ||
                  d.status === "VIEWED" ||
                  d.status === "PARTIALLY_SIGNED",
              ).length}
            </p>
            <p className="text-xs text-muted-foreground">Pending Signatures</p>
          </CardContent>
        </Card>
      </div>

      {/* Required for onboarding section */}
      {requiredDocs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileTextIcon className="h-4 w-4" />
              Required for LP Onboarding
            </CardTitle>
            <CardDescription>
              LPs must sign these documents during onboarding Step 6
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {requiredDocs.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Other documents */}
      {otherDocs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileTextIcon className="h-4 w-4" />
              Other Fund Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {otherDocs.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {documents.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileTextIcon className="h-12 w-12 text-gray-300 mb-3" />
            <h3 className="text-lg font-medium text-gray-700 mb-1">
              No Documents Yet
            </h3>
            <p className="text-sm text-gray-500 text-center max-w-md mb-4">
              Create signature documents (NDA, Subscription Agreement, LPA) for
              investors to sign during onboarding.
            </p>
            <Link href={`/sign/new?fundId=${fundId}&teamId=${teamId}`}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create First Document
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DocumentRow({ doc }: { doc: FundDocument }) {
  const statusBadge = STATUS_BADGES[doc.status] || {
    variant: "outline" as const,
    label: doc.status,
  };
  const typeLabel = doc.documentType
    ? DOC_TYPE_LABELS[doc.documentType] || doc.documentType
    : null;

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex-shrink-0">
          {doc.status === "COMPLETED" ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : doc.status === "DECLINED" || doc.status === "VOIDED" ? (
            <XCircleIcon className="h-5 w-5 text-red-500" />
          ) : doc.status === "DRAFT" ? (
            <PenIcon className="h-5 w-5 text-gray-400" />
          ) : (
            <ClockIcon className="h-5 w-5 text-amber-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{doc.title}</p>
            {typeLabel && (
              <Badge variant="outline" className="text-xs flex-shrink-0">
                {typeLabel}
              </Badge>
            )}
            {doc.requiredForOnboarding && (
              <Badge variant="secondary" className="text-xs flex-shrink-0">
                Required
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {doc.signingStats.signed}/{doc.signingStats.total} signed
            </span>
            {doc.fieldCount > 0 && (
              <span>{doc.fieldCount} fields</span>
            )}
            <span>
              Created {new Date(doc.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
        {doc.signedFileUrl && doc.status === "COMPLETED" && (
          <>
            <DocumentIntegrityBadge signedAt={doc.signedAt} />
            <a
              href={doc.signedFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Download signed PDF"
            >
              <Button variant="outline" size="sm">
                <Download className="h-3 w-3 mr-1" />
                Signed PDF
              </Button>
            </a>
          </>
        )}
        <Link href={`/sign/${doc.id}`}>
          <Button variant="ghost" size="sm">
            <Eye className="h-4 w-4" />
          </Button>
        </Link>
        {doc.status === "DRAFT" && (
          <Link href={`/sign/${doc.id}/prepare`}>
            <Button variant="outline" size="sm">
              <PenIcon className="h-3 w-3 mr-1" />
              Prepare
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
