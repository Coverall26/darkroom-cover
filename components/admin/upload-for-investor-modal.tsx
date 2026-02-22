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
} from "lucide-react";

const DOCUMENT_TYPES = [
  { value: "SUBSCRIPTION_AGREEMENT", label: "Subscription Agreement" },
  { value: "LPA", label: "Limited Partnership Agreement (LPA)" },
  { value: "SIDE_LETTER", label: "Side Letter" },
  { value: "NDA", label: "NDA" },
  { value: "K1_TAX_FORM", label: "K-1 Tax Form" },
  { value: "PROOF_OF_FUNDS", label: "Proof of Funds" },
  { value: "WIRE_CONFIRMATION", label: "Wire Confirmation" },
  { value: "ACH_RECEIPT", label: "ACH Receipt" },
  { value: "ACCREDITATION_PROOF", label: "Accreditation Proof" },
  { value: "IDENTITY_DOCUMENT", label: "Identity Document" },
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

interface UploadForInvestorModalProps {
  isOpen: boolean;
  onClose: () => void;
  investorId: string;
  investorName: string;
  fundId: string;
  fundName: string;
  onSuccess?: () => void;
}

export function UploadForInvestorModal({
  isOpen,
  onClose,
  investorId,
  investorName,
  fundId,
  fundName,
  onSuccess,
}: UploadForInvestorModalProps) {
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setTitle("");
    setDocumentType("");
    setNotes("");
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

  const handleSubmit = async () => {
    if (!selectedFile || !title || !documentType) {
      setError("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const fileData = await fileToBase64(selectedFile);

      const response = await fetch("/api/admin/documents/upload-for-investor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investorId,
          title,
          documentType,
          fundId,
          notes: notes || undefined,
          fileData,
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to upload document");
      }

      setSuccess(true);
      setTimeout(() => {
        handleClose();
        onSuccess?.();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to upload document");
    } finally {
      setIsSubmitting(false);
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Document for Investor
          </DialogTitle>
          <DialogDescription>
            Upload a document on behalf of {investorName} for {fundName}.
            This document will be auto-approved.
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
            <div className="space-y-2">
              <Label htmlFor="file">Document File *</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={handleFileSelect}
                className="hidden"
              />
              {selectedFile ? (
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                  <FileText className="h-8 w-8 text-blue-500" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full h-24 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Click to select a file (PDF, Word, or Image up to 25MB)
                    </span>
                  </div>
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="documentType">Document Type *</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Document Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a title for this document"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal notes about this document..."
                rows={3}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          {!success && (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedFile || !title || !documentType}
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
