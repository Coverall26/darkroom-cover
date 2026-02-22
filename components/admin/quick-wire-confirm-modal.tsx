"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Banknote,
} from "lucide-react";

interface QuickWireConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmed: () => void;
  transactionId: string;
  teamId: string;
  investorName: string;
  expectedAmount: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function QuickWireConfirmModal({
  isOpen,
  onClose,
  onConfirmed,
  transactionId,
  teamId,
  investorName,
  expectedAmount,
}: QuickWireConfirmModalProps) {
  const today = new Date().toISOString().split("T")[0];

  const [fundsReceivedDate, setFundsReceivedDate] = useState(today);
  const [amountReceived, setAmountReceived] = useState(expectedAmount.toString());
  const [bankReference, setBankReference] = useState("");
  const [confirmationNotes, setConfirmationNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resetForm = useCallback(() => {
    setFundsReceivedDate(today);
    setAmountReceived(expectedAmount.toString());
    setBankReference("");
    setConfirmationNotes("");
    setError(null);
    setSuccess(false);
  }, [today, expectedAmount]);

  const handleClose = useCallback(() => {
    if (!submitting) {
      resetForm();
      onClose();
    }
  }, [submitting, resetForm, onClose]);

  const handleSubmit = useCallback(async () => {
    setError(null);

    const amount = parseFloat(amountReceived);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (!fundsReceivedDate) {
      setError("Please select a date");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/wire/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          teamId,
          fundsReceivedDate: new Date(fundsReceivedDate).toISOString(),
          amountReceived: amount,
          bankReference: bankReference.trim() || undefined,
          confirmationNotes: confirmationNotes.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Confirmation failed (${response.status})`);
      }

      setSuccess(true);
      setTimeout(() => {
        resetForm();
        onClose();
        onConfirmed();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
    } finally {
      setSubmitting(false);
    }
  }, [
    transactionId,
    teamId,
    fundsReceivedDate,
    amountReceived,
    bankReference,
    confirmationNotes,
    resetForm,
    onClose,
    onConfirmed,
  ]);

  const amountNum = parseFloat(amountReceived) || 0;
  const hasVariance = amountNum !== expectedAmount && amountNum > 0;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-[#10B981]" />
            Confirm Wire Receipt
          </DialogTitle>
          <DialogDescription>
            Confirm receipt of wire transfer from {investorName}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <CheckCircle2 className="h-12 w-12 text-[#10B981]" />
            <p className="text-lg font-medium">Wire Confirmed</p>
            <p className="text-sm text-muted-foreground text-center">
              {investorName} will be notified.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Investor</span>
                <span className="font-medium">{investorName}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Expected</span>
                <span className="font-medium">{formatCurrency(expectedAmount)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wire-date">Date Received *</Label>
              <Input
                id="wire-date"
                type="date"
                value={fundsReceivedDate}
                onChange={(e) => setFundsReceivedDate(e.target.value)}
                className="text-base sm:text-sm"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wire-amount">Amount Received *</Label>
              <Input
                id="wire-amount"
                type="number"
                step="0.01"
                min="0"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                className="text-base sm:text-sm"
                disabled={submitting}
              />
              {hasVariance && (
                <p className="text-xs text-amber-600">
                  Variance: {formatCurrency(amountNum - expectedAmount)} from expected
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="wire-ref">Bank Reference (optional)</Label>
              <Input
                id="wire-ref"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                placeholder="e.g., FedRef 20260213XXXXXXX"
                className="text-base sm:text-sm"
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wire-notes">Notes (optional)</Label>
              <Textarea
                id="wire-notes"
                value={confirmationNotes}
                onChange={(e) => setConfirmationNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={2}
                className="resize-none text-base sm:text-sm"
                disabled={submitting}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {!success && (
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !fundsReceivedDate || !amountReceived}
              className="min-h-[44px] bg-[#10B981] hover:bg-[#059669]"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirming...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm Wire
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
