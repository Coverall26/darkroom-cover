"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircleIcon,
  AlertTriangleIcon,
  Edit3Icon,
  Loader2Icon,
  SearchIcon,
  UserIcon,
  FileTextIcon,
  DollarSignIcon,
  ClipboardIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MessageSquareIcon,
  EyeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ----- Types -----

interface ApprovalItem {
  id: string;
  investorId: string;
  investorName: string;
  investorEmail: string;
  submissionType: "PROFILE" | "COMMITMENT" | "DOCUMENT" | "CHANGE_REQUEST";
  submittedAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
  fundId: string;
  fundName: string;
  teamId: string;
  entityType?: string;
  commitmentAmount?: number;
  accreditationStatus?: string;
  documentType?: string;
  // For change requests
  changeRequest?: {
    id: string;
    fieldName: string;
    currentValue: string;
    requestedValue: string;
    reason: string;
  };
  // Inline editable fields
  fields?: Array<{
    name: string;
    label: string;
    value: string;
    editable: boolean;
  }>;
}

interface GPApprovalQueueProps {
  teamId: string;
  fundId?: string;
  onApprovalCountChange?: (count: number) => void;
}

type TabValue = "all" | "pending" | "approved" | "rejected" | "changes_requested";

const TABS: Array<{ value: TabValue; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "changes_requested", label: "Changes Requested" },
];

const SUBMISSION_TYPE_LABELS: Record<string, string> = {
  PROFILE: "Profile",
  COMMITMENT: "Commitment",
  DOCUMENT: "Document",
  CHANGE_REQUEST: "Change Request",
};

const SUBMISSION_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  PROFILE: UserIcon,
  COMMITMENT: DollarSignIcon,
  DOCUMENT: FileTextIcon,
  CHANGE_REQUEST: ClipboardIcon,
};

// ----- Approve with Changes Modal -----

interface ApproveWithChangesModalProps {
  item: ApprovalItem;
  open: boolean;
  onClose: () => void;
  onSubmit: (changes: Array<{ field: string; originalValue: string; newValue: string }>, notes: string) => void;
  submitting: boolean;
}

