"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DollarSign,
  Calendar,
  Layers,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

export interface CommitmentTranche {
  amount: number;
  scheduledDate: string;
  label: string;
}

export interface StagedCommitmentData {
  totalCommitment: number;
  tranches: CommitmentTranche[];
  schedule: "monthly" | "quarterly" | "semi_annual" | "custom";
  confirmTerms: boolean;
}

interface StagedCommitmentWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: StagedCommitmentData) => Promise<void>;
  fundName: string;
  fundId: string;
  minimumInvestment: number;
  entityName: string | null;
  existingCommitment?: number;
}

const SCHEDULE_OPTIONS = [
  { value: "monthly", label: "Monthly", months: 1 },
  { value: "quarterly", label: "Quarterly", months: 3 },
  { value: "semi_annual", label: "Semi-Annual", months: 6 },
  { value: "custom", label: "Custom Schedule", months: 0 },
] as const;

function generateTranches(
  totalAmount: number,
  schedule: string,
  numTranches: number,
): CommitmentTranche[] {
  if (numTranches < 1 || totalAmount <= 0) return [];

  const baseAmount = Math.floor((totalAmount / numTranches) * 100) / 100;
  const remainder =
    Math.round((totalAmount - baseAmount * numTranches) * 100) / 100;

  const monthsInterval =
    SCHEDULE_OPTIONS.find((s) => s.value === schedule)?.months || 3;
  const now = new Date();

  return Array.from({ length: numTranches }, (_, i) => {
    const date = new Date(now);
    date.setMonth(date.getMonth() + i * monthsInterval);

    return {
      amount: i === 0 ? baseAmount + remainder : baseAmount,
      scheduledDate: date.toISOString().split("T")[0],
      label: i === 0 ? "Initial Capital Call" : `Tranche ${i + 1}`,
    };
  });
}

