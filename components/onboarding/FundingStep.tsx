"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Banknote,
  Copy,
  CheckCircle2,
  Clock,
  AlertCircle,
  Upload,
  Loader2,
  Phone,
  Mail,
  ClipboardCopy,
  Calendar,
  DollarSign,
  Hash,
  CreditCard,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { putFile } from "@/lib/files/put-file";
import { EncryptionBadge } from "@/components/ui/encryption-badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WireInstructions {
  bankName: string;
  accountName?: string;
  routingNumber: string;
  accountNumber: string;
  swiftCode?: string;
  reference?: string;
  notes?: string;
}

interface FundingStepProps {
  fundId: string;
  teamId: string;
  investmentId?: string;
  investorName?: string;
  fundName?: string;
  commitmentAmount?: number;
  onComplete: () => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FundingStep({
  fundId,
  teamId,
  investmentId,
  investorName,
  fundName,
  commitmentAmount,
  onComplete,
  onBack,
}: FundingStepProps) {
  const [loading, setLoading] = useState(true);
  const [wireInstructions, setWireInstructions] =
    useState<WireInstructions | null>(null);
  const [proofStatus, setProofStatus] = useState<string>("PENDING");
  const [proofFileName, setProofFileName] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Proof metadata fields
  const [amountSent, setAmountSent] = useState(
    commitmentAmount ? commitmentAmount.toString() : "",
  );
  const [wireDateInitiated, setWireDateInitiated] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [bankReference, setBankReference] = useState("");
  const [proofNotes, setProofNotes] = useState("");

  // Copy state
  const [copied, setCopied] = useState<string | null>(null);

  // Pay later state
  const [showPayLater, setShowPayLater] = useState(false);
  const [payLaterCreated, setPayLaterCreated] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchWireData = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const url = fundId
          ? `/api/lp/wire-instructions?fundId=${encodeURIComponent(fundId)}`
          : "/api/lp/wire-instructions";
        const res = await fetch(url, { signal });
        if (!res.ok) {
          if (res.status === 404) {
            setLoading(false);
            return;
          }
          throw new Error("Failed to load wire instructions");
        }
        const data = await res.json();
        setWireInstructions(data.wireInstructions || null);
        setProofStatus(data.proofStatus || "PENDING");
        setProofFileName(data.proofFileName || null);
      } catch (err) {
        // Ignore abort errors; wire instructions may not be configured
        if (err instanceof DOMException && err.name === "AbortError") return;
      } finally {
        setLoading(false);
      }
    },
    [fundId],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchWireData(controller.signal);
    return () => controller.abort();
  }, [fetchWireData]);

  // ---------------------------------------------------------------------------
  // Auto-formatted reference
  // ---------------------------------------------------------------------------

  const autoReference = (() => {
    const lastName = investorName?.split(" ").pop() || "Investor";
    const fund = fundName || "Fund";
    return `LP-${lastName}-${fund}`;
  })();

  // ---------------------------------------------------------------------------
  // Copy Helpers
  // ---------------------------------------------------------------------------

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function copyAllToClipboard() {
    if (!wireInstructions) return;
    const lines = [
      `Bank Name: ${wireInstructions.bankName}`,
      wireInstructions.accountName
        ? `Account Name: ${wireInstructions.accountName}`
        : null,
      `Routing Number: ${wireInstructions.routingNumber}`,
      `Account Number: ${wireInstructions.accountNumber}`,
      wireInstructions.swiftCode
        ? `SWIFT/BIC: ${wireInstructions.swiftCode}`
        : null,
      `Reference/Memo: ${wireInstructions.reference || autoReference}`,
      wireInstructions.notes
        ? `\nNotes: ${wireInstructions.notes}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(lines).then(() => {
      setCopied("all");
      setTimeout(() => setCopied(null), 2000);
    });
  }

  // ---------------------------------------------------------------------------
  // File Upload Handler
  // ---------------------------------------------------------------------------

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setError("File size must be under 10MB");
      return;
    }

    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
    ];
    if (!allowedTypes.includes(file.type)) {
      setError("Only PDF, PNG, and JPEG files are accepted");
      return;
    }

    setUploading(true);
    setError("");

    try {
      // Step 1: Upload file to storage
      const uploadResult = await putFile({ file, teamId });
      if (!uploadResult.type || !uploadResult.data) {
        throw new Error("File upload failed");
      }

      // Step 2: Submit proof metadata
      const res = await fetch("/api/lp/wire-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investmentId,
          storageKey: uploadResult.data,
          storageType: uploadResult.type,
          fileType: file.type,
          fileName: file.name,
          fileSize: file.size,
          notes: proofNotes || undefined,
          amountSent: amountSent ? parseFloat(amountSent) : undefined,
          wireDateInitiated: wireDateInitiated || undefined,
          bankReference: bankReference || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }

      setUploadSuccess(true);
      setProofStatus("RECEIVED");
      setProofFileName(file.name);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Pay Later Handler
  // ---------------------------------------------------------------------------

  async function handlePayLater() {
    setPayLaterCreated(true);
  }

  // ---------------------------------------------------------------------------
  // Format Helpers
  // ---------------------------------------------------------------------------

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Loading funding details...</p>
      </div>
    );
  }

  // Already verified
  if (proofStatus === "VERIFIED") {
    return (
      <div className="space-y-6">
        <div className="text-center py-6">
          <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
          <p className="text-white font-medium text-lg">
            Wire Transfer Verified
          </p>
          <p className="text-gray-400 text-sm mt-1">
            Your payment has been confirmed by the fund administrator.
          </p>
        </div>
        <div className="flex justify-center">
          <Button
            className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
            onClick={onComplete}
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }

  // Upload success / proof under review
  if (uploadSuccess || proofStatus === "RECEIVED") {
    return (
      <div className="space-y-6">
        <div className="text-center py-6">
          <Clock className="h-16 w-16 text-blue-500 mx-auto mb-4" />
          <p className="text-white font-medium text-lg">
            Proof Submitted
          </p>
          <p className="text-gray-400 text-sm mt-2">
            {proofFileName && (
              <>
                Uploaded: <span className="text-white">{proofFileName}</span>
                <br />
              </>
            )}
            Your proof of payment is under review. The fund administrator will
            confirm receipt of your wire transfer.
          </p>
        </div>

        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-blue-400 text-sm">
            Processing typically takes 1-3 business days. You&apos;ll receive an
            email confirmation once your wire has been verified.
          </p>
        </div>

        <div className="flex justify-center">
          <Button
            className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
            onClick={onComplete}
          >
            Continue to Next Step
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section A: Wire Transfer Instructions */}
      {wireInstructions ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Banknote className="h-5 w-5 text-emerald-400" />
            <h3 className="text-white font-medium">Wire Transfer Instructions</h3>
          </div>

          {commitmentAmount && commitmentAmount > 0 && (
            <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-lg p-3">
              <p className="text-gray-400 text-xs uppercase tracking-wider">
                Amount Due
              </p>
              <p className="text-emerald-400 text-xl font-bold font-mono">
                {formatCurrency(commitmentAmount)}
              </p>
            </div>
          )}

          {/* Wire detail rows with individual copy buttons */}
          <div className="space-y-2">
            {[
              {
                label: "Bank Name",
                value: wireInstructions.bankName,
                key: "bank",
              },
              wireInstructions.accountName
                ? {
                    label: "Account Name",
                    value: wireInstructions.accountName,
                    key: "acctname",
                  }
                : null,
              {
                label: "Account Number",
                value: wireInstructions.accountNumber,
                key: "acctnum",
              },
              {
                label: "Routing Number",
                value: wireInstructions.routingNumber,
                key: "routing",
              },
              wireInstructions.swiftCode
                ? {
                    label: "SWIFT/BIC",
                    value: wireInstructions.swiftCode,
                    key: "swift",
                  }
                : null,
              {
                label: "Reference/Memo",
                value: wireInstructions.reference || autoReference,
                key: "ref",
              },
            ]
              .filter(Boolean)
              .map((field) => (
                <div
                  key={field!.key}
                  className="flex items-center justify-between gap-2 p-3 bg-gray-700/30 rounded-lg"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-gray-400 text-xs uppercase tracking-wider">
                      {field!.label}
                    </p>
                    <p className="text-white font-mono text-sm mt-0.5 break-all">
                      {field!.value}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(field!.value, field!.key)
                    }
                    className="text-gray-400 hover:text-white min-h-[44px] min-w-[44px] p-2 flex-shrink-0"
                  >
                    {copied === field!.key ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <Copy className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              ))}
          </div>

          {/* Copy All to Clipboard */}
          <Button
            variant="outline"
            size="sm"
            className="w-full min-h-[44px] border-gray-600 text-gray-300 hover:text-white hover:bg-gray-700/50"
            onClick={copyAllToClipboard}
          >
            {copied === "all" ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500" />
                Copied!
              </>
            ) : (
              <>
                <ClipboardCopy className="h-4 w-4 mr-2" />
                Copy All to Clipboard
              </>
            )}
          </Button>

          <div className="flex justify-end">
            <EncryptionBadge label="Banking details encrypted at rest" className="text-gray-400 dark:text-gray-500" />
          </div>

          {wireInstructions.notes && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-amber-400 text-sm">
                {wireInstructions.notes}
              </p>
            </div>
          )}

          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-blue-400 text-sm">
              Please initiate this wire from your bank. Processing typically
              takes 1-3 business days.
            </p>
          </div>

          {/* ACH Coming Soon */}
          <div className="p-3 bg-gray-700/20 border border-gray-600/30 rounded-lg opacity-70">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
              <p className="text-gray-400 text-sm">
                <span className="font-medium text-gray-300">ACH Payment coming soon</span>
                {" "}— for now, please follow the wire instructions above.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <Banknote className="h-10 w-10 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            Wire instructions have not been configured yet. Please contact your
            fund administrator for payment details.
          </p>
        </div>
      )}

      {/* Section B: Upload Wire Confirmation */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-emerald-400" />
          <h3 className="text-white font-medium">
            Upload Wire Confirmation
          </h3>
        </div>

        <p className="text-gray-400 text-sm">
          Upload proof of your wire transfer (screenshot, PDF, or bank
          confirmation).
        </p>

        {/* Optional metadata fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-gray-300 text-sm flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Amount Sent
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder={
                commitmentAmount
                  ? commitmentAmount.toLocaleString()
                  : "0.00"
              }
              value={amountSent}
              onChange={(e) => setAmountSent(e.target.value)}
              className="bg-gray-700/50 border-gray-600 text-white mt-1 text-base sm:text-sm"
            />
          </div>
          <div>
            <Label className="text-gray-300 text-sm flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Wire Date Initiated
            </Label>
            <Input
              type="date"
              value={wireDateInitiated}
              onChange={(e) => setWireDateInitiated(e.target.value)}
              className="bg-gray-700/50 border-gray-600 text-white mt-1 text-base sm:text-sm"
            />
          </div>
        </div>

        <div>
          <Label className="text-gray-300 text-sm flex items-center gap-1">
            <Hash className="h-3 w-3" />
            Bank Reference Number
          </Label>
          <Input
            placeholder="e.g., FWT-20260210-001234"
            value={bankReference}
            onChange={(e) => setBankReference(e.target.value)}
            className="bg-gray-700/50 border-gray-600 text-white mt-1 text-base sm:text-sm"
          />
        </div>

        <div>
          <Label className="text-gray-300 text-sm">Notes (optional)</Label>
          <Textarea
            placeholder="e.g., Wire sent from Chase account ending in 1234"
            value={proofNotes}
            onChange={(e) => setProofNotes(e.target.value)}
            className="bg-gray-700/50 border-gray-600 text-white mt-1 text-base sm:text-sm"
            rows={2}
          />
        </div>

        {/* Drag-drop upload zone */}
        <div
          className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-emerald-500/50 active:border-emerald-500/70 transition-colors min-h-[100px]"
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ")
              fileInputRef.current?.click();
          }}
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-2" />
          ) : (
            <Upload className="h-8 w-8 text-gray-500 mx-auto mb-2" />
          )}
          <p className="text-gray-300 text-sm font-medium">
            {uploading
              ? "Uploading..."
              : "Tap to upload proof of payment"}
          </p>
          <p className="text-gray-500 text-xs mt-1">
            PDF, PNG, or JPEG — max 10MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.png,.jpg,.jpeg"
            capture="environment"
            onChange={handleFileSelect}
            disabled={uploading}
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {proofStatus === "REJECTED" && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">
              Your previous proof was rejected. Please upload a new document.
            </p>
          </div>
        )}
      </div>

      {/* Section C: Pay Later / Contact GP */}
      {!showPayLater && !payLaterCreated && (
        <div className="text-center pt-2">
          <button
            type="button"
            className="text-gray-400 hover:text-white text-sm underline underline-offset-4"
            onClick={() => setShowPayLater(true)}
          >
            Pay Later / Contact GP
          </button>
        </div>
      )}

      {showPayLater && !payLaterCreated && (
        <Card className="bg-gray-700/30 border-gray-600">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">
              Contact Fund Administrator
            </CardTitle>
            <CardDescription className="text-gray-400">
              Contact the fund administrator for alternative payment
              arrangements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-gray-300 text-sm">
              <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <span>Check your email for contact information from the fund.</span>
            </div>
            <div className="flex items-center gap-2 text-gray-300 text-sm">
              <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <span>
                Your fund administrator will follow up with payment
                instructions.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px] border-gray-600 text-gray-300 hover:text-white w-full"
              onClick={handlePayLater}
            >
              I&apos;ll Pay Later — Continue Onboarding
            </Button>
          </CardContent>
        </Card>
      )}

      {payLaterCreated && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-center">
          <p className="text-blue-400 text-sm">
            No problem! You can complete the wire transfer later from your LP
            dashboard.
          </p>
        </div>
      )}

      {/* ACH / Direct Debit — Phase 2 Coming Soon */}
      <div className="rounded-lg border border-gray-700/50 bg-gray-800/30 p-4 opacity-60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gray-700/50 flex items-center justify-center">
              <CreditCard className="h-4 w-4 text-gray-500" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-400">ACH / Direct Debit</p>
              <p className="text-xs text-gray-500">Pay directly from your bank account</p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
            Coming Soon
          </Badge>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          className="min-h-[44px] text-gray-400 hover:text-white"
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          type="button"
          className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
          onClick={onComplete}
          disabled={uploading}
        >
          {uploadSuccess || proofStatus === "RECEIVED"
            ? "Continue"
            : payLaterCreated
              ? "Continue Without Proof"
              : "Skip for Now — I'll Upload Later"}
        </Button>
      </div>
    </div>
  );
}
