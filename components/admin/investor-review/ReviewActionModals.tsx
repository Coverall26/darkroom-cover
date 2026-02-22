"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  XCircle,
  MessageSquare,
  Loader2,
} from "lucide-react";

interface ChangeField {
  field: string;
  label: string;
  checked: boolean;
  notes: string;
}

interface Investment {
  id: string;
  fundId: string;
  fundName: string;
  commitmentAmount: number;
  fundedAmount: number;
  status: string;
}

interface ReviewActionButtonsProps {
  stage: string;
  actionLoading: string | null;
  onShowApprove: () => void;
  onShowApproveChanges: () => void;
  onShowChanges: () => void;
  onShowReject: () => void;
}

/**
 * ReviewActionButtons — Approve / Reject / Request Changes action bar.
 */
export function ReviewActionButtons({
  stage,
  actionLoading,
  onShowApprove,
  onShowApproveChanges,
  onShowChanges,
  onShowReject,
}: ReviewActionButtonsProps) {
  if (
    stage !== "APPLIED" &&
    stage !== "UNDER_REVIEW" &&
    stage !== "COMMITTED"
  ) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Review Actions</CardTitle>
        <CardDescription>
          Approve, reject, or request changes from this investor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={onShowApprove}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={!!actionLoading}
          >
            <CheckCircle2 size={16} className="mr-1" /> Approve
          </Button>
          <Button
            onClick={onShowApproveChanges}
            variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-50"
            disabled={!!actionLoading}
          >
            <CheckCircle2 size={16} className="mr-1" /> Approve with Changes
          </Button>
          <Button
            onClick={onShowChanges}
            variant="outline"
            disabled={!!actionLoading}
          >
            <MessageSquare size={16} className="mr-1" /> Request Changes
          </Button>
          <Button
            onClick={onShowReject}
            variant="outline"
            className="border-red-300 text-red-700 hover:bg-red-50"
            disabled={!!actionLoading}
          >
            <XCircle size={16} className="mr-1" /> Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Approve Modal ────────────────────────────────────────────────── */

interface ApproveModalProps {
  investorName: string;
  approveNotes: string;
  onNotesChange: (v: string) => void;
  actionLoading: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function ApproveModal({
  investorName,
  approveNotes,
  onNotesChange,
  actionLoading,
  onConfirm,
  onClose,
}: ApproveModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Approve Investor</CardTitle>
          <CardDescription>
            Approve {investorName} for investment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              value={approveNotes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Add any notes..."
              rows={3}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={actionLoading === "approve"}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {actionLoading === "approve" && (
                <Loader2 size={14} className="mr-1 animate-spin" />
              )}
              Approve
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Reject Modal ─────────────────────────────────────────────────── */

interface RejectModalProps {
  investorName: string;
  rejectReason: string;
  onReasonChange: (v: string) => void;
  actionLoading: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function RejectModal({
  investorName,
  rejectReason,
  onReasonChange,
  actionLoading,
  onConfirm,
  onClose,
}: RejectModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Reject Investor</CardTitle>
          <CardDescription>
            This will notify {investorName} of the rejection.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={actionLoading === "reject" || !rejectReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {actionLoading === "reject" && (
                <Loader2 size={14} className="mr-1 animate-spin" />
              )}
              Reject
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Request Changes Modal ────────────────────────────────────────── */

interface RequestChangesModalProps {
  changeFields: ChangeField[];
  onChangeFieldToggle: (idx: number, checked: boolean) => void;
  onChangeFieldNotes: (idx: number, notes: string) => void;
  generalNotes: string;
  onGeneralNotesChange: (v: string) => void;
  actionLoading: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function RequestChangesModal({
  changeFields,
  onChangeFieldToggle,
  onChangeFieldNotes,
  generalNotes,
  onGeneralNotesChange,
  actionLoading,
  onConfirm,
  onClose,
}: RequestChangesModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="max-w-lg w-full my-8">
        <CardHeader>
          <CardTitle>Request Changes</CardTitle>
          <CardDescription>
            Flag specific fields that need correction.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {changeFields.map((cf, idx) => (
            <div key={cf.field} className="space-y-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cf.checked}
                  onChange={(e) => onChangeFieldToggle(idx, e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm font-medium">{cf.label}</span>
              </label>
              {cf.checked && (
                <Input
                  placeholder={`Notes about ${cf.label.toLowerCase()}...`}
                  value={cf.notes}
                  onChange={(e) => onChangeFieldNotes(idx, e.target.value)}
                  className="text-sm ml-6"
                />
              )}
            </div>
          ))}
          <div className="space-y-1.5 pt-2 border-t">
            <Label>General Notes</Label>
            <Textarea
              value={generalNotes}
              onChange={(e) => onGeneralNotesChange(e.target.value)}
              placeholder="Additional context..."
              rows={2}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={actionLoading === "changes"}
            >
              {actionLoading === "changes" && (
                <Loader2 size={14} className="mr-1 animate-spin" />
              )}
              Send Change Request
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Approve with Changes Modal ───────────────────────────────────── */

interface ApproveWithChangesModalProps {
  investorName: string;
  investorEmail: string;
  investorEntityType: string | null;
  investorAccreditationStatus: string | null;
  firstInvestment: Investment | undefined;
  editedFields: Record<string, string>;
  onFieldChange: (field: string, value: string) => void;
  actionLoading: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function ApproveWithChangesModal({
  investorName,
  investorEmail,
  investorEntityType,
  investorAccreditationStatus,
  firstInvestment,
  editedFields,
  onFieldChange,
  actionLoading,
  onConfirm,
  onClose,
}: ApproveWithChangesModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="max-w-lg w-full my-8">
        <CardHeader>
          <CardTitle>Approve with Changes</CardTitle>
          <CardDescription>
            Edit fields before approving. Original values are preserved in the
            audit trail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={editedFields.name ?? investorName}
                onChange={(e) => onFieldChange("name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                value={editedFields.email ?? investorEmail}
                onChange={(e) => onFieldChange("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Entity Type</Label>
              <Input
                value={editedFields.entityType ?? investorEntityType ?? ""}
                onChange={(e) => onFieldChange("entityType", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Accreditation Status</Label>
              <Input
                value={
                  editedFields.accreditationStatus ??
                  investorAccreditationStatus ??
                  ""
                }
                onChange={(e) =>
                  onFieldChange("accreditationStatus", e.target.value)
                }
              />
            </div>
            {firstInvestment && (
              <div className="space-y-1.5">
                <Label>Commitment Amount</Label>
                <Input
                  type="number"
                  value={
                    editedFields.commitmentAmount ??
                    firstInvestment.commitmentAmount?.toString() ??
                    ""
                  }
                  onChange={(e) =>
                    onFieldChange("commitmentAmount", e.target.value)
                  }
                />
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={actionLoading === "approveChanges"}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {actionLoading === "approveChanges" && (
                <Loader2 size={14} className="mr-1 animate-spin" />
              )}
              Approve with Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
