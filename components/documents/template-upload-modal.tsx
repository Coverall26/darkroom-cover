"use client";

import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { putFile } from "@/lib/files/put-file";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

interface TemplateUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  teamId: string;
  documentType: string;
  documentLabel: string;
  fundId?: string;
  onSuccess: () => void;
}

export function TemplateUploadModal({
  isOpen,
  onClose,
  orgId,
  teamId,
  documentType,
  documentLabel,
  fundId,
  onSuccess,
}: TemplateUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setIsUploading(false);
    setUploadProgress(0);
    setDragActive(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (isUploading) return;
    resetState();
    onClose();
  }, [isUploading, resetState, onClose]);

  const validateFile = useCallback((file: File): string | null => {
    // Check type
    const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (
      !ACCEPTED_TYPES.includes(file.type) &&
      !ACCEPTED_EXTENSIONS.includes(extension)
    ) {
      return "Only PDF and DOCX files are accepted";
    }
    // Check size
    if (file.size > MAX_FILE_SIZE) {
      return `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds 25MB limit`;
    }
    return null;
  }, []);

  const handleFileSelect = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      setSelectedFile(file);
    },
    [validateFile],
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect],
  );

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(10);
    setError(null);

    try {
      // Upload file via putFile
      setUploadProgress(30);
      const uploadResult = await putFile({
        file: selectedFile,
        teamId,
      });
      setUploadProgress(70);

      // Save template metadata via API
      const response = await fetch(
        `/api/org/${orgId}/document-templates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentType,
            fileName: selectedFile.name,
            storageKey: uploadResult.data,
            storageType: uploadResult.type,
            numPages: uploadResult.numPages || null,
            fileSize: selectedFile.size,
            fundId: fundId || null,
          }),
        },
      );

      setUploadProgress(90);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      setUploadProgress(100);
      toast.success(`${documentLabel} template uploaded successfully`);

      // Short delay to show 100% before closing
      setTimeout(() => {
        resetState();
        onClose();
        onSuccess();
      }, 500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to upload template",
      );
      setUploadProgress(0);
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Custom Template</DialogTitle>
          <DialogDescription>
            Upload a custom {documentLabel} template. Accepted formats: PDF,
            DOCX. Maximum size: 25MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Drop zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8
              transition-colors cursor-pointer min-h-[160px]
              ${
                dragActive
                  ? "border-[#0066FF] bg-blue-50"
                  : selectedFile
                    ? "border-green-300 bg-green-50"
                    : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
              }
              ${isUploading ? "pointer-events-none opacity-60" : ""}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleInputChange}
              className="hidden"
              disabled={isUploading}
            />

            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <div className="text-center">
                  <p className="font-medium text-sm text-green-800">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-green-600">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                {!isUploading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="min-h-[44px]"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-gray-400" />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">
                    Drag and drop your file here
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    or click to browse
                  </p>
                </div>
                <div className="flex gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    <FileText className="h-3 w-3" />
                    PDF
                  </span>
                  <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    <FileText className="h-3 w-3" />
                    DOCX
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Upload progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Uploading...</span>
                <span className="font-medium">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
              <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="min-h-[44px]"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Template
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
