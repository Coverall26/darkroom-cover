"use client";

import { useState, useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  FileText,
  AlertCircle,
  Loader2,
  CheckCircle2,
  X,
  ShieldCheck,
} from "lucide-react";

/**
 * Extended document types for GP uploads — includes all LP types
 * plus additional GP-specific types (formation docs, POA, trust, custodian).
 */
const GP_DOCUMENT_TYPES = [
  { value: "SUBSCRIPTION_AGREEMENT", label: "Subscription Agreement" },
  { value: "LPA", label: "Limited Partnership Agreement (LPA)" },
  { value: "SIDE_LETTER", label: "Side Letter" },
  { value: "NDA", label: "NDA" },
  { value: "K1_TAX_FORM", label: "K-1 Tax Form" },
  { value: "PROOF_OF_FUNDS", label: "Proof of Funds" },
  { value: "WIRE_CONFIRMATION", label: "Wire Proof" },
  { value: "ACH_RECEIPT", label: "ACH Receipt" },
  { value: "ACCREDITATION_PROOF", label: "Accreditation Letter" },
  { value: "IDENTITY_DOCUMENT", label: "Identity Document" },
  { value: "FORMATION_DOCS", label: "Formation Docs" },
  { value: "POWER_OF_ATTORNEY", label: "Power of Attorney" },
  { value: "TRUST_DOCUMENTS", label: "Trust Documents" },
  { value: "CUSTODIAN_DOCUMENTS", label: "Custodian Documents" },
  { value: "OTHER", label: "Other" },
] as const;

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

interface GPDocUploadProps {
  isOpen: boolean;
  onClose: () => void;
  investorId: string;
  investorName: string;
  fundId: string;
  fundName: string;
  onSuccess?: () => void;
}

/**
 * GPDocUpload — Modal for GPs to upload documents on behalf of an LP investor.
 * Includes confirmation checkbox, date signed, and extended document types.
 * Documents are auto-approved (gp_confirmation_status: NOT_REQUIRED).
 */
export function GPDocUpload({
  isOpen,
  onClose,
  investorId,
  investorName,
  fundId,
  fundName,
  onSuccess,
}: GPDocUploadProps) {
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<string>("");
  const [dateSigned, setDateSigned] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle("");
    setDocumentType("");
    setDateSigned("");
    setNotes("");
    setConfirmed(false);
    setSelectedFile(null);
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError("File size must be less than 25MB");
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only PDF, Word documents, and images are allowed");
      return;
    }

    setError(null);
    setSelectedFile(file);

    if (!title) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setTitle(nameWithoutExt);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError("File size must be less than 25MB");
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only PDF, Word documents, and images are allowed");
      return;
    }

    setError(null);
    setSelectedFile(file);

    if (!title) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setTitle(nameWithoutExt);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async () => {
    if (!selectedFile || !title || !documentType || !confirmed) {
      setError("Please fill all required fields and confirm document authenticity");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const fileData = await fileToBase64(selectedFile);

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investorId,
          title,
          documentType,
          fundId,
          uploadSource: "GP_UPLOADED_FOR_LP",
          notes: notes || undefined,
          externalSigningDate: dateSigned || undefined,
          fileData,
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setSuccess(true);
      setTimeout(() => {
        handleClose();
        onSuccess?.();
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Document for Investor
          </DialogTitle>
          <DialogDescription>
            Upload a document on behalf of <strong>{investorName}</strong> for{" "}
            <strong>{fundName}</strong>. This document will be auto-approved
            since you are uploading it as fund manager.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-medium text-center">
              Document uploaded and approved!
            </p>
            <p className="text-sm text-muted-foreground text-center">
              The document is now available in the investor&apos;s vault.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Document type */}
            <div className="space-y-2">
              <Label htmlFor="gp-doc-type">Document Type *</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger className="min-h-[44px] text-base sm:text-sm">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {GP_DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Drag-drop upload zone */}
            <div className="space-y-2">
              <Label>Document File *</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={handleFileSelect}
                className="hidden"
              />
              {selectedFile ? (
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                  <FileText className="h-8 w-8 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedFile(null)}
                    className="min-h-[44px] min-w-[44px]"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-[#0066FF] hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors"
                >
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground text-center">
                    Drag and drop file here, or click to browse
                  </span>
                  <span className="text-xs text-muted-foreground">
                    PDF, Word, or Image up to 25MB
                  </span>
                </div>
              )}
            </div>

            {/* Document title */}
            <div className="space-y-2">
              <Label htmlFor="gp-doc-title">Document Title *</Label>
              <Input
                id="gp-doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a title for this document"
                className="text-base sm:text-sm min-h-[44px]"
              />
            </div>

            {/* Date Signed */}
            <div className="space-y-2">
              <Label htmlFor="gp-date-signed">Date Signed</Label>
              <Input
                id="gp-date-signed"
                type="date"
                value={dateSigned}
                onChange={(e) => setDateSigned(e.target.value)}
                className="text-base sm:text-sm min-h-[44px]"
                max={new Date().toISOString().split("T")[0]}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="gp-doc-notes">Notes</Label>
              <Textarea
                id="gp-doc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes about this document..."
                rows={3}
                className="text-base sm:text-sm"
              />
            </div>

            {/* Confirmation checkbox */}
            <div className="flex items-start space-x-3 p-3 border rounded-lg bg-amber-50/50 dark:bg-amber-950/30 min-h-[44px]">
              <Checkbox
                id="gp-confirm"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked as boolean)}
                className="mt-0.5 h-5 w-5"
              />
              <Label
                htmlFor="gp-confirm"
                className="text-sm cursor-pointer leading-relaxed flex items-start gap-2"
              >
                <ShieldCheck className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>
                  I confirm this document is authentic and properly executed.
                </span>
              </Label>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          {!success && (
            <Button
              onClick={handleSubmit}
              disabled={
                isSubmitting ||
                !selectedFile ||
                !title ||
                !documentType ||
                !confirmed
              }
              className="min-h-[44px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload &amp; Approve
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