export function StagedCommitmentWizard({
  isOpen,
  onClose,
  onSubmit,
  fundName,
  fundId,
  minimumInvestment,
  entityName,
  existingCommitment = 0,
}: StagedCommitmentWizardProps) {
  const [step, setStep] = useState<"configure" | "schedule" | "review">(
    "configure",
  );
  const [totalAmount, setTotalAmount] = useState<string>("");
  const [schedule, setSchedule] =
    useState<StagedCommitmentData["schedule"]>("quarterly");
  const [numTranches, setNumTranches] = useState<string>("4");
  const [tranches, setTranches] = useState<CommitmentTranche[]>([]);
  const [confirmTerms, setConfirmTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedTotal = parseFloat(totalAmount) || 0;
  const parsedTranches = parseInt(numTranches, 10) || 0;

  const tranchesSum = useMemo(
    () => tranches.reduce((sum, t) => sum + t.amount, 0),
    [tranches],
  );

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);

  const handleConfigureContinue = () => {
    setError(null);

    if (parsedTotal < minimumInvestment) {
      setError(
        `Minimum commitment is ${formatCurrency(minimumInvestment)}`,
      );
      return;
    }

    if (parsedTranches < 2 || parsedTranches > 12) {
      setError("Number of tranches must be between 2 and 12");
      return;
    }

    // Auto-generate tranches based on schedule
    const generated = generateTranches(parsedTotal, schedule, parsedTranches);
    setTranches(generated);
    setStep("schedule");
  };

  const handleScheduleContinue = () => {
    setError(null);

    // Validate all tranches have valid amounts and dates
    for (const tranche of tranches) {
      if (tranche.amount <= 0) {
        setError("All tranche amounts must be greater than zero");
        return;
      }
      if (!tranche.scheduledDate) {
        setError("All tranches must have a scheduled date");
        return;
      }
    }

    const tolerance = 0.01;
    if (Math.abs(tranchesSum - parsedTotal) > tolerance) {
      setError(
        `Tranche amounts (${formatCurrency(tranchesSum)}) must equal total commitment (${formatCurrency(parsedTotal)})`,
      );
      return;
    }

    setStep("review");
  };

  const handleSubmit = async () => {
    if (!confirmTerms) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        totalCommitment: parsedTotal,
        tranches,
        schedule,
        confirmTerms,
      });
    } catch (err: any) {
      setError(err.message || "Failed to create staged commitment");
      setStep("schedule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateTranche = (
    index: number,
    field: keyof CommitmentTranche,
    value: string | number,
  ) => {
    setTranches((prev) =>
      prev.map((t, i) =>
        i === index
          ? {
              ...t,
              [field]: field === "amount" ? parseFloat(value as string) || 0 : value,
            }
          : t,
      ),
    );
  };

  const addCustomTranche = () => {
    const now = new Date();
    now.setMonth(now.getMonth() + tranches.length);
    setTranches((prev) => [
      ...prev,
      {
        amount: 0,
        scheduledDate: now.toISOString().split("T")[0],
        label: `Tranche ${prev.length + 1}`,
      },
    ]);
  };

  const removeTranche = (index: number) => {
    if (tranches.length <= 2) return;
    setTranches((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    setStep("configure");
    setTotalAmount("");
    setSchedule("quarterly");
    setNumTranches("4");
    setTranches([]);
    setConfirmTerms(false);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-gray-900 border-gray-800 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Layers className="h-5 w-5 text-emerald-400" />
            {step === "configure"
              ? "Staged Commitment"
              : step === "schedule"
                ? "Schedule Tranches"
                : "Review Commitment"}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {step === "configure"
              ? `Split your commitment to ${fundName} into scheduled tranches`
              : step === "schedule"
                ? "Customize amounts and dates for each tranche"
                : "Review your staged commitment before confirming"}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          {["configure", "schedule", "review"].map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                  step === s
                    ? "bg-emerald-600 text-white"
                    : ["configure", "schedule", "review"].indexOf(step) > i
                      ? "bg-emerald-600/50 text-emerald-200"
                      : "bg-gray-700 text-gray-400"
                }`}
              >
                {["configure", "schedule", "review"].indexOf(step) > i ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 2 && (
                <div
                  className={`w-8 h-0.5 mx-1 ${
                    ["configure", "schedule", "review"].indexOf(step) > i
                      ? "bg-emerald-600"
                      : "bg-gray-700"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {step === "configure" && (
          <div className="space-y-4 py-2">
            {existingCommitment > 0 && (
              <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-700/50">
                <div className="flex justify-between items-center">
                  <span className="text-blue-200 text-sm">
                    Existing Commitment
                  </span>
                  <span className="text-blue-400 font-medium">
                    {formatCurrency(existingCommitment)}
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-gray-300">Total Commitment Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="number"
                  min={minimumInvestment}
                  step="1000"
                  placeholder={`Minimum ${formatCurrency(minimumInvestment)}`}
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white pl-10"
                />
              </div>
              <p className="text-gray-500 text-xs">
                Minimum: {formatCurrency(minimumInvestment)}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Payment Schedule</Label>
              <Select
                value={schedule}
                onValueChange={(v) =>
                  setSchedule(v as StagedCommitmentData["schedule"])
                }
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300">Number of Tranches</Label>
              <Input
                type="number"
                min="2"
                max="12"
                value={numTranches}
                onChange={(e) => setNumTranches(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
              />
              <p className="text-gray-500 text-xs">Between 2 and 12 installments</p>
            </div>

            {parsedTotal > 0 && parsedTranches >= 2 && (
              <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Amount per tranche</span>
                  <span className="text-white font-medium">
                    ~{formatCurrency(parsedTotal / parsedTranches)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "schedule" && (
          <div className="space-y-3 py-2 max-h-[400px] overflow-y-auto">
            {tranches.map((tranche, index) => (
              <div
                key={index}
                className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-white text-sm font-medium">
                    {tranche.label}
                  </span>
                  {schedule === "custom" && tranches.length > 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTranche(index)}
                      className="h-6 w-6 p-0 text-gray-400 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-gray-400 text-xs">Amount</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500" />
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        value={tranche.amount || ""}
                        onChange={(e) =>
                          updateTranche(index, "amount", e.target.value)
                        }
                        className="bg-gray-700/50 border-gray-600 text-white text-sm pl-7 h-8"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs">Date</Label>
                    <div className="relative">
                      <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500" />
                      <Input
                        type="date"
                        value={tranche.scheduledDate}
                        onChange={(e) =>
                          updateTranche(
                            index,
                            "scheduledDate",
                            e.target.value,
                          )
                        }
                        className="bg-gray-700/50 border-gray-600 text-white text-sm pl-7 h-8"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {schedule === "custom" && tranches.length < 12 && (
              <Button
                variant="outline"
                size="sm"
                onClick={addCustomTranche}
                className="w-full border-dashed border-gray-600 text-gray-400 hover:text-white hover:bg-gray-800"
              >
                <Plus className="h-3 w-3 mr-2" />
                Add Tranche
              </Button>
            )}

            {/* Sum display */}
            <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Tranches Total</span>
                <span
                  className={`font-medium ${
                    Math.abs(tranchesSum - parsedTotal) < 0.01
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {formatCurrency(tranchesSum)}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-400">Target</span>
                <span className="text-white font-medium">
                  {formatCurrency(parsedTotal)}
                </span>
              </div>
              {Math.abs(tranchesSum - parsedTotal) >= 0.01 && (
                <p className="text-amber-400 text-xs mt-2">
                  Adjust tranche amounts to match the total commitment
                </p>
              )}
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4 py-2">
            <div className="space-y-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-400">Entity</span>
                <span className="text-white font-medium">
                  {entityName || "Individual"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Fund</span>
                <span className="text-white font-medium">{fundName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Schedule</span>
                <span className="text-white font-medium">
                  {SCHEDULE_OPTIONS.find((s) => s.value === schedule)?.label}
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-700 pt-3">
                <span className="text-gray-300 font-medium">
                  Total Commitment
                </span>
                <span className="text-emerald-400 font-bold text-lg">
                  {formatCurrency(parsedTotal)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300 text-sm">
                Tranche Schedule
              </Label>
              <div className="space-y-1">
                {tranches.map((tranche, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-gray-800/30 rounded text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-emerald-600/30 flex items-center justify-center text-xs text-emerald-400">
                        {index + 1}
                      </div>
                      <span className="text-gray-300">{tranche.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-xs">
                        {new Date(
                          tranche.scheduledDate + "T00:00:00",
                        ).toLocaleDateString()}
                      </span>
                      <span className="text-white font-medium">
                        {formatCurrency(tranche.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
              <Checkbox
                id="confirm-staged"
                checked={confirmTerms}
                onCheckedChange={(checked) =>
                  setConfirmTerms(checked as boolean)
                }
                className="mt-0.5"
              />
              <Label
                htmlFor="confirm-staged"
                className="text-gray-300 text-sm cursor-pointer leading-relaxed"
              >
                I understand that this is a binding commitment and I will be
                required to fund each tranche on or before the scheduled dates.
                Failure to fund may result in penalties as outlined in the fund
                documents.
              </Label>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-900/20 rounded-lg border border-red-700/50">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <span className="text-red-200 text-sm">{error}</span>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "configure" && (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                className="text-gray-400"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfigureContinue}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}
          {step === "schedule" && (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep("configure")}
                className="text-gray-400"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleScheduleContinue}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Review
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep("schedule")}
                disabled={isSubmitting}
                className="text-gray-400"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!confirmTerms || isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Confirm Commitment
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
