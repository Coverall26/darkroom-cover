"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Save,
  Trash2,
  Clock,
  DollarSign,
  FileText,
  Building2,
  XCircle,
  Upload,
} from "lucide-react";
import { putFile } from "@/lib/files/put-file";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WireInstructions {
  bankName: string;
  accountNumber: string;
  routingNumber: string;
  swiftCode?: string;
  beneficiaryName: string;
  beneficiaryAddress?: string;
  reference?: string;
  notes?: string;
}

interface PendingTransaction {
  id: string;
  investorName: string;
  investorEmail: string;
  amount: number;
  currency: string;
  type: string;
  status: string;
  fundName: string;
  initiatedAt: string;
  description: string | null;
}

interface ConfirmForm {
  fundsReceivedDate: string;
  amountReceived: string;
  bankReference: string;
  confirmationNotes: string;
  confirmed: boolean;
  bankStatementFileName: string;
}

interface WireInstructionsClientProps {
  fundId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (value: number): string =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-800",
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function WireInstructionsClient({
  fundId,
}: WireInstructionsClientProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"instructions" | "confirm">(
    "instructions",
  );
  const [form, setForm] = useState<WireInstructions>({
    bankName: "",
    accountNumber: "",
    routingNumber: "",
    swiftCode: "",
    beneficiaryName: "",
    beneficiaryAddress: "",
    reference: "",
    notes: "",
  });

  // Pending transactions state
  const [pendingTransactions, setPendingTransactions] = useState<
    PendingTransaction[]
  >([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmForm, setConfirmForm] = useState<ConfirmForm>({
    fundsReceivedDate: new Date().toISOString().split("T")[0],
    amountReceived: "",
    bankReference: "",
    confirmationNotes: "",
    confirmed: false,
    bankStatementFileName: "",
  });
  const [bankStatementUploading, setBankStatementUploading] = useState(false);
  const bankStatementRef = useRef<HTMLInputElement>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // -------------------------------------------------------------------------
  // Data Fetching
  // -------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      const fundRes = await fetch(`/api/admin/fund/${fundId}`);
      if (!fundRes.ok) throw new Error("Fund not found");
      const fundData = await fundRes.json();
      const tid = fundData.teamId;
      setTeamId(tid);

      const res = await fetch(
        `/api/teams/${tid}/funds/${fundId}/wire-instructions`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.configured && data.instructions) {
          setForm(data.instructions);
          setConfigured(true);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  const fetchPendingTransactions = useCallback(async () => {
    if (!teamId) return;
    setLoadingTransactions(true);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/funds/${fundId}/transactions?status=PENDING&status=PROOF_UPLOADED`,
      );
      if (res.ok) {
        const data = await res.json();
        setPendingTransactions(data.transactions || []);
      }
    } catch {
      // Silently fail — pending list is supplementary
    } finally {
      setLoadingTransactions(false);
    }
  }, [teamId, fundId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (teamId && activeTab === "confirm") {
      fetchPendingTransactions();
    }
  }, [teamId, activeTab, fetchPendingTransactions]);

  // -------------------------------------------------------------------------
  // Wire Instructions Handlers
  // -------------------------------------------------------------------------

  async function handleSave() {
    if (!teamId) return;

    if (
      !form.bankName ||
      !form.accountNumber ||
      !form.routingNumber ||
      !form.beneficiaryName
    ) {
      setError(
        "Bank name, account number, routing number, and beneficiary name are required",
      );
      return;
    }

    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch(
        `/api/teams/${teamId}/funds/${fundId}/wire-instructions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }

      setConfigured(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!teamId || !confirm("Remove wire instructions from this fund?")) return;

    setSaving(true);
    try {
      const res = await fetch(
        `/api/teams/${teamId}/funds/${fundId}/wire-instructions`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete");

      setForm({
        bankName: "",
        accountNumber: "",
        routingNumber: "",
        swiftCode: "",
        beneficiaryName: "",
        beneficiaryAddress: "",
        reference: "",
        notes: "",
      });
      setConfigured(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof WireInstructions, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // -------------------------------------------------------------------------
  // Confirmation Handlers
  // -------------------------------------------------------------------------

  function startConfirm(tx: PendingTransaction) {
    setConfirmingId(tx.id);
    setConfirmForm({
      fundsReceivedDate: new Date().toISOString().split("T")[0],
      amountReceived: String(tx.amount),
      bankReference: "",
      confirmationNotes: "",
      confirmed: false,
      bankStatementFileName: "",
    });
    setError("");
  }

  function cancelConfirm() {
    setConfirmingId(null);
    setError("");
  }

  async function handleBankStatementUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !teamId) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be under 10MB");
      return;
    }
    if (file.type !== "application/pdf") {
      setError("Only PDF files are accepted for bank statements");
      return;
    }

    setBankStatementUploading(true);
    setError("");
    try {
      const uploadResult = await putFile({ file, teamId });
      if (uploadResult.type && uploadResult.data) {
        setConfirmForm((prev) => ({
          ...prev,
          bankStatementFileName: file.name,
        }));
      }
    } catch {
      setError("Failed to upload bank statement");
    } finally {
      setBankStatementUploading(false);
    }
  }

  async function handleConfirm(transactionId: string) {
    if (!teamId) return;

    const amountNum = parseFloat(confirmForm.amountReceived);
    if (!confirmForm.fundsReceivedDate) {
      setError("Funds received date is required");
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Amount received must be a positive number");
      return;
    }
    if (!confirmForm.confirmed) {
      setError("Please confirm that funds have been received in the fund account");
      return;
    }

    setConfirmLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/wire/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          teamId,
          fundsReceivedDate: new Date(
            confirmForm.fundsReceivedDate,
          ).toISOString(),
          amountReceived: amountNum,
          bankReference: confirmForm.bankReference || undefined,
          confirmationNotes: confirmForm.confirmationNotes || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Confirmation failed");
      }

      // Remove confirmed transaction from pending list
      setPendingTransactions((prev) =>
        prev.filter((t) => t.id !== transactionId),
      );
      setConfirmingId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
    } finally {
      setConfirmLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/admin/fund/${fundId}`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Fund
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Wire Transfers</h1>
          <p className="text-muted-foreground">
            Configure wire instructions and confirm incoming transfers
          </p>
        </div>
        <div className="flex items-center gap-2">
          {configured && (
            <Badge variant="default" className="bg-emerald-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Configured
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled
            title="Coming soon — QuickBooks integration launching Q2 2026"
            className="opacity-50 cursor-not-allowed"
          >
            <Building2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Sync to QuickBooks
          </Button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant={activeTab === "instructions" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setActiveTab("instructions");
            setError("");
          }}
        >
          <Banknote className="h-4 w-4 mr-2" />
          Wire Instructions
        </Button>
        <Button
          variant={activeTab === "confirm" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setActiveTab("confirm");
            setError("");
          }}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Confirm Receipt
          {pendingTransactions.length > 0 && (
            <Badge className="ml-2 bg-amber-500 text-white text-xs px-1.5 py-0">
              {pendingTransactions.length}
            </Badge>
          )}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200 mb-4">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-red-600 hover:text-red-700"
            onClick={() => setError("")}
          >
            Dismiss
          </Button>
        </div>
      )}

      {activeTab === "instructions" ? (
        <WireInstructionsForm
          form={form}
          configured={configured}
          saving={saving}
          saved={saved}
          onUpdateField={updateField}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      ) : (
        <PendingConfirmations
          transactions={pendingTransactions}
          loading={loadingTransactions}
          confirmingId={confirmingId}
          confirmForm={confirmForm}
          confirmLoading={confirmLoading}
          bankStatementUploading={bankStatementUploading}
          bankStatementRef={bankStatementRef}
          onConfirmFormChange={(field, value) =>
            setConfirmForm((prev) => ({ ...prev, [field]: value }))
          }
          onConfirmCheckedChange={(checked) =>
            setConfirmForm((prev) => ({ ...prev, confirmed: checked }))
          }
          onBankStatementUpload={handleBankStatementUpload}
          onStartConfirm={startConfirm}
          onCancelConfirm={cancelConfirm}
          onConfirm={handleConfirm}
          onRefresh={fetchPendingTransactions}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wire Instructions Form (extracted)
// ---------------------------------------------------------------------------

function WireInstructionsForm({
  form,
  configured,
  saving,
  saved,
  onUpdateField,
  onSave,
  onDelete,
}: {
  form: WireInstructions;
  configured: boolean;
  saving: boolean;
  saved: boolean;
  onUpdateField: (field: keyof WireInstructions, value: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Banknote className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Bank Details</CardTitle>
        </div>
        <CardDescription>
          These details will be shown to investors when they need to send wire
          transfers. The account number will be masked for LP display.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="bankName">
              Bank Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="bankName"
              placeholder="e.g., JPMorgan Chase"
              value={form.bankName}
              onChange={(e) => onUpdateField("bankName", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="beneficiaryName">
              Beneficiary Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="beneficiaryName"
              placeholder="e.g., Acme Growth Fund I LLC"
              value={form.beneficiaryName}
              onChange={(e) => onUpdateField("beneficiaryName", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="routingNumber">
              Routing Number (ABA) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="routingNumber"
              placeholder="e.g., 021000021"
              value={form.routingNumber}
              onChange={(e) => onUpdateField("routingNumber", e.target.value)}
              maxLength={9}
            />
          </div>
          <div>
            <Label htmlFor="accountNumber">
              Account Number <span className="text-red-500">*</span>
            </Label>
            <Input
              id="accountNumber"
              placeholder="e.g., 1234567890"
              value={form.accountNumber}
              onChange={(e) => onUpdateField("accountNumber", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="swiftCode">SWIFT Code (international)</Label>
            <Input
              id="swiftCode"
              placeholder="e.g., CHASUS33"
              value={form.swiftCode || ""}
              onChange={(e) => onUpdateField("swiftCode", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="beneficiaryAddress">Beneficiary Address</Label>
            <Input
              id="beneficiaryAddress"
              placeholder="e.g., 123 Main St, New York, NY"
              value={form.beneficiaryAddress || ""}
              onChange={(e) =>
                onUpdateField("beneficiaryAddress", e.target.value)
              }
            />
          </div>
        </div>

        <div>
          <Label htmlFor="reference">Default Reference / Memo</Label>
          <Input
            id="reference"
            placeholder='e.g., "Investor Name - Fund Name"'
            value={form.reference || ""}
            onChange={(e) => onUpdateField("reference", e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Suggested reference line investors should include in their wire
          </p>
        </div>

        <div>
          <Label htmlFor="notes">Special Instructions</Label>
          <Textarea
            id="notes"
            placeholder="Any additional instructions for investors..."
            value={form.notes || ""}
            onChange={(e) => onUpdateField("notes", e.target.value)}
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            {configured && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={saving}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remove
              </Button>
            )}
          </div>
          <Button onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saving ? "Saving..." : saved ? "Saved!" : "Save Wire Instructions"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pending Confirmations
// ---------------------------------------------------------------------------

function PendingConfirmations({
  transactions,
  loading,
  confirmingId,
  confirmForm,
  confirmLoading,
  bankStatementUploading,
  bankStatementRef,
  onConfirmFormChange,
  onConfirmCheckedChange,
  onBankStatementUpload,
  onStartConfirm,
  onCancelConfirm,
  onConfirm,
  onRefresh,
}: {
  transactions: PendingTransaction[];
  loading: boolean;
  confirmingId: string | null;
  confirmForm: ConfirmForm;
  confirmLoading: boolean;
  bankStatementUploading: boolean;
  bankStatementRef: React.RefObject<HTMLInputElement | null>;
  onConfirmFormChange: (field: keyof ConfirmForm, value: string) => void;
  onConfirmCheckedChange: (checked: boolean) => void;
  onBankStatementUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStartConfirm: (tx: PendingTransaction) => void;
  onCancelConfirm: () => void;
  onConfirm: (transactionId: string) => void;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-400 mb-4" />
          <h3 className="text-lg font-medium">No pending wire transfers</h3>
          <p className="text-sm text-muted-foreground mt-1">
            All incoming wire transfers have been confirmed. New pending
            transactions will appear here.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={onRefresh}
          >
            Refresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {transactions.length} pending transaction
          {transactions.length !== 1 ? "s" : ""} awaiting confirmation
        </p>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      {transactions.map((tx) => (
        <Card key={tx.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {tx.investorName}
              </CardTitle>
              <Badge className={STATUS_STYLES[tx.status] || "bg-gray-100 text-gray-800"}>
                {tx.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Fund</p>
                <p className="font-medium">{tx.fundName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Amount</p>
                <p className="font-medium flex items-center gap-1">
                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                  {formatCurrency(tx.amount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <p className="font-medium">{tx.type}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Initiated</p>
                <p className="text-sm flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {formatDate(tx.initiatedAt)}
                </p>
              </div>
            </div>

            {tx.description && (
              <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {tx.description}
                </p>
              </div>
            )}

            {confirmingId === tx.id ? (
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                <h4 className="font-medium text-sm">Confirm Wire Receipt</h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor={`date-${tx.id}`}>
                      Funds Received Date{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id={`date-${tx.id}`}
                      type="date"
                      value={confirmForm.fundsReceivedDate}
                      onChange={(e) =>
                        onConfirmFormChange("fundsReceivedDate", e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor={`amount-${tx.id}`}>
                      Amount Received ($){" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id={`amount-${tx.id}`}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={confirmForm.amountReceived}
                      onChange={(e) =>
                        onConfirmFormChange("amountReceived", e.target.value)
                      }
                    />
                    {confirmForm.amountReceived &&
                      parseFloat(confirmForm.amountReceived) !== tx.amount && (
                        <p className="text-xs text-amber-600 mt-1">
                          Variance:{" "}
                          {formatCurrency(
                            parseFloat(confirmForm.amountReceived) - tx.amount,
                          )}{" "}
                          from expected {formatCurrency(tx.amount)}
                        </p>
                      )}
                  </div>
                </div>

                <div>
                  <Label htmlFor={`ref-${tx.id}`}>
                    Bank Reference / Transaction ID
                  </Label>
                  <Input
                    id={`ref-${tx.id}`}
                    placeholder="e.g., FWT-20260210-001234"
                    value={confirmForm.bankReference}
                    onChange={(e) =>
                      onConfirmFormChange("bankReference", e.target.value)
                    }
                  />
                </div>

                <div>
                  <Label htmlFor={`notes-${tx.id}`}>Notes</Label>
                  <Textarea
                    id={`notes-${tx.id}`}
                    placeholder="Optional notes about this confirmation..."
                    value={confirmForm.confirmationNotes}
                    onChange={(e) =>
                      onConfirmFormChange("confirmationNotes", e.target.value)
                    }
                    rows={2}
                  />
                </div>

                {/* Optional: Upload bank statement as additional proof */}
                <div>
                  <Label className="text-sm">
                    Bank Statement (optional)
                  </Label>
                  <div className="mt-1">
                    {confirmForm.bankStatementFileName ? (
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span>{confirmForm.bankStatementFileName}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 ml-auto"
                          onClick={() =>
                            onConfirmFormChange("bankStatementFileName", "")
                          }
                        >
                          <XCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={bankStatementUploading}
                        onClick={() => bankStatementRef.current?.click()}
                      >
                        {bankStatementUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        {bankStatementUploading
                          ? "Uploading..."
                          : "Upload PDF"}
                      </Button>
                    )}
                    <input
                      ref={bankStatementRef}
                      type="file"
                      className="hidden"
                      accept=".pdf"
                      onChange={onBankStatementUpload}
                    />
                  </div>
                </div>

                {/* Confirmation checkbox */}
                <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900/30">
                  <Checkbox
                    id={`confirm-check-${tx.id}`}
                    checked={confirmForm.confirmed}
                    onCheckedChange={(checked) =>
                      onConfirmCheckedChange(checked === true)
                    }
                    className="mt-0.5"
                  />
                  <label
                    htmlFor={`confirm-check-${tx.id}`}
                    className="text-sm leading-tight cursor-pointer"
                  >
                    I confirm these funds have been received in the fund
                    account.
                  </label>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => onConfirm(tx.id)}
                    disabled={confirmLoading || !confirmForm.confirmed}
                  >
                    {confirmLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Confirming...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Confirm Receipt
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onCancelConfirm}
                    disabled={confirmLoading}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => onStartConfirm(tx)}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirm Wire Receipt
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
