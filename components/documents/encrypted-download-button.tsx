/**
 * Encrypted Document Download Button
 * 
 * A button component that handles downloading and decrypting
 * client-side encrypted documents.
 * 
 * ## Features
 * - Shows download progress
 * - Handles decryption in the browser
 * - Prompts for encryption key if not provided
 * - Displays error messages
 * 
 * @example
 * ```tsx
 * <EncryptedDownloadButton
 *   documentId="doc123"
 *   downloadUrl="/api/download/doc123"
 *   encryptionIv="base64iv..."
 *   originalFileName="contract.pdf"
 *   disabled={false}
 * />
 * ```
 */

"use client";

import { useState } from "react";
import { Download, Loader2, Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useEncryptedDownload } from "@/lib/hooks/use-encrypted-download";
import { toast } from "sonner";

interface EncryptedDownloadButtonProps {
  documentId: string;
  downloadUrl: string;
  encryptionIv: string;
  originalFileName: string;
  originalMimeType?: string;
  storedEncryptionKey?: string;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function EncryptedDownloadButton({
  documentId,
  downloadUrl,
  encryptionIv,
  originalFileName,
  originalMimeType,
  storedEncryptionKey,
  disabled = false,
  variant = "outline",
  size = "sm",
  className,
}: EncryptedDownloadButtonProps) {
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState(storedEncryptionKey || "");
  const { downloadAndDecrypt, isDownloading, progress, error, clearError } = useEncryptedDownload();

  const handleDownload = async () => {
    if (!encryptionKey) {
      setShowKeyDialog(true);
      return;
    }

    const success = await downloadAndDecrypt({
      downloadUrl,
      encryptionKey,
      iv: encryptionIv,
      originalFileName,
      originalMimeType,
    });

    if (success) {
      toast.success("Document downloaded and decrypted successfully");
    } else if (error) {
      toast.error(error);
    }
  };

  const handleKeySubmit = async () => {
    if (!encryptionKey.trim()) {
      toast.error("Please enter the encryption key");
      return;
    }

    setShowKeyDialog(false);
    
    const success = await downloadAndDecrypt({
      downloadUrl,
      encryptionKey: encryptionKey.trim(),
      iv: encryptionIv,
      originalFileName,
      originalMimeType,
    });

    if (success) {
      toast.success("Document downloaded and decrypted successfully");
    } else if (error) {
      toast.error(error);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleDownload}
        disabled={disabled || isDownloading}
        className={className}
      >
        {isDownloading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {progress > 0 && progress < 100 ? `${progress}%` : "Decrypting..."}
          </>
        ) : (
          <>
            <Lock className="mr-2 h-4 w-4" />
            <Download className="mr-2 h-4 w-4" />
            Download
          </>
        )}
      </Button>

      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Encrypted Document
            </DialogTitle>
            <DialogDescription>
              This document is encrypted. Enter the encryption key to download and decrypt it.
              The key was provided when the document was uploaded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="encryptionKey">Encryption Key</Label>
              <Input
                id="encryptionKey"
                type="password"
                placeholder="Enter encryption key..."
                value={encryptionKey}
                onChange={(e) => setEncryptionKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleKeySubmit()}
              />
            </div>
            
            {isDownloading && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-muted-foreground text-center">
                  {progress < 70 ? "Downloading..." : progress < 95 ? "Decrypting..." : "Saving file..."}
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="rounded-md bg-muted p-3">
              <p className="text-xs text-muted-foreground">
                <strong>Security Note:</strong> Encryption keys are never sent to the server. 
                Decryption happens entirely in your browser. If you lose the key, the document 
                cannot be recovered.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKeyDialog(false)} disabled={isDownloading}>
              Cancel
            </Button>
            <Button onClick={handleKeySubmit} disabled={isDownloading || !encryptionKey.trim()}>
              {isDownloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
