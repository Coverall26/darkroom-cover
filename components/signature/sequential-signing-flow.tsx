"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileTextIcon,
  Loader2Icon,
  PenIcon,
  ClockIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  PDFSignatureViewer,
  type SignatureFieldInfo,
} from "@/components/signature/pdf-signature-viewer";
import {
  ESIGN_CONSENT_TEXT,
} from "@/lib/signature/checksum";

interface SigningDocument {
  id: string;
  title: string;
  description: string | null;
  documentStatus: string;
  recipientId: string;
  recipientStatus: string;
  signingToken: string | null;
  signingUrl: string | null;
  signedAt: string | null;
  numPages: number | null;
  completedAt: string | null;
}

interface SigningProgress {
  total: number;
  signed: number;
  complete: boolean;
}

interface SequentialSigningFlowProps {
  onComplete: () => void;
  onProgress?: (progress: SigningProgress) => void;
  fundId?: string;
}

type FlowState =
  | "loading"
  | "no-documents"
  | "document-list"
  | "signing"
  | "complete";

export function SequentialSigningFlow({
  onComplete,
  onProgress,
  fundId,
}: SequentialSigningFlowProps) {
  const [flowState, setFlowState] = useState<FlowState>("loading");
  const [documents, setDocuments] = useState<SigningDocument[]>([]);
  const [progress, setProgress] = useState<SigningProgress>({
    total: 0,
    signed: 0,
    complete: false,
  });
  const [activeDocument, setActiveDocument] = useState<SigningDocument | null>(null);
  const [signingData, setSigningData] = useState<{
    fileUrl: string | null;
    fields: SignatureFieldInfo[];
    recipientName: string;
    recipientEmail: string;
  } | null>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signingLoading, setSigningLoading] = useState(false);
  const hasLoadedRef = useRef(false);

  const fetchDocuments = useCallback(async () => {
    try {
      const url = fundId
        ? `/api/lp/signing-documents?fundId=${encodeURIComponent(fundId)}`
        : "/api/lp/signing-documents";
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          setFlowState("no-documents");
          return;
        }
        throw new Error("Failed to fetch documents");
      }

      const data = await response.json();
      setDocuments(data.documents);
      setProgress(data.progress);
      onProgress?.(data.progress);

      if (data.progress.complete) {
        setFlowState("complete");
      } else if (data.documents.length === 0) {
        setFlowState("no-documents");
      } else {
        setFlowState("document-list");
      }
    } catch (error) {
      console.error("Failed to fetch signing documents:", error);
      setFlowState("no-documents");
    }
  }, [onProgress, fundId]);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      fetchDocuments();
    }
  }, [fetchDocuments]);

  const openDocument = async (doc: SigningDocument) => {
    if (!doc.signingToken) {
      toast.error("No signing link available for this document");
      return;
    }

    setSigningLoading(true);
    setActiveDocument(doc);

    try {
      const response = await fetch(`/api/sign/${doc.signingToken}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error("This signing link has expired or is no longer valid. Please contact your fund manager to resend.");
        }
        if (response.status === 402) {
          throw new Error("This fund is not yet accepting signatures. Please contact your fund manager.");
        }
        throw new Error(data.error || data.message || "Failed to load document");
      }

      const data = await response.json();
      setSigningData({
        fileUrl: data.document.fileUrl,
        fields: data.fields,
        recipientName: data.recipient.name,
        recipientEmail: data.recipient.email,
      });

      // Pre-fill auto-fill fields
      const initialValues: Record<string, string> = {};
      data.fields.forEach((field: SignatureFieldInfo) => {
        if (field.type === "NAME") {
          initialValues[field.id] = data.recipient.name;
        } else if (field.type === "EMAIL") {
          initialValues[field.id] = data.recipient.email;
        } else if (field.type === "DATE_SIGNED") {
          initialValues[field.id] = new Date().toLocaleDateString();
        } else if (field.value) {
          initialValues[field.id] = field.value;
        }
      });
      setFieldValues(initialValues);
      setSignatureData(null);
      setConsentConfirmed(false);

      setFlowState("signing");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load document",
      );
      setActiveDocument(null);
    } finally {
      setSigningLoading(false);
    }
  };

  const handleSubmitSignature = async () => {
    if (!activeDocument?.signingToken || !signingData) return;

    // Validate required signature fields
    const signatureFields = signingData.fields.filter(
      (f) => f.type === "SIGNATURE",
    );
    if (signatureFields.length > 0 && !signatureData) {
      toast.error("Please provide your signature before submitting");
      return;
    }

    // Validate required non-signature fields
    const requiredFields = signingData.fields.filter(
      (f) => f.required && f.type !== "SIGNATURE" && f.type !== "CHECKBOX",
    );
    for (const field of requiredFields) {
      if (!fieldValues[field.id]) {
        toast.error("Please fill in all required fields");
        return;
      }
    }

    if (!consentConfirmed) {
      toast.error(
        "You must consent to electronic signatures before signing",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const fieldData = signingData.fields.map((f) => ({
        id: f.id,
        value:
          f.type === "SIGNATURE" ? signatureData : fieldValues[f.id] || null,
      }));

      const response = await fetch(
        `/api/sign/${activeDocument.signingToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: fieldData,
            signatureImage: signatureData,
            consentConfirmed: true,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || data.message || "Failed to submit signature");
      }

      toast.success(`${activeDocument.title} signed successfully!`);

      // Reset state and refresh documents
      setActiveDocument(null);
      setSigningData(null);
      setSignatureData(null);
      setFieldValues({});
      setConsentConfirmed(false);

      // Refresh the document list
      await fetchDocuments();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit signature",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToList = () => {
    setFlowState("document-list");
    setActiveDocument(null);
    setSigningData(null);
    setSignatureData(null);
    setFieldValues({});
    setConsentConfirmed(false);
  };

  // Loading state
  if (flowState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2Icon className="h-8 w-8 animate-spin text-gray-400 mb-3" />
        <p className="text-sm text-gray-500">Loading documents...</p>
      </div>
    );
  }

  // No documents state
  if (flowState === "no-documents") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <FileTextIcon className="h-12 w-12 text-gray-300 mb-3" />
        <h3 className="text-lg font-medium text-gray-700 mb-1">
          No Documents to Sign
        </h3>
        <p className="text-sm text-gray-500 text-center max-w-md">
          There are no documents requiring your signature at this time.
          Your fund manager will send documents when they&apos;re ready.
        </p>
        <Button
          variant="outline"
          className="mt-4 min-h-[44px]"
          onClick={onComplete}
        >
          Continue
          <ArrowRightIcon className="h-4 w-4 ml-2" />
        </Button>
      </div>
    );
  }

  // Complete state
  if (flowState === "complete") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          All Documents Signed
        </h3>
        <p className="text-sm text-gray-500 text-center max-w-md mb-6">
          You have signed all {progress.total} required document
          {progress.total !== 1 ? "s" : ""}. Copies have been sent to your
          email.
        </p>
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <ShieldCheckIcon className="h-4 w-4" />
          <span>Securely signed and recorded</span>
        </div>
        <Button onClick={onComplete} className="min-h-[44px]">
          Continue
          <ArrowRightIcon className="h-4 w-4 ml-2" />
        </Button>
      </div>
    );
  }

  // Signing a specific document
  if (flowState === "signing" && activeDocument && signingData) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-white px-3 sm:px-4 py-3 gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">
              {activeDocument.title}
            </h3>
            <p className="text-xs text-gray-500">
              Document {documents.findIndex((d) => d.id === activeDocument.id) + 1} of{" "}
              {documents.length}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleBackToList} className="min-h-[44px] flex-shrink-0">
            Back
          </Button>
        </div>

        {/* PDF Viewer with overlays */}
        <div className="flex-1 min-h-[400px]">
          {signingData.fileUrl ? (
            <PDFSignatureViewer
              fileUrl={signingData.fileUrl}
              fields={signingData.fields}
              signatureData={signatureData}
              onSignatureCapture={(data) => setSignatureData(data)}
              onFieldValueChange={(fieldId, value) =>
                setFieldValues((prev) => ({ ...prev, [fieldId]: value }))
              }
              fieldValues={fieldValues}
              recipientName={signingData.recipientName}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              Document preview not available
            </div>
          )}
        </div>

        {/* Consent + Submit */}
        <div className="border-t bg-gray-50 px-4 py-4">
          <div className="flex items-start gap-3 mb-4 min-h-[44px]">
            <Checkbox
              id="esign-consent"
              checked={consentConfirmed}
              onCheckedChange={(checked) =>
                setConsentConfirmed(checked === true)
              }
              className="mt-0.5 h-5 w-5"
            />
            <Label
              htmlFor="esign-consent"
              className="text-xs text-gray-600 leading-relaxed cursor-pointer"
            >
              {ESIGN_CONSENT_TEXT}
            </Label>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleBackToList}
              className="flex-1 min-h-[44px]"
            >
              Back
            </Button>
            <Button
              onClick={handleSubmitSignature}
              disabled={isSubmitting || !consentConfirmed}
              className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                  Signing...
                </>
              ) : (
                <>
                  <PenIcon className="h-4 w-4 mr-2" />
                  Sign Document
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Document list state
  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Documents to Sign
          </h3>
          <p className="text-sm text-gray-500">
            Sign each document in order to complete your onboarding.
          </p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-emerald-600">
            {progress.signed}
          </span>
          <span className="text-gray-400">/{progress.total}</span>
          <p className="text-xs text-gray-500">signed</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
          style={{
            width: `${progress.total > 0 ? (progress.signed / progress.total) * 100 : 0}%`,
          }}
        />
      </div>

      {/* Document list */}
      <div className="space-y-3">
        {documents.map((doc, index) => {
          const isSigned = doc.recipientStatus === "SIGNED";
          const isDeclined = doc.recipientStatus === "DECLINED";
          const isAvailable =
            !isSigned &&
            !isDeclined &&
            (index === 0 ||
              documents[index - 1]?.recipientStatus === "SIGNED");
          const isLocked = !isSigned && !isDeclined && !isAvailable;

          return (
            <div
              key={doc.id}
              className={`rounded-lg border p-4 min-h-[56px] transition-colors ${
                isSigned
                  ? "border-green-200 bg-green-50"
                  : isDeclined
                    ? "border-red-200 bg-red-50"
                    : isAvailable
                      ? "border-blue-200 bg-blue-50 cursor-pointer hover:border-blue-400 active:bg-blue-100"
                      : "border-gray-200 bg-gray-50 opacity-60"
              }`}
              onClick={() => isAvailable && openDocument(doc)}
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {isSigned ? (
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  ) : isDeclined ? (
                    <XCircleIcon className="h-6 w-6 text-red-600" />
                  ) : isAvailable ? (
                    <PenIcon className="h-6 w-6 text-blue-600" />
                  ) : (
                    <ClockIcon className="h-6 w-6 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4
                    className={`font-medium text-sm ${
                      isSigned
                        ? "text-green-800"
                        : isDeclined
                          ? "text-red-800"
                          : isAvailable
                            ? "text-blue-900"
                            : "text-gray-600"
                    }`}
                  >
                    {index + 1}. {doc.title}
                  </h4>
                  <p className="text-xs text-gray-500 truncate">
                    {isSigned && doc.signedAt
                      ? `Signed on ${new Date(doc.signedAt).toLocaleDateString()}`
                      : isDeclined
                        ? "Declined"
                        : isAvailable
                          ? "Ready to sign"
                          : "Sign previous document first"}
                  </p>
                </div>
                {isAvailable && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={signingLoading}
                    className="min-h-[44px] min-w-[60px]"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDocument(doc);
                    }}
                  >
                    {signingLoading && activeDocument?.id === doc.id ? (
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Sign
                        <ArrowRightIcon className="h-3 w-3 ml-1" />
                      </>
                    )}
                  </Button>
                )}
                {isSigned && (
                  <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
                    Signed
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Skip option if no documents */}
      {documents.length === 0 && (
        <Button onClick={onComplete} variant="outline" className="w-full min-h-[44px]">
          Skip — No Documents Available
        </Button>
      )}
    </div>
  );
}
