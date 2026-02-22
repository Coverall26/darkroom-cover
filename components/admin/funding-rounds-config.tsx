"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Pencil,
  GripVertical,
  RefreshCw,
  AlertCircle,
  Loader2,
  Check,
  X,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";

interface FundingRound {
  id: string;
  fundId: string;
  roundName: string;
  roundOrder: number;
  amountRaised: string;
  targetAmount: string | null;
  preMoneyVal: string | null;
  postMoneyVal: string | null;
  leadInvestor: string | null;
  investorCount: number;
  roundDate: string | null;
  closeDate: string | null;
  status: "COMPLETED" | "ACTIVE" | "PLANNED";
  isExternal: boolean;
  externalNotes: string | null;
  instrumentType: string | null;
  valuationCap: string | null;
  discount: string | null;
  createdAt: string;
}

interface FundingRoundsConfigProps {
  fundId: string;
  teamId: string;
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  ACTIVE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  PLANNED: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};

const INSTRUMENT_LABELS: Record<string, string> = {
  SAFE: "SAFE",
  CONVERTIBLE_NOTE: "Convertible Note",
  PRICED_EQUITY: "Priced Equity",
  SPV: "SPV",
};

function formatCurrency(value: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

export function FundingRoundsConfig({ fundId, teamId }: FundingRoundsConfigProps) {
  const [rounds, setRounds] = useState<FundingRound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    roundName: "",
    targetAmount: "",
    amountRaised: "",
    preMoneyVal: "",
    postMoneyVal: "",
    leadInvestor: "",
    investorCount: "",
    roundDate: "",
    closeDate: "",
    status: "PLANNED" as string,
    instrumentType: "",
    valuationCap: "",
    discount: "",
    isExternal: false,
    externalNotes: "",
  });

  const resetForm = () => {
    setFormData({
      roundName: "",
      targetAmount: "",
      amountRaised: "",
      preMoneyVal: "",
      postMoneyVal: "",
      leadInvestor: "",
      investorCount: "",
      roundDate: "",
      closeDate: "",
      status: "PLANNED",
      instrumentType: "",
      valuationCap: "",
      discount: "",
      isExternal: false,
      externalNotes: "",
    });
  };

  const fetchRounds = useCallback(
    async (silent = false) => {
      if (!silent) setIsRefreshing(true);
      try {
        const res = await fetch(
          `/api/teams/${teamId}/funds/${fundId}/funding-rounds`,
        );
        if (res.ok) {
          const data = await res.json();
          setRounds(data.rounds);
        }
      } catch {
        // Ignore fetch errors on silent refresh
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [fundId, teamId],
  );

  useEffect(() => {
    fetchRounds(true);
  }, [fetchRounds]);

  const handleAdd = async () => {
    if (!formData.roundName.trim()) {
      toast.error("Round name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/funds/${fundId}/funding-rounds`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create round");
      }

      toast.success("Funding round created");
      resetForm();
      setShowAddForm(false);
      await fetchRounds(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create round");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (roundId: string) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/funds/${fundId}/funding-rounds/${roundId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update round");
      }

      toast.success("Funding round updated");
      setEditingId(null);
      resetForm();
      await fetchRounds(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update round");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (roundId: string, roundName: string) => {
    if (!confirm(`Delete "${roundName}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(
        `/api/teams/${teamId}/funds/${fundId}/funding-rounds/${roundId}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete round");
      }

      toast.success("Funding round deleted");
      await fetchRounds(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete round");
    }
  };

  const startEdit = (round: FundingRound) => {
    setEditingId(round.id);
    setShowAddForm(false);
    setFormData({
      roundName: round.roundName,
      targetAmount: round.targetAmount || "",
      amountRaised: round.amountRaised || "",
      preMoneyVal: round.preMoneyVal || "",
      postMoneyVal: round.postMoneyVal || "",
      leadInvestor: round.leadInvestor || "",
      investorCount: round.investorCount?.toString() || "",
      roundDate: round.roundDate ? round.roundDate.split("T")[0] : "",
      closeDate: round.closeDate ? round.closeDate.split("T")[0] : "",
      status: round.status,
      instrumentType: round.instrumentType || "",
      valuationCap: round.valuationCap || "",
      discount: round.discount || "",
      isExternal: round.isExternal,
      externalNotes: round.externalNotes || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetForm();
  };

  // Summary stats
  const totalRaised = rounds.reduce(
    (sum, r) => sum + parseFloat(r.amountRaised || "0"),
    0,
  );
  const totalTarget = rounds.reduce(
    (sum, r) => sum + parseFloat(r.targetAmount || "0"),
    0,
  );
  const activeRound = rounds.find((r) => r.status === "ACTIVE");

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading funding rounds...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-[#0066FF]" aria-hidden="true" />
            <div>
              <CardTitle className="text-lg">Funding Rounds</CardTitle>
              <CardDescription>
                Configure startup funding rounds (Pre-Seed through Series C+)
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchRounds()}
              disabled={isRefreshing}
              aria-label="Refresh funding rounds"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setShowAddForm(true);
                setEditingId(null);
                resetForm();
              }}
              disabled={showAddForm}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Round
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        {rounds.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Total Raised</p>
              <p className="text-lg font-semibold font-mono tabular-nums">
                {formatCurrency(totalRaised)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Total Target</p>
              <p className="text-lg font-semibold font-mono tabular-nums">
                {formatCurrency(totalTarget)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Active Round</p>
              <p className="text-sm font-medium truncate">
                {activeRound ? activeRound.roundName : "None"}
              </p>
            </div>
          </div>
        )}

        {/* Add Form */}
        {showAddForm && (
          <RoundForm
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleAdd}
            onCancel={() => {
              setShowAddForm(false);
              resetForm();
            }}
            isSubmitting={isSubmitting}
            submitLabel="Create Round"
          />
        )}

        {/* Rounds List */}
        {rounds.length === 0 && !showAddForm ? (
          <div className="text-center py-8 space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/30">
              <Rocket className="h-7 w-7 text-[#0066FF]" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium">No Funding Rounds</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add your first funding round to track your startup raise progression.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {rounds.map((round) =>
              editingId === round.id ? (
                <RoundForm
                  key={round.id}
                  formData={formData}
                  setFormData={setFormData}
                  onSubmit={() => handleUpdate(round.id)}
                  onCancel={cancelEdit}
                  isSubmitting={isSubmitting}
                  submitLabel="Save Changes"
                />
              ) : (
                <div
                  key={round.id}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 cursor-grab" aria-hidden="true" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">
                        #{round.roundOrder}
                      </span>
                      <span className="font-medium truncate">
                        {round.roundName}
                      </span>
                      <Badge
                        className={`text-[10px] ${STATUS_COLORS[round.status]}`}
                        variant="secondary"
                      >
                        {round.status}
                      </Badge>
                      {round.instrumentType && (
                        <Badge variant="outline" className="text-[10px]">
                          {INSTRUMENT_LABELS[round.instrumentType] || round.instrumentType}
                        </Badge>
                      )}
                      {round.isExternal && (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600 dark:text-amber-400">
                          External
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono tabular-nums">
                        Raised: {formatCurrency(round.amountRaised)}
                      </span>
                      {round.targetAmount && (
                        <span className="font-mono tabular-nums">
                          Target: {formatCurrency(round.targetAmount)}
                        </span>
                      )}
                      {round.preMoneyVal && (
                        <span className="font-mono tabular-nums">
                          Pre: {formatCurrency(round.preMoneyVal)}
                        </span>
                      )}
                      {round.leadInvestor && (
                        <span>Lead: {round.leadInvestor}</span>
                      )}
                      {round.investorCount > 0 && (
                        <span>{round.investorCount} investor(s)</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(round)}
                      className="h-8 w-8 p-0"
                      aria-label={`Edit ${round.roundName}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(round.id, round.roundName)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      disabled={round.status === "ACTIVE"}
                      aria-label={`Delete ${round.roundName}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}

        {/* Validation warning */}
        {rounds.filter((r) => r.status === "ACTIVE").length > 1 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>Multiple active rounds detected. Only one round should be active at a time.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------- Round Form Sub-Component ---------- */

interface RoundFormProps {
  formData: {
    roundName: string;
    targetAmount: string;
    amountRaised: string;
    preMoneyVal: string;
    postMoneyVal: string;
    leadInvestor: string;
    investorCount: string;
    roundDate: string;
    closeDate: string;
    status: string;
    instrumentType: string;
    valuationCap: string;
    discount: string;
    isExternal: boolean;
    externalNotes: string;
  };
  setFormData: React.Dispatch<React.SetStateAction<RoundFormProps["formData"]>>;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  submitLabel: string;
}

function RoundForm({
  formData,
  setFormData,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
}: RoundFormProps) {
  const update = (field: string, value: string | boolean) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="roundName" className="text-xs">
            Round Name *
          </Label>
          <Input
            id="roundName"
            value={formData.roundName}
            onChange={(e) => update("roundName", e.target.value)}
            placeholder="e.g. Pre-Seed, Series A"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="status" className="text-xs">
            Status
          </Label>
          <Select
            value={formData.status}
            onValueChange={(v) => update("status", v)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PLANNED">Planned</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="targetAmount" className="text-xs">
            Target Amount
          </Label>
          <Input
            id="targetAmount"
            value={formData.targetAmount}
            onChange={(e) => update("targetAmount", e.target.value)}
            placeholder="$0"
            className="mt-1 font-mono"
          />
        </div>
        <div>
          <Label htmlFor="amountRaised" className="text-xs">
            Amount Raised
          </Label>
          <Input
            id="amountRaised"
            value={formData.amountRaised}
            onChange={(e) => update("amountRaised", e.target.value)}
            placeholder="$0"
            className="mt-1 font-mono"
          />
        </div>
        <div>
          <Label htmlFor="instrumentType" className="text-xs">
            Instrument Type
          </Label>
          <Select
            value={formData.instrumentType}
            onValueChange={(v) => update("instrumentType", v)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SAFE">SAFE</SelectItem>
              <SelectItem value="CONVERTIBLE_NOTE">Convertible Note</SelectItem>
              <SelectItem value="PRICED_EQUITY">Priced Equity</SelectItem>
              <SelectItem value="SPV">SPV</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="preMoneyVal" className="text-xs">
            Pre-Money Valuation
          </Label>
          <Input
            id="preMoneyVal"
            value={formData.preMoneyVal}
            onChange={(e) => update("preMoneyVal", e.target.value)}
            placeholder="$0"
            className="mt-1 font-mono"
          />
        </div>
        <div>
          <Label htmlFor="postMoneyVal" className="text-xs">
            Post-Money Valuation
          </Label>
          <Input
            id="postMoneyVal"
            value={formData.postMoneyVal}
            onChange={(e) => update("postMoneyVal", e.target.value)}
            placeholder="$0"
            className="mt-1 font-mono"
          />
        </div>
        <div>
          <Label htmlFor="leadInvestor" className="text-xs">
            Lead Investor
          </Label>
          <Input
            id="leadInvestor"
            value={formData.leadInvestor}
            onChange={(e) => update("leadInvestor", e.target.value)}
            placeholder="Investor name"
            className="mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="valuationCap" className="text-xs">
            Valuation Cap
          </Label>
          <Input
            id="valuationCap"
            value={formData.valuationCap}
            onChange={(e) => update("valuationCap", e.target.value)}
            placeholder="$0"
            className="mt-1 font-mono"
          />
        </div>
        <div>
          <Label htmlFor="discount" className="text-xs">
            Discount (%)
          </Label>
          <Input
            id="discount"
            value={formData.discount}
            onChange={(e) => update("discount", e.target.value)}
            placeholder="0"
            className="mt-1 font-mono"
          />
        </div>
        <div>
          <Label htmlFor="investorCount" className="text-xs">
            Investor Count
          </Label>
          <Input
            id="investorCount"
            value={formData.investorCount}
            onChange={(e) => update("investorCount", e.target.value)}
            placeholder="0"
            type="number"
            className="mt-1 font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="roundDate" className="text-xs">
            Round Date
          </Label>
          <Input
            id="roundDate"
            type="date"
            value={formData.roundDate}
            onChange={(e) => update("roundDate", e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="closeDate" className="text-xs">
            Close Date
          </Label>
          <Input
            id="closeDate"
            type="date"
            value={formData.closeDate}
            onChange={(e) => update("closeDate", e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 pt-2 border-t">
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || !formData.roundName.trim()}
          size="sm"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Check className="h-4 w-4 mr-1" />
          )}
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel} size="sm" disabled={isSubmitting}>
          <X className="h-4 w-4 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
