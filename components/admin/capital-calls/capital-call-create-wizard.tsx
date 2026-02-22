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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Banknote,
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Percent,
  Users,
} from "lucide-react";

interface CapitalCallCreateWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  teamId: string;
  fundId: string;
}

export function CapitalCallCreateWizard({
  open,
  onClose,
  onCreated,
  teamId,
  fundId,
}: CapitalCallCreateWizardProps) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [proRataPercentage, setProRataPercentage] = useState("");
  const [notes, setNotes] = useState("");

  const STEPS = ["Call Details", "Schedule & Notes", "Review & Create"];

  function resetForm() {
    setStep(0);
    setAmount("");
    setPurpose("");
    setDueDate("");
    setProRataPercentage("");
    setNotes("");
    setError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function canProceed(): boolean {
    if (step === 0) {
      const amt = parseFloat(amount);
      return !isNaN(amt) && amt > 0 && amt <= 100_000_000_000;
    }
    if (step === 1) {
      return !!dueDate && !isNaN(new Date(dueDate).getTime());
    }
    return true;
  }

  async function handleCreate() {
    setError(null);
    setSubmitting(true);

    try {
      const proRata = proRataPercentage
        ? parseFloat(proRataPercentage)
        : undefined;

      const res = await fetch(
        `/api/teams/${teamId}/funds/${fundId}/capital-calls`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: parseFloat(amount),
            purpose: purpose || undefined,
            dueDate,
            proRataPercentage: proRata,
            notes: notes || undefined,
          }),
        },
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create capital call");
        return;
      }

      resetForm();
      onCreated();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const formatAmount = (v: string) => {
    const num = parseFloat(v);
    if (isNaN(num)) return "$0.00";
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-blue-500" aria-hidden="true" />
            Create Capital Call
          </DialogTitle>
          <DialogDescription>
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step
                  ? "bg-blue-500"
                  : "bg-gray-200 dark:bg-gray-700"
              }`}
            />
          ))}
        </div>

        <div className="min-h-[240px] py-2">
          {/* Step 1: Call Details */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="callAmount">
                  <Banknote className="h-4 w-4 inline mr-1" aria-hidden="true" />
                  Total Call Amount ($)
                </Label>
                <Input
                  id="callAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="500000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="font-mono tabular-nums text-base"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="callPurpose">
                  <FileText className="h-4 w-4 inline mr-1" aria-hidden="true" />
                  Purpose
                </Label>
                <Input
                  id="callPurpose"
                  placeholder="e.g., Property acquisition, Operating expenses"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="proRata">
                  <Percent className="h-4 w-4 inline mr-1" aria-hidden="true" />
                  Pro-Rata Percentage (optional)
                </Label>
                <Input
                  id="proRata"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="Leave blank to set amounts manually per investor"
                  value={proRataPercentage}
                  onChange={(e) => setProRataPercentage(e.target.value)}
                  className="font-mono tabular-nums"
                />
                <p className="text-xs text-muted-foreground">
                  If set, each investor&apos;s amount due is calculated as their commitment × this percentage.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Schedule & Notes */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dueDate">
                  <Calendar className="h-4 w-4 inline mr-1" aria-hidden="true" />
                  Due Date
                </Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="callNotes">Notes (optional)</Label>
                <Textarea
                  id="callNotes"
                  placeholder="Additional instructions or context for investors..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 2 && (
            <div className="space-y-3">
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Review Capital Call
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Amount</span>
                    <span className="font-mono tabular-nums font-semibold">
                      {formatAmount(amount)}
                    </span>
                  </div>
                  {purpose && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Purpose</span>
                      <span className="text-sm">{purpose}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Due Date</span>
                    <span className="text-sm">
                      {dueDate
                        ? new Date(dueDate + "T00:00:00").toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })
                        : "—"}
                    </span>
                  </div>
                  {proRataPercentage && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Pro-Rata</span>
                      <span className="font-mono tabular-nums text-sm">
                        {proRataPercentage}%
                      </span>
                    </div>
                  )}
                  {notes && (
                    <div className="pt-2 border-t">
                      <span className="text-sm text-muted-foreground">Notes</span>
                      <p className="text-sm mt-1">{notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/30 rounded-lg px-3 py-2">
                <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Response rows will be auto-created for all active investors.
                  The call will be created in <strong>DRAFT</strong> status.
                </span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div>
            {step > 0 && (
              <Button
                variant="outline"
                onClick={() => setStep((s) => s - 1)}
                disabled={submitting}
              >
                <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canProceed()}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Banknote className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                Create Draft
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