function ApproveWithChangesModal({
  item,
  open,
  onClose,
  onSubmit,
  submitting,
}: ApproveWithChangesModalProps) {
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open && item.fields) {
      const initial: Record<string, string> = {};
      item.fields.forEach((f) => {
        initial[f.name] = f.value;
      });
      setEditedFields(initial);
      setNotes("");
    }
  }, [open, item.fields]);

  const changes = useMemo(() => {
    if (!item.fields) return [];
    return item.fields
      .filter((f) => editedFields[f.name] !== f.value)
      .map((f) => ({
        field: f.name,
        originalValue: f.value,
        newValue: editedFields[f.name] || "",
      }));
  }, [item.fields, editedFields]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Approve with Changes</DialogTitle>
          <DialogDescription>
            Edit fields before approving {item.investorName}&apos;s submission.
            Changes will be recorded in the audit log.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {item.fields?.filter((f) => f.editable).map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label className="text-sm">
                {field.label}
                {editedFields[field.name] !== field.value && (
                  <span className="ml-2 text-xs text-amber-600">(modified)</span>
                )}
              </Label>
              <Input
                value={editedFields[field.name] || ""}
                onChange={(e) =>
                  setEditedFields((prev) => ({
                    ...prev,
                    [field.name]: e.target.value,
                  }))
                }
                className={cn(
                  editedFields[field.name] !== field.value &&
                    "border-amber-400 bg-amber-50",
                )}
              />
              {editedFields[field.name] !== field.value && (
                <p className="text-xs text-gray-500">
                  Original: <span className="line-through">{field.value}</span>
                </p>
              )}
            </div>
          ))}

          <div className="space-y-1.5">
            <Label className="text-sm">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about the changes..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="min-h-[44px]">
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit(changes, notes)}
            disabled={submitting || changes.length === 0}
            className="min-h-[44px] bg-[#0066FF] hover:bg-[#0052cc]"
          >
            {submitting ? (
              <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Edit3Icon className="h-4 w-4 mr-2" />
            )}
            Approve with {changes.length} Change{changes.length !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----- Request Changes Modal -----

interface RequestChangesModalProps {
  item: ApprovalItem;
  open: boolean;
  onClose: () => void;
  onSubmit: (
    requestedChanges: Array<{
      changeType: string;
      fieldName: string;
      reason: string;
      currentValue?: string;
    }>,
    notes: string,
  ) => void;
  submitting: boolean;
}

function RequestChangesModal({
  item,
  open,
  onClose,
  onSubmit,
  submitting,
}: RequestChangesModalProps) {
  const [flaggedFields, setFlaggedFields] = useState<Record<string, boolean>>({});
  const [fieldNotes, setFieldNotes] = useState<Record<string, string>>({});
  const [generalNotes, setGeneralNotes] = useState("");

  useEffect(() => {
    if (open) {
      setFlaggedFields({});
      setFieldNotes({});
      setGeneralNotes("");
    }
  }, [open]);

  const flaggedCount = Object.values(flaggedFields).filter(Boolean).length;

  const handleSubmit = () => {
    const requestedChanges = (item.fields || [])
      .filter((f) => flaggedFields[f.name])
      .map((f) => ({
        changeType: item.submissionType,
        fieldName: f.name,
        reason: fieldNotes[f.name] || "Changes requested by GP",
        currentValue: f.value,
      }));
    onSubmit(requestedChanges, generalNotes);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Changes</DialogTitle>
          <DialogDescription>
            Flag fields that need corrections from {item.investorName}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {item.fields?.map((field) => (
            <div
              key={field.name}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                flaggedFields[field.name]
                  ? "border-amber-400 bg-amber-50"
                  : "border-gray-200",
              )}
            >
              <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={!!flaggedFields[field.name]}
                  onChange={(e) =>
                    setFlaggedFields((prev) => ({
                      ...prev,
                      [field.name]: e.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded accent-amber-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium">{field.label}</span>
                  <p className="text-xs text-gray-500">{field.value || "—"}</p>
                </div>
              </label>
              {flaggedFields[field.name] && (
                <div className="mt-2 ml-8">
                  <Input
                    value={fieldNotes[field.name] || ""}
                    onChange={(e) =>
                      setFieldNotes((prev) => ({
                        ...prev,
                        [field.name]: e.target.value,
                      }))
                    }
                    placeholder="Reason for change..."
                    className="text-sm"
                  />
                </div>
              )}
            </div>
          ))}

          <div className="space-y-1.5">
            <Label className="text-sm">General Notes</Label>
            <Textarea
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="Additional instructions for the investor..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="min-h-[44px]">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || flaggedCount === 0}
            className="min-h-[44px] bg-amber-500 hover:bg-amber-600 text-white"
          >
            {submitting ? (
              <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <AlertTriangleIcon className="h-4 w-4 mr-2" />
            )}
            Request Changes ({flaggedCount} field{flaggedCount !== 1 ? "s" : ""})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----- Change Request Comparison View -----

function ChangeRequestComparison({
  item,
  onApproveChange,
  onRejectChange,
  loading,
}: {
  item: ApprovalItem;
  onApproveChange: () => void;
  onRejectChange: () => void;
  loading: boolean;
}) {
  if (!item.changeRequest) return null;

  return (
    <div className="mt-3 p-3 bg-gray-50 rounded-lg border space-y-3">
      <p className="text-xs font-medium text-gray-500 uppercase">
        Requested Change: {item.changeRequest.fieldName}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <p className="text-xs text-red-600 font-medium mb-1">Current (Approved)</p>
          <p className="text-sm">{item.changeRequest.currentValue || "—"}</p>
        </div>
        <div className="rounded-lg bg-green-50 border border-green-200 p-3">
          <p className="text-xs text-green-600 font-medium mb-1">Requested New</p>
          <p className="text-sm">{item.changeRequest.requestedValue || "—"}</p>
        </div>
      </div>
      {item.changeRequest.reason && (
        <p className="text-xs text-gray-600">
          <strong>Reason:</strong> {item.changeRequest.reason}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onApproveChange}
          disabled={loading}
          className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
        >
          {loading ? (
            <Loader2Icon className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-1" />
          )}
          Approve Change
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onRejectChange}
          disabled={loading}
          className="min-h-[44px] text-red-600 border-red-300 hover:bg-red-50"
        >
          <XCircleIcon className="h-4 w-4 mr-1" />
          Reject
        </Button>
      </div>
    </div>
  );
}

// ----- Main GP Approval Queue -----

export default function GPApprovalQueue({
  teamId,
  fundId,
  onApprovalCountChange,
}: GPApprovalQueueProps) {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabValue>("pending");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal state
  const [approveWithChangesItem, setApproveWithChangesItem] = useState<ApprovalItem | null>(null);
  const [requestChangesItem, setRequestChangesItem] = useState<ApprovalItem | null>(null);
  const [confirmApproveItem, setConfirmApproveItem] = useState<ApprovalItem | null>(null);
  const [rejectItem, setRejectItem] = useState<ApprovalItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchApprovals = useCallback(async () => {
    try {
      const params = new URLSearchParams({ teamId });
      if (fundId) params.set("fundId", fundId);
      const res = await fetch(`/api/approvals/pending?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setItems(data.items || []);
      onApprovalCountChange?.(
        (data.items || []).filter((i: ApprovalItem) => i.status === "PENDING").length,
      );
    } catch {
      console.error("Failed to fetch approvals");
    } finally {
      setLoading(false);
    }
  }, [teamId, fundId, onApprovalCountChange]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (tab !== "all") {
      result = result.filter(
        (i) => i.status.toLowerCase() === tab,
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.investorName.toLowerCase().includes(q) ||
          i.investorEmail.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, tab, search]);

  const pendingCount = items.filter((i) => i.status === "PENDING").length;

  // ----- Action handlers -----

  const handleApprove = async (item: ApprovalItem) => {
    setActionLoading(item.id);
    try {
      const res = await fetch(
        `/api/admin/investors/${item.investorId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve",
            fundId: item.fundId,
            teamId: item.teamId,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to approve");
      }
      toast.success(`${item.investorName} approved`);
      setConfirmApproveItem(null);
      await fetchApprovals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveWithChanges = async (
    changes: Array<{ field: string; originalValue: string; newValue: string }>,
    notes: string,
  ) => {
    if (!approveWithChangesItem) return;
    setActionLoading(approveWithChangesItem.id);
    try {
      const res = await fetch(
        `/api/admin/investors/${approveWithChangesItem.investorId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve-with-changes",
            fundId: approveWithChangesItem.fundId,
            teamId: approveWithChangesItem.teamId,
            changes,
            notes,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to approve");
      }
      toast.success(`${approveWithChangesItem.investorName} approved with changes`);
      setApproveWithChangesItem(null);
      await fetchApprovals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestChanges = async (
    requestedChanges: Array<{
      changeType: string;
      fieldName: string;
      reason: string;
      currentValue?: string;
    }>,
    notes: string,
  ) => {
    if (!requestChangesItem) return;
    setActionLoading(requestChangesItem.id);
    try {
      const res = await fetch(
        `/api/admin/investors/${requestChangesItem.investorId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "request-changes",
            fundId: requestChangesItem.fundId,
            teamId: requestChangesItem.teamId,
            requestedChanges,
            notes,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to request changes");
      }
      toast.success(`Changes requested from ${requestChangesItem.investorName}`);
      setRequestChangesItem(null);
      await fetchApprovals();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to request changes",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectItem) return;
    setActionLoading(rejectItem.id);
    try {
      const res = await fetch(
        `/api/admin/investors/${rejectItem.investorId}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reject",
            fundId: rejectItem.fundId,
            teamId: rejectItem.teamId,
            rejectionReason: rejectReason || "Did not meet fund requirements",
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reject");
      }
      toast.success(`${rejectItem.investorName} rejected`);
      setRejectItem(null);
      setRejectReason("");
      await fetchApprovals();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject");
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>;
      case "APPROVED":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Approved</Badge>;
      case "REJECTED":
        return <Badge className="bg-red-100 text-red-800 border-red-200">Rejected</Badge>;
      case "CHANGES_REQUESTED":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Changes Requested</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2Icon className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">Approvals</h2>
          {pendingCount > 0 && (
            <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full bg-red-500 text-white text-xs font-bold">
              {pendingCount}
            </span>
          )}
        </div>
        <div className="relative w-64">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search investors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((t) => {
          const count = items.filter(
            (i) => t.value === "all" || i.status.toLowerCase() === t.value,
          ).length;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-h-[44px]",
                tab === t.value
                  ? "border-[#0066FF] text-[#0066FF]"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              {t.label}
              {count > 0 && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Items */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-600 mb-1">
            {tab === "pending" ? "No Pending Approvals" : "No Items Found"}
          </h3>
          <p className="text-sm text-gray-400">
            {tab === "pending"
              ? "All investor submissions have been reviewed."
              : "No items match your current filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const Icon = SUBMISSION_TYPE_ICONS[item.submissionType] || FileTextIcon;
            const isExpanded = expandedId === item.id;
            const isPending = item.status === "PENDING";
            const isChangeRequest = item.submissionType === "CHANGE_REQUEST";

            return (
              <Card
                key={item.id}
                className={cn(
                  "transition-shadow",
                  isPending && "border-amber-200 shadow-sm",
                )}
              >
                <CardContent className="p-4">
                  {/* Row */}
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-gray-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{item.investorName}</span>
                        {getStatusBadge(item.status)}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        <span>{SUBMISSION_TYPE_LABELS[item.submissionType]}</span>
                        <span>|</span>
                        <span>{item.fundName}</span>
                        <span>|</span>
                        <span>
                          {new Date(item.submittedAt).toLocaleDateString()}
                        </span>
                        {item.commitmentAmount && (
                          <>
                            <span>|</span>
                            <span className="font-medium text-gray-700">
                              ${item.commitmentAmount.toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isPending && !isChangeRequest && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => setConfirmApproveItem(item)}
                            disabled={actionLoading === item.id}
                            className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
                          >
                            {actionLoading === item.id ? (
                              <Loader2Icon className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 sm:mr-1" />
                            )}
                            <span className="hidden sm:inline">Approve</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : item.id)
                            }
                            className="min-h-[44px]"
                          >
                            {isExpanded ? (
                              <ChevronUpIcon className="h-4 w-4" />
                            ) : (
                              <ChevronDownIcon className="h-4 w-4" />
                            )}
                          </Button>
                        </>
                      )}
                      {isPending && isChangeRequest && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : item.id)
                          }
                          className="min-h-[44px]"
                        >
                          <EyeIcon className="h-4 w-4 mr-1" />
                          Review
                        </Button>
                      )}
                      {!isPending && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : item.id)
                          }
                          className="min-h-[44px] text-gray-500"
                        >
                          {isExpanded ? (
                            <ChevronUpIcon className="h-4 w-4" />
                          ) : (
                            <ChevronDownIcon className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="mt-4 border-t pt-4 space-y-4">
                      {/* Investor details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-500">Email</p>
                          <p className="font-medium">{item.investorEmail}</p>
                        </div>
                        {item.entityType && (
                          <div>
                            <p className="text-xs text-gray-500">Entity</p>
                            <p className="font-medium">{item.entityType}</p>
                          </div>
                        )}
                        {item.accreditationStatus && (
                          <div>
                            <p className="text-xs text-gray-500">Accreditation</p>
                            <p className="font-medium">{item.accreditationStatus}</p>
                          </div>
                        )}
                        {item.documentType && (
                          <div>
                            <p className="text-xs text-gray-500">Doc Type</p>
                            <p className="font-medium">{item.documentType}</p>
                          </div>
                        )}
                      </div>

                      {/* Change request comparison */}
                      {isChangeRequest && item.changeRequest && (
                        <ChangeRequestComparison
                          item={item}
                          onApproveChange={() => handleApprove(item)}
                          onRejectChange={() => setRejectItem(item)}
                          loading={actionLoading === item.id}
                        />
                      )}

                      {/* Action buttons for expanded pending items */}
                      {isPending && !isChangeRequest && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => setConfirmApproveItem(item)}
                            disabled={actionLoading === item.id}
                            className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1.5" />
                            Approve All
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setApproveWithChangesItem(item)}
                            className="min-h-[44px]"
                          >
                            <Edit3Icon className="h-4 w-4 mr-1.5" />
                            Approve with Changes
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRequestChangesItem(item)}
                            className="min-h-[44px] text-amber-600 border-amber-300 hover:bg-amber-50"
                          >
                            <MessageSquareIcon className="h-4 w-4 mr-1.5" />
                            Request Changes
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRejectItem(item)}
                            className="min-h-[44px] text-red-600 border-red-300 hover:bg-red-50"
                          >
                            <XCircleIcon className="h-4 w-4 mr-1.5" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirm Approve Modal */}
      <Dialog
        open={!!confirmApproveItem}
        onOpenChange={(v) => !v && setConfirmApproveItem(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Approval</DialogTitle>
            <DialogDescription>
              Approve {confirmApproveItem?.investorName}&apos;s{" "}
              {SUBMISSION_TYPE_LABELS[confirmApproveItem?.submissionType || ""]?.toLowerCase() || "submission"}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmApproveItem(null)}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              onClick={() => confirmApproveItem && handleApprove(confirmApproveItem)}
              disabled={actionLoading === confirmApproveItem?.id}
              className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
            >
              {actionLoading === confirmApproveItem?.id ? (
                <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog
        open={!!rejectItem}
        onOpenChange={(v) => {
          if (!v) {
            setRejectItem(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>
              Reject {rejectItem?.investorName}&apos;s submission? They will be
              notified via email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Rejection Reason</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setRejectItem(null);
                setRejectReason("");
              }}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={actionLoading === rejectItem?.id}
              className="min-h-[44px] bg-red-600 hover:bg-red-700"
            >
              {actionLoading === rejectItem?.id ? (
                <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <XCircleIcon className="h-4 w-4 mr-2" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve with Changes Modal */}
      {approveWithChangesItem && (
        <ApproveWithChangesModal
          item={approveWithChangesItem}
          open={!!approveWithChangesItem}
          onClose={() => setApproveWithChangesItem(null)}
          onSubmit={handleApproveWithChanges}
          submitting={actionLoading === approveWithChangesItem.id}
        />
      )}

      {/* Request Changes Modal */}
      {requestChangesItem && (
        <RequestChangesModal
          item={requestChangesItem}
          open={!!requestChangesItem}
          onClose={() => setRequestChangesItem(null)}
          onSubmit={handleRequestChanges}
          submitting={actionLoading === requestChangesItem.id}
        />
      )}
    </div>
  );
}
