"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Banknote,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Loader2,
  FileText,
  ClipboardCopy,
  Calendar,
  DollarSign,
  Hash,
} from "lucide-react";
import { putFile } from "@/lib/files/put-file";
import { EncryptionBadge } from "@/components/ui/encryption-badge";

interface WireInstructions {
  bankName: string;
  accountName: string;
  routingNumber: string;
  accountNumber: string;
  swiftCode?: string;
  reference?: string;
  notes?: string;
}

interface FundWireData {
  fundId: string;
  fundName: string;
  investmentId: string;
  teamId: string;
  commitmentAmount: number;
  wireInstructions: WireInstructions | null;
  proofStatus: string;
  proofFileName?: string;
  proofUploadedAt?: string;
  investorName?: string;
}

export default function LPWireClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [wireData, setWireData] = useState<FundWireData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Proof metadata fields
  const [amountSent, setAmountSent] = useState("");
  const [wireDateInitiated, setWireDateInitiated] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [bankReference, setBankReference] = useState("");
  const [proofNotes, setProofNotes] = useState("");

  useEffect(() => {
    fetchWireData();
  }, []);

  async function fetchWireData() {
    try {
      const res = await fetch("/api/lp/wire-instructions");
      if (!res.ok) {
        if (res.status === 404) {
          setError("No active fund investment found. Please complete your subscription first.");
          setLoading(false);
          return;
        }
        throw new Error("Failed to load wire instructions");
      }
      const data = await res.json();
      setWireData(data);
      // Pre-fill amount sent with commitment amount
      if (data.commitmentAmount) {
        setAmountSent(String(data.commitmentAmount));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load wire instructions");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !wireData) return;

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
      // Step 1: Upload file to storage via presigned URL
      const uploadResult = await putFile({
        file,
        teamId: wireData.teamId,
      });

      if (!uploadResult.type || !uploadResult.data) {
        throw new Error("File upload failed");
      }

      // Step 2: Submit proof metadata to server
      const res = await fetch("/api/lp/wire-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investmentId: wireData.investmentId,
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
      fetchWireData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function copyAllToClipboard() {
    if (!wireData?.wireInstructions) return;
    const wi = wireData.wireInstructions;
    const lines = [
      `Bank Name: ${wi.bankName}`,
      wi.accountName ? `Account Name: ${wi.accountName}` : null,
      `Routing Number: ${wi.routingNumber}`,
      `Account Number: ${wi.accountNumber}`,
      wi.swiftCode ? `SWIFT/BIC: ${wi.swiftCode}` : null,
      `Reference/Memo: ${wi.reference || autoReference}`,
      wi.notes ? `\nNotes: ${wi.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(lines).then(() => {
      setCopied("all");
      setTimeout(() => setCopied(null), 2000);
    });
  }

  // Auto-formatted reference: LP-[LastName]-[FundName]
  const autoReference = (() => {
    const name = wireData?.investorName || "";
    const lastName = name.split(" ").pop() || "Investor";
    const fund = wireData?.fundName || "Fund";
    return `LP-${lastName}-${fund}`;
  })();

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(value);
  }

  const proofStatusInfo: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
    NOT_REQUIRED: { label: "Not Required", color: "bg-gray-500", icon: Clock },
    PENDING: { label: "Awaiting Upload", color: "bg-yellow-500", icon: Clock },
    RECEIVED: { label: "Under Review", color: "bg-blue-500", icon: Clock },
    VERIFIED: { label: "Verified", color: "bg-emerald-500", icon: CheckCircle2 },
    REJECTED: { label: "Rejected", color: "bg-red-500", icon: AlertCircle },
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-8">
        <div className="max-w-[800px] mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-4 bg-gray-700/50 rounded w-32" />
            <div className="h-8 bg-gray-700/50 rounded w-64" />
            <div className="h-4 bg-gray-700/50 rounded w-48" />
            <div className="rounded-lg border border-gray-700 p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-4 bg-gray-700/50 rounded w-24" />
                  <div className="h-4 bg-gray-700/50 rounded w-40" />
                </div>
              ))}
            </div>
            <div className="h-32 bg-gray-700/50 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="max-w-[800px] mx-auto">
        <Link
          href="/lp/dashboard"
          className="inline-flex items-center text-sm text-gray-400 hover:text-white mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Dashboard
        </Link>

        <h1 className="text-2xl font-bold text-white mb-2">
          Wire Transfer Instructions
        </h1>
        <p className="text-gray-400 mb-8">
          Send your investment via wire transfer using the details below
        </p>

        {error && !wireData && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400">{error}</p>
              <Link href="/lp/dashboard">
                <Button className="mt-4" variant="outline">
                  Return to Dashboard
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {wireData && (
          <>
            {/* Fund Summary */}
            <Card className="bg-gray-800/50 border-gray-700 mb-6">
              <CardHeader>
                <CardTitle className="text-white text-lg">{wireData.fundName}</CardTitle>
                <CardDescription className="text-gray-400">
                  Your commitment: {formatCurrency(wireData.commitmentAmount)}
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Wire Instructions */}
            {wireData.wireInstructions ? (
              <Card className="bg-gray-800/50 border-gray-700 mb-6">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-emerald-500" />
                    <CardTitle className="text-white text-lg">
                      Wire Details
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: "Bank Name", value: wireData.wireInstructions.bankName, key: "bank" },
                    { label: "Account Name", value: wireData.wireInstructions.accountName, key: "account" },
                    { label: "Routing Number", value: wireData.wireInstructions.routingNumber, key: "routing" },
                    { label: "Account Number", value: wireData.wireInstructions.accountNumber, key: "acctnum" },
                    wireData.wireInstructions.swiftCode
                      ? { label: "SWIFT/BIC", value: wireData.wireInstructions.swiftCode, key: "swift" }
                      : null,
                    { label: "Reference / Memo", value: wireData.wireInstructions.reference || autoReference, key: "ref" },
                  ].filter((f): f is { label: string; value: string; key: string } => f != null && !!f.value).map((field) => (
                    <div
                      key={field.key}
                      className="flex items-center justify-between gap-2 p-3 bg-gray-700/30 rounded-lg"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-gray-400 text-xs uppercase tracking-wider">
                          {field.label}
                        </p>
                        <p className="text-white font-mono text-sm mt-0.5 break-all">
                          {field.value}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(field.value, field.key)}
                        aria-label={copied === field.key ? `${field.label} copied` : `Copy ${field.label} to clipboard`}
                        className="text-gray-400 hover:text-white min-h-[44px] min-w-[44px] p-2 flex-shrink-0"
                      >
                        {copied === field.key ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <Copy className="h-5 w-5" />
                        )}
                      </Button>
                    </div>
                  ))}

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

                  {wireData.wireInstructions.notes && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <p className="text-amber-400 text-sm">
                        {wireData.wireInstructions.notes}
                      </p>
                    </div>
                  )}

                  {/* Important notice */}
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                    <p className="text-blue-400 text-sm">
                      Please initiate this wire from your bank. Processing typically takes 1-3 business days.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-gray-800/50 border-gray-700 mb-6">
                <CardContent className="py-8 text-center">
                  <Banknote className="h-12 w-12 text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-400">
                    Wire instructions have not been set up yet. Please contact
                    your fund administrator.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Proof of Payment Upload */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-emerald-500" />
                    <CardTitle className="text-white text-lg">
                      Proof of Payment
                    </CardTitle>
                  </div>
                  {wireData.proofStatus && wireData.proofStatus !== "NOT_REQUIRED" && (
                    <Badge
                      className={`${proofStatusInfo[wireData.proofStatus]?.color || "bg-gray-500"} text-white`}
                    >
                      {proofStatusInfo[wireData.proofStatus]?.label || wireData.proofStatus}
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-gray-400">
                  Upload your wire transfer confirmation after sending
                </CardDescription>
              </CardHeader>
              <CardContent>
                {wireData.proofStatus === "VERIFIED" ? (
                  <div className="text-center py-6">
                    <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                    <p className="text-white font-medium">
                      Wire transfer verified
                    </p>
                    <p className="text-gray-400 text-sm mt-1">
                      Your payment has been confirmed by the fund administrator.
                    </p>
                  </div>
                ) : wireData.proofStatus === "RECEIVED" ? (
                  <div className="text-center py-6">
                    <Clock className="h-12 w-12 text-blue-500 mx-auto mb-3" />
                    <p className="text-white font-medium">Proof under review</p>
                    <p className="text-gray-400 text-sm mt-1">
                      {wireData.proofFileName && (
                        <>Uploaded: {wireData.proofFileName}<br /></>
                      )}
                      The fund administrator is reviewing your proof of payment.
                    </p>
                  </div>
                ) : uploadSuccess ? (
                  <div className="text-center py-6">
                    <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                    <p className="text-white font-medium">Upload successful</p>
                    <p className="text-gray-400 text-sm mt-1">
                      Your proof of payment has been submitted for review.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Wire proof metadata fields */}
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
                          placeholder="0.00"
                          value={amountSent}
                          onChange={(e) => setAmountSent(e.target.value)}
                          className="bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 mt-1 text-base sm:text-sm"
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
                        className="bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 mt-1 text-base sm:text-sm"
                      />
                    </div>

                    <div>
                      <Label className="text-gray-300 text-sm">
                        Notes (optional)
                      </Label>
                      <Textarea
                        placeholder="e.g., Wire sent from Chase account ending in 1234"
                        value={proofNotes}
                        onChange={(e) => setProofNotes(e.target.value)}
                        className="bg-gray-700/50 border-gray-600 text-white placeholder:text-gray-500 mt-1 text-base sm:text-sm"
                        rows={2}
                      />
                    </div>

                    <div
                      className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-emerald-500/50 active:border-emerald-500/70 transition-colors min-h-[100px]"
                      onClick={() => fileInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      aria-label="Upload proof of payment. Tap to take a photo or select a file."
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                    >
                      {uploading ? (
                        <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-3" />
                      ) : (
                        <Upload className="h-8 w-8 text-gray-500 mx-auto mb-3" />
                      )}
                      <p className="text-gray-300 text-sm font-medium">
                        {uploading
                          ? "Uploading..."
                          : "Tap to upload proof of payment"}
                      </p>
                      <p className="text-gray-500 text-xs mt-1">
                        Take a photo or select a file (PDF, PNG, JPEG — max 10MB)
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*,.pdf,.png,.jpg,.jpeg"
                        capture="environment"
                        onChange={handleUpload}
                        disabled={uploading}
                      />
                    </div>

                    {error && (
                      <p className="text-red-400 text-sm" role="alert">{error}</p>
                    )}

                    {wireData.proofStatus === "REJECTED" && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg" role="alert">
                        <p className="text-red-400 text-sm">
                          Your previous proof was rejected. Please upload a new
                          document.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
