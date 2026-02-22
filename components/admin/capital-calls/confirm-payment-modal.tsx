"use client";

import { useState } from "react";
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
import { CheckCircle2, Loader2 } from "lucide-react";

interface ConfirmPaymentModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  response: {
    id: string;
    investorName: string;
    amountDue: number;
    amountPaid: number;
  };
  teamId: string;
  fundId: string;
  callId: string;
}

export function ConfirmPaymentModal({
  open,
  onClose,
  onConfirm,
  response,
  teamId,
  fundId,
  callId,
}: ConfirmPaymentModalProps) {
  const [amountPaid, setAmountPaid] = useState(
    String(response.amountDue - response.amountPaid),
  );
  const [fundReceivedDate, setFundReceivedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = response.amountDue - response.amountPaid;

  async function handleSubmit() {
    setError(null);
    const amount = parseFloat(amountPaid);
    if (isNaN(amount) || amount <= 0) {
      setError("Please enter a valid amount");
      return;
    }
    if (amount > remaining * 1.01) {
      setError(`Amount exceeds remaining balance of $${remaining.toFixed(2)}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/funds/${fundId}/capital-calls/${callId}/responses/${response.id}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amountPaid: amount,
            fundReceivedDate,
            notes: notes || undefined,
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to confirm payment");
        return;
      }

      onConfirm();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
            Confirm Payment
          </DialogTitle>
          <DialogDescription>
            Confirm wire receipt from {response.investorName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Amount Due</span>
              <p className="font-mono tabular-nums font-semibold">
                ${response.amountDue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Already Paid</span>
              <p className="font-mono tabular-nums font-semibold">
                ${response.amountPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {remaining > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-sm">
              Remaining: <span className="font-mono tabular-nums font-semibold">${remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="amountPaid">Amount Received ($)</Label>
            <Input
              id="amountPaid"
              type="number"
              step="0.01"
              min="0.01"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="font-mono tabular-nums"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="receivedDate">Date Received</Label>
            <Input
              id="receivedDate"
              type="date"
              value={fundReceivedDate}
              onChange={(e) => setFundReceivedDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Bank reference, wire confirmation number, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            Confirm Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
