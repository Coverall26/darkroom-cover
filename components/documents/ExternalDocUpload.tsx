"use client";

import { useState, useRef } from "react";
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
  ChevronDown,
  ChevronUp,
  X,
  Clock,
} from "lucide-react";

const DOCUMENT_TYPES = [
  { value: "NDA", label: "NDA" },
  { value: "SUBSCRIPTION_AGREEMENT", label: "Subscription Agreement / SAFE / SPA" },
  { value: "LPA", label: "Limited Partnership Agreement (LPA)" },
  { value: "SIDE_LETTER", label: "Side Letter" },
  { value: "OTHER", label: "Other" },
] as const;

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_TYPES = [
  "application/pdf",
];

interface ExternalDocUploadProps {
  fundId: string;
  investmentId?: string;
  onUploadComplete?: () => void;
}

/**
 * ExternalDocUpload — Expandable inline section for LP onboarding Step 5.
 * Allows LPs to upload documents that were signed outside the platform.
 */
export function ExternalDocUpload({
  fundId,
  investmentId,
  onUploadComplete,
}: ExternalDocUploadProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [documentType, setDocumentType] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dateSigned, setDateSigned] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setDocumentType("");
    setSelectedFile(null);
    setDateSigned("");
    setNotes("");
    setError(null);
    setSuccess(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError("File size must be less than 25MB");
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only PDF files are accepted for externally signed documents");
      return;
    }

    setError(null);
    setSelectedFile(file);
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
      setError("Only PDF files are accepted for externally signed documents");
      return;
    }

    setError(null);
    setSelectedFile(file);
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
    if (!selectedFile || !documentType) {
      setError("Please select a file and document type");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const fileData = await fileToBase64(selectedFile);
      const title = selectedFile.name.replace(/\.[^/.]+$/, "");

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          documentType,
          fundId,
          uploadSource: "LP_UPLOADED_EXTERNAL",
          lpNotes: notes || undefined,
          isOfflineSigned: true,
          externalSigningDate: dateSigned || undefined,
          investmentId,
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
      onUploadComplete?.();

      // Reset after a delay
      setTimeout(() => {
        resetForm();
        setSuccess(false);
      }, 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border rounded-lg bg-muted/30">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors rounded-lg min-h-[44px]"
      >
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Already signed documents outside the platform? Upload them here.
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t">
          {success ? (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="text-sm font-medium text-center">
                Document uploaded. Pending GP review.
              </p>
              <p className="text-xs text-muted-foreground text-center">
                You can track the status in your document vault.
              </p>
            </div>
          ) : (
            <>
              {/* Document type selector */}
              <div className="space-y-2 pt-4">
                <Label htmlFor="ext-doc-type">Document Type *</Label>
                <Select value={documentType} onValueChange={setDocumentType}>
                  <SelectTrigger className="min-h-[44px] text-base sm:text-sm">
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

              {/* Drag-drop upload zone */}
              <div className="space-y-2">
                <Label>Upload PDF *</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {selectedFile ? (
                  <div className="flex items-center gap-3 p-3 border rounded-lg bg-background">
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
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground text-center">
                      Drag and drop your PDF here, or click to browse
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PDF only, up to 25MB
                    </span>
                  </div>
                )}
              </div>

              {/* Date signed */}
              <div className="space-y-2">
                <Label htmlFor="ext-date-signed" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Date Signed
                </Label>
                <Input
                  id="ext-date-signed"
                  type="date"
                  value={dateSigned}
                  onChange={(e) => setDateSigned(e.target.value)}
                  className="text-base sm:text-sm min-h-[44px]"
                  max={new Date().toISOString().split("T")[0]}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="ext-notes">Notes (Optional)</Label>
                <Textarea
                  id="ext-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="E.g., signed via DocuSign on 2/10/2026"
                  rows={2}
                  className="text-base sm:text-sm"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !selectedFile || !documentType}
                className="w-full min-h-[44px]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Document
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
