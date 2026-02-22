"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  InvestorSummaryCards,
  DocumentReviewPanel,
  WireConfirmationPanel,
  ReviewActionButtons,
  ApproveModal,
  RejectModal,
  RequestChangesModal,
  ApproveWithChangesModal,
} from "@/components/admin/investor-review";

interface InvestorData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  entityType: string | null;
  entityName: string | null;
  accreditationStatus: string | null;
  accreditationType: string | null;
  ndaSigned: boolean;
  ndaSignedAt: string | null;
  stage: string;
  teamId: string;
  investments: Array<{
    id: string;
    fundId: string;
    fundName: string;
    commitmentAmount: number;
    fundedAmount: number;
    status: string;
  }>;
  documents: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    file: string | null;
    createdAt: string;
    approvalNotes: string | null;
  }>;
}

interface ChangeField {
  field: string;
  label: string;
  checked: boolean;
  notes: string;
}

const REVIEW_FIELDS: Array<{ field: string; label: string }> = [
  { field: "name", label: "Investor Name" },
  { field: "email", label: "Email Address" },
  { field: "entityType", label: "Entity Type" },
  { field: "entityName", label: "Entity Name" },
  { field: "accreditationStatus", label: "Accreditation Status" },
  { field: "commitmentAmount", label: "Commitment Amount" },
  { field: "phone", label: "Phone Number" },
  { field: "address", label: "Address" },
];

