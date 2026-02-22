"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Loader2,
  AlertCircle,
  FileText,
} from "lucide-react";

interface TemplatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  templateId: string | null;
  templateName: string;
}

export function TemplatePreviewModal({
  isOpen,
  onClose,
  orgId,
  templateId,
  templateName,
}: TemplatePreviewModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [zoom, setZoom] = useState(100);

  const fetchPreview = useCallback(async () => {
    if (!templateId || !isOpen) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/org/${orgId}/document-templates/${templateId}/preview`,
      );

      if (!response.ok) {
        throw new Error("Failed to load preview");
      }

      const data = await response.json();
      setPreviewUrl(data.previewUrl);
      setTotalPages(data.numPages || null);
    } catch {
      setError("Failed to load document preview");
    } finally {
      setLoading(false);
    }
  }, [templateId, orgId, isOpen]);

  useEffect(() => {
    if (isOpen && templateId) {
      setCurrentPage(1);
      setZoom(100);
      fetchPreview();
    } else {
      setPreviewUrl(null);
      setError(null);
    }
  }, [isOpen, templateId, fetchPreview]);

  const handleZoomIn = () => setZoom((z: number) => Math.min(z + 25, 200));
  const handleZoomOut = () => setZoom((z: number) => Math.max(z - 25, 50));

  const handlePrevPage = () =>
    setCurrentPage((p: number) => Math.max(p - 1, 1));
  const handleNextPage = () =>
    setCurrentPage((p: number) =>
      totalPages ? Math.min(p + 1, totalPages) : p,
    );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="h-[90vh] w-[90%] max-w-4xl rounded-lg bg-gray-900 p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-white truncate">
              {templateName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom controls */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= 50}
              className="h-8 w-8 text-gray-300 hover:text-white hover:bg-gray-700 min-h-[44px] min-w-[44px]"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-gray-400 w-12 text-center">
              {zoom}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= 200}
              className="h-8 w-8 text-gray-300 hover:text-white hover:bg-gray-700 min-h-[44px] min-w-[44px]"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>

            {/* Page navigation */}
            {totalPages && totalPages > 1 && (
              <>
                <div className="w-px h-4 bg-gray-600 mx-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={currentPage <= 1}
                  className="h-8 w-8 text-gray-300 hover:text-white hover:bg-gray-700 min-h-[44px] min-w-[44px]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages}
                  className="h-8 w-8 text-gray-300 hover:text-white hover:bg-gray-700 min-h-[44px] min-w-[44px]"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}

            {/* Close button */}
            <div className="w-px h-4 bg-gray-600 mx-1" />
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 text-gray-300 hover:text-white hover:bg-gray-700 min-h-[44px] min-w-[44px]"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400" />
                <p className="mt-2 text-sm text-gray-400">
                  Loading preview...
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
                <p className="mt-2 text-sm text-red-400">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchPreview}
                  className="mt-3"
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {previewUrl && !loading && !error && (
            <div
              className="flex justify-center"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
            >
              {previewUrl.endsWith(".pdf") ||
              previewUrl.includes("application/pdf") ||
              previewUrl.includes(".pdf") ? (
                <iframe
                  src={`${previewUrl}#page=${currentPage}`}
                  className="w-full bg-white rounded shadow-lg"
                  style={{
                    height: "calc(90vh - 80px)",
                    maxWidth: "800px",
                  }}
                  title={`Preview: ${templateName}`}
                />
              ) : (
                <iframe
                  src={previewUrl}
                  className="w-full bg-white rounded shadow-lg"
                  style={{
                    height: "calc(90vh - 80px)",
                    maxWidth: "800px",
                  }}
                  title={`Preview: ${templateName}`}
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
