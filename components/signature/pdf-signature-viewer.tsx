"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  CheckCircle2,
  PenIcon,
  Loader2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ZoomInIcon,
  ZoomOutIcon,
  AlertCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EnhancedSignaturePad, SignaturePadHandle } from "@/components/signature/enhanced-signature-pad";
import { SignatureThemeProvider } from "@/lib/signature/theme/context";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface SignatureFieldInfo {
  id: string;
  type: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  placeholder: string | null;
  value: string | null;
  recipientId?: string;
}

interface PDFSignatureViewerProps {
  fileUrl: string;
  fields: SignatureFieldInfo[];
  signatureData: string | null;
  onSignatureCapture: (signatureDataUrl: string) => void;
  onFieldValueChange: (fieldId: string, value: string) => void;
  fieldValues: Record<string, string>;
  recipientName?: string;
  readOnly?: boolean;
}

export function PDFSignatureViewer({
  fileUrl,
  fields,
  signatureData,
  onSignatureCapture,
  onFieldValueChange,
  fieldValues,
  recipientName,
  readOnly = false,
}: PDFSignatureViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [pdfLoading, setPdfLoading] = useState<boolean>(true);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const signaturePadRef = useRef<SignaturePadHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPdfLoading(false);
  }, []);

  const goToPrevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(numPages, prev + 1));
  }, [numPages]);

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(2.0, prev + 0.1));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(0.5, prev - 0.1));
  }, []);

  const handlePageRenderSuccess = useCallback((page: any) => {
    setPageSize({ width: page.width, height: page.height });
  }, []);

  const currentPageFields = fields.filter((f) => f.pageNumber === currentPage);

  const handleFieldClick = (field: SignatureFieldInfo) => {
    if (readOnly) return;
    if (field.type === "SIGNATURE" || field.type === "INITIALS") {
      setActiveFieldId(field.id);
      setShowSignatureModal(true);
    }
  };

  const handleSignatureConfirm = () => {
    if (!signaturePadRef.current || signaturePadRef.current.isEmpty()) return;
    const dataUrl = signaturePadRef.current.getSignatureDataUrl("png");
    if (dataUrl && activeFieldId) {
      onSignatureCapture(dataUrl);
      onFieldValueChange(activeFieldId, "signed");
    }
    setShowSignatureModal(false);
    setActiveFieldId(null);
  };

  const getFieldStyle = (field: SignatureFieldInfo): React.CSSProperties => {
    if (!pageSize) return { display: "none" };
    return {
      position: "absolute",
      left: `${field.x}%`,
      top: `${field.y}%`,
      width: `${field.width}%`,
      height: `${field.height}%`,
      zIndex: 10,
    };
  };

  const isFieldSigned = (field: SignatureFieldInfo): boolean => {
    if (field.type === "SIGNATURE" || field.type === "INITIALS") {
      return !!(signatureData && fieldValues[field.id]);
    }
    return !!fieldValues[field.id];
  };

  const getFieldContent = (field: SignatureFieldInfo) => {
    const signed = isFieldSigned(field);

    if (field.type === "SIGNATURE" || field.type === "INITIALS") {
      if (signed && signatureData) {
        return (
          <div className="relative w-full h-full flex items-center justify-center bg-white/90 rounded border border-green-300">
            <img
              src={signatureData}
              alt="Signature"
              className="max-w-full max-h-full object-contain p-0.5"
            />
            <CheckCircle2 className="absolute top-0.5 right-0.5 h-3 w-3 text-green-600" />
          </div>
        );
      }
      return (
        <div className="w-full h-full flex items-center justify-center bg-blue-50/80 border-2 border-dashed border-blue-400 rounded cursor-pointer hover:bg-blue-100/90 transition-colors group">
          <div className="flex flex-col items-center gap-0.5">
            <PenIcon className="h-4 w-4 text-blue-600 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] font-medium text-blue-700">
              {field.type === "INITIALS" ? "Initial here" : "Sign here"}
            </span>
          </div>
          {field.required && (
            <AlertCircleIcon className="absolute top-0.5 right-0.5 h-3 w-3 text-red-500" />
          )}
        </div>
      );
    }

    if (field.type === "DATE_SIGNED") {
      const dateValue = fieldValues[field.id] || new Date().toLocaleDateString();
      return (
        <div className="w-full h-full flex items-center px-1 bg-gray-50/80 border border-gray-300 rounded text-xs">
          {dateValue}
        </div>
      );
    }

    if (field.type === "NAME") {
      const nameValue = fieldValues[field.id] || recipientName || "";
      return (
        <div className="w-full h-full flex items-center px-1 bg-gray-50/80 border border-gray-300 rounded text-xs">
          {nameValue}
        </div>
      );
    }

    if (field.type === "CHECKBOX") {
      return (
        <div className="w-full h-full flex items-center justify-center min-h-[44px] min-w-[44px]">
          <input
            type="checkbox"
            checked={fieldValues[field.id] === "true"}
            onChange={(e) => {
              if (!readOnly) {
                onFieldValueChange(field.id, e.target.checked ? "true" : "");
              }
            }}
            className="h-5 w-5 rounded border-gray-400 cursor-pointer"
            disabled={readOnly}
          />
        </div>
      );
    }

    // TEXT, COMPANY, TITLE, ADDRESS, EMAIL fields
    return (
      <input
        type="text"
        value={fieldValues[field.id] || ""}
        onChange={(e) => {
          if (!readOnly) {
            onFieldValueChange(field.id, e.target.value);
          }
        }}
        placeholder={field.placeholder || field.type.toLowerCase().replace("_", " ")}
        className="w-full h-full px-1 text-base bg-white/90 border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        readOnly={readOnly}
      />
    );
  };

  // Count fields by completion status
  const totalRequired = fields.filter((f) => f.required).length;
  const completedRequired = fields.filter(
    (f) => f.required && isFieldSigned(f),
  ).length;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-gray-800 px-2 sm:px-4 py-2 rounded-t-lg gap-2">
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <span className="text-xs sm:text-sm text-gray-300 whitespace-nowrap">
            {currentPage}/{numPages}
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={zoomOut}
            className="rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-300 hover:bg-gray-700 active:bg-gray-600"
            aria-label="Zoom out"
          >
            <ZoomOutIcon className="h-5 w-5" />
          </button>
          <span className="text-xs sm:text-sm text-gray-300">{Math.round(scale * 100)}%</span>
          <button
            onClick={zoomIn}
            className="rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-300 hover:bg-gray-700 active:bg-gray-600"
            aria-label="Zoom in"
          >
            <ZoomInIcon className="h-5 w-5" />
          </button>
        </div>
        {totalRequired > 0 && (
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {completedRequired}/{totalRequired}
            </span>
            {completedRequired === totalRequired ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircleIcon className="h-4 w-4 text-amber-500" />
            )}
          </div>
        )}
      </div>

      {/* PDF Viewer */}
      <div
        ref={containerRef}
        className="flex-1 bg-gray-200 overflow-auto relative -webkit-overflow-scrolling-touch"
        style={{ minHeight: 300, WebkitOverflowScrolling: "touch" }}
      >
        {pdfLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2Icon className="h-8 w-8 animate-spin text-gray-500" />
          </div>
        )}
        <div className="flex flex-col items-center p-4">
          <Document
            file={fileUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={null}
            className="flex flex-col items-center"
          >
            <div className="relative inline-block shadow-lg">
              <Page
                pageNumber={currentPage}
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                onRenderSuccess={handlePageRenderSuccess}
              />
              {/* Signature field overlays */}
              {pageSize && currentPageFields.map((field) => (
                <div
                  key={field.id}
                  style={getFieldStyle(field)}
                  onClick={() => handleFieldClick(field)}
                >
                  {getFieldContent(field)}
                </div>
              ))}
            </div>
          </Document>
        </div>
      </div>

      {/* Page Navigation */}
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-2 sm:gap-4 bg-gray-100 border-t py-2 px-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className="min-h-[44px]"
          >
            <ChevronLeftIcon className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <span className="text-sm text-gray-600 whitespace-nowrap">
            {currentPage} of {numPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            className="min-h-[44px]"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRightIcon className="h-4 w-4 sm:ml-1" />
          </Button>
        </div>
      )}

      {/* Signature Capture Modal */}
      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent className="sm:max-w-md max-w-[calc(100vw-2rem)] mx-auto">
          <DialogHeader>
            <DialogTitle>
              {activeFieldId && fields.find((f) => f.id === activeFieldId)?.type === "INITIALS"
                ? "Add Your Initials"
                : "Add Your Signature"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <SignatureThemeProvider>
              <EnhancedSignaturePad
                ref={signaturePadRef}
                width={340}
                height={160}
                onSignatureChange={() => {}}
                showControls={true}
                initialName={recipientName}
              />
            </SignatureThemeProvider>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="min-h-[44px]"
              onClick={() => {
                setShowSignatureModal(false);
                setActiveFieldId(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSignatureConfirm} className="min-h-[44px]">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Apply Signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