export default function ReviewPageClient() {
  const params = useParams();
  const investorId = params?.investorId as string;

  const [investor, setInvestor] = useState<InvestorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Approve modal state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveNotes, setApproveNotes] = useState("");

  // Reject modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Request changes state
  const [showChangesModal, setShowChangesModal] = useState(false);
  const [changeFields, setChangeFields] = useState<ChangeField[]>(
    REVIEW_FIELDS.map((f) => ({
      ...f,
      checked: false,
      notes: "",
    })),
  );
  const [generalNotes, setGeneralNotes] = useState("");

  // Approve with changes state
  const [showApproveChangesModal, setShowApproveChangesModal] = useState(false);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});

  // Fetch investor data
  const fetchInvestor = useCallback(async () => {
    if (!investorId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/investors/${investorId}`);
      if (!res.ok) throw new Error("Failed to load investor");
      const data = await res.json();
      setInvestor(data);
    } catch {
      toast.error("Failed to load investor details");
    } finally {
      setLoading(false);
    }
  }, [investorId]);

  useEffect(() => {
    fetchInvestor();
  }, [fetchInvestor]);

  // Review actions
  const handleApprove = async () => {
    if (!investor) return;
    setActionLoading("approve");
    try {
      const res = await fetch(
        `/api/admin/investors/${investor.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve",
            notes: approveNotes || undefined,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to approve");
      }
      toast.success("Investor approved");
      setShowApproveModal(false);
      fetchInvestor();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to approve investor",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!investor || !rejectReason.trim()) return;
    setActionLoading("reject");
    try {
      const res = await fetch(
        `/api/admin/investors/${investor.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reject",
            reason: rejectReason,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to reject");
      }
      toast.success("Investor rejected");
      setShowRejectModal(false);
      fetchInvestor();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reject investor",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestChanges = async () => {
    if (!investor) return;
    const flaggedFields = changeFields.filter((f) => f.checked);
    if (flaggedFields.length === 0) {
      toast.error("Please select at least one field to flag");
      return;
    }
    setActionLoading("changes");
    try {
      const res = await fetch(
        `/api/admin/investors/${investor.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "request-changes",
            flaggedFields: flaggedFields.map((f) => ({
              field: f.field,
              label: f.label,
              notes: f.notes,
            })),
            generalNotes,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to request changes");
      }
      toast.success("Change request sent to investor");
      setShowChangesModal(false);
      fetchInvestor();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to request changes",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveWithChanges = async () => {
    if (!investor) return;
    const changedKeys = Object.keys(editedFields).filter(
      (k) => editedFields[k] !== "",
    );
    if (changedKeys.length === 0) {
      toast.error("Please edit at least one field");
      return;
    }
    setActionLoading("approveChanges");
    try {
      const res = await fetch(
        `/api/admin/investors/${investor.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve-with-changes",
            changes: editedFields,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to approve with changes");
      }
      toast.success("Investor approved with modifications");
      setShowApproveChangesModal(false);
      fetchInvestor();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to approve",
      );
    } finally {
      setActionLoading(null);
    }
  };

  // Document review action
  const handleDocumentAction = async (
    docId: string,
    action: "approve" | "reject" | "request-revision",
    notes?: string,
  ) => {
    setActionLoading(docId);
    try {
      const res = await fetch(`/api/admin/documents/${docId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to ${action} document`);
      }
      toast.success(
        action === "approve"
          ? "Document approved"
          : action === "reject"
            ? "Document rejected"
            : "Revision requested",
      );
      fetchInvestor();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Action failed",
      );
    } finally {
      setActionLoading(null);
    }
  };

  // Wire confirmation
  const handleConfirmWire = async (investmentId: string) => {
    setActionLoading(investmentId);
    try {
      const res = await fetch("/api/admin/wire/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investmentId,
          fundsReceivedDate: new Date().toISOString(),
          confirmationMethod: "MANUAL",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to confirm wire");
      }
      toast.success("Wire transfer confirmed");
      fetchInvestor();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to confirm wire",
      );
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!investor) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-gray-500">Investor not found.</p>
        <Link href="/admin/investors">
          <Button variant="outline" className="mt-4">
            <ArrowLeft size={16} className="mr-1" /> Back to Investors
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/admin/investors/${investorId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft size={16} className="mr-1" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Review: {investor.name}
            </h1>
            <p className="text-sm text-gray-500">{investor.email}</p>
          </div>
        </div>
        <Badge
          className={
            investor.stage === "APPROVED" || investor.stage === "FUNDED"
              ? "bg-emerald-100 text-emerald-800"
              : investor.stage === "REJECTED"
                ? "bg-red-100 text-red-800"
                : "bg-amber-100 text-amber-800"
          }
        >
          {investor.stage}
        </Badge>
      </div>

      {/* Investor Summary */}
      <InvestorSummaryCards
        entityType={investor.entityType}
        entityName={investor.entityName}
        phone={investor.phone}
        ndaSigned={investor.ndaSigned}
        accreditationStatus={investor.accreditationStatus}
        investments={investor.investments}
      />

      {/* Action Buttons */}
      <ReviewActionButtons
        stage={investor.stage}
        actionLoading={actionLoading}
        onShowApprove={() => setShowApproveModal(true)}
        onShowApproveChanges={() => setShowApproveChangesModal(true)}
        onShowChanges={() => setShowChangesModal(true)}
        onShowReject={() => setShowRejectModal(true)}
      />

      {/* Document Review */}
      <DocumentReviewPanel
        documents={investor.documents}
        actionLoading={actionLoading}
        onDocumentAction={handleDocumentAction}
      />

      {/* Wire Confirmation */}
      <WireConfirmationPanel
        investments={investor.investments}
        actionLoading={actionLoading}
        onConfirmWire={handleConfirmWire}
      />

      {/* === MODALS === */}
      {showApproveModal && (
        <ApproveModal
          investorName={investor.name}
          approveNotes={approveNotes}
          onNotesChange={setApproveNotes}
          actionLoading={actionLoading}
          onConfirm={handleApprove}
          onClose={() => setShowApproveModal(false)}
        />
      )}
      {showRejectModal && (
        <RejectModal
          investorName={investor.name}
          rejectReason={rejectReason}
          onReasonChange={setRejectReason}
          actionLoading={actionLoading}
          onConfirm={handleReject}
          onClose={() => setShowRejectModal(false)}
        />
      )}
      {showChangesModal && (
        <RequestChangesModal
          changeFields={changeFields}
          onChangeFieldToggle={(idx, checked) => {
            const updated = [...changeFields];
            updated[idx].checked = checked;
            setChangeFields(updated);
          }}
          onChangeFieldNotes={(idx, notes) => {
            const updated = [...changeFields];
            updated[idx].notes = notes;
            setChangeFields(updated);
          }}
          generalNotes={generalNotes}
          onGeneralNotesChange={setGeneralNotes}
          actionLoading={actionLoading}
          onConfirm={handleRequestChanges}
          onClose={() => setShowChangesModal(false)}
        />
      )}
      {showApproveChangesModal && (
        <ApproveWithChangesModal
          investorName={investor.name}
          investorEmail={investor.email}
          investorEntityType={investor.entityType}
          investorAccreditationStatus={investor.accreditationStatus}
          firstInvestment={investor.investments[0]}
          editedFields={editedFields}
          onFieldChange={(field, value) =>
            setEditedFields((prev) => ({ ...prev, [field]: value }))
          }
          actionLoading={actionLoading}
          onConfirm={handleApproveWithChanges}
          onClose={() => setShowApproveChangesModal(false)}
        />
      )}
    </div>
  );
}
